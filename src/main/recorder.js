// Gravador do que o jogo recebe: mensagens do socket e respostas de fetch/XHR do site (só leitura, desligado por padrão).
// Serve para descobrir o formato dos eventos (ex.: shiny apareceu / capturado) antes de criar os alertas.
// Grava só o que CHEGA do servidor; o que a página envia (onde costumam ir tokens de login) fica de fora,
// e parâmetros com cara de segredo são apagados dos endereços.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { label } = require('./config');

const LIMIT = 25 * 1024 * 1024;   // para sozinho ao passar de 25 MB

let file = null, size = 0;

const folder = () => path.join(app.getPath('userData'), 'gravacoes');
const isRecording = () => Boolean(file);

function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function start() {
  if (file) return file;
  fs.mkdirSync(folder(), { recursive: true });
  file = path.join(folder(), `gravacao-${stamp()}.jsonl`);
  size = 0;
  fs.writeFileSync(file, '');
  return file;
}

function stop() { const f = file; file = null; return f; }

// Tira do endereço parâmetros que costumam carregar segredos.
function cleanUrl(url) {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/token|key|auth|session|sig|secret|pass/i.test(k)) u.searchParams.set(k, '***');
    return u.toString();
  } catch { return String(url).split('?')[0]; }
}

async function record(a, frame) {
  if (!file) return;
  if (frame.kind === 'http') {
    const { body, ...rest } = frame;
    let data = null, note;
    if (!/json|text|javascript/i.test(rest.mime || '')) note = 'conteúdo não é texto';
    else if (rest.size > 400_000) note = 'resposta grande demais';
    else {
      try { const r = await body(); data = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body; }
      catch { note = 'corpo indisponível'; }
    }
    frame = { ...rest, url: cleanUrl(rest.url), data, ...(note ? { note } : {}) };
    if (!file) return;
  }
  const line = JSON.stringify({ t: new Date().toISOString(), conta: a.id, nome: label(a), ...frame }) + '\n';
  size += Buffer.byteLength(line);
  if (size > LIMIT) { stop(); return; }
  fs.appendFile(file, line, () => {});
}

Object.assign(module.exports, { start, stop, record, isRecording, folder });
