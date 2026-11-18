// Pokédex do CorollaHUB: filtros por tipo (até 2, os dois precisam estar no Pokémon), região e opções.
const TYPES = QUADRA_TYPES;
const TYPE_ORDER = Object.keys(TYPES);
const REGION_NAMES = { kanto: 'Kanto', johto: 'Johto', hoenn: 'Hoenn', sinnoh: 'Sinnoh', unova: 'Unova', kalos: 'Kalos', alola: 'Alola', galar: 'Galar', hisui: 'Hisui', paldea: 'Paldea' };
const REGION_GEN = { kanto: 1, johto: 2, hoenn: 3, sinnoh: 4, unova: 5, kalos: 6, alola: 7, galar: 8, hisui: 8, paldea: 9 };

// "Vulpix de Alola" → nome "Vulpix" + identificação "Alola"; "Rotom (Heat)" → "Rotom" + "Heat".
function splitName(name, form) {
  if (!form) return { base: name, tag: '' };
  const regional = /^(.*) de (Alola|Galar|Hisui|Paldea)(?: \((.*)\))?$/.exec(name);
  if (regional) return { base: regional[1], tag: regional[2] + (regional[3] ? ` · ${regional[3]}` : '') };
  const alt = /^(.*) \((.*)\)$/.exec(name);
  return alt ? { base: alt[1], tag: alt[2] } : { base: name, tag: '' };
}

// [número, nome, 'tipo1/tipo2', região, marcas, código da forma?] → objetos prontos para filtrar
const DEX = POKEDEX.map(([n, name, types, region, flags, pid], i) => ({
  i, n, pid: pid || n, name, ...splitName(name, flags & 1), types: types.split('/'), region: POKEDEX_REGIONS[region],
  form: Boolean(flags & 1), legendary: Boolean(flags & 2), mythical: Boolean(flags & 4),
  search: `${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')} ${n}`,
}));

const $ = s => document.querySelector(s);
const ic = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const typeVars = t => `--type:${TYPES[t].color};--glyph:${TYPES[t].glyph}`;
const emblem = t => `<span class="emblem" style="${typeVars(t)}" aria-hidden="true"><svg viewBox="0 0 10 10"><use href="#t-${t}"/></svg></span>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// ---------- estado dos filtros (lembrado entre aberturas) ----------
const KEY = 'corollahub.pokedex';
let f = { types: [], mono: false, regions: [], forms: true, legend: false, art: false, folded: false, q: '' };
try { f = { ...f, ...JSON.parse(localStorage.getItem(KEY) || '{}'), q: '' }; } catch {}
f.types = f.types.filter(t => TYPES[t]).slice(0, 2);
f.regions = f.regions.filter(r => REGION_NAMES[r]);
const remember = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...f, q: '' })); } catch {} };

function matches(p, o = f) {
  if (o.types.length && !o.types.every(t => p.types.includes(t))) return false;
  if (o.mono && p.types.length !== 1) return false;
  if (o.regions.length && !o.regions.includes(p.region)) return false;
  if (!o.forms && p.form) return false;
  if (o.legend && !(p.legendary || p.mythical)) return false;
  if (o.q) {
    const q = norm(o.q).replace(/^#/, '');
    if (/^\d+$/.test(q)) { if (p.n !== Number(q)) return false; }
    else if (!p.search.includes(q)) return false;
  }
  return true;
}
const count = o => { let c = 0; for (const p of DEX) if (matches(p, o)) c++; return c; };

// Clicar num tipo: tira se já está; senão entra (com 2 escolhidos, troca o segundo).
function withType(t) {
  if (f.types.includes(t)) return f.types.filter(x => x !== t);
  return f.types.length < 2 ? [...f.types, t] : [f.types[0], t];
}

// ---------- botões de filtro ----------
const typeBox = $('#types'), regionBox = $('#regions');
typeBox.innerHTML = TYPE_ORDER.map(t => `<button class="chip type" data-type="${t}" style="${typeVars(t)}">${emblem(t)}<span>${TYPES[t].name}</span><em></em></button>`).join('');
regionBox.innerHTML = Object.keys(REGION_NAMES).map(r => `<button class="chip region" data-region="${r}"><span>${REGION_NAMES[r]}</span><em></em></button>`).join('');

typeBox.addEventListener('click', e => {
  const t = e.target.closest('[data-type]')?.dataset.type;
  if (!t) return;
  f.types = withType(t);
  if (f.types.length === 2) f.mono = false;   // dois tipos e "tipo único" não combinam
  update();
});
regionBox.addEventListener('click', e => {
  const r = e.target.closest('[data-region]')?.dataset.region;
  if (!r) return;
  f.regions = f.regions.includes(r) ? f.regions.filter(x => x !== r) : [...f.regions, r];
  update();
});
$('#mono').addEventListener('click', () => { if (f.types.length < 2) { f.mono = !f.mono; update(); } });
$('#forms').addEventListener('click', () => { f.forms = !f.forms; update(); });
$('#legend').addEventListener('click', () => { f.legend = !f.legend; update(); });
$('#art').addEventListener('click', () => { f.art = !f.art; lastKey = ''; update(); });
$('#fold').addEventListener('click', () => { f.folded = !f.folded; update(); });
$('#clear').addEventListener('click', () => { f = { ...f, types: [], mono: false, regions: [], legend: false, q: '' }; $('#q').value = ''; update(); });
// filtros ativos na linha acima da grade: clicar tira o filtro
$('#active').addEventListener('click', e => {
  const tok = e.target.closest('[data-drop]');
  if (!tok) return;
  const [kind, value] = tok.dataset.drop.split(':');
  if (kind === 'type') f.types = f.types.filter(t => t !== value);
  if (kind === 'region') f.regions = f.regions.filter(r => r !== value);
  if (kind === 'mono') f.mono = false;
  if (kind === 'legend') f.legend = false;
  if (kind === 'forms') f.forms = true;
  if (kind === 'q') { f.q = ''; $('#q').value = ''; }
  update();
});
let typing;
$('#q').addEventListener('input', e => { clearTimeout(typing); typing = setTimeout(() => { f.q = e.target.value; update(); }, 90); });
$('#q').addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  e.stopPropagation();
  if (e.target.value) { e.target.value = ''; f.q = ''; update(); } else window.quadra?.command('pokedex-hide');
});
$('#dex-close').addEventListener('click', () => window.quadra?.command('pokedex-hide'));
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !e.defaultPrevented && document.activeElement !== $('#q')) { window.quadra?.command('pokedex-hide'); return; }
  if ((e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'f')) && document.activeElement !== $('#q')) { e.preventDefault(); $('#q').focus(); $('#q').select(); }
});

// ---------- imagens (PokéAPI), baixadas só quando o card aparece ----------
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';
const imageURL = (p, art) => art ? `${SPRITES}other/official-artwork/${p.pid}.png` : `${SPRITES}${p.pid}.png`;
const results = $('#results');
// Se a imagem falhar: tenta o outro estilo; se falhar de novo, fica o emblema do tipo.
results.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  const p = DEX[Number(img.dataset.i)];
  if (!img.dataset.retry) { img.dataset.retry = '1'; img.classList.toggle('pixel', f.art); img.src = imageURL(p, !f.art); return; }
  img.closest('.art').classList.add('missing');
  img.remove();
}, true);
results.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.closest('.art').classList.add('ready'); }, true);

// ---------- copiar o nome ----------
let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {   // reserva, caso a área de transferência recuse
    const area = Object.assign(document.createElement('textarea'), { value: text });
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area); area.select();
    const ok = document.execCommand('copy'); area.remove(); return ok;
  }
}
results.addEventListener('click', async e => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  e.stopPropagation();
  const p = DEX[Number(btn.dataset.copy)];
  if (!(await copyText(p.base))) { toast('Não foi possível copiar'); return; }
  btn.classList.add('done');
  btn.innerHTML = ic('check');
  toast(`Copiado: ${p.base}`);
  setTimeout(() => { btn.classList.remove('done'); btn.innerHTML = ic('copy'); }, 1200);
});

// ---------- cards ----------
const pad = n => '#' + String(n).padStart(4, '0');
function card(p) {
  const main = p.types[0], second = p.types[1] || main;
  const badges = p.types.map(t => `<span class="tpill" style="${typeVars(t)}">${emblem(t)}<span>${TYPES[t].name}</span></span>`).join('');
  const special = p.mythical ? 'Mítico' : p.legendary ? 'Lendário' : '';
  return `<article class="mon" style="--a:${TYPES[main].color};--b:${TYPES[second].color}" title="${esc(p.name)} — ${REGION_NAMES[p.region]}${special ? ' · ' + special : ''}">
    <div class="line"><span class="num">${pad(p.n)}</span>${special ? `<span class="leg" title="${special}">${ic('star')}</span>` : ''}<span class="reg">${REGION_NAMES[p.region]}</span><button class="copy" data-copy="${p.i}" title="Copiar “${esc(p.base)}”" aria-label="Copiar o nome ${esc(p.base)}">${ic('copy')}</button></div>
    <div class="art">${emblem(main)}<img class="${f.art ? '' : 'pixel'}" src="${imageURL(p, f.art)}" data-i="${p.i}" alt="${esc(p.name)}" loading="lazy" decoding="async" draggable="false"></div>
    <h3>${esc(p.base)}</h3>
    ${p.tag ? `<span class="ftag">${esc(p.tag)}</span>` : ''}
    <div class="tps">${badges}</div>
  </article>`;
}

let lastKey = '';
function update() {
  remember();
  // contadores e estado dos botões
  for (const btn of typeBox.children) {
    const t = btn.dataset.type, on = f.types.includes(t);
    const next = withType(t);
    const n = on ? count(f) : count({ ...f, types: next, mono: next.length === 2 ? false : f.mono });
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on);
    btn.querySelector('em').textContent = n;
    btn.disabled = !on && n === 0;
    btn.title = on ? `Tirar ${TYPES[t].name}` : f.types.length === 2 ? `Trocar ${TYPES[f.types[1]].name} por ${TYPES[t].name}` : f.types.length === 1 ? `${TYPES[f.types[0]].name} + ${TYPES[t].name}` : `Pokémon com ${TYPES[t].name}`;
  }
  for (const btn of regionBox.children) {
    const r = btn.dataset.region, on = f.regions.includes(r);
    const n = count({ ...f, regions: [r] });
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on);
    btn.querySelector('em').textContent = n;
    btn.disabled = !on && n === 0;
    btn.title = `${REGION_NAMES[r]} — ${REGION_GEN[r]}ª geração`;
  }
  const mono = $('#mono');
  mono.classList.toggle('on', f.mono);
  mono.disabled = f.types.length === 2;
  mono.querySelector('em').textContent = f.types.length === 2 ? '' : count({ ...f, mono: true });
  mono.title = f.types.length === 2 ? 'Com dois tipos escolhidos não existe tipo único' : f.types.length === 1 ? `Só ${TYPES[f.types[0]].name} puro, sem segundo tipo` : 'Só Pokémon com um único tipo';
  $('#forms').classList.toggle('on', f.forms);
  document.body.classList.toggle('folded', f.folded);
  $('#fold span').textContent = f.folded ? 'Mostrar filtros' : 'Ocultar filtros';
  $('#art').classList.toggle('on', f.art);
  const legend = $('#legend'), legends = count({ ...f, legend: true });
  legend.classList.toggle('on', f.legend);
  legend.querySelector('em').textContent = legends;
  legend.disabled = !f.legend && legends === 0;
  $('#type-hint').textContent = f.types.length === 2 ? 'os dois juntos' : f.types.length === 1 ? 'escolha outro para combinar' : 'até 2';

  // linha acima da grade: total + filtros ativos (clicáveis para remover)
  const tokens = [];
  const token = (drop, html, style = '') => tokens.push(`<button class="token" data-drop="${drop}" style="${style}" title="Remover filtro">${html}${ic('close')}</button>`);
  f.types.forEach(t => token(`type:${t}`, `${emblem(t)}<span>${TYPES[t].name}</span>`, typeVars(t)));
  if (f.mono) token('mono', '<span>Tipo único</span>');
  f.regions.forEach(r => token(`region:${r}`, `<span>${REGION_NAMES[r]}</span>`));
  if (f.legend) token('legend', '<span>Lendários e míticos</span>');
  if (!f.forms) token('forms', '<span>Sem formas</span>');
  if (f.q.trim()) token('q', `<span>“${esc(f.q.trim())}”</span>`);
  $('#active').innerHTML = tokens.length ? tokens.join('') : '<span class="none">Todos os Pokémon</span>';
  $('#clear').hidden = !tokens.length;

  const list = DEX.filter(p => matches(p));
  $('#count').innerHTML = `<b>${list.length}</b> ${list.length === 1 ? 'Pokémon' : 'Pokémon'}`;
  const key = list.map(p => p.i).join();
  if (key === lastKey) return;
  lastKey = key;
  results.innerHTML = list.length ? list.map(card).join('')
    : `<div class="empty"><b>Nenhum Pokémon com esses filtros.</b><span>Tire um tipo ou uma região para ver mais.</span></div>`;
  results.scrollTop = 0;
}
update();
