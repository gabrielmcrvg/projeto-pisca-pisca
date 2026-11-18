// Saúde das contas: avisos, notificações do Windows, recarga automática e detecção de internet.
const path = require('node:path');
const { app, Menu, Notification, net, shell } = require('electron');
const { ctx, paths, START_URL, APP_ID, alive } = require('./context');
const { label } = require('./config');
const icon = paths.icon;
const { AccountMonitor } = require('./monitor');
const accounts = require('./accounts');
const ui = require('./main-window');

// ---------- Saúde das contas: avisos e recarga automática ----------
function watch(a, wc) {
  const m = new AccountMonitor(wc, { auto: ctx.config.autoReload, online: ctx.online });
  ctx.monitors.set(a.id, m);
  m.on('change', () => ui.state());
  m.on('alert', () => queueAlert(a));
  m.on('reload', kind => {
    if (wc.isDestroyed()) return;
    const url = wc.getURL();
    if (kind === 'loadfail' || kind === 'offline' || !url || url === 'about:blank') accounts.navigate(a.id, a.url || START_URL);
    else wc.reload();
  });
}

const notices = new Set();   // mantém as notificações vivas até serem fechadas

let alertBatch = [], alertTimer;

function queueAlert(a) {
  alertBatch.push(a.id);
  const owner = ctx.detached.get(a.id) || ctx.win;
  if (alive(owner) && !owner.isFocused()) owner.flashFrame(true);
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => {   // junta avisos próximos (ex.: a internet caiu para todas)
    const ids = [...new Set(alertBatch)].filter(id => ctx.monitors.get(id)?.problem);
    alertBatch = [];
    if (!ids.length || !Notification.isSupported()) return;
    const first = accounts.acc(ids[0]), m = ctx.monitors.get(ids[0]);
    const title = ids.length > 1 ? `${ids.length} contas com problema` : `${label(first)} — ${m.problem.message}`;
    const body = ids.length > 1
      ? ids.map(id => `${label(accounts.acc(id))}: ${ctx.monitors.get(id).problem.message}`).join('\n')
      : (ctx.config.autoReload ? 'O CorollaHUB vai recarregar a conta sozinho.' : 'Clique para ver a conta.');
    const n = new Notification({ title, body, icon: paths.icon });
    notices.add(n);
    n.on('click', () => accounts.reveal(ids[0]));
    n.on('close', () => notices.delete(n));
    n.show();
  }, 1500);
}

function watchNetwork() {
  setInterval(() => {
    const now = net.isOnline();
    if (now === ctx.online) return;
    ctx.online = now;
    for (const m of ctx.monitors.values()) m.setOnline(now);
    ui.state();
  }, 5000);
}

// Um atalho no Menu Iniciar com o mesmo AppUserModelID: o Windows só mostra as notificações
// de apps que têm um. De quebra, abre o CorollaHUB sem passar pelo CMD.
function ensureShortcut() {
  if (process.platform !== 'win32' || app.isPackaged) return;   // o instalador já cria o atalho
  try {
    const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'CorollaHUB.lnk');
    const wanted = { target: process.execPath, args: `"${paths.root}"`, cwd: paths.root, appUserModelId: APP_ID,
      icon: paths.iconIco, iconIndex: 0, description: 'CorollaHUB — várias contas em uma janela' };
    let current = null;
    try { current = shell.readShortcutLink(lnk); } catch {}
    if (current && current.target === wanted.target && current.args === wanted.args && current.appUserModelId === APP_ID) return;
    shell.writeShortcutLink(lnk, current ? 'replace' : 'create', wanted);
  } catch (e) { console.error('Atalho do Menu Iniciar:', e.message); }
}

// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { watch, queueAlert, watchNetwork, ensureShortcut });
