'use strict';

const assert = require('node:assert/strict');
const { appendFileSync } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { test, after } = require('node:test');
const reader = require('../linux/app/log-reader.js');

const originalEnvironment = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';
after(() => {
  reader.stopTorLog();
  if (originalEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnvironment;
});

async function fixture(t, contents = '') {
  reader.stopTorLog();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'etor-log-reader-'));
  const logPath = path.join(directory, 'UE_game.log');
  await fs.writeFile(logPath, contents);
  t.after(async () => {
    reader.stopTorLog();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, logPath };
}

async function waitFor(predicate, description, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail(`Timed out waiting for ${description}`);
    await delay(10);
  }
}

test('starts at EOF, preserves the exclusion filter, and delivers CRLF/empty lines', async (t) => {
  const { logPath } = await fixture(t, 'old history\n'.repeat(1000));
  const lines = [];
  await reader.mainWatch(logPath, (line) => lines.push(line));
  assert.equal(reader.getStatus().lastPosition, (await fs.stat(logPath)).size);
  await fs.appendFile(
    logPath,
    [
      'SoundTriggerTimestamps skipped',
      'gameplaylog skipped',
      'ERROR: skipped',
      'Warning skipped',
      'PushMgr@RecvLogicMsg skipped',
      'new предмет 🔥',
      '',
      'last line',
      '',
    ].join('\r\n'),
  );
  await waitFor(() => lines.length === 3, 'new unfiltered lines');
  assert.deepEqual(lines, ['new предмет 🔥', '', 'last line']);
});

test('an inherited development environment cannot replay the existing log', async (t) => {
  const { logPath } = await fixture(t, 'existing history\n'.repeat(10000));
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const lines = [];
    await reader.mainWatch(logPath, (line) => lines.push(line));
    assert.equal(reader.getStatus().lastPosition, (await fs.stat(logPath)).size);
    await fs.appendFile(logPath, 'new append only\n');
    await waitFor(() => lines.length === 1, 'new append in development environment');
    assert.deepEqual(lines, ['new append only']);
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test('buffers UTF-8 bytes and incomplete lines across independent appends', async (t) => {
  const { logPath } = await fixture(t);
  const lines = [];
  await reader.mainWatch(logPath, (line) => lines.push(line));
  const text = 'Лут 💎';
  const encoded = Buffer.from(text);
  const split = encoded.length - 2;
  await fs.appendFile(logPath, encoded.subarray(0, split));
  await waitFor(() => reader.getStatus().lastPosition === split, 'partial UTF-8 read');
  assert.deepEqual(lines, []);
  await fs.appendFile(logPath, encoded.subarray(split));
  await waitFor(() => reader.getStatus().lastPosition === encoded.length, 'remaining UTF-8 read');
  assert.deepEqual(lines, []);
  await fs.appendFile(logPath, '\r');
  await waitFor(() => reader.getStatus().lastPosition === encoded.length + 1, 'split CRLF read');
  assert.deepEqual(lines, []);
  await fs.appendFile(logPath, '\nследующая\n');
  await waitFor(() => lines.length === 2, 'complete UTF-8 lines');
  assert.deepEqual(lines, [text, 'следующая']);
});

test('pauses between 512 KiB batches and resumes without losing or splitting lines', async (t) => {
  const { logPath } = await fixture(t);
  const expected = Array.from({ length: 20000 }, (_, index) => `${index} — предмет 🔥 ${'x'.repeat(40)}`);
  const data = Buffer.from(`${expected.join('\n')}\n`);
  assert.ok(data.length > 2 * 512 * 1024);
  assert.ok(data.length < 3 * 512 * 1024);
  const lines = [];
  await reader.mainWatch(logPath, (line) => lines.push(line));
  // Complete the burst before the reader runs; appendFile() itself writes in chunks.
  appendFileSync(logPath, data);
  await waitFor(() => reader.getStatus().lastPosition === 512 * 1024, 'first batch');
  await delay(350);
  assert.equal(reader.getStatus().lastPosition, 512 * 1024, 'consumer controls the next batch');
  reader.notifyCanReadMore();
  await waitFor(() => reader.getStatus().lastPosition === 2 * 512 * 1024, 'second batch');
  reader.resetFlowControl();
  await waitFor(() => lines.length === expected.length, 'remaining batches');
  assert.equal(reader.getStatus().lastPosition, data.length);
  assert.deepEqual(lines, expected);
});

test('a line longer than a read chunk does not require an impossible acknowledgement', async (t) => {
  const { logPath } = await fixture(t);
  const lines = [];
  const expected = '💎'.repeat(150000);
  await reader.mainWatch(logPath, (line) => lines.push(line));
  await fs.appendFile(logPath, `${expected}\n`);
  await waitFor(() => lines.length === 1, 'one complete long line');
  assert.deepEqual(lines, [expected]);
});

test('filtered-only chunks continue automatically until an actionable line', async (t) => {
  const { logPath } = await fixture(t);
  const lines = [];
  await reader.mainWatch(logPath, (line) => lines.push(line));
  await fs.appendFile(logPath, `${`Warning ${'x'.repeat(1000)}\n`.repeat(1100)}survived\n`);
  await waitFor(() => lines.length === 1, 'line after excluded chunks');
  assert.deepEqual(lines, ['survived']);
});

test('truncation resets the offset, UTF-8 decoder, and incomplete line', async (t) => {
  const { logPath } = await fixture(t, 'old history\n'.repeat(1000));
  const lines = [];
  await reader.mainWatch(logPath, (line) => lines.push(line));
  const partial = Buffer.concat([Buffer.from('old unfinished '), Buffer.from('💎').subarray(0, 2)]);
  await fs.appendFile(logPath, partial);
  const oldSize = (await fs.stat(logPath)).size;
  await waitFor(() => reader.getStatus().lastPosition === oldSize, 'old partial line');
  await fs.writeFile(logPath, 'новая\n');
  await waitFor(() => lines.length === 1, 'first line after truncation');
  await fs.appendFile(logPath, 'next\n');
  await waitFor(() => lines.length === 2, 'append after truncation');
  assert.deepEqual(lines, ['новая', 'next']);
});

test('detects truncate-and-regrow even when the replacement has the same size', async (t) => {
  const { logPath } = await fixture(t, `${'a'.repeat(100)}\n`);
  const lines = [];
  await reader.mainWatch(logPath, (line) => lines.push(line));
  await fs.writeFile(logPath, `${'b'.repeat(100)}\n`);
  await waitFor(() => lines.length === 1, 'same-size replacement');
  assert.deepEqual(lines, ['b'.repeat(100)]);
});

test('retries a delayed rename/recreate and reads the replacement from its beginning', async (t) => {
  const { logPath } = await fixture(t, 'old history\n');
  const lines = [];
  await reader.mainWatch(logPath, (line) => lines.push(line));
  await fs.appendFile(logPath, 'old line\norphaned partial');
  const oldSize = (await fs.stat(logPath)).size;
  await waitFor(() => reader.getStatus().lastPosition === oldSize, 'old line and partial');
  await fs.rename(logPath, `${logPath}.1`);
  await delay(1300);
  assert.equal(reader.getStatus().isRunning, true, 'missing replacement must not stop tracking');
  await fs.writeFile(logPath, 'new first\nnew partial');
  await waitFor(() => lines.length === 2, 'replacement beginning');
  await fs.appendFile(logPath, ' completed\n');
  await waitFor(() => lines.length === 3, 'replacement continuation');
  assert.deepEqual(lines, ['old line', 'new first', 'new partial completed']);
});

test('drains a renamed file backlog before switching and accepts synchronous acknowledgements', async (t) => {
  const { logPath } = await fixture(t);
  const expected = Array.from({ length: 18000 }, (_, index) => `${index} ${'x'.repeat(64)}`);
  const lines = [];
  await reader.mainWatch(logPath, (line) => lines.push(line));
  appendFileSync(logPath, `${expected.join('\n')}\n`);
  await waitFor(() => reader.getStatus().lastPosition === 512 * 1024, 'paused original file');
  await fs.rename(logPath, `${logPath}.1`);
  await fs.writeFile(logPath, 'replacement first\n');
  reader.updateCallback((line) => {
    lines.push(line);
    reader.notifyCanReadMore();
  });
  await waitFor(() => lines.length === expected.length + 1, 'old backlog and replacement');
  assert.deepEqual(lines, [...expected, 'replacement first']);
});

test('rejects nonexistent paths and directories and leaves no running reader', async (t) => {
  const { directory, logPath } = await fixture(t);
  await reader.mainWatch(logPath, () => {});
  await assert.rejects(reader.mainWatch(path.join(directory, 'missing.log'), () => {}), { code: 'ENOENT' });
  assert.deepEqual(reader.getStatus(), { isRunning: false, logPath: '', lastPosition: 0 });
  await assert.rejects(reader.mainWatch(directory, () => {}), { code: 'EINVAL' });
  assert.deepEqual(reader.getStatus(), { isRunning: false, logPath: '', lastPosition: 0 });
});

test('stop/restart inside a callback isolates sessions and cancels remaining old deliveries', async (t) => {
  const { directory, logPath } = await fixture(t);
  const nextPath = path.join(directory, 'next.log');
  await fs.writeFile(nextPath, 'existing next history\n');
  const oldLines = [];
  const newLines = [];
  let restart;
  await reader.mainWatch(logPath, (line) => {
    oldLines.push(line);
    reader.stopTorLog();
    restart = reader.mainWatch(nextPath, (next) => newLines.push(next));
  });
  await fs.appendFile(logPath, 'first\nsecond\nthird\n');
  await waitFor(() => restart, 'restart initiated by callback');
  await restart;
  await fs.appendFile(nextPath, 'new session\n');
  await waitFor(() => newLines.length === 1, 'new session callback');
  await fs.appendFile(logPath, 'stale append\n');
  await delay(350);
  assert.deepEqual(oldLines, ['first']);
  assert.deepEqual(newLines, ['new session']);
  assert.equal(reader.getStatus().logPath, nextPath);
  reader.stopTorLog();
  await fs.appendFile(nextPath, 'after stop\n');
  await delay(350);
  assert.deepEqual(newLines, ['new session']);
  assert.deepEqual(reader.getStatus(), { isRunning: false, logPath: '', lastPosition: 0 });
});

test('a superseded asynchronous startup cannot replace the current session', async (t) => {
  const { directory, logPath } = await fixture(t);
  const nextPath = path.join(directory, 'next.log');
  await fs.writeFile(nextPath, '');
  const oldLines = [];
  const newLines = [];
  const oldStart = reader.mainWatch(logPath, (line) => oldLines.push(line));
  reader.stopTorLog();
  const nextStart = reader.mainWatch(nextPath, (line) => newLines.push(line));
  await Promise.all([oldStart, nextStart]);
  await fs.appendFile(logPath, 'stale\n');
  await fs.appendFile(nextPath, 'current\n');
  await waitFor(() => newLines.length === 1, 'current asynchronous session');
  assert.deepEqual(oldLines, []);
  assert.deepEqual(newLines, ['current']);
  assert.equal(reader.getStatus().logPath, nextPath);
});
