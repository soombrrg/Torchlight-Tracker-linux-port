'use strict';

function windowBounds(options, current) {
  if (!options || typeof options !== 'object') throw new TypeError('Window options are required');
  const bounds = { ...current };
  for (const key of ['x', 'y', 'width', 'height']) {
    if (options[key] === undefined) continue;
    if (!Number.isSafeInteger(options[key]) || (['width', 'height'].includes(key) && options[key] < 1)) {
      throw new TypeError(`Invalid window ${key}`);
    }
    bounds[key] = options[key];
  }
  return bounds;
}

module.exports = { windowBounds };
