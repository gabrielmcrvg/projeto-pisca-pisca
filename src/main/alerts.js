// Central de alertas: o que avisar, onde avisar (WhatsApp / Windows) e os alertas que não são de shiny.
//
// Lê (só lendo) as mensagens que o jogo recebe:
//  • "estado.balls" — pokébolas por número (4 = Ultra Ball; 1 Poké, 2 Great, 5 a de 50 un.);
//  • "estado.items" — itens por número; os potes e os revives são somados (cada conta compra tipos diferentes);
//  • "batalha" k:"cura" — o item que curou um pokémon é um pote: entra sozinho na soma dos potes;
//  • "estado.pkMud" — pokémon novos ou que mudaram; um capturado agora com nota alta vira alerta.
// Cada alerta de estoque sai uma vez quando a quantidade cai abaixo do limite e só volta a valer depois de repor.
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { app, Notification } = require('electron');
const { ctx, paths } = require('./context');
const { label, save } = require('./config');

const events = new EventEmitter();   // 'alert' { tipo, text, conta }, 'change'
const ULTRA = '4';
const QUICK = /"balls"|"items"|"pkMud"|"cura"/;
const RECENT_CATCH = 10 * 60_000;    // pokémon com caughtAt mais antigo que isso já existia

const DEFAULTS = {
  whatsapp: true, windows: true, comandos: true,
  shinyVisto: true, shinyCaptura: true, shinyFuga: true,
  atualizacao: true,
  ultra: { on: true, min: 50 },
  // grupos somados por conta; os números dos itens de cada grupo
  potes: { on: true, min: 100, ids: ['203', '204', '70070'] },
  revives: { on: true, min: 20, ids: ['205'] },
  nota: { on: true, min: 3.5 },
  marcar: {},                          // conta -> participante do grupo a marcar
};

function config() {
  const c = (ctx.config.alertas ||= {});
  // quem já tinha escolhido avisos na janela do WhatsApp continua com as mesmas escolhas
  const old = ctx.config.whatsapp?.avisos;
  if (old && !c.migrado) {
    if (old.visto === false) c.shinyVisto = false;
    if (old.captura === false) c.shinyCaptura = false;
    if (old.fuga === false) c.shinyFuga = false;
    if (old.atualizacao === false) c.atualizacao = false;
    c.migrado = true;
  }
  for (const [k, v] of Object.entries(DEFAULTS)) if (c[k] === undefined) c[k] = structuredClone(v);
  // primeira versão vinha sem o revive marcado: o 205 é o Revive
  if (!c.revive205) { c.revive205 = true; if (!c.revives.ids.length) c.revives = { ...c.revives, on: true, ids: ['205'] }; }
  return c;
}

// Estado guardado: estoque visto por conta, alertas de estoque "armados" e pokémon já vistos.
const file = () => path.join(app.getPath('userData'), 'alertas.json');
let data = null;
function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { data = {}; }
  data.estoque ||= {};      // conta -> { balls: {}, items: {}, em }
  data.avisados ||= {};     // "conta:ultra" / "conta:item:205" -> quantidade quando avisou
  data.pokemon ||= [];      // ids de pokémon já vistos (para não avisar duas vezes)
  data.historico ||= [];
  return data;
}
let saveTimer;
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(file(), JSON.stringify(data)); } catch {} }, 800); }

const hora = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;
const num = n => Number(n).toLocaleString('pt-BR');

// Dispara um alerta: histórico, notificação do Windows e (via janela do WhatsApp) mensagem no grupo.
function emit(tipo, text, conta = null, title = 'CorollaHUB') {
  const c = config();
  load().historico.push({ t: new Date().toISOString(), tipo, conta, text });
  if (data.historico.length > 200) data.historico.splice(0, data.historico.length - 200);
  persist();
  if (c.windows) {
    try { if (Notification.isSupported()) new Notification({ title, body: text.split('\n')[0], icon: paths.icon }).show(); } catch {}
  }
  if (c.whatsapp) events.emit('alert', { tipo, text, conta });
  events.emit('change');
}

// ---------- estoque ----------
function checkLow(a, key, nome, qtd, min) {
  const avisados = load().avisados;
  if (qtd >= min) { if (key in avisados) { delete avisados[key]; persist(); } return; }
  if (key in avisados) return;          // já avisou; espera repor
  avisados[key] = qtd;
  persist();
  const emoji = key.endsWith(':ultra') ? '🎒' : key.endsWith(':revives') ? '💊' : '🧪';
  emit('estoque', `${emoji} ${label(a)} ${qtd === 0 ? 'está sem ' + nome : 'está com só ' + num(qtd) + ' ' + nome} (aviso abaixo de ${num(min)}), às ${hora()}.`, a.id, `${nome} acabando`);
}

// Soma de um grupo na conta (a lista do jogo traz o que a conta tem; item que sumiu dela = 0).
const groupTotal = (items, ids) => ids.reduce((t, id) => t + (typeof items?.[id] === 'number' ? items[id] : 0), 0);

function checkGroups(a, items) {
  const c = config();
  for (const [key, nome] of [['potes', 'potes'], ['revives', 'revives']]) {
    const g = c[key];
    if (!g.on || !g.ids.length) continue;
    checkLow(a, `${a.id}:${key}`, nome, groupTotal(items, g.ids), Number(g.min) || 0);
  }
}

// Um item curou um pokémon: é pote. Entra na soma dos potes (se ainda não estiver em algum grupo).
function learnPotion(a, itemId) {
  const id = String(itemId), c = config();
  if (!id || c.potes.ids.includes(id) || c.revives.ids.includes(id)) return;
  c.potes.ids.push(id);
  save();
  const items = load().estoque[a.id]?.items;
  if (items) checkGroups(a, items);
  events.emit('change');
}

function onEstado(a, e) {
  const c = config();
  const est = (load().estoque[a.id] ||= { balls: {}, items: {} });
  let touched = false;
  if (e.balls && typeof e.balls === 'object') {
    est.balls = { ...e.balls }; touched = true;
    if (c.ultra.on && typeof e.balls[ULTRA] === 'number') checkLow(a, `${a.id}:ultra`, 'Ultra Balls', e.balls[ULTRA], Number(c.ultra.min) || 0);
  }
  if (e.items && typeof e.items === 'object') {
    est.items = { ...e.items }; touched = true;
    checkGroups(a, e.items);
  }
  if (touched) { est.em = Date.now(); persist(); events.emit('change'); }
  if (Array.isArray(e.pkMud)) onPokemon(a, e.pkMud);
}

// ---------- pokémon bom ----------
function onPokemon(a, list) {
  const c = config(), d = load();
  const known = new Set(d.pokemon);
  let changed = false;
  for (const p of list) {
    if (!p || p.id == null || known.has(p.id)) continue;
    known.add(p.id); d.pokemon.push(p.id); changed = true;
    if (!c.nota.on || p.shiny) continue;                         // shiny já tem o alerta dele
    if (typeof p.caughtAt !== 'number' || Date.now() - p.caughtAt > RECENT_CATCH) continue;
    if (typeof p.nota !== 'number' || p.nota < Number(c.nota.min)) continue;
    const q = typeof p.quality === 'number' ? `, qualidade ${p.quality.toLocaleString('pt-BR')}` : '';
    emit('nota', `⭐ ${label(a)} capturou ${p.nome} nota ${p.nota.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} (nv ${p.level}${q}), às ${hora()}!`, a.id, 'Pokémon bom capturado');
  }
  if (changed) { if (d.pokemon.length > 3000) d.pokemon.splice(0, d.pokemon.length - 3000); persist(); }
}

// Versão nova do jogo (ver gameupdate.js): um aviso por versão.
require('./gameupdate').events.on('update', ({ versao, auto }) => {
  if (!config().atualizacao) return;
  emit('atualizacao', `🔄 Atualização nova do jogo: versão ${versao}, às ${hora()}.\n` +
    (auto ? 'As contas do HUB estão sendo recarregadas sozinhas.' : 'Clique em "Atualizar agora" nas contas.'), null, 'Atualização do jogo');
});

// Chamado para cada mensagem que o jogo recebe (ver health.js).
function handle(a, frame) {
  if (frame.kind !== 'in' || frame.opcode !== 1 || typeof frame.data !== 'string' || !QUICK.test(frame.data)) return;
  let j;
  try { j = JSON.parse(frame.data); } catch { return; }
  if (j.t === 'estado' && j.estado) { try { onEstado(a, j.estado); } catch {} }
  else if (j.t === 'batalha') for (const e of j.ev || []) if (e?.k === 'cura' && e.itemId != null) learnPotion(a, e.itemId);
}

// ---------- janela ----------
function summary() {
  const c = config(), d = load();
  const contas = ctx.config.accounts.map(a => {
    const est = d.estoque[a.id] || { balls: {}, items: {} };
    const has = Object.keys(est.items || {}).length > 0;
    return { id: a.id, nome: label(a), ultra: est.balls?.[ULTRA] ?? null, items: est.items || {}, em: est.em || null,
      potes: has ? groupTotal(est.items, c.potes.ids) : null, revives: has && c.revives.ids.length ? groupTotal(est.items, c.revives.ids) : null };
  });
  // números de item vistos em alguma conta, para escolher na lista
  const vistos = {};
  for (const ct of contas) for (const [id, q] of Object.entries(ct.items)) (vistos[id] ||= []).push(`${ct.nome}: ${num(q)}`);
  return { config: c, contas, itensVistos: vistos, historico: d.historico.slice(-12).reverse() };
}

function setConfig(patch) {
  const c = config();
  for (const k of ['whatsapp', 'windows', 'comandos', 'shinyVisto', 'shinyCaptura', 'shinyFuga', 'atualizacao']) if (k in patch) c[k] = Boolean(patch[k]);
  if (patch.ultra) c.ultra = { on: Boolean(patch.ultra.on), min: Math.max(0, Math.round(Number(patch.ultra.min) || 0)) };
  if (patch.nota) c.nota = { on: Boolean(patch.nota.on), min: Math.min(10, Math.max(0, Number(patch.nota.min) || 0)) };
  for (const key of ['potes', 'revives']) {
    const g = patch[key];
    if (!g) continue;
    const ids = Array.isArray(g.ids) ? [...new Set(g.ids.map(x => String(x).replace(/\D/g, '')).filter(Boolean))].slice(0, 30) : c[key].ids;
    c[key] = { on: Boolean(g.on), min: Math.max(0, Math.round(Number(g.min) || 0)), ids };
    // o mesmo item não fica nos dois grupos
    const other = key === 'potes' ? 'revives' : 'potes';
    const before = c[other].ids.length;
    c[other].ids = c[other].ids.filter(id => !ids.includes(id));
    const reset = [key, ...(c[other].ids.length !== before ? [other] : [])];
    for (const k of Object.keys(load().avisados)) if (reset.some(r => k.endsWith(':' + r))) delete data.avisados[k];
  }
  if (patch.marcar && typeof patch.marcar === 'object') {
    for (const [conta, id] of Object.entries(patch.marcar)) { if (id) c.marcar[conta] = String(id); else delete c.marcar[conta]; }
  }
  if (patch.ultra) for (const key of Object.keys(load().avisados)) if (key.endsWith(':ultra')) delete data.avisados[key];
  save(); persist();
  events.emit('change');
}

Object.assign(module.exports, { events, config, emit, handle, summary, setConfig, hora });
