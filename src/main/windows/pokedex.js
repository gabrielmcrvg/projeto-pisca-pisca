// Pokédex: telinha de consulta que abre/fecha e fica por cima do app.
const { app, BrowserWindow, screen } = require('electron');
const { ctx, paths, BG, secured, alive, onScreen, ownerWindow, sameDisplay, fitOnDisplay } = require('../context');
const { save, saveSoon } = require('../config');
const icon = paths.icon, preload = paths.preload;
const accounts = require('../accounts');
const chat = require('./chat');
const ui = require('../main-window');

let pokedex = null;

// ---------- Pokédex: telinha de consulta, sempre por cima do app ----------
// O botão (ou Ctrl+P) alterna: abre / esconde. Esconder guarda filtros e rolagem para a próxima vez.
const DEX_SIZE = { width: 980, height: 700 };

// Canto inferior esquerdo da janela dona (a principal ou a conta destacada onde o botão foi clicado).
function dexCorner(owner = ctx.win, size = DEX_SIZE) {
  const b = alive(owner) ? owner.getContentBounds() : screen.getPrimaryDisplay().workArea;
  return fitOnDisplay({ x: b.x + 18, y: Math.max(b.y, b.y + b.height - size.height - 18), width: size.width, height: size.height });
}
const parentOf = () => (alive(pokedex) ? pokedex.getParentWindow() : null);

const pokedexShown = () => alive(pokedex) && pokedex.isVisible() && !pokedex.isMinimized();

function rememberPokedex() {
  if (!alive(pokedex) || !pokedex.isVisible() || pokedex.isMinimized()) return;
  ctx.config.pokedex = { ...ctx.config.pokedex, bounds: pokedex.getBounds() };
  saveSoon();
}

function createPokedex(owner = ctx.win) {
  const saved = ctx.config.pokedex?.bounds;
  pokedex = new BrowserWindow({
    // a posição salva só vale se estiver no mesmo monitor da janela dona
    ...(onScreen(saved) && sameDisplay(saved, owner) ? saved : dexCorner(owner)), frame: false, parent: owner, skipTaskbar: true, maximizable: false, fullscreenable: false,
    minWidth: 640, minHeight: 420, backgroundColor: BG, icon, title: 'CorollaHUB • Pokédex',
    webPreferences: { ...secured, preload },
  });
  pokedex.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pokedex.webContents.on('will-navigate', event => event.preventDefault());
  pokedex.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    const k = (input.key || '').toLowerCase(), ctrl = input.control || input.meta;
    if (ctrl && !input.alt && !input.shift && k === 'p') { event.preventDefault(); togglePokedex(parentOf()); }
    if (ctrl && !input.alt && !input.shift && k === 'g') { event.preventDefault(); chat.openChat(); }
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

// Passa a telinha para outra janela dona (ex.: botão clicado numa conta destacada em outro monitor).
function moveDexTo(owner) {
  if (!alive(pokedex) || parentOf() === owner) return;
  pokedex.setParentWindow(owner);
  const { width, height } = pokedex.getBounds();
  pokedex.setBounds(dexCorner(owner, { width, height }));
}
// A janela dona vai fechar: a telinha volta para a principal (senão fecharia junto).
function adopt(w) {
  if (!ctx.quitting && alive(pokedex) && parentOf() === w && w !== ctx.win) moveDexTo(ctx.win);
}

function showPokedex(from) {
  const owner = ownerWindow(from);
  if (!alive(pokedex)) createPokedex(owner);
  else { moveDexTo(owner); if (pokedex.isMinimized()) pokedex.restore(); pokedex.show(); pokedex.focus(); }
  ctx.config.pokedex = { ...ctx.config.pokedex, open: true };
  save(); ui.state();
}

function hidePokedex() {
  if (alive(pokedex)) pokedex.hide();
  ctx.config.pokedex = { ...ctx.config.pokedex, open: false };
  save(); ui.state();
  const owner = parentOf();
  if (alive(owner)) owner.focus();
}

const shownIn = w => pokedexShown() && parentOf() === w;
// O botão alterna aberta ↔ fechada; clicado em outra janela, a telinha vai para ela.
const togglePokedex = from => (shownIn(ownerWindow(from)) ? hidePokedex() : showPokedex(from));

const openPokedex = showPokedex;
const owns = wc => alive(pokedex) && wc === pokedex.webContents;
function close() { if (alive(pokedex)) pokedex.close(); }


// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { DEX_SIZE, dexCorner, pokedexShown, rememberPokedex, createPokedex, showPokedex, hidePokedex, togglePokedex, openPokedex, owns, close, shownIn, adopt, moveDexTo });
