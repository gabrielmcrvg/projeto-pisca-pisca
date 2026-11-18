// Janela "Alertas": o que avisar e onde, estoque de cada conta, contadores de shiny e últimos alertas.
const { BrowserWindow } = require('electron');
const { ctx, paths, BG, secured, alive } = require('../context');
const alerts = require('../alerts');
const shiny = require('../shiny');
const gameupdate = require('../gameupdate');
const wa = require('../whatsapp');

let win = null;

function state() {
  const w = wa.state();
  return { alertas: true, ...alerts.summary(), shiny: shiny.summary(), autoUpdate: gameupdate.enabled(),
    whatsapp: { status: w.status, grupo: w.targetName || '', conectado: w.status === 'online' && Boolean(w.target), participantes: wa.participants() } };
}
function push() { if (alive(win)) win.webContents.send('state', state()); }
alerts.events.on('change', push);
shiny.events.on('change', push);
wa.events.on('change', push);

function openAlerts() {
  if (alive(win)) { if (win.isMinimized()) win.restore(); win.focus(); return; }
  win = new BrowserWindow({ width: 640, height: 820, minWidth: 520, minHeight: 560, parent: ctx.win, backgroundColor: BG, icon: paths.icon,
    title: 'CorollaHUB • Alertas', autoHideMenuBar: true, webPreferences: { ...secured, preload: paths.preload } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.on('page-title-updated', event => event.preventDefault());
  win.on('closed', () => { win = null; });
  win.loadFile(paths.page('alerts'));
}

function command(cmd, value) {
  if (cmd === 'ready') return push();
  if (cmd === 'alerts-set') { alerts.setConfig(value || {}); return; }
  if (cmd === 'shiny-set') { shiny.setCounts(Number(value?.id), value || {}); return; }
  if (cmd === 'alerts-autoupdate') { gameupdate.setEnabled(Boolean(value)); push(); return; }
  if (cmd === 'alerts-whatsapp') { require('./whatsapp').openWhatsApp(); return; }
}

const owns = wc => alive(win) && wc === win.webContents;
function close() { if (alive(win)) win.close(); }

Object.assign(module.exports, { openAlerts, command, owns, close });
