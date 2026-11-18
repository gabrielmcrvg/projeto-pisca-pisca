// Ferramentas de extensões (processo principal): ler manifestos, abrir .crx/.zip, achar extensões
// instaladas nos navegadores do PC. Sem dependências externas.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
const versionKey = v => String(v).split(/[._]/).map(n => String(Number(n) || 0).padStart(6, '0')).join('.');

// "__MSG_appName__" → texto do _locales (português primeiro).
function message(dir, manifest, value) {
  if (typeof value !== 'string') return '';
  const m = /^__MSG_(.+)__$/.exec(value);
  if (!m) return value;
  for (const loc of ['pt_BR', 'pt_PT', 'pt', manifest.default_locale, 'en_US', 'en'].filter(Boolean)) {
    try {
      const msgs = readJSON(path.join(dir, '_locales', loc, 'messages.json'));
      const key = Object.keys(msgs).find(k => k.toLowerCase() === m[1].toLowerCase());
      if (key && msgs[key].message) return msgs[key].message;
    } catch {}
  }
  return m[1];
}

// O ID do Chrome vem da chave pública do manifesto (quando existe).
function idFromKey(key) {
  if (!key) return null;
  try {
    const hex = crypto.createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32);
    return hex.replace(/./g, c => 'abcdefghijklmnop'[parseInt(c, 16)]);
  } catch { return null; }
}

// A pasta pode ter o manifest.json direto ou ser a cópia de um navegador: <id>/<versão>/manifest.json.
function resolveDir(dir) {
  if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
  let versions = [];
  try {
    versions = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'manifest.json')))
      .map(e => e.name).sort((a, b) => versionKey(b).localeCompare(versionKey(a)));
  } catch {}
  return versions.length ? path.join(dir, versions[0]) : null;
}

function describe(dir) {
  const manifest = readJSON(path.join(dir, 'manifest.json'));
  const sites = new Set();
  const add = m => { const h = /^[^:]+:\/\/([^/]+)/.exec(m); sites.add(h ? h[1].replace(/^\*\./, '') : m); };
  for (const cs of manifest.content_scripts || []) for (const m of cs.matches || []) add(m);
  for (const p of manifest.host_permissions || []) add(p);
  for (const p of manifest.permissions || []) if (typeof p === 'string' && /:\/\/|^<all_urls>$/.test(p)) add(p);
  const icons = manifest.icons || {};
  const size = Object.keys(icons).map(Number).sort((a, b) => b - a).find(n => n <= 128) ?? Object.keys(icons)[0];
  let icon = null;
  try {
    if (size !== undefined) {
      const file = path.join(dir, icons[size]);
      if (file.startsWith(path.resolve(dir)) && /\.png$/i.test(file)) icon = 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
    }
  } catch {}
  return {
    dir, manifest, id: idFromKey(manifest.key),
    name: message(dir, manifest, manifest.name) || path.basename(dir),
    version: manifest.version || '',
    description: message(dir, manifest, manifest.description || ''),
    sites: [...sites], theme: Boolean(manifest.theme), manifestVersion: manifest.manifest_version, icon,
  };
}

function validate(info) {
  if (info.theme) throw Error('Isso é um tema, não uma extensão.');
  if (![2, 3].includes(info.manifestVersion)) throw Error('O manifest.json não é de uma extensão do Chrome.');
}

// Copia sem "_metadata" (o Chromium recusa essa pasta em extensões descompactadas).
function copyClean(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true, filter: s => path.basename(s) !== '_metadata' });
}

// .crx (versões 2 e 3) é um cabeçalho seguido de um .zip comum.
function crxToZip(buf) {
  if (buf.subarray(0, 4).toString('latin1') !== 'Cr24') return buf;
  const version = buf.readUInt32LE(4);
  if (version === 3) return buf.subarray(12 + buf.readUInt32LE(8));
  if (version === 2) return buf.subarray(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12));
  throw Error('Formato de .crx desconhecido.');
}

// Leitor de .zip mínimo (armazenado ou deflate), sem permitir caminhos fora da pasta de destino.
function unzip(buf, target) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('O arquivo não é um .zip/.crx válido.');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const root = path.resolve(target);
  fs.mkdirSync(root, { recursive: true });
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw Error('O arquivo .zip está corrompido.');
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;
    const out = path.resolve(root, name);
    if (out !== root && !out.startsWith(root + path.sep)) throw Error('O arquivo tem um caminho inválido.');
    if (name.endsWith('/')) { fs.mkdirSync(out, { recursive: true }); continue; }
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (method !== 0 && method !== 8) throw Error('O arquivo usa uma compressão que o app não abre.');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, method === 0 ? data : zlib.inflateRawSync(data));
  }
}

// Extensões instaladas nos navegadores do PC (Windows): Brave, Chrome, Edge, Vivaldi.
const BROWSERS = [
  ['Brave', 'BraveSoftware/Brave-Browser/User Data'],
  ['Chrome', 'Google/Chrome/User Data'],
  ['Edge', 'Microsoft/Edge/User Data'],
  ['Vivaldi', 'Vivaldi/User Data'],
];
function scanBrowsers(localAppData = process.env.LOCALAPPDATA) {
  const found = [];
  if (!localAppData) return found;
  for (const [browser, rel] of BROWSERS) {
    const base = path.join(localAppData, rel);
    let profiles = [];
    try { profiles = fs.readdirSync(base, { withFileTypes: true }).filter(e => e.isDirectory() && (e.name === 'Default' || /^Profile \d+$/.test(e.name))).map(e => e.name); } catch { continue; }
    for (const profile of profiles) {
      const extRoot = path.join(base, profile, 'Extensions');
      let ids = [];
      try { ids = fs.readdirSync(extRoot, { withFileTypes: true }).filter(e => e.isDirectory() && /^[a-p]{32}$/.test(e.name)).map(e => e.name); } catch { continue; }
      for (const id of ids) {
        const dir = resolveDir(path.join(extRoot, id));
        if (!dir) continue;
        try {
          const info = describe(dir);
          if (info.theme || ![2, 3].includes(info.manifestVersion)) continue;
          found.push({ ...info, id, browser, profile: profile === 'Default' ? 'Perfil padrão' : profile.replace('Profile', 'Perfil') });
        } catch {}
      }
    }
  }
  return found;
}

const storeId = text => /([a-p]{32})/.exec(String(text || ''))?.[1] || null;

module.exports = { describe, validate, resolveDir, copyClean, crxToZip, unzip, scanBrowsers, storeId, idFromKey, versionKey };
