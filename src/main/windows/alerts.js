// Janela "Alertas": o que avisar e onde, estoque de cada conta, contadores de shiny e últimos alertas.
const { BrowserWindow } = require('electron');
const { ctx, paths, BG, secured, alive } = require('../context');
const alerts = require('../alerts');
const shiny = require('../shiny');
const gameupdate = require('../gameupdate');
const wa = require('../whatsapp');

let win = null;
let pending = null, lastState = null;

function state() {
  const w = wa.state();
  return { alertas: true, ...alerts.summary(), shiny: shiny.summary(), autoUpdate: gameupdate.enabled(),
    whatsapp: { status: w.status, grupo: w.targetName || '', conectado: w.status === 'online' && Boolean(w.target), participantes: wa.participants() } };
}
// Agrupa rajadas das quatro contas. Apenas a interface espera até 150 ms;
// a detecção e o envio dos alertas continuam imediatos.
function publish(force = false) {
  if (pending !== null) { clearTimeout(pending); pending = null; }
  if (!alive(win)) return;
  const snapshot = state(), key = JSON.stringify(snapshot);
  if (!force && key === lastState) return;
  win.webContents.send('state', snapshot);
  lastState = key;
}
function push() {
  if (!alive(win) || pending !== null) return;
  pending = setTimeout(() => { pending = null; publish(); }, 150);
}
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
  win.on('closed', () => {
    if (pending !== null) clearTimeout(pending);
    pending = null; lastState = null; win = null;
  });
  win.loadFile(paths.page('alerts'));
}

function command(cmd, value) {
  if (cmd === 'ready') return publish(true);
  if (cmd === 'alerts-set') { alerts.setConfig(value || {}); return; }
  if (cmd === 'shiny-set') { shiny.setCounts(Number(value?.id), value || {}); return; }
  if (cmd === 'alerts-autoupdate') { gameupdate.setEnabled(Boolean(value)); push(); return; }
  if (cmd === 'alerts-whatsapp') { require('./whatsapp').openWhatsApp(); return; }
}

const owns = wc => alive(win) && wc === win.webContents;
function close() { if (alive(win)) win.close(); }

Object.assign(module.exports, { openAlerts, command, owns, close });
