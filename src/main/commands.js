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
  '/status: se cada conta está on ou off\n/tutorial: como ligar o seu HUB ao bot\n/ajuda: esta lista';

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

// Tutorial para os amigos: baixar, instalar e ligar o HUB deles ao bot.
const RELEASES = 'https://github.com/gabrielmcrvg/projeto-pisca-pisca/releases/latest';
function tutorial() {
  const n = wa.botNumber();
  const num = n && /^\d{12,13}$/.test(n) ? `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, -4)}-${n.slice(-4)}` : 'o número deste bot';
  return '📖 Como instalar o HUB e ligar ao bot dos alertas\n\n' +
    '*Baixar e instalar*\n' +
    `1. Abra ${RELEASES}\n` +
    '2. Em *Assets*, baixe o *CorollaHUB-Setup-….exe* (ou o *-portatil.exe*, que roda sem instalar).\n' +
    '3. Abra o arquivo. Se o Windows mostrar "O Windows protegeu o computador", clique em *Mais informações* → *Executar assim mesmo*.\n' +
    '4. Siga o instalador (dá para escolher a pasta) e abra o HUB. Entre nas suas contas do jogo, uma em cada janela.\n\n' +
    '*Ligar ao bot*\n' +
    '5. No HUB, clique no botão de teclado (canto superior direito) → *WhatsApp do bot…*\n' +
    `6. Digite o número do bot: *${num}* e clique em *Gerar código*.\n` +
    '7. Mande o código de 8 letras para o dono do bot, na hora. Ele digita no celular do bot em Aparelhos conectados → Conectar com número de telefone. O código vence em poucos minutos.\n' +
    '8. Quando conectar, escolha este grupo e clique em *Mandar teste*.\n\n' +
    '*Ajustar os alertas*\n' +
    '9. Clique em *Alertas* (sino no topo) → *Quem marcar no grupo* e escolha o seu número nas suas contas.\n' +
    '10. Ainda em Alertas, desmarque *Avisar quando sair versão nova* (um HUB só já avisa o grupo).\n\n' +
    'Pronto: os shinies, o estoque e o resto das suas contas passam a avisar aqui. Mande /ajuda para ver os comandos.';
}

// Com mais de um HUB no mesmo bot, cada um espera um instante e não responde se outro já mandou
// exatamente a mesma resposta (ex.: /tutorial, ou dois HUBs abertos com as mesmas contas).
const ownSent = new Map();   // texto -> quando o bot mandou
wa.events.on('own-message', ({ text }) => ownSent.set(text.trim(), Date.now()));
function sendOnce(text) {
  // vez de cada HUB pelo número do aparelho: um responde, os outros veem a resposta e desistem
  const wait = 300 + (wa.deviceSlot() % 6) * 1800 + Math.floor(Math.random() * 300);
  setTimeout(() => {
    const key = text.trim();
    if (Date.now() - (ownSent.get(key) || 0) < 15_000) return;   // a mesma resposta já saiu
    ownSent.set(key, Date.now());
    for (const [k, at] of ownSent) if (Date.now() - at > 60_000) ownSent.delete(k);
    wa.send(text).catch(() => {});
  }, wait);
}

const COMMANDS = {
  estoque, ultra: () => stock('ultra'), ultraball: () => stock('ultra'), potes: () => stock('potes'), pote: () => stock('potes'),
  status, on: status, online: status, tutorial, conectar: tutorial,
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
  if (!reply) return;
  sendOnce(reply);
});

Object.assign(module.exports, { COMMANDS, HELP });
