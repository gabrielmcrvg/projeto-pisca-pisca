const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function setup() {
  const timers = new Map(), windows = [], sent = [];
  const alerts = { events: new EventEmitter(), summary: () => ({ gold: value }) };
  const shiny = { events: new EventEmitter(), summary: () => ({ total: 0 }) };
  const wa = { events: new EventEmitter(), state: () => ({}), participants: () => [] };
  let next = 0, value = 0, summaries = 0;
  alerts.summary = () => { summaries++; return { value }; };
  class BrowserWindow extends EventEmitter {
    constructor() {
      super(); this.dead = false;
      this.webContents = Object.assign(new EventEmitter(), {
        send: (channel, state) => sent.push({ channel, state }), setWindowOpenHandler() {},
      });
      windows.push(this);
    }
    loadFile() {}
    close() { this.dead = true; this.emit('closed'); }
  }
  const sandbox = { module: { exports: {} },
    setTimeout(fn, delay) { assert.equal(delay, 150); timers.set(++next, fn); return next; },
    clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === 'electron') return { BrowserWindow };
      if (name === '../context') return { ctx: {}, paths: { page: () => 'alerts.html' }, secured: {}, alive: w => w && !w.dead };
      if (name === '../alerts') return alerts;
      if (name === '../window-chrome') return require('../src/main/window-chrome');
      if (name === '../shiny') return shiny;
      if (name === '../whatsapp') return wa;
      if (name === '../gameupdate') return { enabled: () => true };
      throw new Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/windows/alerts.js'), 'utf8'), sandbox);
  return { api: sandbox.module.exports, timers, windows, sent, alerts, shiny, wa,
    value(v) { value = v; }, summaries: () => summaries,
    flush() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
  };
}

test('janela fechada não monta estados nem agenda atualizações', () => {
  const app = setup();
  app.alerts.events.emit('change'); app.shiny.events.emit('change');
  assert.equal(app.timers.size, 0);
  assert.equal(app.summaries(), 0);
});

test('cem mudanças viram uma atualização com o estado mais recente', () => {
  const app = setup(); app.api.openAlerts(); app.api.command('ready');
  for (let i = 1; i <= 100; i++) { app.value(i); app.alerts.events.emit('change'); }
  assert.equal(app.timers.size, 1);
  assert.equal(app.summaries(), 1);
  app.flush();
  assert.equal(app.sent.length, 2);
  assert.equal(app.sent[1].state.value, 100);
  assert.equal(app.summaries(), 2);
});

test('não reenvia estado igual, mas responde ao ready de uma página recarregada', () => {
  const app = setup(); app.api.openAlerts(); app.api.command('ready');
  app.wa.events.emit('change'); app.flush();
  assert.equal(app.sent.length, 1);
  app.api.command('ready');
  assert.equal(app.sent.length, 2);
});

test('fechar cancela trabalho pendente; reabrir recebe o estado atual', () => {
  const app = setup(); app.api.openAlerts(); app.api.command('ready');
  app.value(7); app.alerts.events.emit('change'); app.api.close();
  assert.equal(app.timers.size, 0);
  app.api.openAlerts(); app.api.command('ready');
  assert.equal(app.sent.at(-1).state.value, 7);
});
