// Atualização do jogo: a própria página consulta /saude a cada ~10 s ({"versao":"1.443.1"}) e, quando a versão
// muda, mostra o botão "Atualizar agora". O HUB lê a mesma resposta (só lendo) e recarrega a conta sozinho —
// o mesmo efeito de clicar no botão. As contas recarregam uma de cada vez, com alguns segundos entre elas.
const { EventEmitter } = require('node:events');
const { ctx } = require('./context');
const { save } = require('./config');

const FIRST_WAIT = 15_000;     // dá um tempo para o servidor terminar de atualizar
const BETWEEN = 8_000;         // intervalo entre uma conta e a próxima
const MIN_GAP = 10 * 60_000;   // nunca recarrega a mesma conta por atualização mais de 1x em 10 min

const events = new EventEmitter();   // 'update' (uma vez por versão nova)
const loaded = new Map();      // conta -> versão com que a página carregou
const lastReload = new Map();
const scheduled = new Set();
let notified = null;           // última versão avisada no Windows
let queue = 0;

const enabled = () => ctx.config.autoUpdateGame !== false;
function setEnabled(on) { ctx.config.autoUpdateGame = Boolean(on); save(); }

// A página carregou de novo: a primeira versão que ela ver passa a ser a dela.
function reset(id) { loaded.delete(id); }

function isSaude(url) { try { return new URL(url).pathname.replace(/\/+$/, '') === '/saude'; } catch { return false; } }

async function handle(a, frame) {
  if (frame.kind !== 'http' || !isSaude(frame.url) || frame.status !== 200) return;
  let versao;
  try {
    const r = await frame.body();
    versao = JSON.parse(r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body)?.versao;
  } catch { return; }
  if (typeof versao !== 'string' || !versao) return;
  const mine = loaded.get(a.id);
  if (!mine) { loaded.set(a.id, versao); return; }
  if (mine === versao || scheduled.has(a.id)) return;

  if (notified !== versao) {
    notified = versao;
    events.emit('update', { versao, de: mine, auto: enabled() });
  }
  if (!enabled()) return;
  if (Date.now() - (lastReload.get(a.id) || 0) < MIN_GAP) return;
  scheduled.add(a.id);
  const wait = FIRST_WAIT + BETWEEN * queue++;
  setTimeout(() => {
    queue = Math.max(0, queue - 1);
    scheduled.delete(a.id);
    const wc = ctx.views.get(a.id)?.webContents;
    if (!wc || wc.isDestroyed()) return;
    lastReload.set(a.id, Date.now());
    loaded.delete(a.id);
    ctx.monitors.get(a.id)?.manual();
    wc.reloadIgnoringCache();   // como o botão do jogo: busca os arquivos novos
  }, wait);
}

Object.assign(module.exports, { events, handle, reset, enabled, setEnabled });
