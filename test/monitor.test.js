const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { AccountMonitor, BACKOFF } = require('../src/main/monitor');

// Uma página falsa: emite os mesmos eventos que o webContents do Electron.
function fakePage() {
  const wc = new EventEmitter();
  wc.url = 'https://pokeidle.io/app';
  wc.getURL = () => wc.url;
  wc.isDestroyed = () => false;
  const dbg = new EventEmitter();
  let attached = false;
  dbg.isAttached = () => attached;
  dbg.attach = () => { attached = true; };
  dbg.detach = () => { attached = false; };
  dbg.sendCommand = async () => ({});
  wc.debugger = dbg;
  let n = 0;
  wc.navigate = () => wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
  wc.load = () => { wc.navigate(); wc.emit('did-finish-load'); };
  wc.openSocket = (host = 'pokeidle.io') => { const id = `ws${++n}`; dbg.emit('message', {}, 'Network.webSocketCreated', { requestId: id, url: `wss://${host}/ws` }); return id; };
  wc.closeSocket = id => dbg.emit('message', {}, 'Network.webSocketClosed', { requestId: id });
  return wc;
}
function setup(opts) {
  const wc = fakePage(), m = new AccountMonitor(wc, opts), log = { alerts: 0, reloads: [] };
  m.on('alert', () => log.alerts++);
  m.on('reload', kind => log.reloads.push(kind));
  wc.load();
  return { wc, m, log };
}

test('travou: avisa, recarrega em 10 s e some quando a página volta', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m, log } = setup();
  wc.emit('render-process-gone', {}, { reason: 'crashed' });
  assert.equal(m.public.kind, 'crash');
  assert.equal(log.alerts, 1);
  assert.equal(m.public.retryAt - Date.now(), BACKOFF[0] * 1000);
  t.mock.timers.tick(BACKOFF[0] * 1000);
  assert.deepEqual(log.reloads, ['crash']);
  wc.load();
  assert.equal(m.public, null);
  m.dispose();
});

test('socket do jogo caiu: espera 30 s o jogo reconectar sozinho antes de agir', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m, log } = setup();
  const s1 = wc.openSocket();
  wc.closeSocket(s1);
  t.mock.timers.tick(20_000);
  wc.openSocket(); // o próprio jogo reconectou
  t.mock.timers.tick(60_000);
  assert.equal(m.public, null);
  assert.equal(log.alerts, 0);
  m.dispose();
});

test('socket do jogo caiu e não voltou: avisa e recarrega; reconectar limpa o aviso', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m, log } = setup();
  wc.closeSocket(wc.openSocket());
  t.mock.timers.tick(30_000);
  assert.equal(m.public.kind, 'disconnected');
  t.mock.timers.tick(BACKOFF[0] * 1000);
  assert.deepEqual(log.reloads, ['disconnected']);
  wc.load(); wc.openSocket();
  assert.equal(m.public, null);
  m.dispose();
});

test('recarregar a página fecha o socket sem gerar aviso', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m, log } = setup();
  const s = wc.openSocket();
  wc.navigate(); wc.closeSocket(s); wc.emit('did-finish-load');
  t.mock.timers.tick(120_000);
  assert.equal(m.public, null);
  assert.equal(log.alerts, 0);
  m.dispose();
});

test('sockets de outros sites são ignorados', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m } = setup();
  wc.closeSocket(wc.openSocket('outro.site'));
  t.mock.timers.tick(60_000);
  assert.equal(m.public, null);
  m.dispose();
});

test('depois de recarregar duas vezes sem o jogo conectar, sugere entrar de novo e para', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m, log } = setup();
  wc.closeSocket(wc.openSocket());
  t.mock.timers.tick(30_000);
  t.mock.timers.tick(BACKOFF[0] * 1000); wc.load();
  t.mock.timers.tick(45_000);
  assert.equal(m.public.kind, 'disconnected');
  t.mock.timers.tick(BACKOFF[1] * 1000); wc.load();
  t.mock.timers.tick(45_000);
  assert.equal(m.public.kind, 'login');
  t.mock.timers.tick(600_000);
  assert.equal(log.reloads.length, 2);
  m.dispose();
});

test('falhas seguidas usam espera crescente e pausam depois de 5 tentativas', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m, log } = setup();
  for (const wait of BACKOFF) {
    wc.emit('did-fail-load', {}, -106, 'offline', wc.url, true);
    assert.equal(m.public.retryAt - Date.now(), wait * 1000);
    t.mock.timers.tick(wait * 1000);
  }
  wc.emit('did-fail-load', {}, -106, 'x', wc.url, true);
  assert.equal(m.public.paused, true);
  assert.equal(m.public.retryAt, null);
  assert.equal(log.reloads.length, BACKOFF.length);
  assert.equal(log.alerts, 1, 'só um aviso por queda');
  m.dispose();
});

test('sem internet espera a conexão; quando volta, recarrega na hora', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m, log } = setup();
  m.setOnline(false);
  wc.emit('did-fail-load', {}, -106, 'x', wc.url, true);
  assert.equal(m.public.kind, 'offline');
  t.mock.timers.tick(600_000);
  assert.equal(log.reloads.length, 0);
  m.setOnline(true);
  assert.deepEqual(log.reloads, ['offline']);
  wc.load();
  assert.equal(m.public, null);
  m.dispose();
});

test('com a recarga automática desligada só avisa', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m, log } = setup({ auto: false });
  wc.emit('render-process-gone', {}, { reason: 'crashed' });
  t.mock.timers.tick(600_000);
  assert.equal(m.public.kind, 'crash');
  assert.equal(log.reloads.length, 0);
  m.setAuto(true);
  t.mock.timers.tick(BACKOFF[0] * 1000);
  assert.equal(log.reloads.length, 1);
  m.dispose();
});

test('recarregar à mão ou dispensar limpa o aviso e zera as tentativas', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m, log } = setup();
  wc.emit('render-process-gone', {}, { reason: 'crashed' });
  m.manual();
  assert.equal(m.public, null);
  t.mock.timers.tick(600_000);
  assert.equal(log.reloads.length, 0);
  m.dispose();
});

test('página sem resposta por 20 s vira aviso; se responder antes, nada acontece', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { wc, m } = setup();
  wc.emit('unresponsive'); t.mock.timers.tick(10_000); wc.emit('responsive');
  t.mock.timers.tick(30_000);
  assert.equal(m.public, null);
  wc.emit('unresponsive'); t.mock.timers.tick(20_000);
  assert.equal(m.public.kind, 'unresponsive');
  wc.emit('responsive');
  assert.equal(m.public, null);
  m.dispose();
});
