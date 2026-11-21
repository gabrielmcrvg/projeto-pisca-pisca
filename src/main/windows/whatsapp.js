// Janela "WhatsApp do bot": conectar o número do bot (QR ou código), escolher o grupo e testar.
const windowChrome = require('../window-chrome');
const { BrowserWindow, dialog } = require('electron');
const { ctx, paths, BG, secured, alive } = require('../context');
const wa = require('../whatsapp');
const alerts = require('../alerts');
require('../commands');   // responde /estoque, /shinies… no grupo

let waWin = null;

function push(s = wa.state()) { if (alive(waWin)) waWin.webContents.send('state', { whatsapp: true, ...s }); }
wa.events.on('change', push);
// Cada shiny vira mensagem no grupo. Sem conexão, o aviso espera (até 20) e sai quando o WhatsApp voltar.
const pending = [];
const ready = () => { const s = wa.state(); return s.status === 'online' && Boolean(s.target); };
function flush() { while (ready() && pending.length) { const m = pending.shift(); const tag = mention(m.conta); wa.send(tag ? `@${tag.user} ${m.text}` : m.text, tag ? [tag.id] : []).catch(() => {}); } }
// Quem marcar: escolhido por conta na janela Alertas; só vale se a pessoa estiver no grupo escolhido.
function mention(conta) {
  const id = conta != null ? alerts.config().marcar?.[conta] : null;
  if (!id) return null;
  const p = wa.participants().find(x => x.id === id);
  return p ? { id: p.id, user: p.id.split('@')[0] } : null;
}
alerts.events.on('alert', ({ text, conta }) => {
  if (!wa.hasSession()) return;                 // WhatsApp nunca conectado neste HUB: só a notificação do Windows
  pending.push({ conta, text: pending.length || !ready() ? text + ' (aviso atrasado: o WhatsApp estava desconectado)' : text });
  if (pending.length > 20) pending.shift();
  flush();
});
wa.events.on('change', () => flush());

function openWhatsApp() {
  if (alive(waWin)) { if (waWin.isMinimized()) waWin.restore(); waWin.focus(); return; }
  waWin = new BrowserWindow({ ...windowChrome(), width: 560, height: 700, minWidth: 460, minHeight: 520, parent: ctx.win, backgroundColor: BG, icon: paths.icon,
    title: 'CorollaHUB • WhatsApp do bot', autoHideMenuBar: true, webPreferences: { ...secured, preload: paths.preload } });
  waWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  waWin.webContents.on('will-navigate', event => event.preventDefault());
  waWin.on('page-title-updated', event => event.preventDefault());
  waWin.on('closed', () => { waWin = null; });
  waWin.loadFile(paths.page('whatsapp'));
}

async function waCommand(cmd, value) {
  if (cmd === 'ready') return push();
  if (cmd === 'wa-qr') return wa.start(null);
  if (cmd === 'wa-code') {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length < 12 || digits.length > 13) return { error: 'Digite o número do bot com DDI e DDD, ex.: 55 11 91234-5678.' };
    return wa.start(digits);
  }
  if (cmd === 'wa-cancel') return wa.stop();
  if (cmd === 'wa-open-alerts') return require('./alerts').openAlerts();
  if (cmd === 'wa-groups') { try { await wa.refreshGroups(); } catch { return { error: 'Não consegui buscar os grupos.' }; } return; }
  if (cmd === 'wa-target') return wa.setTarget(String(value || ''));
  if (cmd === 'wa-test') {
    try { await wa.send('✅ Teste do CorollaHUB: os alertas de shiny vão chegar neste grupo.'); return { ok: true }; }
    catch (e) { return { error: e?.message || 'Não consegui mandar a mensagem.' }; }
  }
  if (cmd === 'wa-logout') {
    const { response } = await dialog.showMessageBox(waWin, { type: 'warning', buttons: ['Desconectar', 'Cancelar'], defaultId: 1, cancelId: 1, noLink: true,
      title: 'Desconectar o WhatsApp', message: 'Desconectar este HUB do número do bot?',
      detail: 'Ele sai da lista de aparelhos conectados do bot e para de mandar alertas. Para voltar, é só conectar de novo.' });
    if (response !== 0) return { canceled: true };
    await wa.logout();
  }
}

const owns = wc => alive(waWin) && wc === waWin.webContents;
function close() { if (alive(waWin)) waWin.close(); }

Object.assign(module.exports, { openWhatsApp, waCommand, owns, close });
