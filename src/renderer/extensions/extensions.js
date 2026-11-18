// Janela "Extensões": instalar (navegador, Chrome Web Store, pasta/arquivo), listar e remover.
const $ = s => document.querySelector(s);
const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cmd = (name, value) => window.quadra.command(name, value);
const icon = src => src ? `<img class="xicon" src="${src}" alt="">` : `<span class="xicon none">${ic('puzzle')}</span>`;
const sitesLine = sites => sites?.length ? `${ic('globe')}<span>${esc(sites.slice(0, 4).join(', '))}${sites.length > 4 ? ` +${sites.length - 4}` : ''}</span>` : '';

// ---------- aviso no rodapé ----------
function notice(text, { kind = 'ok', reload = false } = {}) {
  const el = $('#notice');
  el.hidden = false;
  el.className = `xm-notice ${kind}`;
  $('#notice-text').textContent = text;
  $('#reload-all').hidden = !reload;
}
$('#reload-all').addEventListener('click', async () => { await cmd('reload-all'); notice('Contas recarregadas — as extensões já estão ativas nas páginas.'); });

async function run(promise, busyButton) {
  busyButton?.classList.add('busy');
  if (busyButton) busyButton.disabled = true;
  try {
    const r = await promise;
    if (r?.error) notice(r.error, { kind: 'bad' });
    else if (r?.ok && r.version !== undefined) notice(`“${r.name}” ${r.version} instalada em ${r.accounts ?? 'todas as'} conta${r.accounts === 1 ? '' : 's'}. Recarregue as contas para ela aparecer nas páginas.`, { reload: true });
    else if (r?.ok) notice(`“${r.name}” removida. Recarregue as contas para ela sumir das páginas.`, { reload: true });
    if (r?.ok) { await refresh(); if (!$('[data-pane=browser]').hidden && $('#scan-list').childElementCount) scan(); }
    return r;
  } finally {
    busyButton?.classList.remove('busy');
    if (busyButton) busyButton.disabled = false;
  }
}

// ---------- abas ----------
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === tab));
  document.querySelectorAll('.pane').forEach(p => { p.hidden = p.dataset.pane !== tab.dataset.tab; });
  if (tab.dataset.tab === 'store') $('#store-link').focus();
}));

// ---------- do navegador ----------
const STATUS = { new: ['Instalar', ''], update: ['Atualizar', 'upd'], installed: ['Instalada', 'done'] };
async function scan() {
  const list = $('#scan-list');
  list.innerHTML = '<div class="muted">Procurando…</div>';
  const found = await cmd('ext-scan');
  if (!Array.isArray(found) || !found.length) {
    list.innerHTML = `<div class="muted">Nenhuma extensão encontrada no Brave, Chrome, Edge ou Vivaldi deste PC.</div>`;
    return;
  }
  list.innerHTML = found.map(e => {
    const [label, cls] = STATUS[e.status];
    return `<div class="xrow">${icon(e.icon)}<div class="xinfo"><b>${esc(e.name)}</b> <span class="ver">${esc(e.version)}</span>
      <small>${esc(e.browser)} • ${esc(e.profile)}${e.sites?.length ? ' • ' : ''}${sitesLine(e.sites)}</small></div>
      <button class="btn mini ${cls}" data-key="${e.key}" ${e.status === 'installed' ? 'disabled' : ''}>${e.status === 'installed' ? ic('check') : ''}<span>${label}</span></button></div>`;
  }).join('');
}
$('#scan').addEventListener('click', () => run(scan(), $('#scan')));
$('#scan-list').addEventListener('click', e => {
  const b = e.target.closest('[data-key]');
  if (b) run(cmd('ext-install-browser', { key: b.dataset.key }), b);
});

// ---------- Chrome Web Store ----------
$('#store-form').addEventListener('submit', e => {
  e.preventDefault();
  const link = $('#store-link').value.trim();
  if (!link) { $('#store-link').focus(); return; }
  run(cmd('ext-install-store', { link }), e.submitter || $('#store-form button')).then(r => { if (r?.ok) $('#store-link').value = ''; });
});

// ---------- pasta ou arquivo ----------
$('#pick-folder').addEventListener('click', e => run(cmd('ext-install-folder'), e.currentTarget));
$('#pick-file').addEventListener('click', e => run(cmd('ext-install-file'), e.currentTarget));
$('#open-folder').addEventListener('click', () => cmd('ext-open-folder'));

// ---------- instaladas ----------
async function refresh() {
  const { installed = [], accounts } = await cmd('ext-list') || {};
  $('#acc-count').textContent = accounts ? `todas as ${accounts}` : 'todas as';
  const box = $('#installed');
  if (!installed.length) {
    box.innerHTML = `<div class="empty">${ic('puzzle')}<b>Nenhuma extensão instalada.</b><span>Use uma das opções acima para instalar.</span></div>`;
    return;
  }
  box.innerHTML = installed.map(e => `<div class="xrow big${e.error ? ' has-error' : ''}">${icon(e.icon)}
    <div class="xinfo"><b>${esc(e.name)}</b> <span class="ver">${esc(e.version)}</span>${e.source === 'projeto' ? ' <span class="tag">pasta do projeto</span>' : ''}
      ${e.description ? `<p>${esc(e.description)}</p>` : ''}
      <small>${e.error ? `<span class="err">${ic('warning')}${esc(e.error)}</span>` : `${e.loaded ? '<span class="ok">● ativa em todas as contas</span>' : '<span class="muted">não carregada</span>'}${e.sites?.length ? ' • ' : ''}${sitesLine(e.sites)}`}</small>
    </div>
    <button class="btn mini danger" data-remove="${esc(e.folder)}" ${e.source === 'projeto' ? 'disabled title="Está na pasta extensions do projeto"' : 'title="Remover de todas as contas"'}>${ic('trash')}<span>Remover</span></button></div>`).join('');
}
$('#installed').addEventListener('click', e => {
  const b = e.target.closest('[data-remove]');
  if (b && !b.disabled) run(cmd('ext-remove', { folder: b.dataset.remove }), b);
});

refresh();
addEventListener('focus', refresh);   // atualiza a lista ao voltar para a janela
