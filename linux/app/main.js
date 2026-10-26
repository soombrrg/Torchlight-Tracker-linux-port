// Linux adaptation of the active YiHuo ETor v1.3.0 release entry point.
// Original UI, translations and game calculations remain upstream-owned.
const isDev = process.env.TLI_DEBUG === '1';

// 非开发环境屏蔽 console.log，但保留 console.error 和 console.warn
if (!isDev) {
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalDebug = console.debug;

  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};

  // 可选：如果需要保留某些关键日志，可以使用 console.warn
  // console.warn 和 console.error 保持不变，用于错误和警告信息
}

const { app, BrowserWindow, ipcMain, dialog, shell, Menu, protocol, net } = require('electron');

const os = require('os');
const fs = require('fs').promises;
const path = require('path');
const { pathToFileURL } = require('url');
const tor = require('./log-reader');
const { resolveLogPath } = require('./linux-paths');
const { installRendererCompatibility } = require('./renderer-compat');
const packageJson = require('./package.json');
const wss = require('ws');

app.setName('etor-linux');
if (process.env.TLI_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.TLI_USER_DATA_DIR));
}
const rendererURL = process.env.TLI_RENDERER_URL || 'https://etor-beta.710421059.xyz/';
const errorPageURL = pathToFileURL(path.join(__dirname, 'connection-error.html')).href;
const rendererOrigin = new URL(rendererURL).origin;

let mainWindow;
let mainWindowRestoreBounds = null;
let isLoggingActive = false;
let currentLogPath = '';
let preferredLogPath = '';
let logConsumerReady = false;
let startupError = null;
let logOperation = Promise.resolve();

let wssServer = null;
let wssPort = null;

// IPC 消息发送节流机制
let ipcMessageQueue = [];
const ipcBatchSize = isDev ? 3000 : 1000; // 每批发送的消息数量
const ipcBatchInterval = 100; // 批量发送间隔（毫秒）
let isProcessingIpc = false; // <--- 使用一个更清晰的标志

// WebSocket 消息队列
let wssMessageQueue = [];
let isWaitingForBatchConfirm = false; // 是否正在等待批次确认
let pendingBatchId = null; // 当前等待确认的批次 ID
let pendingBatchCount = 0;
const wssBatchSize = isDev ? 3000 : 1000; // 每批发送的消息数量
let wssFallbackTimer = null; // WSS 确认兜底定时器（1s）

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    title: 'YiHuo ETor — Linux',
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalURL(url).catch((error) => console.error(error.message));
    return { action: 'deny' };
  });

  // Dev tools disabled for production
  // mainWindow.webContents.openDevTools();

  // Secret dev tools shortcut: press 0 fifteen times
  let zeroKeyPressCount = 0;
  let zeroKeyResetTimer = null;

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === '0') {
      zeroKeyPressCount++;

      // Clear existing timer and set new one
      if (zeroKeyResetTimer) {
        clearTimeout(zeroKeyResetTimer);
      }

      // Reset counter after 2 seconds of no presses
      zeroKeyResetTimer = setTimeout(() => {
        zeroKeyPressCount = 0;
      }, 2000);

      // Open dev tools on 15th press
      if (zeroKeyPressCount >= 15) {
        mainWindow.webContents.openDevTools();
        zeroKeyPressCount = 0;
        clearTimeout(zeroKeyResetTimer);
      }
    }
  });

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
  mainWindowRestoreBounds = mainWindow.getBounds();

  mainWindow.on('maximize', () => {
    if (typeof mainWindow.getNormalBounds === 'function') {
      mainWindowRestoreBounds = mainWindow.getNormalBounds();
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
        // 无论保存成功与否，都关闭窗口
        mainWindow.destroy();
      }
    }
    // 如果用户点击了"取消"，什么都不做，窗口保持打开
  });

  // 🔒 安全：防止跳转到非法网站
  mainWindow.webContents.on('will-navigate', (event, newURL) => {
    if (new URL(newURL).origin !== rendererOrigin && !newURL.startsWith(errorPageURL)) {
      event.preventDefault();
      openExternalURL(newURL).catch((error) => console.error(error.message));
    }
  });

  // 设置窗口选项
  ipcMain.on('set-window-options', (event, options) => {
    console.log('收到窗口选项设置请求:', options);

    // 获取当前窗口位置，保持位置不变
    const currentBounds = mainWindow.getBounds();
    console.log('当前窗口大小:', currentBounds);

    // 设置新的窗口大小
    mainWindow.setBounds({
      // x: currentBounds.x,
      // y: currentBounds.y,
      x: options.x ? options.x : currentBounds.x,
      y: options.y ? options.y : currentBounds.y,
      width: options.width,
      height: options.height,
    });

    // 验证设置是否成功
    const newBounds = mainWindow.getBounds();
    console.log('设置后窗口大小:', newBounds);

    if (options.autoHideMenuBar !== undefined) {
      mainWindow.setAutoHideMenuBar(options.autoHideMenuBar);
    }
    if (options.resizable !== undefined) {
      mainWindow.setResizable(options.resizable);
    }
    if (options.maximizable !== undefined) {
      mainWindow.setMaximizable(options.maximizable);
    }
    if (options.alwaysOnTop !== undefined) {
      mainWindow.setAlwaysOnTop(options.alwaysOnTop, 'screen-saver');
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

  ipcMain.handle('get-window-bounds', () => {
    const currentBounds = mainWindow.getBounds();
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
    console.log('应用获得焦点');
    mainWindow.webContents.send('app-focus');
  });

  app.on('browser-window-blur', () => {
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
    wssMessageQueue = [];
    clearTimeout(wssFallbackTimer);
    isWaitingForBatchConfirm = false;
    pendingBatchId = null;
    await tor.mainWatch(logPath, routeLogMessage);
    isLoggingActive = tor.getStatus().isRunning;
    currentLogPath = tor.getStatus().logPath;
    preferredLogPath = currentLogPath;
    startupError = null;
  });
  logOperation = operation;
  return operation;
}

let wsClient = null;

function maybeNotifyCanReadMore() {
  try {
    if (tor && typeof tor.notifyCanReadMore === 'function') {
      tor.notifyCanReadMore();
    }
  } catch (_) {}
}

function createWebSocketServer() {
  ipcMain.handle('get-wss-port', () => wssPort);
  return new Promise((resolve) => {
    wssServer = new wss.Server({ host: '127.0.0.1', port: 0 });
    wssServer.once('listening', () => {
      wssPort = wssServer.address().port;
      resolve();
    });
    wssServer.on('error', (error) => {
      console.error('[Linux] WebSocket unavailable; using IPC:', error.message);
      wssPort = null;
      resolve();
    });
    wssServer.on('connection', (ws) => {
      wsClient = ws;
      console.log('一个新的客户端已连接');

      // =========================================================
      // 关键：从 IPC 队列迁移消息到 WSS 队列，保证顺序
      // =========================================================
      if (ipcMessageQueue.length > 0) {
        console.log(`正在从 IPC 迁移 ${ipcMessageQueue.length} 条待处理消息到 WSS 队列...`);
        // 使用 unshift 将旧消息放在队列最前面，优先处理
        wssMessageQueue = wssMessageQueue.concat(ipcMessageQueue);
        ipcMessageQueue = []; // 清空 IPC 队列
      }

      // 重置等待确认状态（新连接建立时）
      isWaitingForBatchConfirm = false;
      pendingBatchId = null;
      pendingBatchCount = 0;

      // 客户端连接后，立即开始处理 WSS 队列（可能包含刚迁移过来的消息）
      processWssMessageQueue();

      // 如果日志正在运行，确保流控状态被重置
      if (isLoggingActive) {
        if (tor.resetFlowControl) tor.resetFlowControl();
      }

      wsClient.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());

          if (message.type === 'BATCH_PROCESSED') {
            if (isWaitingForBatchConfirm && message.batchId === pendingBatchId) {
              console.log(`收到 Worker 确认，批次 ID: ${message.batchId}`);
              isWaitingForBatchConfirm = false;
              pendingBatchId = null;
              pendingBatchCount = 0;
              if (wssFallbackTimer) {
                clearTimeout(wssFallbackTimer);
                wssFallbackTimer = null;
              }
              // 无论队列是否低于水位，都通知一次，让日志读取按“批次节拍”前进
              // 多次通知是幂等的，tor 端有 canReadMore/isReading 保护
              if (wssMessageQueue.length < 1000) {
                maybeNotifyCanReadMore();
              }
              // 收到确认后，立即处理下一批
              processWssMessageQueue();
            }
          } else if (message.type === 'READY') {
            console.log('Worker 已就绪，开始发送消息');
            processWssMessageQueue(); // Worker就绪，也可以触发一次处理
          }
        } catch (error) {}
      });

      const handleDisconnect = (reason) => {
        console.log(`❌ WebSocket 客户端已断开 (${reason}). 回退到稳定的 IPC 通道.`);
        wsClient = null;
        isWaitingForBatchConfirm = false; // 重置状态

        // =========================================================
        // 关键：将 WSS 队列中未处理的消息迁移回 IPC 队列
        // =========================================================
        if (wssMessageQueue.length > 0) {
          console.log(`正在从 WSS 迁移 ${wssMessageQueue.length} 条待处理消息到 IPC 队列...`);
          // 使用 push 将它们放在IPC队列末尾，因为它们是新消息
          // ipcMessageQueue.push(...wssMessageQueue);
          ipcMessageQueue = ipcMessageQueue.concat(wssMessageQueue);
          wssMessageQueue = [];
          // 立即启动IPC处理
          processIpcMessageQueue();
        }
      };

      wsClient.on('close', () => handleDisconnect('close'));
      wsClient.on('error', (error) => handleDisconnect(`error: ${error.message}`));
    });
  });

}

// 彻底重写 processWssMessageQueue 函数 (死锁修复)
function processWssMessageQueue() {
  if (
    isWaitingForBatchConfirm ||
    wssMessageQueue.length === 0 ||
    !wsClient ||
    wsClient.readyState !== wss.OPEN
  ) {
    return;
  }

  isWaitingForBatchConfirm = true;

  try {
    const batch = wssMessageQueue.splice(0, wssBatchSize);
    if (batch.length === 0) {
      isWaitingForBatchConfirm = false;
      return;
    }

    const batchId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    pendingBatchId = batchId;
    pendingBatchCount = batch.length;

    const batchMessage = JSON.stringify({
      type: 'BATCH',
      batchId,
      messages: batch,
      count: batch.length,
    });

    console.log(
      `[WSS发送] 发送批次 ${batchId}, 消息数: ${batch.length}, 队列剩余: ${wssMessageQueue.length}`,
    );
    wsClient.send(batchMessage);

    // 1 秒确认兜底：若 1s 内未收到确认，则视为已处理，推动继续读取
    if (wssFallbackTimer) clearTimeout(wssFallbackTimer);
    wssFallbackTimer = setTimeout(() => {
      if (isWaitingForBatchConfirm && pendingBatchId === batchId) {
        console.warn(`批次 ${batchId} 1s 未确认，兜底触发继续读取`);
        isWaitingForBatchConfirm = false;
        pendingBatchId = null;
        pendingBatchCount = 0;
        // 通知日志端继续读取
        if (wssMessageQueue.length < 1000) {
          maybeNotifyCanReadMore();
        }
        // 继续处理队列
        processWssMessageQueue();
      }
    }, 1000);
  } catch (error) {
    console.error('处理并发送WebSocket消息失败:', error);
    isWaitingForBatchConfirm = false;
  }
}

// ===================================================================
// 日志路由和 IPC 处理
// ===================================================================

// 这是唯一的日志入口函数，它决定消息的去向
function routeLogMessage(msg) {
  // 优先使用 WSS 通道
  if (wsClient && wsClient.readyState === wss.OPEN) {
    wssMessageQueue.push(msg);
    processWssMessageQueue();
  } else {
    // WSS 不可用时，回退到 IPC
    ipcMessageQueue.push(msg);
    // 关键：如果当前没有正在处理的循环，就启动一个
    if (!isProcessingIpc) {
      processIpcMessageQueue();
    }
  }
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
  await createWebSocketServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // tor日志相关
  ipcMain.handle('start-tor-log', async (event, options) => {
    const { logPath } = options;
    await startLog(logPath);
    return tor.getStatus();
  });

  ipcMain.handle('stop-tor-log', async () => {
    logOperation = logOperation.catch(() => {}).then(() => {
      tor.stopTorLog();
      isLoggingActive = false;
      currentLogPath = '';
      ipcMessageQueue = [];
      wssMessageQueue = [];
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
    const { url = rendererURL, ...winOpts } = options;
    if (new URL(url).origin !== rendererOrigin) throw new Error('Unexpected window origin');
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

    await win.loadURL(url);

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
        mainWindowRestoreBounds = win.getBounds();
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
        if (!mainWindowRestoreBounds) return;
        const currentBounds = win.getBounds();
        win.setBounds({
          x: currentBounds.x,
          y: currentBounds.y,
          width: mainWindowRestoreBounds.width,
          height: mainWindowRestoreBounds.height,
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
  clearTimeout(wssFallbackTimer);
  wssServer?.clients.forEach((client) => client.terminate());
  wssServer?.close();
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
  const filePath = path.join(os.tmpdir(), path.basename(filename));
  try {
    await fs.writeFile(filePath, data);
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

module.exports = {
  wssMessageQueue,
  ipcMessageQueue,
};
