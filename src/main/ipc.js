// Comandos que as páginas mandam ao processo principal (via preload).
const { app, BrowserWindow, ipcMain } = require('electron');
const { ctx, MODES, alive } = require('./context');
const { TYPE_KEYS, save } = require('./config');
const { layout, MAX } = require('./layout');
const accounts = require('./accounts');
const chat = require('./windows/chat');
const dex = require('./windows/pokedex');
const extWindow = require('./windows/extensions');
const waWindow = require('./windows/whatsapp');
const alertsWindow = require('./windows/alerts');
const menus = require('./menus');
const ui = require('./main-window');

function isTrusted(event) {
  const sender = event.sender;
  if (event.senderFrame !== sender.mainFrame) return false;
  if (alive(ctx.win) && sender === ctx.win.webContents) return true;
  if (extWindow.owns(sender) || dex.owns(sender) || waWindow.owns(sender) || alertsWindow.owns(sender)) return true;
  return [...ctx.detached.values()].some(dw => alive(dw) && dw.webContents === sender);
}

ipcMain.handle('command', async (event, cmd, value) => {
  if (!isTrusted(event)) return { error: 'Acesso negado' };
  try {
    if (extWindow.owns(event.sender)) return await extWindow.extCommand(cmd, value, BrowserWindow.fromWebContents(event.sender));
    if (waWindow.owns(event.sender)) return await waWindow.waCommand(cmd, value);
    if (alertsWindow.owns(event.sender)) return alertsWindow.command(cmd, value);
    if (dex.owns(event.sender)) { if (cmd === 'pokedex-hide') dex.hidePokedex(); return; }
    if (cmd === 'ready') { ui.arrange(); return; }
    if (cmd === 'chat') { chat.openChat(); return; }
    if (cmd === 'layout' && MODES.includes(value)) { ctx.config.mode = value; ctx.focus = null; ui.arrange(); save(); return; }
    if (cmd === 'reload-all') { accounts.reloadAll(); return; }
    if (cmd === 'pokedex') { dex.togglePokedex(BrowserWindow.fromWebContents(event.sender)); return; }
    if (cmd === 'app-menu') { menus.appMenu(event.sender); return; }
    if (cmd === 'extensions') { extWindow.openExtensions(); return; }
    if (cmd === 'alerts') { alertsWindow.openAlerts(); return; }
    if (cmd === 'auto-reload') { ctx.config.autoReload = !ctx.config.autoReload; for (const m of ctx.monitors.values()) m.setAuto(ctx.config.autoReload); save(); ui.state(); return; }
    if (cmd === 'drag-start' || cmd === 'drag-end') { ctx.dragging = cmd === 'drag-start'; ui.arrange(); return; }
    if (cmd === 'count') {
      const n = Number(value);
      if (!Number.isInteger(n) || n < 1 || n > MAX) return;
      while (ctx.config.accounts.length < n) accounts.addAccount();
      while (ctx.config.accounts.length > n) accounts.removeAccount(ctx.config.accounts.at(-1).id);
      save(); ui.arrange(); return;
    }
    const id = value?.id, a = accounts.acc(id);
    if (!a) return;
    const wc = ctx.views.get(id).webContents;
    if (cmd === 'move') {
      const list = ctx.config.accounts, from = list.indexOf(a), to = list.findIndex(b => b.id === value.to);
      if (to < 0 || from === to) return;
      [list[from], list[to]] = [list[to], list[from]];
      ui.arrange();
    }
    if (cmd === 'remove') { accounts.removeAccount(id); ui.arrange(); }
    if (cmd === 'detach') accounts.detach(id, value);
    if (cmd === 'attach' && ctx.detached.has(id)) ctx.detached.get(id).close();
    if (cmd === 'navigate') { const url = accounts.safeURL(value.url); ctx.monitors.get(id)?.manual(); accounts.navigate(id, url); }
    if (cmd === 'dismiss-alert') ctx.monitors.get(id)?.dismiss();
    if (cmd === 'tag-menu') menus.tagMenu(a, event.sender);
    if (cmd === 'forget-login') accounts.forgetLogin(a, BrowserWindow.fromWebContents(event.sender));
    if (cmd === 'rename') accounts.rename(a, value.name);
    if (cmd === 'set-type' && TYPE_KEYS.includes(value.type)) a.type = value.type;
    if (cmd === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    if (cmd === 'reload') accounts.reloadAccount(a);
    if (cmd === 'focus') { ctx.focus = ctx.focus === id ? null : id; ui.arrange(); }
    if (cmd === 'mute') accounts.toggleMute(a);
    if (cmd === 'zoom') { a.zoom = Math.max(0.3, Math.min(1.5, Math.round((a.zoom + Number(value.delta)) * 10) / 10)); wc.setZoomFactor(a.zoom); }
    save(); ui.state();
  } catch (e) { return { error: e.message }; }
});

// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { isTrusted });
