// Estado compartilhado do processo principal, constantes e caminhos do app.
// Os outros módulos leem e alteram `ctx` (em vez de variáveis globais soltas).
const path = require('node:path');
const { screen } = require('electron');

const ROOT = path.join(__dirname, '..', '..');

const ctx = {
  win: null,          // janela principal
  config: null,       // preferências carregadas (ver config.js)
  ready: false,       // a página da janela principal já carregou
  quitting: false,    // o app está fechando
  dragging: false,    // um painel está sendo arrastado
  focus: null,        // id da conta ampliada (null = todas)
  active: null,       // id da última conta em que o jogador clicou
  online: true,       // o computador tem internet
  views: new Map(),     // id da conta -> WebContentsView com o jogo
  monitors: new Map(),  // id da conta -> AccountMonitor (saúde da conta)
  detached: new Map(),  // id da conta -> janela destacada
};

const paths = {
  root: ROOT,
  page: name => path.join(ROOT, 'src', 'renderer', name, 'index.html'),
  preload: path.join(ROOT, 'src', 'preload', 'preload.js'),
  icon: path.join(ROOT, 'assets', 'icon.png'),
  iconIco: path.join(ROOT, 'assets', 'icon.ico'),
  devExtensions: path.join(ROOT, 'extensions'),   // só quando roda pelo código-fonte
};

const START_URL = 'https://pokeidle.io/app';
const APP_ID = 'com.corollahub.app';
const BG = '#12151B';
const FRAME = 2;   // espessura da moldura do painel em volta do jogo
const MODES = ['grid', 'columns', 'rows'];
// Páginas sem acesso ao Node, isoladas e em sandbox; o jogo continua rodando em segundo plano.
const secured = { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false };

const alive = w => Boolean(w) && !w.isDestroyed();

// A janela (ou posição salva) ainda aparece em algum monitor?
function onScreen(b) {
  return Boolean(b) && screen.getAllDisplays().some(({ workArea: r }) =>
    b.x < r.x + r.width - 60 && b.x + b.width > r.x + 60 && b.y >= r.y - 10 && b.y < r.y + r.height - 60);
}

module.exports = { ctx, paths, START_URL, APP_ID, BG, FRAME, MODES, secured, alive, onScreen };
