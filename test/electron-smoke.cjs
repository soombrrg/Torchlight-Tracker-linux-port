// Launch with Electron under Xvfb; all data and pages are local fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { app } = require('electron');
const connectionErrorMode = process.argv.includes('--connection-error');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'etor-linux-smoke-'));
const logPath = path.join(temporary, 'UE_game.log');
fs.writeFileSync(logPath, 'old history must not be replayed\n');
process.env.TLI_LOG_PATH = logPath;
process.env.TLI_USER_DATA_DIR = path.join(temporary, 'profile');
delete process.env.TLI_DEBUG;

const fixtureFiles = {
  '/': ['renderer.html', 'text/html'],
  '/renderer.js': ['renderer.js', 'text/javascript'],
  '/assets/bridge-fixture.js': ['bridge-fixture.js', 'text/javascript'],
};
const fixtureServer = http.createServer((request, response) => {
  const entry = fixtureFiles[new URL(request.url, 'http://fixture').pathname];
  if (!entry) { response.writeHead(404); response.end(); return; }
  response.setHeader('content-type', entry[1]);
  response.end(fs.readFileSync(path.join(__dirname, 'fixtures', entry[0])));
});

const deadline = setTimeout(() => finish(new Error('Electron smoke test timed out')), 20000);
let finished = false;

function finish(error, report) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  try {
    require('../linux/app/log-reader').stopTorLog();
    fixtureServer.closeAllConnections();
    fixtureServer.close();
    fs.rmSync(temporary, { recursive: true, force: true });
    if (error) process.stderr.write(`${error.stack}\n`);
    else {
      const output = path.join(__dirname, connectionErrorMode
        ? '../docs/evidence/linux-electron-connection-error.json'
        : '../docs/evidence/linux-electron-smoke.json');
      fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
  } finally {
    app.exit(error ? 1 : 0);
  }
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await predicate()) return;
    await delay(25);
  }
  throw new Error('Renderer assertion timed out');
}

let windowCount = 0;
app.on('browser-window-created', (_event, window) => {
  windowCount++;
  fs.appendFileSync(logPath, 'queued before renderer ready\n');
  if (connectionErrorMode) {
    let checking = false;
    window.webContents.on('did-finish-load', async () => {
      if (checking || !window.webContents.getURL().includes('/connection-error.html')) return;
      checking = true;
      try {
        const result = await window.webContents.executeJavaScript(`({
          title: document.title,
          message: document.body.textContent.includes('Cannot reach the original ETor interface'),
          retry: Boolean(document.querySelector('#retry')),
          close: Boolean(document.querySelector('#close')),
          bridge: Boolean(window.electronAPI)
        })`);
        assert.equal(result.message, true);
        assert.equal(result.retry, true);
        assert.equal(result.close, true);
        assert.equal(result.bridge, true);
        finish(null, { electron: process.versions.electron, local_missing_file_only: true, checks: result });
      } catch (error) {
        finish(error);
      }
    });
    return;
  }
  window.webContents.once('did-finish-load', async () => {
    try {
      const evaluate = (code) => window.webContents.executeJavaScript(code);
      await waitFor(() => evaluate('window.fixtureReady === true'));
      const status = await evaluate('window.electronAPI.getTorStatus()');
      assert.equal(status.isRunning, true);
      assert.equal(status.currentLogPath, logPath);
      assert.equal(await evaluate('(async () => (await window.electronAPI.getBackVersion()).version)()'), '1.0.5');
      const osInfo = await evaluate('window.electronAPI.getOSInfo()');
      assert.equal(osInfo.platform, 'linux');
      assert.equal(osInfo.username, '');
      assert.equal(osInfo.homedir, '');
      assert.equal(await evaluate('window.electronAPI.getWindowId()'), window.id);
      assert.equal(window.webContents.getLastWebPreferences().contextIsolation, true);
      assert.equal(window.webContents.getLastWebPreferences().nodeIntegration, false);

      const lines = Array.from({ length: 1205 }, (_, index) => `fixture-line-${index}`);
      fs.appendFileSync(logPath, `${lines.join('\n')}\n`);
      await waitFor(async () => await evaluate('window.receivedLogLines.length') === lines.length + 1);
      assert.deepEqual(await evaluate('window.receivedLogLines'), ['queued before renderer ready', ...lines]);

      const split = Buffer.from('UTF-8 Проверка 火\n');
      fs.appendFileSync(logPath, split.subarray(0, split.length - 3));
      await delay(300);
      assert.equal(await evaluate('window.receivedLogLines.length'), lines.length + 1);
      fs.appendFileSync(logPath, split.subarray(split.length - 3));
      await waitFor(async () => await evaluate('window.receivedLogLines.length') === lines.length + 2);
      assert.equal(await evaluate('window.receivedLogLines.at(-1)'), 'UTF-8 Проверка 火');

      const reloaded = new Promise((resolve) => window.webContents.once('did-finish-load', resolve));
      window.webContents.reload();
      fs.appendFileSync(logPath, 'queued during renderer reload\n');
      await reloaded;
      await waitFor(() => evaluate('window.fixtureReady === true'));
      await waitFor(async () => await evaluate('window.receivedLogLines.length') === 1);
      assert.deepEqual(await evaluate('window.receivedLogLines'), ['queued during renderer reload']);

      assert.equal(await evaluate('window.restartLikeOriginalWorker()'), logPath);
      assert.equal((await evaluate('window.electronAPI.getTorStatus()')).isRunning, true);

      const forbidden = path.join(temporary, 'must-not-exist');
      const blocked = await evaluate(`window.electronAPI.runShellCommand(${JSON.stringify(`touch ${forbidden}`)})`);
      assert.ok(blocked.error);
      assert.equal(fs.existsSync(forbidden), false);

      await assert.rejects(evaluate(`window.electronAPI.startTorLog(${JSON.stringify(path.join(temporary, 'missing.log'))})`));
      const stopped = await evaluate('window.electronAPI.getTorStatus()');
      assert.equal(stopped.isRunning, false);
      assert.equal(stopped.isLoggingActive, false);
      await evaluate(`window.electronAPI.startTorLog(${JSON.stringify(logPath)})`);
      const restarted = await evaluate('window.electronAPI.getTorStatus()');
      assert.equal(restarted.isRunning, true);
      assert.equal(restarted.isLoggingActive, true);

      await evaluate('window.electronAPI.stopTorLog()');
      assert.equal((await evaluate('window.electronAPI.getTorStatus()')).isRunning, false);
      finish(null, {
        electron: process.versions.electron,
        node: process.versions.node,
        platform: process.platform,
        window_count: windowCount,
        renderer: 'loopback HTTP fixture; upstream website and APIs were not contacted',
        game: 'temporary synthetic log only; game installation and process were not touched',
        checks: {
          context_isolation: true,
          node_integration_disabled: true,
          automatic_log_start: true,
          queued_before_renderer_ready: true,
          original_backend_version: true,
          os_info_identity_redacted: true,
          ipc_lines_in_order: lines.length,
          utf8_partial_line: true,
          renderer_reload: true,
          original_worker_path_recovery: true,
          shell_execution_disabled: true,
          bad_path_rejects_with_truthful_status: true,
          restart: true,
          stop: true,
        },
      });
    } catch (error) {
      finish(error);
    }
  });
});

fixtureServer.listen(0, '127.0.0.1', () => {
  process.env.TLI_RENDERER_URL = connectionErrorMode
    ? require('node:url').pathToFileURL(path.join(temporary, 'missing-renderer.html')).href
    : `http://127.0.0.1:${fixtureServer.address().port}/`;
  require('../linux/app/main');
});
