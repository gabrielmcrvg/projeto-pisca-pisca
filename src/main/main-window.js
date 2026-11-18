// Janela principal: cria a janela, posiciona os painéis das contas e envia o estado para a página.
const { app, BrowserWindow, Menu } = require('electron');
const { ctx, paths, START_URL, BG, FRAME, secured, alive } = require('./context');
const { save, loadConfig } = require('./config');
const { layout, HEADER, MAX, DETACHED_TOP } = require('./layout');
const icon = paths.icon, preload = paths.preload;
const accounts = require('./accounts');
const dex = require('./windows/pokedex');
const extWindow = require('./windows/extensions');
const waWindow = require('./windows/whatsapp');
const alertsWindow = require('./windows/alerts');
const wa = require('./whatsapp');
const extensions = require('./extensions/catalog');
const health = require('./health');
const keys = require('./shortcuts');

// Botões do topo (Pokédex, Auto, avisos): iguais na janela principal e nas destacadas.
// "Aberto" vale para a janela onde a telinha está agora.
function toolbar(owner) {
  return {
    autoReload: ctx.config.autoReload, online: ctx.online,
    alerts: ctx.config.accounts.filter(a => ctx.monitors.get(a.id)?.problem).length,
    loadingAny: ctx.config.accounts.some(a => a.loading),
    pokedexOpen: dex.shownIn(owner),
  };
}

function state() {
  if (!ctx.ready || !alive(ctx.win)) return;
  const list = accounts.attached(), [width, height] = ctx.win.getContentSize();
  const rects = layout(width, height, ctx.config.mode, list.length, list.findIndex(a => a.id === ctx.focus));
  ctx.win.webContents.send('state', {
    extensions: extensions.extLoadedNames(), extensionErrors: [...extensions.extErrors.values()],
    ...toolbar(ctx.win),
    mode: ctx.config.mode, focus: ctx.focus, active: ctx.active, total: ctx.config.accounts.length, max: MAX,
    panels: list.map((a, k) => ({ ...accounts.pub(a), rect: rects[k] })),
    detached: [...ctx.detached.keys()].map(id => accounts.pub(accounts.acc(id))),
  });
  for (const [id, dw] of ctx.detached) {
    if (!alive(dw)) continue;
    const [w, h] = dw.getContentSize();
    dw.webContents.send('state', { ...toolbar(dw), detachedWindow: true, focus: null, active: null,
      panels: [{ ...accounts.pub(accounts.acc(id)), rect: { x: 0, y: DETACHED_TOP, width: w, height: Math.max(HEADER + 1, h - DETACHED_TOP) } }] });
  }
}

function arrange() {
  if (!alive(ctx.win)) return;
  const list = accounts.attached(), [width, height] = ctx.win.getContentSize();
  if (ctx.focus !== null && !list.some(a => a.id === ctx.focus)) ctx.focus = null;
  layout(width, height, ctx.config.mode, list.length, list.findIndex(a => a.id === ctx.focus)).forEach((rect, k) => {
    const view = ctx.views.get(list[k].id);
    view.setVisible(Boolean(rect) && !ctx.dragging);
    if (rect) view.setBounds({ x: rect.x + FRAME, y: rect.y + HEADER, width: Math.max(1, rect.width - 2 * FRAME), height: Math.max(1, rect.height - HEADER - FRAME) });
  });
  for (const [id, dw] of ctx.detached) {
    if (!alive(dw)) continue;
    const [w, h] = dw.getContentSize();
    ctx.views.get(id).setVisible(true);
    ctx.views.get(id).setBounds({ x: 0, y: DETACHED_TOP + HEADER, width: w, height: Math.max(1, h - DETACHED_TOP - HEADER) });
  }
  state();
}

async function create() {
  ctx.config = loadConfig();
  ctx.config.accounts.forEach(a => { a.url = START_URL; });
  Menu.setApplicationMenu(null);
  ctx.win = new BrowserWindow({ width: 1480, height: 960, minWidth: 900, minHeight: 650, backgroundColor: BG, icon, title: 'CorollaHUB', webPreferences: { ...secured, preload } });
  ctx.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  ctx.win.webContents.on('will-navigate', event => event.preventDefault());
  ctx.win.webContents.on('before-input-event', (event, input) => { if (keys.shortcut(input, null)) event.preventDefault(); });
  ctx.win.on('page-title-updated', event => event.preventDefault());
  ctx.win.on('focus', () => ctx.win.flashFrame(false));
  for (const a of ctx.config.accounts) ctx.win.contentView.addChildView(accounts.createView(a));
  ctx.win.on('resize', arrange);
  // Fechar a janela principal encerra tudo; as janelas destacadas reabrem no mesmo lugar.
  ctx.win.on('close', () => {
    ctx.quitting = true;
    // fechar as janelinhas antes da principal evita travar ao sair
    dex.close();
    extWindow.close();
    waWindow.close();
    alertsWindow.close();
    wa.stop();
    try { save(); } catch {}
    for (const dw of ctx.detached.values()) if (alive(dw)) dw.close();
  });
  ctx.win.on('closed', () => {
    for (const v of ctx.views.values()) if (!v.webContents.isDestroyed()) v.webContents.close();
    ctx.views.clear();
    app.quit();
  });
  await ctx.win.loadFile(paths.page('hub'));
  ctx.ready = true;
  health.watchNetwork();
  health.ensureShortcut();
  wa.autoStart();
  extensions.ensureExtDir();
  arrange();
  for (const a of ctx.config.accounts) {
    accounts.navigate(a.id, START_URL);
    if (a.detached) accounts.detach(a.id);
  }
  if (ctx.config.pokedex?.open) dex.showPokedex();
}

// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { state, arrange, create });
