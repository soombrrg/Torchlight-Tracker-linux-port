'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createSecurityPolicy } = require('../linux/app/security');

function fixture() {
  const invokes = new Map();
  const messages = new Map();
  const opened = [];
  const contents = new EventEmitter();
  contents.isDestroyed = () => false;
  contents.mainFrame = { url: 'https://fixture.example/app' };
  contents.setWindowOpenHandler = (handler) => { contents.openWindow = handler; };
  const policy = createSecurityPolicy({
    ipcMain: {
      handle: (channel, handler) => invokes.set(channel, handler),
      on: (channel, handler) => messages.set(channel, handler),
    },
    rendererURL: 'https://fixture.example/',
    errorPageURL: 'file:///fixture/connection-error.html',
    openExternalURL: async (url) => opened.push(url),
    report: () => {},
  });
  policy.protectWindow({ webContents: contents });
  const event = { sender: contents, senderFrame: contents.mainFrame };
  return { policy, contents, event, invokes, messages, opened };
}

test('privileged IPC accepts only registered main frames at the exact renderer origin', () => {
  const { policy, contents, event, invokes, messages } = fixture();
  let calls = 0;
  policy.ipcMain.handle('read', () => ++calls);
  policy.ipcMain.on('write', () => { calls++; });
  assert.equal(invokes.get('read')(event), 1);
  messages.get('write')(event);
  assert.equal(calls, 2);
  const invalid = [
    { ...event, sender: { ...contents } },
    { ...event, senderFrame: null },
    { ...event, senderFrame: { url: contents.mainFrame.url } },
  ];
  for (const untrusted of invalid) {
    assert.throws(() => invokes.get('read')(untrusted), /Untrusted/);
    messages.get('write')(untrusted);
  }
  for (const url of ['https://fixture.example.evil/', 'http://fixture.example/', 'file:///fixture/secret', 'about:blank']) {
    contents.mainFrame.url = url;
    assert.throws(() => invokes.get('read')(event), /Untrusted/);
    messages.get('write')(event);
  }
  assert.equal(calls, 2);
});

test('local error page can retry or close but cannot read logs or write temporary files', () => {
  const { policy, contents, event } = fixture();
  contents.mainFrame.url = 'file:///fixture/connection-error.html?url=https://fixture.example';
  for (const channel of ['force-reload', 'close-window', 'get-window-id']) {
    assert.equal(policy.isTrustedSender(event, channel), true);
  }
  for (const channel of ['start-tor-log', 'get-native-log-path', 'save-to-temp', 'get-os-info']) {
    assert.equal(policy.isTrustedSender(event, channel), false);
  }
  contents.mainFrame.url = 'file:///fixture/connection-error.html.evil';
  assert.equal(policy.isTrustedSender(event, 'force-reload'), false);
  contents.mainFrame.url = 'file://evil/fixture/connection-error.html';
  assert.equal(policy.isTrustedSender(event, 'force-reload'), false);
});

test('every protected window blocks foreign navigation, redirects, popups and webviews', async () => {
  const { contents, opened } = fixture();
  for (const type of ['will-navigate', 'will-redirect']) {
    let prevented = false;
    const event = { preventDefault() { prevented = true; } };
    contents.emit(type, event, 'https://evil.example/');
    assert.equal(prevented, true);
    prevented = false;
    contents.emit(type, event, 'https://fixture.example/overlay');
    assert.equal(prevented, false);
    contents.emit(type, { url: 'https://evil.example/', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
  }
  let prevented = false;
  contents.emit('will-attach-webview', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.deepEqual(contents.openWindow({ url: 'https://fixture.example/help' }), { action: 'deny' });
  await Promise.resolve();
  assert.deepEqual(opened, ['https://fixture.example/help']);
});

test('destroyed windows lose IPC authorization and malformed on-messages do not crash the process', async () => {
  const { policy, contents, event, messages } = fixture();
  policy.ipcMain.on('broken', () => { throw new Error('malformed input'); });
  assert.doesNotThrow(() => messages.get('broken')(event));
  policy.ipcMain.on('rejected', async () => { throw new Error('async malformed input'); });
  messages.get('rejected')(event);
  await Promise.resolve();
  contents.emit('destroyed');
  assert.equal(policy.isTrustedSender(event, 'read'), false);
});
