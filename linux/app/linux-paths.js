const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const APP_ID = '1974050';
const LOG_PARTS = ['UE_game', 'TorchLight', 'Saved', 'Logs', 'UE_game.log'];

// Steam's KeyValues files use quoted strings, braces, and C-style comments.
function parseVdf(text) {
  let cursor = 0;

  function nextToken() {
    while (cursor < text.length) {
      if (/\s/.test(text[cursor])) {
        cursor += 1;
      } else if (text.startsWith('//', cursor)) {
        const end = text.indexOf('\n', cursor + 2);
        cursor = end === -1 ? text.length : end + 1;
      } else if (text.startsWith('/*', cursor)) {
        const end = text.indexOf('*/', cursor + 2);
        if (end === -1) throw new Error('Unterminated VDF comment');
        cursor = end + 2;
      } else {
        break;
      }
    }

    if (cursor === text.length) return null;
    const char = text[cursor++];
    if (char === '{' || char === '}') return { type: char };

    if (char === '"') {
      let value = '';
      while (cursor < text.length) {
        const current = text[cursor++];
        if (current === '"') return { type: 'string', value };
        if (current === '\\' && cursor < text.length) {
          const escaped = text[cursor++];
          value += escaped === '\\' || escaped === '"' ? escaped : `\\${escaped}`;
        } else {
          value += current;
        }
      }
      throw new Error('Unterminated VDF string');
    }

    let value = char;
    while (cursor < text.length && !/[\s{}]/.test(text[cursor])) {
      if (text.startsWith('//', cursor) || text.startsWith('/*', cursor)) break;
      value += text[cursor++];
    }
    return { type: 'string', value };
  }

  function readObject(nested = false) {
    const result = Object.create(null);
    for (let key = nextToken(); key; key = nextToken()) {
      if (key.type === '}') {
        if (!nested) throw new Error('Unexpected VDF closing brace');
        return result;
      }
      if (key.type !== 'string') throw new Error('Expected VDF key');
      const value = nextToken();
      if (value?.type === '{') {
        result[key.value] = readObject(true);
      } else if (value?.type === 'string') {
        result[key.value] = value.value;
      } else {
        throw new Error('Expected VDF value');
      }
    }
    if (nested) throw new Error('Unterminated VDF object');
    return result;
  }

  return readObject();
}

function getField(object, name) {
  if (!object || typeof object !== 'object') return undefined;
  const key = Object.keys(object).find((key) => key.toLowerCase() === name);
  return key === undefined ? undefined : object[key];
}

async function readVdf(filename) {
  try {
    return parseVdf(await fs.readFile(filename, 'utf8'));
  } catch {
    // A missing or damaged Steam metadata file must not hide other libraries.
    return null;
  }
}

async function readableLog(filename) {
  const resolved = await fs.realpath(filename);
  const stats = await fs.stat(resolved);
  if (!stats.isFile()) {
    const error = new Error(`Game log is not a regular file: ${filename}`);
    error.code = 'EINVAL';
    throw error;
  }
  await fs.access(resolved, constants.R_OK);
  return resolved;
}

function defaultSteamRoots(homeDir, env) {
  return [
    path.join(env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share'), 'Steam'),
    path.join(homeDir, '.local', 'share', 'Steam'),
    path.join(homeDir, '.steam', 'steam'),
    path.join(homeDir, '.steam', 'root'),
    path.join(homeDir, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
  ];
}

async function resolveLogPath({
  explicitPath,
  homeDir = os.homedir(),
  env = process.env,
  steamRoots,
} = {}) {
  const hasExplicitPath = explicitPath !== undefined && explicitPath !== null;
  const requested = hasExplicitPath ? explicitPath : env.TLI_LOG_PATH;
  if (hasExplicitPath || (requested !== undefined && requested !== '')) {
    if (typeof requested !== 'string' || requested.trim() === '') {
      throw new TypeError('Game log path must be a non-empty string');
    }
    return {
      logPath: await readableLog(path.resolve(requested)),
      source: hasExplicitPath ? 'explicit' : 'env',
    };
  }

  const roots = steamRoots ?? defaultSteamRoots(homeDir, env);
  const seenLibraries = new Set();

  async function inspectLibrary(libraryPath) {
    let library;
    try {
      library = await fs.realpath(libraryPath);
      if (!(await fs.stat(library)).isDirectory() || seenLibraries.has(library)) return null;
    } catch {
      return null;
    }
    seenLibraries.add(library);

    const manifest = await readVdf(path.join(library, 'steamapps', `appmanifest_${APP_ID}.acf`));
    const installDir = getField(getField(manifest, 'appstate'), 'installdir');
    if (typeof installDir !== 'string' || installDir === '' || path.isAbsolute(installDir)) {
      return null;
    }
    const common = path.join(library, 'steamapps', 'common');
    const gameDir = path.resolve(common, installDir);
    const relative = path.relative(common, gameDir);
    if (relative === '..' || relative.startsWith(`..${path.sep}`)) return null;
    try {
      return await readableLog(path.join(gameDir, ...LOG_PARTS));
    } catch {
      return null;
    }
  }

  const seenRoots = new Set();
  for (const candidate of roots) {
    let root;
    try {
      root = await fs.realpath(candidate);
      if (!(await fs.stat(root)).isDirectory() || seenRoots.has(root)) continue;
    } catch {
      continue;
    }
    seenRoots.add(root);

    // The client library always wins over any external library it advertises.
    const primaryLog = await inspectLibrary(root);
    if (primaryLog) return { logPath: primaryLog, source: 'steam' };

    for (const directory of ['steamapps', 'config']) {
      const metadata = await readVdf(path.join(root, directory, 'libraryfolders.vdf'));
      const folders = getField(metadata, 'libraryfolders');
      if (!folders || typeof folders !== 'object') continue;
      const indexes = Object.keys(folders).filter((key) => /^\d+$/.test(key));
      indexes.sort((left, right) => Number(left) - Number(right));
      for (const index of indexes) {
        const entry = folders[index];
        const libraryPath = typeof entry === 'string' ? entry : getField(entry, 'path');
        if (typeof libraryPath !== 'string' || !path.isAbsolute(libraryPath)) continue;
        const logPath = await inspectLibrary(libraryPath);
        if (logPath) return { logPath, source: 'steam' };
      }
    }
  }

  return { logPath: null, source: null };
}

module.exports = { resolveLogPath };
