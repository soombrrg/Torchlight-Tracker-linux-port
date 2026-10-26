const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { adaptRendererSource } = require('../linux/app/renderer-compat');

test('the original desktop getter can restart with an empty UI path after native stop', async () => {
  const source = readFileSync(path.join(__dirname, 'fixtures/bridge-fixture.js'), 'utf8');
  const result = adaptRendererSource(source);
  assert.equal(result.patched, true);
  const calls = [];
  const context = { window: { electronAPI: {
    stopTorLog: async () => calls.push('stop'),
    getGameLogPath: async () => '/fixture/UE_game.log',
    startTorLog: async (logPath) => calls.push(logPath),
  } } };
  vm.runInNewContext(result.source, context);
  assert.equal(await context.window.restartLikeOriginalWorker(), '/fixture/UE_game.log');
  assert.deepEqual(calls, ['stop', '/fixture/UE_game.log']);
});

test('unrelated frontend code is unchanged; an already compatible getter is not patched', () => {
  for (const source of [
    'const profit = newQuantity - oldQuantity;',
    'if(!fn||"function"!=typeof vn.hasShizukuPermission)return""',
    'if("function"!=typeof vn.getGameLogPath)return""',
  ]) {
    assert.deepEqual(adaptRendererSource(source), { source, patched: false });
  }
});

test('ambiguous duplicate gates are left untouched rather than applying a broad rewrite', () => {
  const source = 'if(!a||"function"!=typeof b.getGameLogPath)return"";'.repeat(2);
  assert.deepEqual(adaptRendererSource(source), { source, patched: false });
});
