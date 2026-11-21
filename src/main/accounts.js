// Contas: uma sessão e uma página por conta; navegar, adicionar, remover, destacar, renomear e esquecer login.
const { BrowserWindow, WebContentsView, dialog } = require('electron');
const { ctx, paths, START_URL, BG, secured, alive, onScreen } = require('./context');
const { label, save, saveSoon, fresh } = require('./config');
const { MAX } = require('./layout');
const icon = paths.icon, preload = paths.preload;
const extensions = require('./extensions/catalog');
const health = require('./health');
const keys = require('./shortcuts');
const ui = require('./main-window');
const windowChrome = require('./window-chrome');
const dex = require('./windows/pokedex');

function safeURL(value) {
  let text = String(value || '').trim();
  if (!text) throw Error('Digite o endereço do jogo.');
  if (!/^https?:\/\//i.test(text)) text = 'https://' + text;
  const url = new URL(text);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Use um endereço HTTP ou HTTPS sem senha.');
  return url.href;
}

const acc = id => ctx.config.accounts.find(a => a.id === id);

const attached = () => ctx.config.accounts.filter(a => !ctx.detached.has(a.id));

function pub(a) {
  const alert = ctx.monitors.get(a.id)?.public ?? null;
  return { id: a.id, name: a.name, label: label(a), type: a.type, slot: ctx.config.accounts.indexOf(a) + 1,
    url: a.url, zoom: a.zoom, muted: a.muted, loading: a.loading, alert, error: alert?.message || '' };
}

async function navigate(id, url) {
  const a = acc(id), view = ctx.views.get(id);
  if (!a || !view) return;
  await view.extensionsReady;
  try { await view.webContents.loadURL(url); }
  catch { /* o monitor da conta mostra o aviso e tenta de novo */ }
}

function createView(a) {
  const id = a.id, partition = `persist:quadra-account-${id}`;
  const view = new WebContentsView({ webPreferences: { ...secured, partition } });
  ctx.views.set(id, view);
  const wc = view.webContents;
  view.extensionsReady = extensions.loadExtensions(wc.session);
  wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  wc.session.setPermissionCheckHandler(() => false);
  wc.setAudioMuted(a.muted);
  wc.setZoomFactor(a.zoom);
  wc.setWindowOpenHandler(({ url }) => {
    try { safeURL(url); } catch { return { action: 'deny' }; }
    return { action: 'allow', overrideBrowserWindowOptions: { title: `CorollaHUB • Conta ${id}`, icon, autoHideMenuBar: true, webPreferences: { ...secured, partition } } };
  });
  wc.on('will-navigate', (event, url) => { try { safeURL(url); } catch { event.preventDefault(); } });
  wc.on('did-start-loading', () => { a.loading = true; ui.state(); });
  wc.on('did-stop-loading', () => { a.loading = false; ui.state(); });
  for (const event of ['did-navigate', 'did-navigate-in-page']) wc.on(event, () => {
    try { a.url = safeURL(wc.getURL()); saveSoon(); ui.state(); } catch {}
  });
  wc.on('did-finish-load', () => wc.setZoomFactor(a.zoom));
  wc.on('focus', () => { if (ctx.active !== id) { ctx.active = id; ui.state(); } });
  wc.on('before-input-event', (event, input) => { if (keys.shortcut(input, id)) event.preventDefault(); });
  health.watch(a, wc);
  return view;
}

function reveal(id) {
  const target = ctx.detached.get(id) || ctx.win;
  if (!alive(target)) return;
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
  const wc = ctx.views.get(id)?.webContents;
  if (wc && !wc.isDestroyed()) wc.focus();
}

function reloadAccount(a) {
  const wc = ctx.views.get(a.id)?.webContents;
  if (!wc || wc.isDestroyed()) return;
  ctx.monitors.get(a.id)?.manual();
  const url = wc.getURL();
  if (!url || url === 'about:blank' || ctx.monitors.get(a.id)?.failedThisLoad) navigate(a.id, a.url || START_URL);
  else wc.reload();
}

function reloadAll() { for (const a of ctx.config.accounts) reloadAccount(a); }

// ---------- Nome e tipo de cada conta ----------
function rename(a, name) {
  a.name = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
  const dw = ctx.detached.get(a.id);
  if (alive(dw)) dw.setTitle(`CorollaHUB • ${label(a)}`);
}

// Apaga tudo o que a sessão desta conta guardou (cookies, dados de sites, cache), para entrar com outro login.
// As outras contas têm sessões próprias e não são afetadas.
async function forgetLogin(a, owner) {
  const { response } = await dialog.showMessageBox(owner && !owner.isDestroyed() ? owner : undefined, {
    type: 'warning', buttons: ['Esquecer login', 'Cancelar'], defaultId: 1, cancelId: 1, noLink: true,
    title: 'Esquecer login', message: `Esquecer o login da ${label(a)}?`,
    detail: 'Apaga os cookies, os dados salvos e o cache só desta conta — as outras contas não mudam. ' +
      'A página volta para a tela de entrar, para você usar outro login.\n\n' +
      'Também zera as medições que a extensão guardou nesta conta. Não dá para desfazer.',
  });
  if (response !== 0 || !acc(a.id)) return;
  const wc = ctx.views.get(a.id)?.webContents;
  if (!wc || wc.isDestroyed()) return;
  ctx.monitors.get(a.id)?.manual();
  await wc.loadURL('about:blank').catch(() => {});   // fecha o jogo antes, para ele não regravar a sessão
  const ses = wc.session;
  await ses.clearStorageData();
  await ses.clearCache();
  await ses.clearAuthCache();
  a.url = START_URL;
  save();
  navigate(a.id, START_URL);
  if (alive(ctx.win)) ctx.win.webContents.send('ui', { notice: `Login da ${label(a)} esquecido — entre com outra conta` });
}

// ---------- Atalhos de teclado (valem com o foco no jogo, no painel ou numa janela destacada) ----------
function toggleMute(a) {
  a.muted = !a.muted;
  ctx.views.get(a.id)?.webContents.setAudioMuted(a.muted);
  save(); ui.state();
}

function addAccount() {
  if (ctx.config.accounts.length >= MAX) throw Error(`O máximo é ${MAX} contas.`);
  const used = new Set(ctx.config.accounts.map(a => a.id));
  let id = 1; while (used.has(id)) id++;   // reaproveita o número: o login daquela conta volta
  const a = fresh(id);
  ctx.config.accounts.push(a);
  ctx.win.contentView.addChildView(createView(a));
  navigate(id, START_URL);
}

function removeAccount(id) {
  if (ctx.config.accounts.length <= 1) throw Error('Mantenha pelo menos uma conta aberta.');
  const view = ctx.views.get(id);
  ctx.views.delete(id);
  ctx.monitors.get(id)?.dispose();
  ctx.monitors.delete(id);
  ctx.config.accounts = ctx.config.accounts.filter(a => a.id !== id);
  if (ctx.focus === id) ctx.focus = null;
  if (ctx.active === id) ctx.active = null;
  const dw = ctx.detached.get(id);
  if (alive(dw)) dw.close();
  else if (alive(ctx.win)) ctx.win.contentView.removeChildView(view);
  if (!view.webContents.isDestroyed()) view.webContents.close();
}

function detach(id, at) {
  const a = acc(id);
  if (!a) return;
  if (ctx.detached.has(id)) { const dw = ctx.detached.get(id); if (dw.isMinimized()) dw.restore(); dw.focus(); return; }
  const view = ctx.views.get(id);
  let bounds = onScreen(a.detached) ? a.detached : null;
  if (!bounds && at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
    bounds = { x: Math.round(at.x - 160), y: Math.round(at.y - 20), width: 960, height: 720 };
    if (!onScreen(bounds)) bounds = null;
  }
  const dw = new BrowserWindow({
    ...windowChrome(),
    ...(bounds || { width: 960, height: 720 }), minWidth: 420, minHeight: 300, backgroundColor: BG, icon,
    title: `CorollaHUB • ${label(a)}`, autoHideMenuBar: true, webPreferences: { ...secured, preload },
  });
  dw.webContents.on('before-input-event', (event, input) => { if (keys.shortcut(input, id)) event.preventDefault(); });
  dw.on('page-title-updated', event => event.preventDefault());
  dw.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  dw.webContents.on('will-navigate', event => event.preventDefault());
  ctx.detached.set(id, dw);
  if (alive(ctx.win)) ctx.win.contentView.removeChildView(view);
  dw.contentView.addChildView(view);
  a.detached = dw.getBounds();
  if (ctx.focus === id) ctx.focus = null;
  const remember = () => { if (alive(dw) && !dw.isMinimized() && !dw.isMaximized() && acc(id)) { a.detached = dw.getBounds(); saveSoon(); } };
  dw.on('resize', () => { remember(); ui.arrange(); });
  dw.on('move', remember);
  dw.on('focus', () => dw.flashFrame(false));
  // Fechar a janela destacada devolve a conta para a janela principal (a página continua aberta).
  dw.on('close', () => {
    // a Pokédex que estava por cima desta janela volta para a principal
    dex.adopt(dw);
    ctx.detached.delete(id);
    try { dw.contentView.removeChildView(view); } catch {}
    if (ctx.quitting) return;
    if (acc(id)) {
      a.detached = null;
      if (alive(ctx.win) && !view.webContents.isDestroyed()) ctx.win.contentView.addChildView(view);
    }
    save(); ui.arrange();
  });
  dw.loadFile(paths.page('hub'), { query: { conta: String(id) } });
  save(); ui.arrange();
}

// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { safeURL, acc, attached, pub, navigate, createView, reveal, reloadAccount, reloadAll, rename, forgetLogin, toggleMute, addAccount, removeAccount, detach });
