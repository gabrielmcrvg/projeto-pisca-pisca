// ChatGPT numa janelinha flutuante, móvel e sempre por cima do app.
const { app, BrowserWindow, WebContentsView, screen, shell } = require('electron');
const { ctx, paths, BG, secured, alive, onScreen } = require('../context');
const { save, saveSoon } = require('../config');
const icon = paths.icon, preload = paths.preload;
const accounts = require('../accounts');
const ui = require('../main-window');

// ---------- ChatGPT: janelinha flutuante, móvel, presa ao CorollaHUB ----------
const CHAT_URL = 'https://chatgpt.com/';

const CHAT_HEAD = 40;                       // altura da barra do topo do chat

const CHAT_SIZE = { width: 420, height: 640 };

const CHAT_PILL = { width: 236, height: CHAT_HEAD };

let chatWin = null, chatView = null, chatLoading = false;

// Sites de login costumam recusar navegadores embutidos; o chat se apresenta como um Chrome comum.
const plainUserAgent = () => app.userAgentFallback.replace(/\s(?:Quadra|quadra-browser|CorollaHUB|Electron)\/\S+/g, '');

const isHttps = url => { try { return new URL(url).protocol === 'https:'; } catch { return false; } };

function chatState() {
  if (!alive(chatWin)) return;
  chatWin.webContents.send('state', { chat: true, collapsed: Boolean(ctx.config.chat.collapsed), loading: chatLoading });
}

function rememberChat() {
  if (!alive(chatWin) || chatWin.isMinimized()) return;
  if (ctx.config.chat.collapsed) ctx.config.chat.pill = chatWin.getBounds();
  else ctx.config.chat.bounds = chatWin.getBounds();
  saveSoon();
}

function layoutChat() {
  if (!alive(chatWin) || !chatView) return;
  const [w, h] = chatWin.getContentSize();
  chatView.setVisible(!ctx.config.chat.collapsed);
  chatView.setBounds({ x: 0, y: CHAT_HEAD, width: w, height: Math.max(1, h - CHAT_HEAD) });
}

// Posição padrão: canto inferior direito da janela principal.
function chatCorner(size) {
  const b = alive(ctx.win) ? ctx.win.getContentBounds() : screen.getPrimaryDisplay().workArea;
  return { x: b.x + b.width - size.width - 18, y: b.y + b.height - size.height - 18, ...size };
}

function openChat() {
  if (alive(chatWin)) { if (ctx.config.chat.collapsed) setChatCollapsed(false); chatWin.show(); chatWin.focus(); return; }
  const collapsed = Boolean(ctx.config.chat.collapsed);
  const saved = collapsed ? ctx.config.chat.pill : ctx.config.chat.bounds;
  const bounds = onScreen(saved) ? saved : chatCorner(collapsed ? CHAT_PILL : CHAT_SIZE);
  chatWin = new BrowserWindow({
    ...bounds, frame: false, parent: ctx.win, skipTaskbar: true, maximizable: false, fullscreenable: false,
    resizable: !collapsed, minWidth: collapsed ? CHAT_PILL.width : 320, minHeight: collapsed ? CHAT_HEAD : 320,
    backgroundColor: BG, icon, title: 'CorollaHUB • ChatGPT', webPreferences: { ...secured, preload },
  });
  chatWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  chatWin.webContents.on('will-accounts.navigate', event => event.preventDefault());
  chatWin.webContents.on('before-input-event', (event, input) => { if (chatKeys(input)) event.preventDefault(); });

  chatView = new WebContentsView({ webPreferences: { ...secured, partition: 'persist:quadra-chatgpt' } });
  const wc = chatView.webContents, ses = wc.session;
  ses.setUserAgent(plainUserAgent());
  wc.setUserAgent(plainUserAgent());
  // só a escrita na área de transferência (botões "copiar" do ChatGPT); o resto é negado
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'clipboard-sanitized-write'));
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write');
  wc.setWindowOpenHandler(({ url }) => isHttps(url)
    ? { action: 'allow', overrideBrowserWindowOptions: { parent: chatWin, autoHideMenuBar: true, icon, title: 'CorollaHUB • ChatGPT',
        webPreferences: { ...secured, partition: 'persist:quadra-chatgpt' } } }
    : { action: 'deny' });
  wc.on('did-ui.create-window', child => child.webContents.setUserAgent(plainUserAgent()));
  wc.on('will-accounts.navigate', (event, url) => { if (!isHttps(url)) event.preventDefault(); });
  wc.on('did-start-loading', () => { chatLoading = true; chatState(); });
  wc.on('did-stop-loading', () => { chatLoading = false; chatState(); });
  for (const ev of ['did-accounts.navigate', 'did-accounts.navigate-in-page']) wc.on(ev, () => {
    const url = wc.getURL();
    try { if (new URL(url).hostname.endsWith('chatgpt.com')) { ctx.config.chat.url = url; saveSoon(); } } catch {}
  });
  wc.on('before-input-event', (event, input) => { if (chatKeys(input)) event.preventDefault(); });
  chatWin.contentView.addChildView(chatView);

  chatWin.on('resize', () => { layoutChat(); rememberChat(); });
  chatWin.on('move', rememberChat);
  chatWin.on('close', () => { if (!ctx.quitting) { ctx.config.chat.open = false; save(); } });
  // a página do chat só é fechada depois que a janela terminou de fechar (fechar antes travava o app)
  chatWin.on('closed', () => {
    const view = chatView;
    chatWin = null; chatView = null;
    if (view && !view.webContents.isDestroyed()) view.webContents.close();
    ui.state();
  });
  ctx.config.chat.open = true;
  save();
  layoutChat();
  ui.state();
  chatWin.loadFile(paths.page('chat'));
  wc.loadURL(isHttps(ctx.config.chat.url) ? ctx.config.chat.url : CHAT_URL).catch(() => {});
}

// Recolher deixa só a barrinha no canto (o canto inferior direito fica no mesmo lugar).
function setChatCollapsed(collapsed) {
  if (!alive(chatWin) || Boolean(ctx.config.chat.collapsed) === collapsed) return;
  const b = chatWin.getBounds();
  if (collapsed) ctx.config.chat.bounds = b;
  ctx.config.chat.collapsed = collapsed;
  const size = collapsed ? CHAT_PILL : { width: ctx.config.chat.bounds?.width || CHAT_SIZE.width, height: ctx.config.chat.bounds?.height || CHAT_SIZE.height };
  let next = { x: b.x + b.width - size.width, y: b.y + b.height - size.height, ...size };
  if (!collapsed && !onScreen(next)) next = chatCorner(size);
  chatWin.setResizable(true);
  chatWin.setMinimumSize(collapsed ? CHAT_PILL.width : 320, collapsed ? CHAT_HEAD : 320);
  chatWin.setBounds(next);
  chatWin.setResizable(!collapsed);
  layoutChat(); rememberChat(); chatState(); ui.state();
}

function toggleChat() {
  if (!alive(chatWin)) return openChat();
  if (!chatWin.isVisible() || chatWin.isMinimized()) { chatWin.show(); chatWin.focus(); return; }
  if (ctx.config.chat.collapsed) { setChatCollapsed(false); chatWin.focus(); }
  else setChatCollapsed(true);
  ui.state();
}

function chatKeys(input) {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return false;
  const ctrl = input.control || input.meta, k = (input.key || '').toLowerCase();
  if (ctrl && !input.alt && !input.shift && k === 'g') { toggleChat(); return true; }
  if (input.key === 'F5' && chatView) { chatView.webContents.reload(); return true; }
  return false;
}

function chatCommand(cmd) {
  if (!alive(chatWin)) return;
  const wc = chatView?.webContents;
  if (cmd === 'chat-reload' && wc) wc.reload();
  if (cmd === 'chat-home' && wc) wc.loadURL(CHAT_URL).catch(() => {});
  if (cmd === 'chat-collapse') setChatCollapsed(!ctx.config.chat.collapsed);
  if (cmd === 'chat-external' && wc && isHttps(wc.getURL())) shell.openExternal(wc.getURL());
  if (cmd === 'chat-close') chatWin.close();
}
const isOpen = () => alive(chatWin) && !ctx.config.chat.collapsed;
const isCollapsed = () => alive(chatWin) && Boolean(ctx.config.chat.collapsed);
const owns = wc => alive(chatWin) && wc === chatWin.webContents;
function close() { if (alive(chatWin)) chatWin.close(); }


// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { CHAT_URL, CHAT_HEAD, CHAT_SIZE, CHAT_PILL, plainUserAgent, isHttps, chatState, rememberChat, layoutChat, chatCorner, openChat, setChatCollapsed, toggleChat, chatKeys, chatCommand, isOpen, isCollapsed, owns, close });
