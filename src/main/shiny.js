// Alertas de shiny: lê (só lendo) as mensagens que o jogo recebe e avisa no WhatsApp e no Windows.
//
// O que o servidor do jogo manda e é usado aqui:
//  • "campo": as criaturas em campo, cada uma com s (slot), n (nome), nv (nível), lt (60000 + espécie) e sh (shiny);
//  • "batalha": eventos; k:"bola" (pokébola jogada, com shiny e sucesso) e k:"fugiu" (com shiny e nome);
//  • "estado.dexMud": contadores da Pokédex por espécie, com sv (shinies vistos) e sc (shinies capturados).
// Os contadores da Pokédex vêm do servidor, então servem de rede de segurança: se o aviso pelo campo
// passar batido (HUB travado, recarregando…), a subida do sv/sc ainda gera o aviso — e nunca em dobro.
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { app } = require('electron');
const { ctx, paths } = require('./context');
const { label } = require('./config');
const alerts = require('./alerts');

const events = new EventEmitter();
const WINDOW = 3 * 60_000;      // aviso pelo campo e subida no contador dentro disso = o mesmo shiny
const QUICK = /"sh":[1-9t]|"shiny":true|"dexMud"/;   // filtro barato antes de ler o JSON

const file = () => path.join(app.getPath('userData'), 'shinies.json');
let data = null;
const live = new Map();   // conta -> Map(slot -> { nome, nivel, especie, em })
const recent = [];        // avisos recentes { conta, tipo, especie, em } para não repetir

function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { data = {}; }
  data.contas ||= {};
  data.historico ||= [];
  return data;
}
let saveTimer;
function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { fs.writeFileSync(file(), JSON.stringify(data, null, 1)); } catch {} }, 500); }

const conta = id => (load().contas[id] ||= { vistos: 0, capturados: 0, fugiram: 0, sv: {}, sc: {} });
const opts = () => { const c = alerts.config(); return { visto: c.shinyVisto, captura: c.shinyCaptura, fuga: c.shinyFuga }; };
const totals = () => Object.values(load().contas).reduce((t, c) => ({ vistos: t.vistos + c.vistos, capturados: t.capturados + c.capturados }), { vistos: 0, capturados: 0 });

const hora = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}`;

function seenRecently(id, tipo, especie) {
  const now = Date.now();
  while (recent.length && now - recent[0].em > WINDOW) recent.shift();
  return recent.some(r => r.conta === id && r.tipo === tipo && (especie == null || r.especie == null || r.especie === especie));
}

// Registra o evento, soma nos contadores e avisa (WhatsApp + notificação do Windows).
function fire(a, tipo, info) {
  const c = conta(a.id);
  if (tipo === 'visto') c.vistos++;
  if (tipo === 'capturado') c.capturados++;
  if (tipo === 'fugiu') c.fugiram++;
  recent.push({ conta: a.id, tipo, especie: info.especie ?? null, em: Date.now() });
  const ev = { t: new Date().toISOString(), conta: a.id, nomeConta: label(a), tipo, ...info };
  load().historico.push(ev);
  if (data.historico.length > 300) data.historico.splice(0, data.historico.length - 300);
  persist();
  events.emit('change');

  const o = opts();
  if ((tipo === 'visto' && !o.visto) || (tipo === 'capturado' && !o.captura) || (tipo === 'fugiu' && !o.fuga)) return;
  const nome = info.nome ? `Shiny ${info.nome}` : 'Um shiny';
  const nv = info.nivel ? ` (nv ${info.nivel})` : '';
  const t = totals();
  let text;
  if (tipo === 'visto') text = `✨ ${nome}${nv} apareceu na conta ${label(a)}, às ${hora()}!\nShinies vistos: ${c.vistos} nesta conta · ${t.vistos} no total`;
  else if (tipo === 'capturado') text = `🎉 ${label(a)} capturou ${info.nome ? 'o ' + nome : 'um shiny'}${nv}, às ${hora()}!\nShinies capturados: ${c.capturados} nesta conta · ${t.capturados} no total`;
  else text = `💨 ${info.nome ? 'O ' + nome : 'O shiny'} fugiu da conta ${label(a)}, às ${hora()}.`;
  alerts.emit('shiny-' + tipo, text, a.id, tipo === 'visto' ? 'Shiny!' : tipo === 'capturado' ? 'Shiny capturado!' : 'Shiny fugiu');
}

function onCampo(a, j) {
  const mobs = live.get(a.id) || new Map();
  live.set(a.id, mobs);
  for (const m of j.mobs || []) {
    if (!m || !m.sh) continue;
    if (mobs.has(m.s)) continue;                    // o mesmo shiny continua em campo
    const especie = m.lt > 60000 ? m.lt - 60000 : null;
    mobs.set(m.s, { nome: m.n, nivel: m.nv, especie, em: Date.now() });
    if (!seenRecently(a.id, 'visto', especie)) fire(a, 'visto', { nome: m.n, nivel: m.nv, especie });
  }
  // esquece shinies que saíram de campo há muito tempo
  for (const [s, m] of mobs) if (Date.now() - m.em > 30 * 60_000) mobs.delete(s);
}

function onBatalha(a, j) {
  const mobs = live.get(a.id) || new Map();
  for (const e of j.ev || []) {
    if (e.k === 'bola' && e.shiny && e.sucesso) {
      const m = mobs.get(e.slot);
      if (m?.capturado) continue;
      if (m) m.capturado = true;
      if (!seenRecently(a.id, 'capturado', m?.especie)) fire(a, 'capturado', { nome: m?.nome, nivel: m?.nivel, especie: m?.especie ?? null });
    } else if (e.k === 'fugiu' && e.shiny) {
      const m = [...mobs.values()].find(x => x.nome === e.nome && !x.fugiu) || null;
      if (m) m.fugiu = true;
      if (!seenRecently(a.id, 'fugiu', m?.especie)) fire(a, 'fugiu', { nome: e.nome, nivel: e.level, especie: m?.especie ?? null });
    }
  }
}

// Contadores da Pokédex: só avisam se subiram em relação ao último valor conhecido
// (o primeiro valor de cada espécie só vira referência).
function onDex(a, dex) {
  const c = conta(a.id);
  let changed = false;
  for (const [sp, d] of Object.entries(dex || {})) {
    const especie = Number(sp);
    for (const [key, tipo] of [['sv', 'visto'], ['sc', 'capturado']]) {
      // a espécie veio sem sv/sc = ainda zero shinies dela
      const now = typeof d[key] === 'number' ? d[key] : 0;
      const before = c[key][sp];
      c[key][sp] = now;
      if (before === now) continue;
      changed = true;
      if (before == null || now < before) continue;
      for (let i = before; i < now; i++) if (!seenRecently(a.id, tipo, especie)) fire(a, tipo, { especie, nome: nomeDe(a.id, especie) });
    }
  }
  if (changed) persist();
}

// Nome da espécie: do que está em campo ou, se não tiver, dos dados da Pokédex do app.
let dexNames = null;
function dexName(especie) {
  if (!dexNames) {
    dexNames = new Map();
    try {
      const src = fs.readFileSync(path.join(paths.root, 'src', 'renderer', 'pokedex', 'data.js'), 'utf8');
      for (const m of src.matchAll(/^\[(\d+),"([^"]+)",/gm)) if (!dexNames.has(Number(m[1]))) dexNames.set(Number(m[1]), m[2]);
    } catch {}
  }
  return dexNames.get(especie) || null;
}
function nomeDe(id, especie) {
  for (const m of (live.get(id) || new Map()).values()) if (m.especie === especie) return m.nome;
  return dexName(especie);
}

// Chamado para cada mensagem que o jogo recebe (ver health.js).
function handle(a, frame) {
  if (frame.kind !== 'in' || frame.opcode !== 1 || typeof frame.data !== 'string' || !QUICK.test(frame.data)) return;
  let j;
  try { j = JSON.parse(frame.data); } catch { return; }
  try {
    if (j.t === 'campo') onCampo(a, j);
    else if (j.t === 'batalha') onBatalha(a, j);
    else if (j.t === 'estado' && j.estado?.dexMud) onDex(a, j.estado.dexMud);
  } catch {}
}

function summary() {
  const d = load();
  const contas = ctx.config.accounts.map(a => ({ id: a.id, nome: label(a), ...(({ vistos, capturados, fugiram }) => ({ vistos, capturados, fugiram }))(conta(a.id)) }));
  return { contas, total: totals(), ultimos: d.historico.slice(-5).reverse() };
}

// Ajuste à mão (janela Alertas): shinies de antes do HUB contar, por exemplo.
function setCounts(id, { vistos, capturados } = {}) {
  const c = conta(id);
  const n = v => Math.max(0, Math.min(99999, Math.round(Number(v) || 0)));
  if (vistos !== undefined) c.vistos = n(vistos);
  if (capturados !== undefined) c.capturados = n(capturados);
  persist();
  events.emit('change');
}

Object.assign(module.exports, { events, handle, summary, setCounts });
