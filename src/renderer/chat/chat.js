// Barra do topo da janelinha do ChatGPT: arrastar move a janela; os botões mandam comandos ao app.
const send = cmd => window.quadra.command(cmd);
document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => send(b.dataset.cmd)));
// Recolhida: clicar no nome também abre de novo.
document.querySelector('.chat-title').addEventListener('click', () => { if (document.body.classList.contains('collapsed')) send('chat-collapse'); });
window.quadra.onState(state => {
  if (!state.chat) return;
  document.body.classList.toggle('collapsed', state.collapsed);
  document.body.classList.toggle('loading', state.loading);
  const fold = document.querySelector('#fold');
  fold.innerHTML = `<svg class="ic"><use href="#i-${state.collapsed ? 'up' : 'down'}"/></svg>`;
  fold.title = state.collapsed ? 'Abrir o chat (Ctrl+G)' : 'Recolher (Ctrl+G)';
});
send('ready');
