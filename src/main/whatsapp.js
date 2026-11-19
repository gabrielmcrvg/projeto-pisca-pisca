// WhatsApp do bot de alertas: o HUB entra no número do bot como "aparelho conectado" (igual ao WhatsApp Web)
// e manda as mensagens no grupo escolhido. Usa a biblioteca Baileys (não oficial).
// A sessão fica salva na pasta de dados (whatsapp-sessao); só pede QR/código de novo se desconectar.
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { app } = require('electron');
const QRCode = require('qrcode');
const { ctx } = require('./context');
const { save } = require('./config');

const events = new EventEmitter();
const BACKOFF = [2, 5, 15, 30, 60];   // segundos entre tentativas de reconectar
const GAP = 4000;                     // intervalo mínimo entre mensagens (evita rajadas)

// status: off | connecting | qr | code | online | error
let st = { status: 'off', qr: null, code: null, me: null, error: null, groups: [] };
let sock = null, wanted = false, tries = 0, retryTimer = null, phone = null, generation = 0;
let lib = null;
let factory = null;   // só para testes: troca a conexão real por uma falsa

const authDir = () => path.join(app.getPath('userData'), 'whatsapp-sessao');
const hasSession = () => fs.existsSync(path.join(authDir(), 'creds.json'));
const settings = () => (ctx.config.whatsapp ||= {});

const silent = { level: 'silent', trace() {}, debug() {}, info() {}, warn() {}, error() {}, fatal() {}, child() { return silent; } };

function set(patch) { st = { ...st, ...patch }; events.emit('change', state()); }
function state() {
  const s = settings();
  return { ...st, target: s.target || null, targetName: s.targetName || '', hasSession: hasSession() };
}

async function load() {
  if (factory) return factory;
  lib ||= await import('baileys');
  return async () => {
    const { state: auth, saveCreds } = await lib.useMultiFileAuthState(authDir());
    let version;
    try { version = (await Promise.race([lib.fetchLatestBaileysVersion(), new Promise((_, no) => setTimeout(no, 5000))])).version; } catch {}
    const s = lib.makeWASocket({ auth, logger: silent, browser: lib.Browsers.windows('Chrome'), markOnlineOnConnect: false,
      syncFullHistory: false, ...(version ? { version } : {}) });
    s.ev.on('creds.update', saveCreds);
    return s;
  };
}

// Liga (ou religa). Com `number`, pede o código de 8 letras em vez do QR.
async function start(number) {
  stopSocket();
  wanted = true;
  phone = number ? String(number).replace(/\D/g, '') : null;
  const gen = ++generation;
  set({ status: 'connecting', qr: null, code: null, error: null });
  let s;
  try { s = await (await load())(); } catch (e) {
    set({ status: 'error', error: 'Não consegui iniciar o WhatsApp: ' + (e?.message || e) });
    return;
  }
  if (gen !== generation) { try { s.end?.(); } catch {} return; }
  sock = s;
  let asked = false;
  // mensagens novas no grupo escolhido (para os comandos /potes, /shinies…)
  s.ev.on('messages.upsert', ({ messages, type }) => {
    if (gen !== generation || type !== 'notify') return;
    for (const m of messages || []) {
      if (!m?.key || m.key.remoteJid !== settings().target) continue;
      const text = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
      // mensagem do próprio bot (deste ou de outro HUB conectado ao mesmo número)
      if (m.key.fromMe) { if (text) events.emit('own-message', { text: String(text) }); continue; }
      if (text) events.emit('message', { text: String(text), from: m.key.participant || null, at: Number(m.messageTimestamp) * 1000 || Date.now() });
    }
  });
  s.ev.on('connection.update', async u => {
    if (gen !== generation) return;
    if (u.qr) {
      if (phone) {
        if (asked) return;
        asked = true;
        try { const code = await s.requestPairingCode(phone); set({ status: 'code', code: code.match(/.{1,4}/g).join('-'), qr: null }); }
        catch { set({ status: 'error', error: 'Não consegui gerar o código. Confira o número (com DDI 55 e DDD).' }); stopSocket(); }
      } else {
        set({ status: 'qr', qr: await QRCode.toDataURL(u.qr, { margin: 1, width: 280 }), code: null });
      }
    }
    if (u.connection === 'open') {
      tries = 0;
      const me = s.user ? { id: s.user.id, name: s.user.name || s.user.verifiedName || '', number: String(s.user.id).split(/[:@]/)[0] } : null;
      set({ status: 'online', qr: null, code: null, error: null, me });
      refreshGroups().catch(() => {});
    }
    if (u.connection === 'close') onClose(gen, u.lastDisconnect?.error?.output?.statusCode);
  });
}

function onClose(gen, code) {
  if (gen !== generation) return;
  sock = null;
  const R = lib?.DisconnectReason || { loggedOut: 401, forbidden: 403, restartRequired: 515, timedOut: 408 };
  if (code === R.loggedOut) {
    fs.rmSync(authDir(), { recursive: true, force: true });
    wanted = false;
    set({ status: 'off', qr: null, code: null, me: null, groups: [], error: 'O HUB foi desconectado pelo celular do bot. Conecte de novo para voltar a mandar alertas.' });
    return;
  }
  if (code === R.forbidden) {
    wanted = false;
    set({ status: 'error', qr: null, code: null, error: 'O WhatsApp recusou este número (ele pode ter sido banido).' });
    return;
  }
  if (!wanted) { set({ status: 'off', qr: null, code: null }); return; }
  // QR ou código sem resposta: para de tentar e espera o usuário pedir outro
  if (!hasSession() && code !== R.restartRequired) {
    wanted = false;
    const waiting = st.status === 'qr' || st.status === 'code';
    set({ status: 'off', qr: null, code: null, error: waiting ? 'O tempo para conectar acabou. Clique de novo para gerar outro.'
      : 'Não consegui falar com o WhatsApp. Confira a internet e tente de novo.' });
    return;
  }
  const wait = code === R.restartRequired ? 0 : BACKOFF[Math.min(tries++, BACKOFF.length - 1)] * 1000;
  set({ status: 'connecting', qr: null, code: null });
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { if (wanted) start(null); }, wait);
}

function stopSocket() {
  generation++;
  clearTimeout(retryTimer);
  const s = sock;
  sock = null;
  try { s?.end?.(undefined); } catch {}
}

// Para de usar o WhatsApp neste HUB (a sessão continua salva).
function stop() { wanted = false; stopSocket(); set({ status: 'off', qr: null, code: null }); }

// Desconecta de vez: some da lista de aparelhos conectados do bot e apaga a sessão.
async function logout() {
  wanted = false;
  const s = sock;
  try { await s?.logout?.(); } catch {}
  stopSocket();
  fs.rmSync(authDir(), { recursive: true, force: true });
  const conf = settings();
  delete conf.target; delete conf.targetName;
  save();
  set({ status: 'off', qr: null, code: null, me: null, groups: [], error: null });
}

async function refreshGroups() {
  if (!sock || st.status !== 'online') return [];
  const all = await sock.groupFetchAllParticipating();
  const mine = new Set([sock.user?.id, sock.user?.lid].filter(Boolean).map(j => String(j).replace(/:\d+@/, '@')));
  const groups = Object.values(all).map(g => ({ id: g.id, name: g.subject || 'Grupo sem nome', size: g.participants?.length || 0,
    // quem pode ser marcado (o próprio bot fica de fora); o número aparece quando o WhatsApp informa
    participants: (g.participants || []).filter(p => typeof p?.id === 'string' && !mine.has(p.id) && !mine.has(p.phoneNumber))
      .map(p => ({ id: p.id, numero: String(p.phoneNumber || (p.id.endsWith('@s.whatsapp.net') ? p.id : '')).split('@')[0] || null })) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  set({ groups });
  return groups;
}

function setTarget(id) {
  const g = st.groups.find(x => x.id === id);
  const conf = settings();
  if (!g) { delete conf.target; delete conf.targetName; } else { conf.target = g.id; conf.targetName = g.name; }
  save();
  events.emit('change', state());
}

// Fila de envio: uma mensagem por vez, com intervalo mínimo entre elas.
let queue = Promise.resolve(), lastSent = 0;
// Número deste aparelho conectado (cada HUB ligado ao bot tem um: 5521…:3@s.whatsapp.net → 3).
function deviceSlot() { const m = String(sock?.user?.id || st.me?.id || '').match(/:(\d+)@/); return m ? Number(m[1]) : 0; }

// Número do bot (para o tutorial).
function botNumber() { return st.me?.number || null; }

// Participantes do grupo escolhido (para marcar nos alertas).
function participants() { const t = settings().target; return st.groups.find(g => g.id === t)?.participants || []; }

function send(text, mentions = []) {
  const job = queue.then(async () => {
    const target = settings().target;
    if (!target) throw Error('Escolha o grupo que vai receber os alertas.');
    if (!sock || st.status !== 'online') throw Error('O WhatsApp não está conectado.');
    const wait = lastSent + GAP - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    await sock.sendMessage(target, mentions.length ? { text: String(text), mentions } : { text: String(text) });
    lastSent = Date.now();
  });
  queue = job.catch(() => {});
  return job;
}

// Ao abrir o app: se já tinha conectado antes, reconecta sozinho.
function autoStart() { if (hasSession()) start(null); }

function setFactory(f) { factory = f; }

Object.assign(module.exports, { events, state, start, stop, logout, refreshGroups, setTarget, send, participants, botNumber, deviceSlot, autoStart, hasSession, setFactory });
