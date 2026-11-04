import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { ImageResponse } from '../node_modules/vinext/dist/shims/og.js';

test('vinext ImageResponse completes a local PNG render', async () => {
  const response = new ImageResponse(createElement('div', {
    style: {
      display: 'flex', width: '100%', height: '100%',
      alignItems: 'center', justifyContent: 'center',
      background: 'white', color: 'black', fontSize: 24,
    },
  }, 'ChatUI'), { width: 240, height: 120 });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  const png = Buffer.from(await response.arrayBuffer());
  assert.deepEqual(png.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(png.readUInt32BE(16), 240);
  assert.equal(png.readUInt32BE(20), 120);
  assert.ok(png.length > 1000, 'the response must contain rendered image data');
});
