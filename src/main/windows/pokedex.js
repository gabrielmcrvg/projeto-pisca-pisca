// Pokédex: telinha de consulta que abre/fecha e fica por cima do app.
const { app, BrowserWindow, screen } = require('electron');
const { ctx, paths, BG, secured, alive, onScreen } = require('../context');
const { save, saveSoon } = require('../config');
const icon = paths.icon, preload = paths.preload;
const accounts = require('../accounts');
const chat = require('./chat');
const ui = require('../main-window');

let pokedex = null;

// ---------- Pokédex: telinha de consulta, sempre por cima do app ----------
// O botão (ou Ctrl+P) alterna: abre / esconde. Esconder guarda filtros e rolagem para a próxima vez.
const DEX_SIZE = { width: 980, height: 700 };

function dexCorner() {
  const b = alive(ctx.win) ? ctx.win.getContentBounds() : screen.getPrimaryDisplay().workArea;
  return { x: b.x + 18, y: Math.max(b.y, b.y + b.height - DEX_SIZE.height - 18), ...DEX_SIZE };
}

const pokedexShown = () => alive(pokedex) && pokedex.isVisible() && !pokedex.isMinimized();

function rememberPokedex() {
  if (!alive(pokedex) || !pokedex.isVisible() || pokedex.isMinimized()) return;
  ctx.config.pokedex = { ...ctx.config.pokedex, bounds: pokedex.getBounds() };
  saveSoon();
}

function createPokedex() {
  const saved = ctx.config.pokedex?.bounds;
  pokedex = new BrowserWindow({
    ...(onScreen(saved) ? saved : dexCorner()), frame: false, parent: ctx.win, skipTaskbar: true, maximizable: false, fullscreenable: false,
    minWidth: 640, minHeight: 420, backgroundColor: BG, icon, title: 'CorollaHUB • Pokédex',
    webPreferences: { ...secured, preload },
  });
  pokedex.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pokedex.webContents.on('will-accounts.navigate', event => event.preventDefault());
  pokedex.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const k = (input.key || '').toLowerCase(), ctrl = input.control || input.meta;
    if (ctrl && !input.alt && !input.shift && k === 'p') { event.preventDefault(); togglePokedex(); }
    if (ctrl && !input.alt && !input.shift && k === 'g') { event.preventDefault(); chat.toggleChat(); }
  });
  pokedex.on('page-title-updated', event => event.preventDefault());
  pokedex.on('move', rememberPokedex);
  pokedex.on('resize', rememberPokedex);
  // ✕ ou Alt+F4: só esconde (a não ser que o app esteja fechando)
  pokedex.on('close', event => { if (!ctx.quitting) { event.preventDefault(); hidePokedex(); } });
  pokedex.on('closed', () => { pokedex = null; });
  pokedex.on('show', () => ui.state());
  pokedex.on('hide', () => ui.state());
  pokedex.loadFile(paths.page('pokedex'));
}

function showPokedex() {
  if (!alive(pokedex)) createPokedex();
  else { if (pokedex.isMinimized()) pokedex.restore(); pokedex.show(); pokedex.focus(); }
  ctx.config.pokedex = { ...ctx.config.pokedex, open: true };
  save(); ui.state();
}

function hidePokedex() {
  if (alive(pokedex)) pokedex.hide();
  ctx.config.pokedex = { ...ctx.config.pokedex, open: false };
  save(); ui.state();
  if (alive(ctx.win)) ctx.win.focus();
}

const togglePokedex = () => (pokedexShown() ? hidePokedex() : showPokedex());

const openPokedex = showPokedex;
const owns = wc => alive(pokedex) && wc === pokedex.webContents;
function close() { if (alive(pokedex)) pokedex.close(); }


// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { DEX_SIZE, dexCorner, pokedexShown, rememberPokedex, createPokedex, showPokedex, hidePokedex, togglePokedex, openPokedex, owns, close });
