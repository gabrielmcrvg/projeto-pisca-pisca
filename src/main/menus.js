// Menus nativos: o do botão de ajuda e o do nome de cada conta.
const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const { TYPE_KEYS, TYPE_NAMES, defaultType, label, save } = require('./config');
const accounts = require('./accounts');
const extWindow = require('./windows/extensions');
const waWindow = require('./windows/whatsapp');
const alertsWindow = require('./windows/alerts');
const extensions = require('./extensions/catalog');
const ui = require('./main-window');
const recorder = require('./recorder');
const gameupdate = require('./gameupdate');
const tray = require('./tray');

// Menu do botão de ajuda no topo: atalhos, pastas do app e versão.
const SHORTCUTS = 'Ctrl+1…4 — ampliar/restaurar a conta (ou trazer a janela destacada)\nCtrl+0 — voltar para todas\n' +
  'Ctrl+M — som da conta ativa\nF5 — recarregar a conta ativa\nCtrl+F5 — recarregar todas\nCtrl+P — Pokédex\nCtrl+G — ChatGPT\n\n' +
  'Duplo clique no nome — renomear\nClique direito no nome — tipo e esquecer login\nArrastar o nome — trocar de lugar ou destacar';

function appMenu(sender) {
  const owner = BrowserWindow.fromWebContents(sender) || undefined;
  Menu.buildFromTemplate([
    { label: 'Atalhos de teclado', click: () => dialog.showMessageBox(owner, { type: 'info', title: 'Atalhos', message: 'Atalhos do CorollaHUB', detail: SHORTCUTS, noLink: true }) },
    { type: 'separator' },
    { label: 'Gerenciar extensões…', click: extWindow.openExtensions },
    { label: 'Alertas…', click: alertsWindow.openAlerts },
    { label: 'WhatsApp do bot…', click: waWindow.openWhatsApp },
    { label: 'Atualizar o jogo sozinho', type: 'checkbox', checked: gameupdate.enabled(), click: item => gameupdate.setEnabled(item.checked) },
    { label: 'Abrir pasta de extensões', click: () => shell.openPath(extensions.ensureExtDir()) },
    { label: 'Abrir pasta de dados', click: () => shell.openPath(app.getPath('userData')) },
    { type: 'separator' },
    { label: 'Gravar mensagens do jogo', type: 'checkbox', checked: recorder.isRecording(),
      click: () => (recorder.isRecording() ? recorder.stop() : recorder.start()) },
    { label: 'Abrir pasta de gravações', click: () => { require('node:fs').mkdirSync(recorder.folder(), { recursive: true }); shell.openPath(recorder.folder()); } },
    { type: 'separator' },
    { label: 'Ocultar na bandeja (continuar rodando)', enabled: tray.available(), click: tray.hide },
    { label: 'Sair do CorollaHUB', click: () => app.quit() },
    { type: 'separator' },
    { label: 'Sobre o CorollaHUB', click: () => dialog.showMessageBox(owner, { type: 'info', title: 'Sobre', message: `CorollaHUB ${app.getVersion()}`,
      detail: `Várias contas em uma janela.\nElectron ${process.versions.electron} • Chromium ${process.versions.chrome}\n\nDados e imagens da Pokédex: PokéAPI.`, noLink: true }) },
  ]).popup({ window: owner });
}

function tagMenu(a, sender) {
  const owner = BrowserWindow.fromWebContents(sender);
  Menu.buildFromTemplate([
    { label: 'Renomear…', click: () => { if (!sender.isDestroyed()) sender.send('ui', { rename: a.id }); } },
    { label: 'Tipo', submenu: TYPE_KEYS.map(t => ({ label: TYPE_NAMES[t], type: 'radio', checked: a.type === t,
      click: () => { a.type = t; save(); ui.state(); } })) },
    { type: 'separator' },
    { label: 'Esquecer login desta conta…', click: () => accounts.forgetLogin(a, owner) },
    { type: 'separator' },
    { label: 'Restaurar nome e tipo', enabled: Boolean(a.name) || a.type !== defaultType(a.id),
      click: () => { accounts.rename(a, ''); a.type = defaultType(a.id); save(); ui.state(); } },
  ]).popup({ window: owner || undefined });
}

// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { SHORTCUTS, appMenu, tagMenu });
