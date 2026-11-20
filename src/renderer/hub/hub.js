const detachedId = Number(new URLSearchParams(location.search).get('conta')) || null;
if (detachedId) document.body.classList.add('detached');

// Tipos (cor + emblema em pixel art) vêm de types.js.
const TYPES = QUADRA_TYPES;
const typeOf = key => TYPES[key] || TYPES.fire;
const ic = name => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const emblem = type => `<span class="emblem" aria-hidden="true"><svg viewBox="0 0 10 10"><use href="#t-${type}"/></svg></span>`;
const paint = (el, type) => { const t = typeOf(type); el.style.setProperty('--type', t.color); el.style.setProperty('--glyph', t.glyph); };

const container = document.querySelector('#panels');
const panels = new Map();
const controls = new WeakMap();
let dragId = null, total = 0, editing = null;

async function send(cmd, value) {
  const result = await window.quadra.command(cmd, value);
  if (result?.error) document.querySelector('#feedback').textContent = result.error;
}

function makePanel(id) {
  const panel = document.createElement('section');
  panel.className = 'panel';
  const windowButtons = detachedId
    ? `<button class="btn tool" data-action="attach" title="Voltar para a janela principal">${ic('attach')}</button>`
    : `<button class="btn tool expand" data-action="focus">${ic('expand')}</button><button class="btn tool" data-action="detach" title="Destacar em outra janela">${ic('detach')}</button>`;
  panel.innerHTML = `<div class="bar">
    <strong class="tag handle" draggable="${!detachedId}">
      ${detachedId ? '' : `<span class="grip">${ic('grip')}</span>`}<span class="emblem-slot"></span><span class="warn">${ic('warning')}</span><span class="name"></span>
    </strong>
    <button class="btn tool back" data-action="back" title="Voltar">${ic('back')}</button>
    <button class="btn tool reload" data-action="reload">${ic('reload')}</button>
    <input class="url" aria-label="Endereço da conta" placeholder="Endereço…" spellcheck="false">
    <span class="alert-pill" role="alert"><span class="alert-text"></span><span class="alert-time"></span>
      <button class="btn mini" data-action="reload" title="Recarregar agora">Recarregar</button>
      <button class="btn tool ghost" data-action="dismiss-alert" title="Dispensar aviso">${ic('close')}</button></span>
    <span class="zoombox"><button class="btn tool" data-action="zoom-out" title="Diminuir zoom">${ic('zoom-out')}</button><span class="zoom"></span><button class="btn tool" data-action="zoom-in" title="Aumentar zoom">${ic('zoom-in')}</button></span>
    <button class="btn tool mute" data-action="mute"></button>
    ${windowButtons}
    <button class="btn tool close" data-action="remove" title="Fechar esta conta (o login continua salvo)">${ic('close')}</button>
  </div><div class="drop">${ic('swap')}<span>Soltar aqui para trocar</span></div>`;

  panel.addEventListener('click', e => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    send(action.startsWith('zoom-') ? 'zoom' : action, { id, delta: action === 'zoom-in' ? 0.1 : -0.1 });
  });
  panel.querySelector('.url').addEventListener('keydown', e => { if (e.key === 'Enter') send('navigate', { id, url: e.target.value }); });

  const tag = panel.querySelector('.tag');
  tag.addEventListener('contextmenu', e => { e.preventDefault(); send('tag-menu', { id }); });
  tag.addEventListener('dblclick', e => { e.preventDefault(); startRename(id); });

  if (!detachedId) {
    tag.addEventListener('dragstart', e => {
      if (editing === id) { e.preventDefault(); return; }
      dragId = id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', panel.dataset.label || `Conta ${id}`);
      document.body.classList.add('dragging');
      panel.classList.add('dragged');
      send('drag-start');
    });
    tag.addEventListener('dragend', e => {
      document.body.classList.remove('dragging');
      panel.classList.remove('dragged');
      // Solto fora da janela: destaca a conta numa janela própria, onde o mouse estava.
      const { screenX: x, screenY: y } = e;
      const outside = (x || y) && (x < window.screenX || y < window.screenY ||
        x > window.screenX + window.outerWidth || y > window.screenY + window.outerHeight);
      if (e.dataTransfer.dropEffect === 'none' && outside) send('detach', { id, x, y });
      dragId = null;
      send('drag-end');
    });
    panel.addEventListener('dragover', e => {
      if (dragId === null || dragId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      panel.classList.add('over');
    });
    panel.addEventListener('dragleave', e => { if (!panel.contains(e.relatedTarget)) panel.classList.remove('over'); });
    panel.addEventListener('drop', e => {
      e.preventDefault();
      panel.classList.remove('over');
      if (dragId !== null && dragId !== id) send('move', { id: dragId, to: id });
    });
  }
  controls.set(panel, Object.fromEntries(['name', 'tag', 'url', 'zoom', 'mute', 'expand', 'emblem-slot'].map(key => [key, panel.querySelector('.' + key)])));
  container.append(panel);
  return panel;
}

// ---------- Renomear direto no painel ----------
function startRename(id) {
  const panel = panels.get(id);
  if (!panel || editing !== null) return;
  editing = id;
  const tag = panel.querySelector('.tag'), name = panel.querySelector('.name');
  tag.draggable = false;
  const input = document.createElement('input');
  input.className = 'rename';
  input.maxLength = 20;
  input.value = panel.dataset.name || '';
  input.placeholder = `Conta ${id}`;
  input.setAttribute('aria-label', 'Nome da conta');
  name.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = commit => {
    if (done) return;
    done = true;
    input.replaceWith(name);
    tag.draggable = !detachedId;
    editing = null;
    if (commit) send('rename', { id, name: input.value });
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('click', e => e.stopPropagation());
}
window.quadra.onUi(message => {
  if (message?.rename) startRename(message.rename);
  if (message?.notice) { const fb = document.querySelector('#feedback'); fb.textContent = message.notice; fb.title = message.notice; fb.dataset.notice = message.notice; }
});

// ---------- Cabeçalho ----------
document.querySelectorAll('[data-layout]').forEach(button => button.addEventListener('click', () => send('layout', button.dataset.layout)));
document.querySelector('#reload-all').addEventListener('click', () => send('reload-all'));
document.querySelector('#pokedex').addEventListener('click', () => send('pokedex'));
document.querySelector('#chatgpt').addEventListener('click', () => send('chat'));
document.querySelector('#help').addEventListener('click', () => send('app-menu'));
document.querySelector('#extensions').addEventListener('click', () => send('extensions'));
document.querySelector('#alerts').addEventListener('click', () => send('alerts'));
document.querySelector('#auto-reload').addEventListener('click', () => send('auto-reload'));
document.querySelector('#more').addEventListener('click', () => send('count', total + 1));
document.querySelector('#fewer').addEventListener('click', () => send('count', total - 1));
document.querySelector('#detached-list').addEventListener('click', e => {
  const id = Number(e.target.closest('[data-id]')?.dataset.id);
  if (id) send('attach', { id });
});

function chip(a) {
  const button = document.createElement('button');
  button.className = 'btn chip';
  button.dataset.id = a.id;
  button.title = `${a.label} está destacada. Clique para trazer de volta`;
  button.innerHTML = `${emblem(a.type)}<span></span>${ic('attach')}`;
  button.querySelector('span:not(.emblem)').textContent = a.label;
  paint(button, a.type);
  return button;
}


// ---------- Contagem regressiva da recarga ----------
const retries = new Map();   // painel -> horário da próxima tentativa
let ticker = null;
function tick() {
  const now = Date.now();
  for (const [panel, at] of retries) {
    const left = Math.max(0, Math.ceil((at - now) / 1000));
    panel.querySelector('.alert-time').textContent = left > 0 ? `· ${left}s` : '· agora';
    panel.querySelector('.alert-pill').title = `${panel.querySelector('.alert-text').textContent} — ${left > 0 ? `recarrega sozinha em ${left}s` : 'recarregando…'}`;
  }
  if (!retries.size) { clearInterval(ticker); ticker = null; }
}

function showAlert(panel, alert) {
  const text = panel.querySelector('.alert-text'), time = panel.querySelector('.alert-time');
  const had = panel.classList.contains('alert');
  panel.classList.toggle('alert', Boolean(alert));
  if (!alert) { retries.delete(panel); return; }
  if (!had) { panel.classList.remove('flash'); void panel.offsetWidth; panel.classList.add('flash'); }
  text.textContent = alert.message;
  if (alert.retryAt) {
    retries.set(panel, alert.retryAt);
    if (!ticker) ticker = setInterval(tick, 1000);
    tick();
  } else {
    retries.delete(panel);
    time.textContent = alert.kind === 'offline' ? '· aguardando' : alert.paused ? '· pausada' : '';
    panel.querySelector('.alert-pill').title = alert.message + (alert.kind === 'offline' ? ' — recarrega quando a internet voltar'
      : alert.paused ? ' — a recarga automática parou depois de várias tentativas; use Recarregar'
      : alert.kind === 'login' ? ' — entre na conta de novo' : !alert.auto ? ' — recarga automática desligada' : '');
  }
}

// Botões e indicadores do topo: iguais na janela principal e na barra compacta das destacadas.
function toolbar(state) {
  for (const [sel, on, title] of [['#pokedex', state.pokedexOpen, state.pokedexOpen ? 'Fechar a Pokédex (Ctrl+P)' : 'Abrir a Pokédex (Ctrl+P)']]) {
    const b = document.querySelector(sel);
    b.classList.toggle('active', Boolean(on));
    b.setAttribute('aria-pressed', Boolean(on));
    b.title = title;
  }
  const auto = document.querySelector('#auto-reload');
  auto.classList.toggle('active', Boolean(state.autoReload));
  auto.setAttribute('aria-pressed', Boolean(state.autoReload));
  const loading = state.loadingAny ?? state.panels.some(a => a.loading);
  const error = state.alerts > 0 || state.online === false;
  document.body.classList.toggle('is-loading', loading);
  document.body.classList.toggle('is-error', error);
  document.body.classList.toggle('is-ok', !loading && !error);
}

window.quadra.onState(state => {
  toolbar(state);
  if (!state.detachedWindow) {
    total = state.total;
    document.querySelectorAll('[data-layout]').forEach(button => {
      const on = button.dataset.layout === state.mode;
      button.classList.toggle('active', on);
      button.setAttribute('aria-pressed', on);
    });
    document.querySelector('#total').textContent = state.total;
    document.querySelector('#fewer').disabled = state.total <= 1;
    document.querySelector('#more').disabled = state.total >= state.max;
    const list = document.querySelector('#detached-list');
    const key = state.detached.map(a => `${a.id}:${a.label}:${a.type}`).join();
    if (list.dataset.key !== key) { list.dataset.key = key; list.replaceChildren(...state.detached.map(chip)); }
    const feedback = document.querySelector('#feedback'), ext = state.extensions || [], bad = state.extensionErrors || [];
    const notice = state.online === false ? 'Sem internet — as contas recarregam quando a conexão voltar'
      : bad.length ? `Extensão com erro — ${bad[0]}` : ext.length ? `Extensão ativa: ${ext.join(', ')}` : '';
    if (notice && feedback.dataset.notice !== notice) { feedback.dataset.notice = notice; feedback.textContent = notice; feedback.title = notice; }
    feedback.classList.toggle('bad', state.online === false || bad.length > 0);
  } else {
    document.title = `CorollaHUB • ${state.panels[0]?.label ?? ''}`;
  }

  const ids = new Set(state.panels.map(a => a.id));
  for (const [id, panel] of panels) if (!ids.has(id)) { retries.delete(panel); panel.remove(); panels.delete(id); }
  for (const a of state.panels) {
    const panel = panels.get(a.id) || panels.set(a.id, makePanel(a.id)).get(a.id);
    const refs = controls.get(panel);
    const rect = a.rect;
    panel.hidden = !rect;
    if (!rect) continue;
    const bounds = [rect.x, rect.y, rect.width, rect.height].join(':');
    if (panel.dataset.bounds !== bounds) {
      Object.assign(panel.style, { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' });
      panel.dataset.bounds = bounds;
    }
    panel.classList.toggle('compact', rect.width < 460);
    panel.classList.toggle('tiny', rect.width < 300);
    panel.classList.toggle('active', state.active === a.id && state.panels.length > 1);
    panel.classList.toggle('loading', a.loading);
    panel.classList.toggle('error', Boolean(a.alert));

    // nome e tipo
    if (panel.dataset.type !== a.type) {
      panel.dataset.type = a.type;
      paint(panel, a.type);
      refs['emblem-slot'].innerHTML = emblem(a.type);
    }
    panel.dataset.name = a.name || '';
    panel.dataset.label = a.label;
    const name = refs.name;
    if (name.textContent !== a.label) name.textContent = a.label;
    const tagTitle = `${a.label} • ${typeOf(a.type).name}\nDuplo clique: renomear • Clique direito: tipo e esquecer login` + (detachedId ? '' : '\nArraste para trocar de lugar, ou para fora da janela para destacar');
    refs.tag.title = tagTitle;

    const input = refs.url;
    if (document.activeElement !== input && input.value !== a.url) input.value = a.url;
    const zoom = Math.round(a.zoom * 100) + '%';
    if (refs.zoom.textContent !== zoom) refs.zoom.textContent = zoom;
    const mute = refs.mute;
    if (mute.dataset.muted !== String(a.muted)) { mute.dataset.muted = a.muted; mute.innerHTML = ic(a.muted ? 'muted' : 'sound'); }
    mute.title = `${a.muted ? 'Ativar' : 'Silenciar'} áudio (Ctrl+M na conta ativa)`;
    const expand = refs.expand;
    if (expand) {
      const focused = state.focus === a.id;
      if (expand.dataset.on !== String(focused)) { expand.dataset.on = focused; expand.innerHTML = ic(focused ? 'restore' : 'expand'); expand.classList.toggle('active', focused); }
      expand.title = `${focused ? 'Restaurar' : 'Ampliar'} (Ctrl+${a.slot})`;
    }
    panel.querySelector('.bar > .reload').title = a.loading ? 'Carregando…' : 'Recarregar (F5)';
    showAlert(panel, a.alert);
  }
});
send('ready');
