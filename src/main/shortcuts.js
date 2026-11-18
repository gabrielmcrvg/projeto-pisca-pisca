// Atalhos de teclado (valem com o foco no jogo, no painel ou numa janela destacada).
const { ctx } = require('./context');
const accounts = require('./accounts');
const chat = require('./windows/chat');
const dex = require('./windows/pokedex');
const ui = require('./main-window');

function shortcut(input, sourceId) {
  if (input.type !== 'keyDown') return false;
  const ctrl = input.control || input.meta, plain = !input.alt && !input.shift;
  const target = accounts.acc(sourceId) || accounts.acc(ctx.active) || accounts.attached()[0];
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(input.code || '')?.[1];
  if (ctrl && plain && digit !== undefined) {
    const n = Number(digit);
    if (n === 0) { if (!input.isAutoRepeat && ctx.focus !== null) { ctx.focus = null; ui.arrange(); } return true; }
    const a = ctx.config.accounts[n - 1];
    if (!a) return false;
    if (input.isAutoRepeat) return true;
    if (ctx.detached.has(a.id)) accounts.reveal(a.id);
    else { ctx.focus = ctx.focus === a.id ? null : a.id; ui.arrange(); accounts.reveal(a.id); }
    return true;
  }
  if (ctrl && plain && (input.key || '').toLowerCase() === 'p') { if (!input.isAutoRepeat) dex.togglePokedex(); return true; }
  if (ctrl && plain && (input.key || '').toLowerCase() === 'g') { if (!input.isAutoRepeat) chat.toggleChat(); return true; }
  if (ctrl && plain && (input.key || '').toLowerCase() === 'm') { if (!input.isAutoRepeat && target) accounts.toggleMute(target); return true; }
  if (input.key === 'F5' && !input.alt) {
    if (!input.isAutoRepeat) { if (ctrl) accounts.reloadAll(); else if (target) accounts.reloadAccount(target); ui.state(); }
    return true;
  }
  return false;
}

// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { shortcut });
