'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function load(isMainFrame = true) {
  const listeners = new Map();
  const ipcRenderer = {
    on(channel, listener) { listeners.set(channel, listener); return this; },
    removeAllListeners(channel) { listeners.delete(channel); return this; },
    send() {}, invoke() {},
  };
  let api;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../linux/app/preload.js'), 'utf8'), {
    process: { isMainFrame },
    require: () => ({ ipcRenderer, contextBridge: { exposeInMainWorld(_name, value) { api = value; } } }),
  });
  return { api, listeners };
}

test('preload event APIs never return ipcRenderer or pass IPC events to page callbacks', () => {
  const { api, listeners } = load();
  for (const [method, channel] of [
    ['onBeforeQuit', 'before-quit'], ['onWindowClose', 'window-close'],
    ['onWindowMaximize', 'window-maximize'], ['onWindowUnmaximize', 'window-unmaximize'],
    ['onDeviceChange', 'device-change'], ['onLogMsg', 'tor-log-msg'], ['onLogBatch', 'ipc-log-batch'],
  ]) {
    let received;
    assert.equal(api[method]((...args) => { received = args; }), undefined);
    listeners.get(channel)({ sender: 'privileged IPC object' }, 'payload');
    assert.deepEqual(received, ['payload']);
  }
  for (const method of Object.keys(api).filter((name) => name.startsWith('off'))) {
    assert.equal(api[method](), undefined);
  }
});

test('preload does not expose privileged APIs in child frames', () => {
  assert.equal(load(false).api, undefined);
});
