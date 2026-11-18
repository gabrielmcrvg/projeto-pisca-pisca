// Janela "WhatsApp do bot": mostra o estado da conexão e manda os comandos ao app.
const $ = s => document.querySelector(s);
const send = (cmd, value) => window.quadra.command(cmd, value);
const LABEL = { off: 'Desconectado', connecting: 'Conectando…', qr: 'Esperando o QR', code: 'Esperando o código', online: 'Conectado', error: 'Erro' };
let last = null;

function feedback(text, ok) {
  const f = $('#wa-msg');
  f.hidden = !text; f.textContent = text || ''; f.className = 'wa-feedback ' + (ok ? 'ok' : 'bad');
}
function error(text) { $('#error').hidden = !text; $('#error').textContent = text || ''; }

window.quadra.onState(s => {
  if (!s.whatsapp) return;
  last = s;
  const view = s.status === 'error' ? 'off' : s.status;
  document.querySelectorAll('[data-view]').forEach(el => { el.hidden = el.dataset.view !== view; });
  const st = $('#status');
  st.className = 'wa-status ' + (s.status === 'online' ? 'online' : s.status === 'error' ? 'error' : s.status === 'off' ? '' : 'wait');
  $('#status-text').textContent = LABEL[s.status] || s.status;
  if (s.qr) $('#qr').src = s.qr;
  if (s.code) $('#code').textContent = s.code;
  $('#me').textContent = s.me ? '+' + s.me.number + (s.me.name ? ` (${s.me.name})` : '') : '—';
  error(s.error);
  $('#group-card').hidden = s.status !== 'online';
  const sel = $('#group');
  const groups = s.groups || [];
  sel.replaceChildren(new Option(groups.length ? 'Escolha um grupo…' : 'Nenhum grupo encontrado', ''),
    ...groups.map(g => new Option(`${g.name} (${g.size})`, g.id)));
  if (s.target && !groups.some(g => g.id === s.target)) sel.add(new Option(s.targetName || 'Grupo salvo', s.target));
  sel.value = s.target || '';
  $('#test').disabled = !s.target;
});

$('#qr-btn').addEventListener('click', () => { error(''); send('wa-qr'); });
$('#code-form').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await send('wa-code', $('#phone').value);
  if (r?.error) error(r.error);
});
document.querySelectorAll('[data-cancel]').forEach(b => b.addEventListener('click', () => send('wa-cancel')));
$('#logout').addEventListener('click', () => send('wa-logout'));
$('#refresh').addEventListener('click', async () => { const r = await send('wa-groups'); feedback(r?.error || '', false); });
$('#group').addEventListener('change', e => { feedback(''); send('wa-target', e.target.value); });
$('#test').addEventListener('click', async () => {
  const b = $('#test');
  b.disabled = true; b.classList.add('busy'); feedback('Mandando…', true);
  const r = await send('wa-test');
  b.classList.remove('busy'); b.disabled = !last?.target;
  feedback(r?.error || 'Mensagem de teste enviada. Confira no grupo.', !r?.error);
});
$('#open-alerts').addEventListener('click', () => send('wa-open-alerts'));
send('ready');
