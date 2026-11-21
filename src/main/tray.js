// Bandeja: esconde as janelas sem fechar páginas, sessões ou o bot.
const { app, BrowserWindow, Menu, Tray, dialog, powerSaveBlocker } = require('electron');
const { ctx, paths, alive } = require('./context');

let tray = null, blocker = null;
const hiddenWindows = new Set();

const available = () => Boolean(tray) && !tray.isDestroyed();

function hide() {
  if (!available() || ctx.quitting || !alive(ctx.win)) return false;
  // Inclui contas destacadas e janelas auxiliares. Apenas as que estavam
  // abertas serão restauradas; as páginas dos jogos continuam carregadas.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!alive(win) || (win !== ctx.win && !win.isVisible())) continue;
    hiddenWindows.add(win);
    win.hide();
  }
  return true;
}

function restore() {
  if (ctx.quitting || !alive(ctx.win)) return false;
  const windows = new Set([ctx.win, ...hiddenWindows]);
  hiddenWindows.clear();
  for (const win of windows) {
    if (!alive(win)) continue;
    if (win.isMinimized()) win.restore();
    win.show();
  }
  ctx.win.focus();
  return true;
}

function dispose() {
  hiddenWindows.clear();
  if (blocker !== null) {
    powerSaveBlocker.stop(blocker);
    blocker = null;
  }
  if (available()) tray.destroy();
  tray = null;
}

function install() {
  if (available()) return true;
  try {
    tray = new Tray(process.platform === 'win32' ? paths.iconIco : paths.icon);
    tray.setToolTip('CorollaHUB — contas e alertas ativos em segundo plano');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir CorollaHUB', click: restore },
      { label: 'Ocultar na bandeja', click: hide },
      { type: 'separator' },
      { label: 'Contas e alertas continuam funcionando', enabled: false },
      { type: 'separator' },
      { label: 'Sair do CorollaHUB', click: () => app.quit() },
    ]));
    tray.on('click', restore);
    tray.on('double-click', restore);
    // Mantém o computador ativo por inatividade, permitindo apagar o monitor.
    // Suspensão manual, desligamento e falta de internet ainda interrompem o jogo.
    blocker = powerSaveBlocker.start('prevent-app-suspension');
    return true;
  } catch (error) {
    dispose();
    dialog.showErrorBox('CorollaHUB — bandeja indisponível',
      'Não foi possível ativar a bandeja. A janela continuará funcionando normalmente; fechar encerrará o app.\n\n' + error.message);
    return false;
  }
}

module.exports = { install, available, hide, restore, dispose };
