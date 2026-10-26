// Runs the release's unchanged log reader against disposable files on Linux.
// Usage: node original-log-reader.cjs /absolute/path/to/build/obf-app/tor/main.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

async function waitFor(predicate, timeout = 2500) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Log reader observation timed out');
    await delay(25);
  }
}

async function main() {
  const input = process.argv[2];
  if (!input || !path.isAbsolute(input)) {
    throw new Error('Provide the absolute path to the original log reader');
  }
  process.env.NODE_ENV = 'production';
  const tor = require(input);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'etor-original-probe-'));
  const logPath = path.join(temporary, 'UE_game.log');
  const observations = {
    platform: process.platform,
    node: process.version,
    module: 'build/obf-app/tor/main.js',
    cases: {},
  };
  let received = [];
  try {
    fs.writeFileSync(logPath, 'existing history\n');
    await tor.mainWatch(logPath, (line) => received.push(line));
    assert.equal(tor.getStatus().isRunning, true);
    fs.appendFileSync(logPath, 'new item: Проверка 火\n');
    await waitFor(() => received.length > 0);
    assert.deepEqual(received, ['new item: Проверка 火']);
    observations.cases.append = {
      received_new_line: true,
      historical_line_skipped: true,
      utf8_preserved: true,
    };

    received = [];
    fs.appendFileSync(logPath, 'split-record:first');
    await waitFor(() => received.length > 0);
    fs.appendFileSync(logPath, ':second\n');
    await waitFor(() => received.length > 1);
    observations.cases.partial_line = {
      expected: ['split-record:first:second'],
      actual: received.slice(),
      complete_record_preserved:
        received.length === 1 && received[0] === 'split-record:first:second',
    };

    received = [];
    const oldPosition = tor.getStatus().lastPosition;
    fs.writeFileSync(logPath, 'short\n');
    await delay(700);
    observations.cases.truncate = {
      previous_position: oldPosition,
      current_size: fs.statSync(logPath).size,
      reader_position: tor.getStatus().lastPosition,
      received_lines: received.length,
      recovered: received.includes('short'),
    };

    tor.stopTorLog();
    received = [];
    fs.writeFileSync(logPath, 'old file history\n');
    await tor.mainWatch(logPath, (line) => received.push(line));
    fs.renameSync(logPath, path.join(temporary, 'UE_game.old.log'));
    const replacement = 'first line of replacement\n';
    fs.writeFileSync(logPath, replacement);
    await waitFor(
      () => tor.getStatus().isRunning && tor.getStatus().lastPosition === Buffer.byteLength(replacement),
    );
    await delay(350);
    fs.appendFileSync(logPath, 'later line of replacement\n');
    await waitFor(() => received.includes('later line of replacement'));
    observations.cases.rotation = {
      first_line_received: received.includes('first line of replacement'),
      later_line_received: true,
      received_lines: received.length,
    };
    tor.stopTorLog();

    await tor.mainWatch(path.join(temporary, 'missing.log'), () => {});
    observations.cases.missing_file = {
      reader_running: tor.getStatus().isRunning,
    };
  } finally {
    tor.stopTorLog();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  process.stdout.write(`${JSON.stringify(observations, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
