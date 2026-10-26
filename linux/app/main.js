// Linux adaptation of the active YiHuo ETor v1.3.0 release entry point.
// Original UI, translations and game calculations remain upstream-owned.
const isDev = process.env.TLI_DEBUG === '1';

// 非开发环境屏蔽 console.log，但保留 console.error 和 console.warn
if (!isDev) {
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};

  // 可选：如果需要保留某些关键日志，可以使用 console.warn
  // console.warn 和 console.error 保持不变，用于错误和警告信息
}

const { app, BrowserWindow, ipcMain: nativeIpcMain, dialog, shell, Menu, protocol, net, session } = require('electron');

const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { pathToFileURL } = require('url');
const tor = require('./log-reader');
const { resolveLogPath } = require('./linux-paths');
const { installRendererCompatibility } = require('./renderer-compat');
const packageJson = require('./package.json');
const { createSecurityPolicy } = require('./security');
const { saveTemporaryFile } = require('./safe-temp');
const { windowBounds } = require('./window-options');

app.setName('etor-linux');
if (process.env.TLI_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.TLI_USER_DATA_DIR));
}
const rendererURL = process.env.TLI_RENDERER_URL || 'https://etor-beta.710421059.xyz/';
const errorPageURL = pathToFileURL(path.join(__dirname, 'connection-error.html')).href;
const security = createSecurityPolicy({ ipcMain: nativeIpcMain, rendererURL, errorPageURL, openExternalURL });
const ipcMain = security.ipcMain;

let mainWindow;
const restoreBounds = new WeakMap();
let isLoggingActive = false;
let currentLogPath = '';
let preferredLogPath = '';
let logConsumerReady = false;
let startupError = null;
let logOperation = Promise.resolve();

// IPC 消息发送节流机制
let ipcMessageQueue = [];
const ipcBatchSize = isDev ? 3000 : 1000; // 每批发送的消息数量
const ipcBatchInterval = 100; // 批量发送间隔（毫秒）
let isProcessingIpc = false; // <--- 使用一个更清晰的标志

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'Torchlight Tracker',
    icon: path.join(__dirname, 'etor.png'),
    // minWidth: 800,
    // minHeight: 600,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    transparent: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // alwaysOnTop: true,
      backgroundThrottling: false, // 禁用后台节流，保持页面活跃
      // 可选：限制只能访问指定域名
      // additionalArguments: ['--restrict-to-origin=https://your-web-app.com']
    },
  });

  mainWindow.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) logConsumerReady = false;
  });
  security.protectWindow(mainWindow);

  // Just keep injecting constantly - brute force approach
  let translateScript = null;
  let translationsData = null;
  let injectionInterval = null;

  // Load translations from roaming directory (allows updates without repacking)
  async function loadTranslations() {
    const roamingPath = path.join(app.getPath('userData'), 'translations.json');
    const bundledPath = path.join(__dirname, 'translations.json');

    try {
      // Always copy bundled translations to roaming on launch
      console.warn('[Translation] Copying bundled translations to roaming');
      const bundledData = await fs.readFile(bundledPath, 'utf-8');
      await fs.writeFile(roamingPath, bundledData, 'utf-8');
      console.warn('[Translation] Updated translations.json in roaming');

      // Load from roaming
      const jsonData = await fs.readFile(roamingPath, 'utf-8');
      console.warn('[Translation] Loaded translations from roaming');
      return jsonData;
    } catch (error) {
      console.error('[Translation] Failed to load translations:', error);
      // Fallback to bundled if roaming fails
      return await fs.readFile(bundledPath, 'utf-8');
    }
  }

  // Load both the translations JSON and the script
  console.warn('[Translation] Starting to load translations and script...');
  Promise.all([
    loadTranslations(),
    fs.readFile(path.join(__dirname, 'translate.js'), 'utf-8')
  ]).then(([jsonData, script]) => {
    translationsData = jsonData;
    translateScript = script;
    console.warn('[Translation] Ready to inject');
  }).catch(err => {
    console.error('[Translation] Failed to load:', err);
  });

  // Function to start translation injection
  function startTranslationInjection() {
    // Clear any existing interval
    if (injectionInterval) {
      clearInterval(injectionInterval);
      injectionInterval = null;
    }

    console.log('[Translation] Starting injection interval');

    // Inject every second until successful
    injectionInterval = setInterval(async () => {
      if (!translateScript || !translationsData) return;

      try {
        // Check if already loaded
        const alreadyLoaded = await mainWindow.webContents.executeJavaScript('window.__TRANSLATION_LOADED__ === true');

        if (alreadyLoaded) {
          console.log('[Main] Translation already loaded, stopping injection');
          clearInterval(injectionInterval);
          injectionInterval = null;
          return;
        }

        // First inject the translations data
        await mainWindow.webContents.executeJavaScript(`window.__TRANSLATIONS_DATA__ = ${translationsData};`);

        // Then inject the script
        await mainWindow.webContents.executeJavaScript(translateScript);
      } catch (error) {
        // Silently fail, will retry next second
      }
    }, 1000);
  }

  // Start initial injection
  startTranslationInjection();

  // Restart injection on page reload/navigation
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Translation] Page reloaded, restarting injection');
    startTranslationInjection();
  });
  mainWindow.on('closed', () => clearInterval(injectionInterval));

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
    }
  });
  restoreBounds.set(mainWindow, mainWindow.getBounds());

  mainWindow.on('maximize', () => {
    if (typeof mainWindow.getNormalBounds === 'function') {
      restoreBounds.set(mainWindow, mainWindow.getNormalBounds());
    }
    mainWindow.webContents.send('window-maximize');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-unmaximize');
  });

  //主界面关闭前弹窗确认
  mainWindow.on('close', async (event) => {
    // 阻止默认关闭行为
    event.preventDefault();

    const result = await dialog.showMessageBox(mainWindow, {
      title: 'Confirm Exit',
      type: 'question',
      message: 'Are you sure you want to exit YiHuo-ETor?',
      buttons: ['Confirm', 'Cancel'],
      defaultId: 1, // Default to "Cancel"
      cancelId: 1, // ESC key maps to "Cancel"
    });

    if (result.response === 0) {
      // 用户点击了"确定"，先通知前端保存历史记录
      try {
        console.log('发送 window-close 事件到前端...');
        // 发送事件到前端，让前端保存历史记录
        mainWindow.webContents.send('window-close');
        // 给前端一点时间处理（100ms应该足够）
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error('发送 window-close 事件失败:', error);
      } finally {
        // Overlays are part of this application and must not outlive its main window.
        for (const window of BrowserWindow.getAllWindows()) {
          if (window !== mainWindow && !window.isDestroyed()) window.destroy();
        }
        mainWindow.destroy();
      }
    }
    // 如果用户点击了"取消"，什么都不做，窗口保持打开
  });

  // 设置窗口选项
  ipcMain.on('set-window-options', (event, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    win.setBounds(windowBounds(options, win.getBounds()));
    for (const [option, setter] of [
      ['autoHideMenuBar', 'setAutoHideMenuBar'],
      ['resizable', 'setResizable'],
      ['maximizable', 'setMaximizable'],
      ['alwaysOnTop', 'setAlwaysOnTop'],
    ]) {
      if (typeof options[option] === 'boolean') win[setter](options[option]);
    }
  });

  ipcMain.on('set-mouse-ignore', (event, ignore, options) => {
    // BrowserWindow.fromWebContents 是获取发送事件窗口的最佳、最安全的方式
    const win = BrowserWindow.fromWebContents(event.sender);

    if (win) {
      console.log(`[IPC] 收到指令：设置鼠标穿透为 ${ignore}`, options || '');
      win.setIgnoreMouseEvents(ignore, options);
    }
  });

  ipcMain.handle('get-window-bounds', (event) => {
    const currentBounds = BrowserWindow.fromWebContents(event.sender).getBounds();
    return {
      x: currentBounds.x || 0,
      y: currentBounds.y || 0,
      width: currentBounds.width || 0,
      height: currentBounds.height || 0,
    };
  });

  ipcMain.handle('get-back-version', () => {
    return {
      version: packageJson.version,
    };
  });

  // 强制刷新页面（忽略缓存）
  ipcMain.handle('force-reload', async () => {
    await loadRenderer();
    return { success: mainWindow.webContents.getURL().startsWith(rendererURL) };
  });

  // Save untranslated texts to file (merge with existing)
  ipcMain.on('save-untranslated', async (event, data) => {
    try {
      const untranslatedPath = path.join(app.getPath('userData'), 'untranslated.json');

      // Load existing untranslated data if it exists
      let existing = {};
      try {
        const existingData = await fs.readFile(untranslatedPath, 'utf-8');
        existing = JSON.parse(existingData);
      } catch (err) {
        // File doesn't exist yet, that's fine
      }

      // Merge new data with existing (existing translations are preserved)
      const merged = { ...existing, ...data };

      await fs.writeFile(untranslatedPath, JSON.stringify(merged, null, 2), 'utf-8');
      console.log(`[Translation] Saved ${Object.keys(merged).length} untranslated texts to untranslated.json`);
    } catch (error) {
      console.error('[Translation] Failed to save untranslated texts:', error);
    }
  });

  // 处理窗口最小化/恢复事件
  mainWindow.on('minimize', () => {
    console.log('窗口最小化');
    mainWindow.webContents.send('window-minimize');
  });

  mainWindow.on('restore', () => {
    console.log('窗口恢复');
    mainWindow.webContents.send('window-restore');
  });

  mainWindow.on('show', () => {
    console.log('窗口显示');
    mainWindow.webContents.send('window-restore');
  });

  // 处理应用焦点事件
  app.on('browser-window-focus', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    console.log('应用获得焦点');
    mainWindow.webContents.send('app-focus');
  });

  app.on('browser-window-blur', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    console.log('应用失去焦点');
    mainWindow.webContents.send('app-blur');
  });

  await loadRenderer();
}

async function loadRenderer() {
  try {
    await mainWindow.loadURL(rendererURL);
  } catch (error) {
    console.error('[Linux] Cannot load the original UI:', error.message);
    await mainWindow.loadFile(path.join(__dirname, 'connection-error.html'), {
      query: { url: rendererURL },
    });
  }
}

async function openExternalURL(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported URL');
  await shell.openExternal(url.href);
}

function readExplicitLogArgument() {
  const args = process.argv.slice(1);
  const index = args.indexOf('--log');
  if (index !== -1) {
    if (!args[index + 1] || args[index + 1].startsWith('--')) {
      throw new Error('--log requires a path to UE_game.log');
    }
    return args[index + 1];
  }
  return args.find((arg) => arg.startsWith('--log='))?.slice(6);
}

function startLog(logPath) {
  const operation = logOperation.catch(() => {}).then(async () => {
    if (tor.getStatus().isRunning && currentLogPath === logPath) return;
    tor.stopTorLog();
    isLoggingActive = false;
    currentLogPath = '';
    ipcMessageQueue = [];
    await tor.mainWatch(logPath, routeLogMessage);
    isLoggingActive = tor.getStatus().isRunning;
    currentLogPath = tor.getStatus().logPath;
    preferredLogPath = currentLogPath;
    startupError = null;
  });
  logOperation = operation;
  return operation;
}

function maybeNotifyCanReadMore() {
  try {
    if (tor && typeof tor.notifyCanReadMore === 'function') {
      tor.notifyCanReadMore();
    }
  } catch (_) {}
}

// The supplied desktop UI consumes IPC. No loopback listener is needed.
function routeLogMessage(message) {
  // Hold further reads until this chunk drains, including small EOF appends.
  tor.pauseReading();
  ipcMessageQueue.push(message);
  processIpcMessageQueue();
}

// 批量处理 IPC 消息队列 (这个函数基本不变)
// 2. 替换整个 processIpcMessageQueue 函数
function processIpcMessageQueue() {
  // 如果正在处理，或者队列为空，则直接返回
  if (!logConsumerReady || isProcessingIpc || ipcMessageQueue.length === 0) {
    return;
  }

  isProcessingIpc = true;

  // 使用 setTimeout 创建一个异步的处理循环，避免阻塞主线程
  setTimeout(() => {
    if (!logConsumerReady) {
      isProcessingIpc = false;
      return;
    }
    // 检查主窗口是否存在
    if (
      !mainWindow ||
      mainWindow.isDestroyed() ||
      !mainWindow.webContents ||
      mainWindow.webContents.isDestroyed()
    ) {
      console.warn('主窗口不存在，无法发送IPC消息，清空队列。');
      ipcMessageQueue = [];
      isProcessingIpc = false;
      return;
    }

    try {
      const batch = ipcMessageQueue.splice(0, ipcBatchSize);

      if (batch.length > 0) {
        // Electron 的 send 本身就是异步的，我们在这里一次性把它们都发出去
        // 更好的做法是把整个 batch 一次性发过去，让渲染层去循环
        // 但为了最小改动，我们仍然逐条发送
        // mainWindow.webContents.send('tor-log-batch', batch);
        batch.forEach((msg) => {
          mainWindow.webContents.send('tor-log-msg', msg);
        });
        console.log(
          `[IPC发送] 发送批次, 消息数: ${batch.length}, 队列剩余: ${ipcMessageQueue.length}`,
        );
      }
    } catch (error) {
      console.error('处理 IPC 消息队列失败:', error);
    } finally {
      // 无论成功还是失败，都重置标志位
      isProcessingIpc = false;

      // 检查是否还有剩余任务，如果有，则安排下一次处理
      if (ipcMessageQueue.length > 0) {
        processIpcMessageQueue();
      } else {
        // 如果队列已空，通知日志读取器可以继续了
        maybeNotifyCanReadMore();
      }
    }
  }, ipcBatchInterval); // 使用固定的间隔来发送下一批
}

app.whenReady().then(async () => {
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  installRendererCompatibility({ protocol, net, rendererURL });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle('get-wss-port', () => null);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // tor日志相关
  ipcMain.handle('start-tor-log', async (event, options) => {
    const { logPath } = options || {};
    if (typeof logPath !== 'string') throw new TypeError('A game-log path is required');
    const canonicalPath = await fs.realpath(logPath);
    if (canonicalPath !== preferredLogPath) {
      throw new Error('Select the game log with Ctrl+O or --log before starting it');
    }
    await startLog(canonicalPath);
    return tor.getStatus();
  });

  ipcMain.handle('stop-tor-log', async () => {
    logOperation = logOperation.catch(() => {}).then(() => {
      tor.stopTorLog();
      isLoggingActive = false;
      currentLogPath = '';
      ipcMessageQueue = [];
    });
    await logOperation;
  });

  ipcMain.handle('get-tor-status', () => {
    const torStatus = tor.getStatus();
    return {
      ...torStatus,
      isLoggingActive: torStatus.isRunning,
      currentLogPath: torStatus.logPath,
      startupError,
    };
  });
  ipcMain.handle('get-native-log-path', () => preferredLogPath);

  ipcMain.on('log-consumer-ready', (event) => {
    if (event.sender !== mainWindow?.webContents) return;
    logConsumerReady = true;
    processIpcMessageQueue();
    if (ipcMessageQueue.length === 0) maybeNotifyCanReadMore();
  });

  // 监听来自前端的“打开新窗口”请求
  ipcMain.handle('open-window', async (event, options) => {
    const { url = rendererURL, ...winOpts } = options || {};
    if (!security.isRendererURL(url)) throw new Error('Unexpected window origin');
    const win = new BrowserWindow({
      width: winOpts.width,
      height: winOpts.height,
      minWidth: winOpts.minWidth,
      minHeight: winOpts.minHeight,
      //禁用工具栏
      titleBarStyle: 'hidden',
      autoHideMenuBar: winOpts.autoHideMenuBar,
      resizable: winOpts.resizable,
      maximizable: winOpts.maximizable,
      alwaysOnTop: winOpts.alwaysOnTop,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false, // 禁用后台节流，保持页面活跃
        // 可选：限制只能访问指定域名
        // additionalArguments: ['--restrict-to-origin=https://your-web-app.com']
      },
    });

    security.protectWindow(win);
    restoreBounds.set(win, win.getBounds());
    try {
      await win.loadURL(url);
    } catch (error) {
      win.destroy();
      throw error;
    }

    if (isDev) {
      win.webContents.openDevTools();
    }
    return { id: win.webContents.id }; // 返回窗口标识
  });

  // 获取当前窗口 ID
  ipcMain.handle('get-window-id', (event) => {
    return event.sender.id;
  });

  // 设置当前窗口置顶
  ipcMain.on('set-always-on-top', (event, flag) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.setAlwaysOnTop(flag);
  });

  // 关闭当前窗口
  ipcMain.on('close-current-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  // 最小化当前窗口
  ipcMain.on('minimize-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.minimize();
    }
  });

  //最大化
  ipcMain.on('maximize-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      if (!win.isMaximized() && !win.isFullScreen()) {
        restoreBounds.set(win, win.getBounds());
      }
      win.maximize();
    }
  });

  //获取当前窗口是否最大化
  ipcMain.handle('get-window-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      return win.isMaximized();
    }
    return false;
  });

  //取消最大化
  ipcMain.on('unmaximize-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      const applyRestoreBounds = () => {
        const previous = restoreBounds.get(win);
        if (!previous) return;
        const currentBounds = win.getBounds();
        win.setBounds({
          x: currentBounds.x,
          y: currentBounds.y,
          width: previous.width,
          height: previous.height,
        });
      };
      if (win.isFullScreen()) {
        win.setFullScreen(false);
      }
      if (win.isMaximized()) {
        win.unmaximize();
        setTimeout(applyRestoreBounds, 0);
      } else {
        applyRestoreBounds();
      }
    }
  });

  // 关闭当前窗口（通用）
  ipcMain.on('close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.close();
    }
  });

  // 切换全屏状态
  ipcMain.handle('toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      const isFullscreen = win.isFullScreen();
      win.setFullScreen(!isFullscreen);
      console.log(`切换全屏状态: ${isFullscreen ? '退出全屏' : '进入全屏'}`);
      return { success: true, isFullscreen: !isFullscreen };
    }
    return { success: false, error: '窗口不存在' };
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { label: 'Select game log…', accelerator: 'CommandOrControl+O', click: async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
          defaultPath: currentLogPath || os.homedir(),
          properties: ['openFile'],
          filters: [{ name: 'Game log', extensions: ['log'] }],
        });
        if (result.canceled) return;
        try {
          await startLog(result.filePaths[0]);
          await loadRenderer();
        } catch (error) {
          dialog.showErrorBox('Cannot read game log', error.message);
        }
      } },
      { type: 'separator' },
      { role: 'quit' },
    ] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }] },
  ]));

  try {
    const result = await resolveLogPath({ explicitPath: readExplicitLogArgument() });
    if (result.logPath) await startLog(result.logPath);
  } catch (error) {
    startupError = error.message;
    console.error('[Linux] Log discovery:', error.message);
  }
  await createWindow();
}).catch((error) => {
  console.error('[Linux] Startup failed:', error);
  app.exit(1);
});

app.on('will-quit', () => {
  tor.stopTorLog();
});

// 应用退出前事件
app.on('before-quit', async (event) => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  console.log('应用即将退出，发送 before-quit 事件到前端...');
  try {
    // 发送事件到前端
    mainWindow.webContents.send('before-quit');
    // 给前端一点时间处理（100ms）
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('before-quit 事件已发送');
  } catch (error) {
    console.error('发送 before-quit 事件失败:', error);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ===================================================================
// 🛠️ IPC Handlers - 提供给网页调用的本地服务
// ===================================================================

// 获取操作系统信息
ipcMain.handle('get-os-info', () => {
  return {
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    // Keep the original API shape without disclosing the local user identity.
    username: '',
    homedir: '',
  };
});

// 打开文件选择器
ipcMain.handle('open-file-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
    });
    return { filePaths: result.filePaths, canceled: result.canceled };
  } catch (err) {
    return { error: err.message };
  }
});

// Preserve the original API without executing website-provided shell commands.
ipcMain.handle('run-shell-command', async (event, command) => {
  const match = String(command).match(/^(?:xdg-open|start(?:\s+"")?)\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/);
  if (match) {
    try {
      await openExternalURL(match[1] || match[2] || match[3]);
      return { stdout: '', stderr: '' };
    } catch (error) {
      return { stdout: '', stderr: error.message, error: error.message };
    }
  }
  return { stdout: '', stderr: '', error: 'Shell commands are disabled in the Linux port' };
});

// 保存数据到临时文件
ipcMain.handle('save-to-temp', async (event, data, filename = 'output.txt') => {
  try {
    const filePath = await saveTemporaryFile(data, filename);
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

module.exports = {
  ipcMessageQueue,
};
