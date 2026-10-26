'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { windowBounds } = require('../linux/app/window-options');
const current = { x: 120, y: 200, width: 800, height: 600 };

test('window options preserve explicit zero coordinates and omitted dimensions', () => {
  assert.deepEqual(windowBounds({ x: 0, y: 0 }, current), { ...current, x: 0, y: 0 });
  assert.deepEqual(windowBounds({ width: 1280 }, current), { ...current, width: 1280 });
});

test('window options reject malformed numeric dimensions before calling Electron', () => {
  for (const options of [null, { width: 0 }, { height: -1 }, { x: NaN }, { x: '0' }, { height: 1.5 }]) {
    assert.throws(() => windowBounds(options, current), TypeError);
  }
});
