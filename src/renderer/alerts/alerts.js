// Janela "Alertas": mostra o estado e manda as mudanças de configuração ao app.
const $ = s => document.querySelector(s);
const send = (cmd, value) => window.quadra.command(cmd, value);
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
let cfg = null;
const sections = new Map();
const itemRows = new Map();
const shinyRows = new Map();
// Só altera o DOM da seção cujo conteúdo mudou. Isso preserva foco e seletores.
function renderSection(key, value, render) {
  const next = JSON.stringify(value);
  if (sections.get(key) === next) return;
  render();
  sections.set(key, next);
}

function cell(text, low) { const td = document.createElement('td'); td.textContent = text; if (low) td.className = 'low'; return td; }

window.quadra.onState(s => {
  if (!s.alertas) return;
  cfg = s.config;
  $('#drops-on').checked = Boolean(cfg.drops.on);
  renderSection('drops', [s.dropTypes, cfg.drops], () => $('#drop-types').replaceChildren(...s.dropTypes.map(item => {
    const row = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = cfg.drops.ids.includes(item.id);
    input.disabled = !cfg.drops.on;
    input.addEventListener('change', () => {
      const ids = cfg.drops.ids.filter(id => id !== item.id);
      if (input.checked) ids.push(item.id);
      send('alerts-set', { drops: { ids } });
    });
    row.append(input, ' ' + item.name);
    return row;
  })));
  document.querySelectorAll('[data-flag]').forEach(i => { i.checked = Boolean(cfg[i.dataset.flag]); });
  for (const g of ['ultra', 'potes', 'revives', 'nota']) {
    $(`[data-group="${g}"]`).checked = Boolean(cfg[g].on);
    const inp = $(`[data-min="${g}"]`);
    if (document.activeElement !== inp) inp.value = cfg[g].min;
  }
  $('#autoupdate').checked = s.autoUpdate;

  const w = s.whatsapp, st = $('#wa-status');
  renderSection('whatsapp', [w.conectado, w.grupo], () => {
  st.textContent = w.conectado ? `Conectado: os alertas vão para o grupo “${w.grupo}”.` : 'O WhatsApp do bot não está conectado neste HUB.';
  const b = document.createElement('button'); b.className = 'linkbtn'; b.textContent = w.conectado ? 'Configurar' : 'Conectar…';
  b.addEventListener('click', () => send('alerts-whatsapp')); st.append(b);
  });

  const parts = w.participantes || [];
  const phone = n => (n && /^\d{12,13}$/.test(n) ? `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, -4)}-${n.slice(-4)}` : n);
  renderSection('tags', [w.conectado, parts, cfg.marcar, s.contas.map(c => [c.id, c.nome])], () => $('#tags').replaceChildren(...(w.conectado ? s.contas.map(c => {
    const row = document.createElement('label'); row.className = 'al-row';
    const name = document.createElement('span'); name.textContent = c.nome;
    const sel = document.createElement('select'); sel.className = 'al-tag';
    sel.add(new Option('Ninguém', ''));
    parts.forEach((p, i) => sel.add(new Option(p.numero ? phone(p.numero) : `Participante ${i + 1} (número oculto pelo WhatsApp)`, p.id)));
    const cur = cfg.marcar?.[c.id] || '';
    if (cur && !parts.some(p => p.id === cur)) sel.add(new Option('Pessoa que saiu do grupo', cur));
    sel.value = cur;
    sel.addEventListener('change', () => send('alerts-set', { marcar: { [c.id]: sel.value } }));
    row.append(name, sel);
    return row;
  }) : [Object.assign(document.createElement('p'), { textContent: 'Conecte o WhatsApp do bot e escolha o grupo para marcar alguém.' })])));

  renderSection('stock', [s.contas.map(c => [c.id, c.nome, c.ultra, c.potes, c.revives]), cfg.ultra, cfg.potes, cfg.revives], () => $('#stock').replaceChildren(...s.contas.map(c => {
    const tr = document.createElement('tr');
    tr.append(cell(c.nome), cell(fmt(c.ultra), c.ultra != null && cfg.ultra.on && c.ultra < cfg.ultra.min),
      cell(fmt(c.potes), c.potes != null && cfg.potes.on && c.potes < cfg.potes.min),
      cell(cfg.revives.ids.length ? fmt(c.revives) : 'marque abaixo', c.revives != null && cfg.revives.on && c.revives < cfg.revives.min));
    return tr;
  })));

  // Estoque atual informado pelo jogo, independente dos avisos de novos drops.
  const rareNames = { '70000': 'Boss Token', '70011': 'Chave', '70012': 'Shiny', '70013': 'Bicicleta', '70018': 'Osso' };
  const rareTypes = s.dropTypes || [];
  const rareRows = s.contas.map(c => ({ id: c.id, name: c.nome, values: rareTypes.map(item => {
    const value = c.items?.[item.id] ?? 0;
    return c.itemsKnown && Number.isSafeInteger(value) && value >= 0 ? value : null;
  }) }));
  renderSection('rare-head', rareTypes, () => {
    const headings = ['Conta', ...rareTypes.map(item => rareNames[item.id] || item.name)].map((label, i) => {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = label;
      if (i) th.title = rareTypes[i - 1].name;
      return th;
    });
    $('#rare-head').replaceChildren(...headings);
  });
  renderSection('rare-stock', rareRows, () => {
    $('#rare-stock').replaceChildren(...rareRows.map(c => {
      const tr = document.createElement('tr'); tr.dataset.accountId = c.id;
      const name = cell(c.name); name.title = c.name;
      tr.append(name, ...c.values.map(value => cell(value == null ? '—' : fmt(value))));
      return tr;
    }));
    const complete = rareRows.length > 0 && rareRows.every(c => c.values.every(value => value != null));
    const hasReadings = rareRows.some(c => c.values.some(value => value != null));
    const totalLabel = document.createElement('th'); totalLabel.scope = 'row';
    totalLabel.textContent = !complete && hasReadings ? 'Total parcial' : 'Total';
    const totals = rareTypes.map((_, i) => {
      const values = rareRows.map(c => c.values[i]).filter(value => value != null);
      const th = document.createElement('th');
      th.textContent = values.length ? fmt(values.reduce((sum, value) => sum + value, 0)) : '—';
      return th;
    });
    $('#rare-total').replaceChildren(totalLabel, ...totals);
    $('#rare-status').textContent = complete ? 'Total das ' + rareRows.length + ' contas acima.'
      : hasReadings ? 'Total parcial: aguardando a leitura das outras contas.'
      : 'Aguardando o jogo enviar a mochila das contas.';
  });

  const ids = Object.keys(s.itensVistos).sort((a, b) => a - b);
  for (const [id, refs] of itemRows) if (!ids.includes(id)) { refs.row.remove(); itemRows.delete(id); }
  const rows = ids.map(id => {
    let refs = itemRows.get(id);
    if (!refs) {
      const row = document.createElement('div'); row.className = 'al-item';
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', 'Classificação do item ' + id);
      for (const [v, t] of [['', '-'], ['potes', 'Pote'], ['revives', 'Revive']]) sel.add(new Option(t, v));
      sel.addEventListener('change', () => setItem(id, sel.value));
      const name = document.createElement('b'); name.textContent = 'Item ' + id;
      const where = document.createElement('span');
      row.append(name, where, sel);
      refs = { row, sel, where }; itemRows.set(id, refs);
    }
    const text = s.itensVistos[id].join(' · ');
    if (refs.where.textContent !== text) refs.where.textContent = text;
    const group = cfg.potes.ids.includes(id) ? 'potes' : cfg.revives.ids.includes(id) ? 'revives' : '';
    if (document.activeElement !== refs.sel && refs.sel.value !== group) refs.sel.value = group;
    return refs.row;
  });
  renderSection('item-order', ids, () => $('#items').replaceChildren(...(rows.length ? rows : [
    Object.assign(document.createElement('p'), { textContent: 'Os itens aparecem aqui quando o jogo mandar a mochila de alguma conta (depois de usar ou comprar um item).' }),
  ])));

  // números editáveis: dá para ajustar os shinies de antes do HUB contar
  const numInput = (c, key) => {
    const td = document.createElement('td'), inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.step = '1'; inp.className = 'al-count'; inp.value = c[key];
    inp.dataset.id = c.id; inp.dataset.key = key;
    inp.setAttribute('aria-label', c.nome + ': shinies ' + key);
    inp.addEventListener('change', () => send('shiny-set', { id: c.id, [key]: inp.value }));
    td.append(inp);
    return td;
  };
  const accountIds = s.shiny.contas.map(c => c.id);
  for (const [id, refs] of shinyRows) if (!accountIds.includes(id)) { refs.tr.remove(); shinyRows.delete(id); }
  const counterRows = s.shiny.contas.map(c => {
    let refs = shinyRows.get(c.id);
    if (!refs) {
      const tr = document.createElement('tr'), name = cell(c.nome);
      const vistos = numInput(c, 'vistos'), capturados = numInput(c, 'capturados');
      tr.append(name, vistos, capturados);
      refs = { tr, name, vistos: vistos.firstChild, capturados: capturados.firstChild };
      shinyRows.set(c.id, refs);
    }
    if (refs.name.textContent !== c.nome) refs.name.textContent = c.nome;
    for (const key of ['vistos', 'capturados']) {
      const input = refs[key];
      input.setAttribute('aria-label', c.nome + ': shinies ' + key);
      if (document.activeElement !== input && input.value !== String(c[key])) input.value = c[key];
    }
    return refs.tr;
  });
  renderSection('shiny-order', accountIds, () => $('#shinies').replaceChildren(...counterRows));
  $('#tot-v').textContent = s.shiny.total.vistos;
  $('#tot-c').textContent = s.shiny.total.capturados;

  renderSection('log', s.historico, () => $('#log').replaceChildren(...(s.historico.length ? s.historico.map(h => {
    const d = document.createElement('div'), t = document.createElement('time'), when = new Date(h.t);
    t.textContent = `${when.toLocaleDateString('pt-BR')} ${when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    d.append(t, h.text);
    return d;
  }) : [Object.assign(document.createElement('div'), { textContent: 'Nenhum alerta ainda.' })])));
});

function setItem(id, group) {
  const potes = cfg.potes.ids.filter(x => x !== id), revives = cfg.revives.ids.filter(x => x !== id);
  if (group === 'potes') potes.push(id);
  if (group === 'revives') revives.push(id);
  send('alerts-set', { potes: { ...cfg.potes, ids: potes }, revives: { ...cfg.revives, ids: revives, on: group === 'revives' ? true : cfg.revives.on } });
}

document.querySelectorAll('[data-flag]').forEach(i => i.addEventListener('change', () => send('alerts-set', { [i.dataset.flag]: i.checked })));
for (const g of ['ultra', 'potes', 'revives', 'nota']) {
  const update = () => send('alerts-set', { [g]: { ...cfg[g], on: $(`[data-group="${g}"]`).checked, min: $(`[data-min="${g}"]`).value } });
  $(`[data-group="${g}"]`).addEventListener('change', update);
  $(`[data-min="${g}"]`).addEventListener('change', update);
}
$('#autoupdate').addEventListener('change', e => send('alerts-autoupdate', e.target.checked));
$('#drops-on').addEventListener('change', e => send('alerts-set', { drops: { on: e.target.checked } }));
send('ready');
