'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { saveTemporaryFile } = require('../linux/app/safe-temp');

test('temporary exports use unique private directories and cannot overwrite an existing same-name file', async (t) => {
  const first = await saveTemporaryFile('first', '../../export.txt');
  const second = await saveTemporaryFile('second', 'export.txt');
  for (const file of [first, second]) {
    t.after(() => fs.rm(path.dirname(file), { recursive: true, force: true }));
    assert.equal(path.basename(file), 'export.txt');
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    assert.equal((await fs.stat(path.dirname(file))).mode & 0o777, 0o700);
  }
  assert.notEqual(path.dirname(first), path.dirname(second));
  assert.equal(await fs.readFile(first, 'utf8'), 'first');
  assert.equal(await fs.readFile(second, 'utf8'), 'second');
});

test('temporary exports reject invalid names and failed writes leave no export file', async () => {
  for (const name of ['', '.', '..', null, 'bad\0name']) {
    await assert.rejects(saveTemporaryFile('data', name));
  }
  await assert.rejects(saveTemporaryFile(undefined, 'invalid-data.txt'));
});
