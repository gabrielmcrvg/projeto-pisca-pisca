const test = require('node:test');
const assert = require('node:assert/strict');
const windowChrome = require('../src/main/window-chrome');

test('barra Windows preserva controles nativos e usa as cores do app', () => {
  assert.deepEqual(windowChrome('win32'), {
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#181b21', symbolColor: '#a1a9b6', height: 32 },
  });
});

test('fora do Windows conserva a moldura do sistema', () => {
  assert.deepEqual(windowChrome('darwin'), {});
  assert.deepEqual(windowChrome('linux'), {});
});

test('opções são independentes entre janelas', () => {
  const first = windowChrome('win32');
  first.titleBarOverlay.color = '#ffffff';
  assert.equal(windowChrome('win32').titleBarOverlay.color, '#181b21');
});
