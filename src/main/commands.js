// Comandos no grupo do WhatsApp: alguém manda "/potes" e o bot responde com os números das contas deste HUB.
// Com mais de um HUB conectado ao bot, cada um responde com as contas dele.
const wa = require('./whatsapp');
const alerts = require('./alerts');
const shiny = require('./shiny');
const { ctx } = require('./context');
const { label } = require('./config');

const MAX_AGE = 2 * 60_000;      // comando mais antigo que isso (ex.: chegou depois de reconectar) é ignorado
const COOLDOWN = 10_000;         // o mesmo comando repetido em seguida só é respondido uma vez
const last = new Map();

const fmt = n => (n == null ? 'sem dados ainda' : Number(n).toLocaleString('pt-BR'));

function stock(kind) {
  const s = alerts.summary();
  const titles = { ultra: '🎒 Ultra Balls', potes: '🧪 Potes', revives: '💊 Revives' };
  if (kind === 'revives' && !s.config.revives.ids.length) return '💊 Revives: nenhum item marcado como revive neste HUB.';
  return `${titles[kind]}\n` + s.contas.map(c => `• ${c.nome}: ${fmt(c[kind])}`).join('\n');
}

function estoque() {
  const s = alerts.summary();
  const n = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR'));
  return '📦 Estoque (Ultra · potes · revives)\n' + s.contas.map(c => `• ${c.nome}: ` +
    (c.ultra == null && c.potes == null && c.revives == null ? 'sem dados ainda' : `${n(c.ultra)} · ${n(c.potes)} · ${n(c.revives)}`)).join('\n') +
    '\n(— = o jogo ainda não mandou esse número)';
}

function shinies() {
  const s = shiny.summary();
  return '✨ Shinies (vistos · capturados)\n' + s.contas.map(c => `• ${c.nome}: ${c.vistos} · ${c.capturados}`).join('\n') +
    `\nTotal: ${s.total.vistos} · ${s.total.capturados}`;
}

const HELP = '🤖 Comandos\n/estoque: Ultra Ball, potes e revives de cada conta\n/ultra · /potes · /revives: só um deles\n/shinies: shinies vistos e capturados\n' +
  '/status: se cada conta está on ou off\n/ajuda: esta lista';

// /status: on/off de cada conta, pelo que o monitor de saúde já sabe (socket do jogo aberto e mensagens chegando).
const QUIET = 2 * 60_000;   // conectada mas sem mensagem do jogo há mais que isso: provavelmente parada
function ago(ms) {
  const m = Math.round(ms / 60_000);
  return m < 1 ? 'agora há pouco' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
function contaStatus(a) {
  const m = ctx.monitors.get(a.id), wc = ctx.views.get(a.id)?.webContents;
  if (!wc || wc.isDestroyed() || !m) return '⚪ fechada';
  if (m.problem) return `🔴 off: ${m.problem.message.toLowerCase()} (${ago(Date.now() - m.problem.since)})`;
  if (a.loading) return '🟡 carregando';
  if (!m.sockets.size) return m.seenSocket ? '🟡 sem conexão com o jogo (tentando reconectar)' : '🟡 conectando ao jogo';
  if (m.lastFrame && Date.now() - m.lastFrame > QUIET) return `🟡 conectada, mas sem atividade ${ago(Date.now() - m.lastFrame)}`;
  return m.lastFrame ? `🟢 on (jogo rodando, última atividade ${ago(Date.now() - m.lastFrame)})` : '🟢 on';
}
function status() {
  const up = Math.round(process.uptime() / 60);
  return '📡 Status das contas\n' + ctx.config.accounts.map(a => `• ${label(a)}: ${contaStatus(a)}`).join('\n') +
    `\nHUB aberto há ${up < 60 ? up + ' min' : Math.floor(up / 60) + 'h' + String(up % 60).padStart(2, '0')}.`;
}

const COMMANDS = {
  estoque, ultra: () => stock('ultra'), ultraball: () => stock('ultra'), potes: () => stock('potes'), pote: () => stock('potes'),
  status, on: status, online: status,
  revives: () => stock('revives'), revive: () => stock('revives'), shinies: shinies, shiny: shinies, ajuda: () => HELP, comandos: () => HELP, help: () => HELP,
};

wa.events.on('message', ({ text, at, from }) => {
  if (alerts.config().comandos === false) return;
  const m = text.trim().match(/^[/!]([a-zçãéí0-9]+)\b\s*(.*)$/i);
  if (!m) return;
  const name = m[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const run = COMMANDS[name];
  if (!run || Date.now() - at > MAX_AGE) return;
  const key = name + ' ' + m[2].trim().toLowerCase();
  if (Date.now() - (last.get(key) || 0) < COOLDOWN) return;
  last.set(key, Date.now());
  const reply = run(m[2], from);
  if (reply) wa.send(reply).catch(() => {});
});

Object.assign(module.exports, { COMMANDS, HELP });
