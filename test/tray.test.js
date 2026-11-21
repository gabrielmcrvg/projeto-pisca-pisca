const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function setup({ failTray = false, failBlocker = false } = {}) {
  const app = new EventEmitter(), windows = [], trays = [], started = [], stopped = [], errors = [];
  let quitCalls = 0;
  class Window extends EventEmitter {
    constructor(visible = true) {
      super(); this.visible = visible; this.dead = false; this.minimized = false;
      this.focused = false; this.closeCalls = 0; windows.push(this);
    }
    isDestroyed() { return this.dead; }
    isVisible() { return this.visible; }
    isMinimized() { return this.minimized; }
    hide() { this.visible = false; }
    show() { this.visible = true; }
    restore() { this.minimized = false; }
    focus() { this.focused = true; }
    close() { this.closeCalls++; this.dead = true; this.emit('closed'); }
    static getAllWindows() { return windows; }
  }
  class Tray extends EventEmitter {
    constructor(icon) { super(); if (failTray) throw new Error('No tray'); this.icon = icon; this.dead = false; trays.push(this); }
    setToolTip(text) { this.tip = text; }
    setContextMenu(menu) { this.menu = menu; }
    isDestroyed() { return this.dead; }
    destroy() { this.dead = true; }
  }
  const ctx = { win: new Window(), quitting: false };
  app.quit = () => { quitCalls++; app.emit('before-quit'); };
  const electron = { app, BrowserWindow: Window, Tray, Menu: { buildFromTemplate: template => template },
    dialog: { showErrorBox: (...args) => errors.push(args) },
    powerSaveBlocker: { start(type) { if (failBlocker) throw new Error('No blocker'); started.push(type); return 0; }, stop: id => stopped.push(id) },
  };
  const context = { ctx, APP_ID: 'test', paths: { iconIco: 'test.ico', icon: 'test.png' }, alive: w => Boolean(w) && !w.dead };
  const sandbox = { module: { exports: {} }, process: { platform: 'win32' },
    require(name) { if (name === 'electron') return electron; if (name === './context') return context; throw new Error(name); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/tray.js'), 'utf8'), sandbox);
  return { tray: sandbox.module.exports, electron, context, ctx, app, Window, windows, trays, started, stopped, errors, quitCalls: () => quitCalls };
}

test('bandeja usa ícone Windows e bloqueio que permite apagar o monitor', () => {
  const s = setup(); assert.equal(s.tray.install(), true); s.tray.install();
  assert.equal(s.trays.length, 1);
  assert.equal(s.trays[0].icon, 'test.ico');
  assert.deepEqual(s.started, ['prevent-app-suspension']);
});

test('ocultar preserva contas destacadas e janelas sem fechar nenhuma', () => {
  const s = setup(), detached = new s.Window(), alerts = new s.Window(), hiddenDex = new s.Window(false);
  s.tray.install(); assert.equal(s.tray.hide(), true);
  assert.equal(s.windows.every(w => !w.visible), true);
  assert.equal(s.windows.every(w => w.closeCalls === 0), true);
  s.tray.hide(); // minimizar e close repetidos não perdem as janelas guardadas
  s.ctx.win.minimized = true; s.tray.restore();
  assert.equal(s.ctx.win.visible && s.ctx.win.focused && !s.ctx.win.minimized, true);
  assert.equal(detached.visible && alerts.visible, true);
  assert.equal(hiddenDex.visible, false);
});

test('restaurar ignora janelas destruídas e aceita os dois cliques do ícone', () => {
  const s = setup(), child = new s.Window(); s.tray.install(); s.tray.hide(); child.dead = true;
  s.trays[0].emit('click'); assert.equal(s.ctx.win.visible, true);
  s.tray.hide(); s.trays[0].emit('double-click'); assert.equal(s.ctx.win.visible, true);
});

test('Sair chama app.quit e não oculta a janela durante o encerramento', () => {
  const s = setup(); s.tray.install(); s.app.on('before-quit', () => { s.ctx.quitting = true; });
  s.trays[0].menu.find(item => item.label === 'Sair do CorollaHUB').click();
  assert.equal(s.quitCalls(), 1); assert.equal(s.tray.hide(), false); assert.equal(s.tray.restore(), false);
});

test('encerrar remove ícone e libera bloqueio, inclusive ID zero, uma única vez', () => {
  const s = setup(); s.tray.install(); s.tray.dispose(); s.tray.dispose();
  assert.equal(s.trays[0].dead, true); assert.equal(s.tray.available(), false);
  assert.deepEqual(s.stopped, [0]);
});

test('falha ao criar bandeja mantém janela acessível e avisa o usuário', () => {
  const s = setup({ failTray: true }); assert.equal(s.tray.install(), false);
  assert.equal(s.tray.hide(), false); assert.equal(s.ctx.win.visible, true);
  assert.equal(s.errors.length, 1); assert.equal(s.started.length, 0);
});

test('falha no bloqueio de suspensão desfaz bandeja incompleta', () => {
  const s = setup({ failBlocker: true }); assert.equal(s.tray.install(), false);
  assert.equal(s.trays[0].dead, true); assert.equal(s.tray.hide(), false); assert.equal(s.errors.length, 1);
});

function loadMain(s) {
  const view = { webContents: { isDestroyed: () => false, close() { view.closed = true; } }, setVisible() {}, setBounds() {} };
  const config = { accounts: [{ id: 1 }], mode: 'grid', pokedex: {} };
  Object.assign(s.ctx, { config, ready: false, views: new Map(), monitors: new Map(), detached: new Map(), focus: null });
  let stops = 0, auxiliaryCloses = 0;
  class MainWindow extends s.Window {
    constructor() {
      super(); this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler() {}, send() {} });
      this.contentView = { addChildView() {} };
    }
    getContentSize() { return [1480,960]; }
    flashFrame() {}
    async loadFile() {}
    close() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      this.emit('close', event);
      if (!event.prevented) super.close();
    }
  }
  const accounts = { attached: () => config.accounts, pub: a => a, createView(a) { s.ctx.views.set(a.id,view); return view; }, navigate() {} };
  const auxiliary = { close() { auxiliaryCloses++; }, shownIn: () => false };
  const sandbox = { module: { exports: {} },
    require(name) {
      if (name === 'electron') return { ...s.electron, BrowserWindow: MainWindow, Menu: { setApplicationMenu() {} } };
      if (name === './context') return { ...s.context, paths: { page: () => 'hub.html' }, secured: {}, FRAME: 2 };
      if (name === './config') return { save() {}, loadConfig: () => config };
      if (name === './layout') return { layout: () => [{x:0,y:0,width:100,height:100}], HEADER:44,MAX:4,DETACHED_TOP:40 };
      if (name === './accounts') return accounts;
      if (name.startsWith('./windows/')) return auxiliary;
      if (name === './whatsapp') return { autoStart() {}, stop() { stops++; } };
      if (name === './extensions/catalog') return { ensureExtDir() {}, extLoadedNames: () => [], extErrors: new Map() };
      if (name === './health') return { watchNetwork() {}, ensureShortcut() {} };
      if (name === './shortcuts') return {};
      if (name === './tray') return s.tray;
      throw new Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/main-window.js'),'utf8'),sandbox);
  return { api: sandbox.module.exports, view, stops: () => stops, auxiliaryCloses: () => auxiliaryCloses };
}

test('X da janela principal só oculta; saída real fecha páginas e WhatsApp', async () => {
  const s = setup(), m = loadMain(s); await m.api.create();
  s.ctx.win.close();
  assert.equal(s.ctx.win.dead, false); assert.equal(s.ctx.win.visible, false);
  assert.equal(s.ctx.quitting, false); assert.equal(m.stops(), 0); assert.equal(m.auxiliaryCloses(), 0);
  assert.equal(m.view.closed, undefined);
  s.ctx.quitting = true; s.ctx.win.close();
  assert.equal(m.stops(), 1); assert.equal(m.auxiliaryCloses(), 4);
  assert.equal(m.view.closed, true); assert.equal(s.ctx.views.size, 0);
});

test('minimizar esconde e fim de sessão permite fechar sem bloquear o Windows', async () => {
  const s = setup(), m = loadMain(s); await m.api.create();
  s.ctx.win.emit('minimize'); assert.equal(s.ctx.win.visible, false);
  s.ctx.win.emit('session-end'); s.ctx.win.close();
  assert.equal(s.ctx.quitting, true); assert.equal(s.ctx.win.dead, true); assert.equal(m.stops(), 1);
});

test('entrada do app marca saída antes de fechar e reabre janela na segunda instância', () => {
  const s = setup(); let restored = 0, disposed = 0;
  Object.assign(s.app, { setName() {}, setAppUserModelId() {}, requestSingleInstanceLock: () => true,
    commandLine: { appendSwitch() {} }, whenReady: () => ({ then: () => ({ catch() {} }) }) });
  const sandbox = { module: { exports: {} }, process: { env: {}, platform: 'win32' },
    require(name) {
      if (name === 'node:path') return path;
      if (name === 'electron') return { app: s.app, dialog: {} };
      if (name === './context') return s.context;
      if (name === './main-window') return {};
      if (name === './ipc') return {};
      if (name === './tray') return { restore() { restored++; }, dispose() { disposed++; } };
      throw new Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/index.js'),'utf8'),sandbox);
  s.app.emit('second-instance'); assert.equal(restored, 1);
  s.app.emit('before-quit'); assert.equal(s.ctx.quitting, true);
  s.app.emit('will-quit'); assert.equal(disposed, 1);
});
