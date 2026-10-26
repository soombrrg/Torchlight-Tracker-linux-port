// preload.js
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') throw new TypeError('A callback is required');
  ipcRenderer.on(channel, (_event, ...args) => callback(...args));
}

function unsubscribe(channel) {
  ipcRenderer.removeAllListeners(channel);
}

if (process.isMainFrame) contextBridge.exposeInMainWorld('electronAPI', {
  getOSInfo: () => ipcRenderer.invoke('get-os-info'),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  runShellCommand: (cmd) => ipcRenderer.invoke('run-shell-command', cmd),
  saveToTemp: (data, filename) => ipcRenderer.invoke('save-to-temp', data, filename),

  //火炬相关
  startTorLog: (logPath) => ipcRenderer.invoke('start-tor-log', { logPath: logPath }),
  stopTorLog: () => ipcRenderer.invoke('stop-tor-log'),
  getTorStatus: () => ipcRenderer.invoke('get-tor-status'),
  getGameLogPath: () => ipcRenderer.invoke('get-native-log-path'),
  onLogMsg: (callback) => {
    subscribe('tor-log-msg', callback);
    ipcRenderer.send('log-consumer-ready');
  },
  offLogMsg: () => unsubscribe('tor-log-msg'),

  //获取当前窗口xy 长宽
  getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
  // 打开新窗口
  openWindow: (config) => ipcRenderer.invoke('open-window', config),
  // 关闭当前窗口
  closeCurrentWindow: () => ipcRenderer.send('close-current-window'),
  // 获取窗口 ID（用于区分）
  getWindowId: () => ipcRenderer.invoke('get-window-id'),
  // 设置当前窗口置顶
  setAlwaysOnTop: (flag) => ipcRenderer.send('set-always-on-top', flag),
  closeWindow: () => ipcRenderer.send('close-window'),
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  unmaximizeWindow: () => ipcRenderer.send('unmaximize-window'),
  setWindowOptions: (options) => ipcRenderer.send('set-window-options', options),

  getWindowMaximized: () => ipcRenderer.invoke('get-window-maximized'),

  getBackVersion: () => ipcRenderer.invoke('get-back-version'),
  forceReload: () => ipcRenderer.invoke('force-reload'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),

  // 持久化相关
  onBeforeQuit: (callback) => subscribe('before-quit', callback),
  onWindowClose: (callback) => subscribe('window-close', callback),
  offBeforeQuit: () => unsubscribe('before-quit'),
  offWindowClose: () => unsubscribe('window-close'),
  onWindowMaximize: (callback) => subscribe('window-maximize', callback),
  onWindowUnmaximize: (callback) => subscribe('window-unmaximize', callback),
  offWindowMaximize: () => unsubscribe('window-maximize'),
  offWindowUnmaximize: () => unsubscribe('window-unmaximize'),

  // 示例：监听事件（比如主进程通知设备插入）
  onDeviceChange: (callback) => subscribe('device-change', callback),
  offDeviceChange: () => unsubscribe('device-change'),

  getWssPort: () => ipcRenderer.invoke('get-wss-port'),

  /**
   * 监听来自主进程的日志批次
   * @param {function} callback - 处理函数，接收一个包含 { batchId, messages } 的对象
   */
  onLogBatch: (callback) => {
    // 移除旧的监听器，防止重复注册
    ipcRenderer.removeAllListeners('ipc-log-batch');
    subscribe('ipc-log-batch', callback);
  },

  /**
   * 向主进程发送批次处理完成的确认信号
   * @param {string} batchId - 已处理完成的批次ID
   */
  sendIpcBatchProcessed: (batchId) => {
    ipcRenderer.send('ipc-batch-processed', batchId);
  },
  setMousePassthrough: (ignore, options) => {
    ipcRenderer.send('set-mouse-ignore', ignore, options);
  },

  // Translation: save untranslated texts
  saveUntranslated: (data) => ipcRenderer.send('save-untranslated', data),
});
