// Janela "Alertas": mostra o estado e manda as mudanças de configuração ao app.
const $ = s => document.querySelector(s);
const send = (cmd, value) => window.quadra.command(cmd, value);
const fmt = n => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
let cfg = null;

function cell(text, low) { const td = document.createElement('td'); td.textContent = text; if (low) td.className = 'low'; return td; }

window.quadra.onState(s => {
  if (!s.alertas) return;
  cfg = s.config;
  document.querySelectorAll('[data-flag]').forEach(i => { i.checked = Boolean(cfg[i.dataset.flag]); });
  for (const g of ['ultra', 'potes', 'revives', 'nota']) {
    $(`[data-group="${g}"]`).checked = Boolean(cfg[g].on);
    const inp = $(`[data-min="${g}"]`);
    if (document.activeElement !== inp) inp.value = cfg[g].min;
  }
  $('#autoupdate').checked = s.autoUpdate;

  const w = s.whatsapp, st = $('#wa-status');
  st.textContent = w.conectado ? `Conectado: os alertas vão para o grupo “${w.grupo}”.` : 'O WhatsApp do bot não está conectado neste HUB.';
  const b = document.createElement('button'); b.className = 'linkbtn'; b.textContent = w.conectado ? 'Configurar' : 'Conectar…';
  b.addEventListener('click', () => send('alerts-whatsapp')); st.append(b);

  const parts = w.participantes || [];
  const phone = n => (n && /^\d{12,13}$/.test(n) ? `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, -4)}-${n.slice(-4)}` : n);
  $('#tags').replaceChildren(...(w.conectado ? s.contas.map(c => {
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
  }) : [Object.assign(document.createElement('p'), { textContent: 'Conecte o WhatsApp do bot e escolha o grupo para marcar alguém.' })]));

  $('#stock').replaceChildren(...s.contas.map(c => {
    const tr = document.createElement('tr');
    tr.append(cell(c.nome), cell(fmt(c.ultra), c.ultra != null && cfg.ultra.on && c.ultra < cfg.ultra.min),
      cell(fmt(c.potes), c.potes != null && cfg.potes.on && c.potes < cfg.potes.min),
      cell(cfg.revives.ids.length ? fmt(c.revives) : 'marque abaixo', c.revives != null && cfg.revives.on && c.revives < cfg.revives.min));
    return tr;
  }));

  const ids = Object.keys(s.itensVistos).sort((a, b) => a - b);
  $('#items').replaceChildren(...(ids.length ? ids.map(id => {
    const row = document.createElement('div'); row.className = 'al-item';
    const sel = document.createElement('select');
    for (const [v, t] of [['', '—'], ['potes', 'Pote'], ['revives', 'Revive']]) sel.add(new Option(t, v));
    sel.value = cfg.potes.ids.includes(id) ? 'potes' : cfg.revives.ids.includes(id) ? 'revives' : '';
    sel.addEventListener('change', () => setItem(id, sel.value));
    const name = document.createElement('b'); name.textContent = 'Item ' + id;
    const where = document.createElement('span'); where.textContent = s.itensVistos[id].join(' · ');
    row.append(name, where, sel);
    return row;
  }) : [Object.assign(document.createElement('p'), { textContent: 'Os itens aparecem aqui quando o jogo mandar a mochila de alguma conta (depois de usar ou comprar um item).' })]));

  // números editáveis: dá para ajustar os shinies de antes do HUB contar
  const numInput = (c, key) => {
    const td = document.createElement('td'), inp = document.createElement('input');
    inp.type = 'number'; inp.min = '0'; inp.step = '1'; inp.className = 'al-count'; inp.value = c[key];
    inp.dataset.id = c.id; inp.dataset.key = key;
    inp.addEventListener('change', () => send('shiny-set', { id: c.id, [key]: inp.value }));
    td.append(inp);
    return td;
  };
  const editing = document.activeElement?.classList.contains('al-count');
  if (!editing) $('#shinies').replaceChildren(...s.shiny.contas.map(c => { const tr = document.createElement('tr'); tr.append(cell(c.nome), numInput(c, 'vistos'), numInput(c, 'capturados')); return tr; }));
  $('#tot-v').textContent = s.shiny.total.vistos;
  $('#tot-c').textContent = s.shiny.total.capturados;

  $('#log').replaceChildren(...(s.historico.length ? s.historico.map(h => {
    const d = document.createElement('div'), t = document.createElement('time'), when = new Date(h.t);
    t.textContent = `${when.toLocaleDateString('pt-BR')} ${when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    d.append(t, h.text);
    return d;
  }) : [Object.assign(document.createElement('div'), { textContent: 'Nenhum alerta ainda.' })]));
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
send('ready');
