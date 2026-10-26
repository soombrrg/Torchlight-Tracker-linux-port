'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');

const MAX_READ_SIZE = 512 * 1024;
const POLL_INTERVAL_MS = 250;
const CHECKPOINT_SIZE = 64;
const excludePattern = /SoundTriggerTimestamps|GameplayLog|error:|Warning|PushMgr@RecvLogicMsg/i;

let current = null;

function isCurrent(session) {
  return current === session && !session.stopped;
}

function resetFileState(session, position = 0) {
  session.lastPosition = position;
  session.decoder = new StringDecoder('utf8');
  session.partialLine = '';
  session.checkpoint = Buffer.alloc(0);
  session.canReadMore = true;
}

function assertRegularFile(stats, logPath) {
  if (!stats.isFile()) {
    const error = new Error(`Log path is not a regular file: ${logPath}`);
    error.code = 'EINVAL';
    throw error;
  }
}

async function closeFile(handle) {
  if (handle) await handle.close().catch(() => {});
}

async function openFile(session, fromEnd) {
  const handle = await fs.promises.open(session.logPath, 'r');
  try {
    const stats = await handle.stat();
    assertRegularFile(stats, session.logPath);
    const position = fromEnd ? stats.size : 0;
    const checkpoint = Buffer.alloc(Math.min(CHECKPOINT_SIZE, position));
    if (checkpoint.length) {
      await handle.read(checkpoint, 0, checkpoint.length, position - checkpoint.length);
    }
    if (!isCurrent(session)) {
      await closeFile(handle);
      return;
    }

    const previous = session.file;
    session.file = handle;
    session.identity = { dev: stats.dev, ino: stats.ino };
    resetFileState(session, position);
    session.checkpoint = checkpoint;
    await closeFile(previous);
  } catch (error) {
    await closeFile(handle);
    throw error;
  }
}

function watchDirectory(session) {
  if (session.watcher || !isCurrent(session)) return;
  try {
    const filename = path.basename(session.logPath);
    const watcher = fs.watch(path.dirname(session.logPath), { persistent: false }, (_, changed) => {
      if (changed == null || String(changed) === filename) scheduleRead(session);
    });
    session.watcher = watcher;
    watcher.on('error', () => {
      watcher.close();
      if (session.watcher === watcher) session.watcher = null;
      scheduleRead(session);
    });
  } catch (_) {
    // Polling also covers unavailable directories and filesystems without fs.watch.
  }
}

function scheduleRead(session) {
  if (!isCurrent(session) || !session.isRunning) return;
  if (session.isReading) {
    session.readAgain = true;
    return;
  }
  if (session.scheduled) return;
  session.scheduled = setImmediate(() => {
    session.scheduled = null;
    void readChanges(session);
  });
  session.scheduled.unref();
}

async function statPath(logPath) {
  try {
    const stats = await fs.promises.stat(logPath);
    assertRegularFile(stats, logPath);
    return stats;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

function sameFile(stats, identity) {
  return stats && stats.dev === identity.dev && stats.ino === identity.ino;
}

async function checkpointChanged(session, stats) {
  if (stats.size < session.lastPosition) return true;
  if (!session.checkpoint.length) return false;
  const previous = Buffer.alloc(session.checkpoint.length);
  const { bytesRead } = await session.file.read(
    previous,
    0,
    previous.length,
    session.lastPosition - previous.length,
  );
  // Detect truncate-and-regrow between polls, including same-size replacements.
  return bytesRead !== previous.length || !previous.equals(session.checkpoint);
}

function deliverLines(session, buffer) {
  const lines = (session.partialLine + session.decoder.write(buffer)).split('\n');
  session.partialLine = lines.pop();
  let delivered = 0;
  for (let line of lines) {
    if (!isCurrent(session)) break;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (excludePattern.test(line)) continue;
    try {
      session.callback(line);
      delivered++;
    } catch (error) {
      console.error('[Log reader] Callback failed:', error);
    }
  }
  return delivered;
}

async function readChanges(session) {
  if (!isCurrent(session) || session.isReading) return;
  session.isReading = true;
  session.readAgain = false;
  try {
    watchDirectory(session);
    const pathStats = await statPath(session.logPath);
    if (!isCurrent(session)) return;
    const stats = await session.file.stat();
    if (!isCurrent(session)) return;
    const changed = await checkpointChanged(session, stats);
    if (!isCurrent(session)) return;
    if (changed) resetFileState(session);

    if (stats.size > session.lastPosition) {
      if (!session.canReadMore) return;
      const buffer = Buffer.allocUnsafe(Math.min(MAX_READ_SIZE, stats.size - session.lastPosition));
      const { bytesRead } = await session.file.read(buffer, 0, buffer.length, session.lastPosition);
      if (!isCurrent(session) || bytesRead === 0) return;
      const chunk = buffer.subarray(0, bytesRead);
      session.lastPosition += bytesRead;
      session.checkpoint = Buffer.from(
        Buffer.concat([session.checkpoint, chunk]).subarray(-CHECKPOINT_SIZE),
      );

      const hasMore = bytesRead === buffer.length && session.lastPosition < stats.size;
      // Set the pause before callbacks: a synchronous acknowledgement must survive.
      session.canReadMore = !hasMore;
      const delivered = deliverLines(session, chunk);
      if (!isCurrent(session)) return;
      // An incomplete/filtered-only chunk has no consumer to acknowledge it.
      if (delivered === 0) session.canReadMore = true;
      if (hasMore && session.canReadMore) session.readAgain = true;
      if (!hasMore && pathStats && !sameFile(pathStats, session.identity)) session.readAgain = true;
    } else if (pathStats && !sameFile(pathStats, session.identity)) {
      // Drain the old descriptor before replacing it; the new file starts at byte 0.
      await openFile(session, false);
      if (isCurrent(session)) session.readAgain = true;
    }
    session.lastError = null;
  } catch (error) {
    if (isCurrent(session) && error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
      const message = `${error.code || ''}: ${error.message}`;
      if (message !== session.lastError) console.error('[Log reader]', message);
      session.lastError = message;
    }
    // The next poll retries temporary disappearance, access errors and rotations.
  } finally {
    session.isReading = false;
    if (isCurrent(session) && session.readAgain) scheduleRead(session);
  }
}

async function mainWatch(logPath, callback) {
  if (typeof logPath !== 'string' || !logPath.trim()) throw new TypeError('A log path is required.');
  if (typeof callback !== 'function') throw new TypeError('A log callback is required.');
  const absolutePath = path.resolve(logPath);
  if (current && current.isRunning && current.logPath === absolutePath) {
    updateCallback(callback);
    return;
  }

  stopTorLog();
  const session = {
    logPath: absolutePath,
    callback,
    file: null,
    watcher: null,
    timer: null,
    scheduled: null,
    stopped: false,
    isRunning: false,
    isReading: false,
    readAgain: false,
  };
  resetFileState(session);
  current = session;
  try {
    // Reject directories/FIFOs before open(), which could otherwise block.
    assertRegularFile(await fs.promises.stat(absolutePath), absolutePath);
    if (!isCurrent(session)) return;
    // Native startup always tails from EOF, including under an inherited dev environment.
    await openFile(session, true);
    if (!isCurrent(session)) return;
    session.isRunning = true;
    watchDirectory(session);
    session.timer = setInterval(() => scheduleRead(session), POLL_INTERVAL_MS);
    session.timer.unref();
    scheduleRead(session);
  } catch (error) {
    if (isCurrent(session)) stopTorLog();
    throw error;
  }
}

function stopTorLog() {
  const session = current;
  if (!session) return;
  current = null;
  session.stopped = true;
  session.isRunning = false;
  clearInterval(session.timer);
  clearImmediate(session.scheduled);
  if (session.watcher) session.watcher.close();
  const handle = session.file;
  session.file = null;
  void closeFile(handle);
}

function getStatus() {
  return current
    ? { isRunning: current.isRunning, logPath: current.logPath, lastPosition: current.lastPosition }
    : { isRunning: false, logPath: '', lastPosition: 0 };
}

function notifyCanReadMore() {
  if (!current) return;
  current.canReadMore = true;
  scheduleRead(current);
}

function resetFlowControl() {
  notifyCanReadMore();
}

function updateCallback(callback) {
  if (!current || typeof callback !== 'function') return;
  current.callback = callback;
  notifyCanReadMore();
}

module.exports = {
  mainWatch,
  stopTorLog,
  getStatus,
  notifyCanReadMore,
  resetFlowControl,
  updateCallback,
};
