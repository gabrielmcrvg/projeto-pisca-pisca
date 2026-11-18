// Ponto de entrada do CorollaHUB (processo principal do Electron).
const path = require('node:path');
const { app, dialog } = require('electron');
const { ctx, APP_ID, alive } = require('./context');

if (process.env.QUADRA_DATA) app.setPath('userData', path.resolve(process.env.QUADRA_DATA));
app.setName('Quadra'); // mantém a pasta %APPDATA%\Quadra, onde ficam os logins
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

// Evita o aviso do Firewall do Windows: desliga recursos do Chromium que abrem portas
// locais (busca de Chromecast/DIAL e o anúncio mDNS do WebRTC). Também silencia os logs.
app.commandLine.appendSwitch('disable-features', 'MediaRouter,DialMediaRouteProvider,GlobalMediaControlsCastStartStop,WebRtcHideLocalIpsWithMdns');
if (!process.env.ELECTRON_ENABLE_LOGGING) app.commandLine.appendSwitch('log-level', '3');
// Sem o mDNS, o WebRTC poderia mostrar IPs locais aos sites; esta política impede isso.
app.on('web-contents-created', (_e, wc) => wc.setWebRTCIPHandlingPolicy('default_public_interface_only'));

const mainWindow = require('./main-window');
require('./ipc');   // registra os comandos vindos das páginas

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const { win } = ctx; if (alive(win)) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(mainWindow.create).catch(e => { dialog.showErrorBox('CorollaHUB', e.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
