'use strict';

function createSecurityPolicy({ ipcMain, rendererURL, errorPageURL, openExternalURL, report = console.warn }) {
  const renderer = new URL(rendererURL);
  const errorPage = new URL(errorPageURL);
  const windows = new Set();
  const errorPageChannels = new Set(['force-reload', 'close-window', 'close-current-window', 'get-window-id']);

  function isRendererURL(value) {
    try {
      const url = new URL(value);
      return renderer.origin === 'null'
        ? url.href === renderer.href
        : url.origin === renderer.origin;
    } catch {
      return false;
    }
  }

  function isErrorPage(value) {
    try {
      const url = new URL(value);
      return url.protocol === errorPage.protocol && url.host === errorPage.host && url.pathname === errorPage.pathname;
    } catch {
      return false;
    }
  }

  function isTrustedSender(event, channel) {
    try {
      const contents = event.sender;
      const frame = event.senderFrame;
      if (!windows.has(contents) || contents.isDestroyed() || !frame || frame !== contents.mainFrame) return false;
      if (isErrorPage(frame.url)) return errorPageChannels.has(channel);
      return isRendererURL(frame.url);
    } catch {
      return false;
    }
  }

  const guardedIpc = {
    handle(channel, handler) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedSender(event, channel)) throw new Error('Untrusted IPC sender');
        return handler(event, ...args);
      });
    },
    on(channel, handler) {
      ipcMain.on(channel, (event, ...args) => {
        if (!isTrustedSender(event, channel)) return;
        try {
          Promise.resolve(handler(event, ...args)).catch(() => report(`IPC handler failed: ${channel}`));
        } catch {
          report(`IPC handler failed: ${channel}`);
        }
      });
    },
  };

  function protectWindow(window) {
    const contents = window.webContents;
    windows.add(contents);
    contents.once('destroyed', () => windows.delete(contents));

    function preventUntrustedNavigation(event, target) {
      const url = typeof target === 'string' ? target : event.url;
      if (!isRendererURL(url) && !isErrorPage(url)) event.preventDefault();
    }

    contents.on('will-navigate', preventUntrustedNavigation);
    contents.on('will-redirect', preventUntrustedNavigation);
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(({ url }) => {
      Promise.resolve().then(() => openExternalURL(url)).catch(() => report('External URL rejected'));
      return { action: 'deny' };
    });
  }

  return { ipcMain: guardedIpc, protectWindow, isRendererURL, isTrustedSender };
}

module.exports = { createSecurityPolicy };
