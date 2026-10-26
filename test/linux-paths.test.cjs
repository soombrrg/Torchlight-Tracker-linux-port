const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveLogPath } = require('../linux/app/linux-paths.js');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tli-linux-paths-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return {
    directory,
    options: { homeDir: directory, env: {} },
    root: path.join(directory, '.local', 'share', 'Steam'),
  };
}

async function writeFile(filename, text = '') {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, text);
  return filename;
}

async function installGame(root, installDir = 'Torchlight Infinite', { log = true } = {}) {
  await writeFile(
    path.join(root, 'steamapps', 'appmanifest_1974050.acf'),
    `"AppState" { "appid" "1974050" "installdir" ${JSON.stringify(installDir)} }`,
  );
  const filename = path.join(
    root,
    'steamapps',
    'common',
    installDir,
    'UE_game',
    'TorchLight',
    'Saved',
    'Logs',
    'UE_game.log',
  );
  if (log) await writeFile(filename, '[redacted gameplay fixture]\n');
  return filename;
}

test('explicit path takes precedence over environment and installed Steam game', async (t) => {
  const { directory, options, root } = await fixture(t);
  await installGame(root);
  const explicitPath = await writeFile(path.join(directory, 'selected game.log'));
  const environmentPath = await writeFile(path.join(directory, 'environment game.log'));

  assert.deepEqual(
    await resolveLogPath({ ...options, explicitPath, env: { TLI_LOG_PATH: environmentPath } }),
    { logPath: explicitPath, source: 'explicit' },
  );
});

test('TLI_LOG_PATH wins over automatic discovery and invalid explicit inputs never fall back', async (t) => {
  const { directory, options, root } = await fixture(t);
  await installGame(root);
  const environmentPath = await writeFile(path.join(directory, 'environment.log'));
  assert.deepEqual(await resolveLogPath({ ...options, env: { TLI_LOG_PATH: environmentPath } }), {
    logPath: environmentPath,
    source: 'env',
  });

  const missing = path.join(directory, 'missing.log');
  await assert.rejects(resolveLogPath({ ...options, explicitPath: missing }), { code: 'ENOENT' });
  await assert.rejects(resolveLogPath({ ...options, env: { TLI_LOG_PATH: missing } }), {
    code: 'ENOENT',
  });
  await assert.rejects(resolveLogPath({ ...options, explicitPath: directory }), { code: 'EINVAL' });
  await assert.rejects(resolveLogPath({ ...options, explicitPath: '' }), TypeError);
});

test('modern libraryfolders handles spaces, escaped quotes, backslashes and comments', async (t) => {
  const { directory, options, root } = await fixture(t);
  const secondary = path.join(directory, 'Games \\ archive "quoted"');
  const logPath = await installGame(secondary, 'Torchlight Infinite "special"');
  await writeFile(
    path.join(root, 'steamapps', 'libraryfolders.vdf'),
    `// Steam-generated header\n"libraryfolders" {\n` +
      `  "0" { "path" ${JSON.stringify(root)} "apps" { "480" "1" } }\n` +
      `  /* optional secondary library */ "1" { "path" ${JSON.stringify(secondary)} }\n}`,
  );

  assert.deepEqual(await resolveLogPath(options), { logPath, source: 'steam' });
});

test('legacy libraryfolders uses numeric entries and ignores metadata', async (t) => {
  const { directory, options, root } = await fixture(t);
  const secondary = path.join(directory, 'Legacy Library');
  const logPath = await installGame(secondary);
  await writeFile(
    path.join(root, 'steamapps', 'libraryfolders.vdf'),
    `"LibraryFolders" { "TimeNextStatsReport" "12345" "1" ${JSON.stringify(secondary)} }`,
  );
  assert.deepEqual(await resolveLogPath(options), { logPath, source: 'steam' });
});

test('primary Steam library wins; secondary libraries are checked by numeric index', async (t) => {
  const { directory, options, root } = await fixture(t);
  const primaryLog = await installGame(root);
  const secondary = path.join(directory, 'Library 2');
  const tenth = path.join(directory, 'Library 10');
  const secondaryLog = await installGame(secondary);
  await installGame(tenth);
  await writeFile(
    path.join(root, 'steamapps', 'libraryfolders.vdf'),
    `"libraryfolders" { "10" { "path" ${JSON.stringify(tenth)} } ` +
      `"2" { "path" ${JSON.stringify(secondary)} } }`,
  );
  assert.deepEqual(await resolveLogPath(options), { logPath: primaryLog, source: 'steam' });

  await fs.unlink(primaryLog);
  assert.deepEqual(await resolveLogPath(options), { logPath: secondaryLog, source: 'steam' });
});

test('honors XDG_DATA_HOME before the default Steam location', async (t) => {
  const { directory, options, root } = await fixture(t);
  await installGame(root);
  const dataHome = path.join(directory, 'xdg data');
  const logPath = await installGame(path.join(dataHome, 'Steam'));
  assert.deepEqual(await resolveLogPath({ ...options, env: { XDG_DATA_HOME: dataHome } }), {
    logPath,
    source: 'steam',
  });
});

test('discovers Flatpak Steam without scanning arbitrary home directories', async (t) => {
  const { directory, options } = await fixture(t);
  await installGame(path.join(directory, 'unrelated', 'Steam'));
  assert.deepEqual(await resolveLogPath(options), { logPath: null, source: null });
  const logPath = await installGame(
    path.join(directory, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  );
  assert.deepEqual(await resolveLogPath(options), { logPath, source: 'steam' });
});

test('canonicalizes symlink roots and explicit log symlinks', async (t) => {
  const { directory, options, root } = await fixture(t);
  const logPath = await installGame(root);
  const alias = path.join(directory, 'Steam alias');
  await fs.symlink(root, alias, 'dir');
  assert.deepEqual(await resolveLogPath({ ...options, steamRoots: [alias, root] }), {
    logPath,
    source: 'steam',
  });
  const logAlias = path.join(directory, 'log alias');
  await fs.symlink(logPath, logAlias);
  assert.deepEqual(await resolveLogPath({ ...options, explicitPath: logAlias }), {
    logPath,
    source: 'explicit',
  });
});

test('missing installation, missing log, malformed metadata and directory log return null', async (t) => {
  const { directory, options, root } = await fixture(t);
  assert.deepEqual(await resolveLogPath(options), { logPath: null, source: null });
  const logPath = await installGame(root, 'Torchlight Infinite', { log: false });
  assert.deepEqual(await resolveLogPath(options), { logPath: null, source: null });
  await fs.mkdir(logPath, { recursive: true });
  await writeFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), '"libraryfolders" { "1"');
  assert.deepEqual(await resolveLogPath(options), { logPath: null, source: null });

  const secondary = path.join(directory, 'Secondary');
  const secondaryLog = await installGame(secondary);
  assert.deepEqual(await resolveLogPath({ ...options, steamRoots: [root, secondary] }), {
    logPath: secondaryLog,
    source: 'steam',
  });
});
