'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function saveTemporaryFile(data, filename = 'output.txt') {
  if (typeof filename !== 'string') throw new TypeError('A filename is required');
  const name = path.basename(filename);
  if (!name || name === '.' || name === '..' || name.includes('\0')) throw new Error('Invalid filename');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'torchlight-tracker-'));
  const filePath = path.join(directory, name);
  try {
    await fs.writeFile(filePath, data, { flag: 'wx', mode: 0o600 });
    return filePath;
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

module.exports = { saveTemporaryFile };
