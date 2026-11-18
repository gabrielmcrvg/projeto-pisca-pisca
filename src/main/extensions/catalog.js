// Extensões instaladas: onde ficam, quais existem e o carregamento em cada conta.
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const { paths } = require('../context');
const EXT = require('./files');
const ui = require('../main-window');

const userExtDir = () => path.join(app.getPath('userData'), 'extensions');

const extDirs = () => app.isPackaged ? [userExtDir()] : [userExtDir(), paths.devExtensions];

function ensureExtDir() {
  const dir = userExtDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const help = path.join(dir, 'COMO-USAR.txt');
    if (!fs.existsSync(help)) fs.writeFileSync(help, 'Use o botão "Extensões" no topo do CorollaHUB para instalar e remover extensões.\r\n' +
      'Também dá para colocar aqui, à mão, uma pasta por extensão (com manifest.json, ou a pasta copiada do navegador).\r\n');
  } catch {}
  return dir;
}

const extSessions = new Map();       // sessão de cada conta -> promessa do carregamento inicial

const extErrors = new Map();         // pasta -> mensagem de erro

const extLoadedFolders = new Set();  // pastas carregadas com sucesso em alguma conta

let extCatalog = null;

function findExtensions() {
  const list = [], seen = new Set();
  for (const base of extDirs()) {
    let names = [];
    try { names = fs.readdirSync(base, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch {}
    for (const name of names) {
      const folder = path.join(base, name), dir = EXT.resolveDir(folder);
      if (!dir) continue;
      let info;
      try { info = EXT.describe(dir); } catch { continue; }
      const key = info.id || name;
      if (seen.has(key)) continue;   // a mesma extensão em duas pastas: vale a do app
      seen.add(key);
      list.push({ ...info, folder, source: base === userExtDir() ? 'app' : 'projeto' });
    }
  }
  return list;
}

const catalog = () => (extCatalog ??= findExtensions());

const refreshCatalog = () => { extCatalog = null; return catalog(); };

// Pastas copiadas de um navegador trazem "_metadata", que o Chromium recusa em extensões
// descompactadas. Nesse caso, uma cópia limpa é feita na pasta de dados do app.
const cacheTarget = dir => path.join(app.getPath('userData'), 'extensions-cache', path.basename(path.dirname(dir)) + '-' + path.basename(dir));

function cleanCopy(dir) {
  if (!fs.existsSync(path.join(dir, '_metadata'))) return dir;
  const target = cacheTarget(dir);
  if (!fs.existsSync(path.join(target, 'manifest.json'))) EXT.copyClean(dir, target);
  return target;
}

async function loadInto(ses, ext) {
  const api = ses.extensions || ses;
  const target = cleanCopy(ext.dir);
  for (const e of api.getAllExtensions()) if ((ext.id && e.id === ext.id) || e.path === target || e.path === ext.dir) api.removeExtension(e.id);
  try { await api.loadExtension(target, { allowFileAccess: false }); extErrors.delete(ext.folder); extLoadedFolders.add(ext.folder); return true; }
  catch (e) { console.error('Extensão não carregou:', ext.dir, e.message); extErrors.set(ext.folder, `${ext.name}: ${e.message}`); return false; }
}

function unloadFrom(ses, ext) {
  const api = ses.extensions || ses;
  for (const e of api.getAllExtensions()) if ((ext.id && e.id === ext.id) || e.path === ext.dir || e.path === cacheTarget(ext.dir)) api.removeExtension(e.id);
}

function loadExtensions(ses) {
  if (extSessions.has(ses)) return extSessions.get(ses);
  const job = (async () => { for (const ext of catalog()) await loadInto(ses, ext); })().then(() => ui.state());
  extSessions.set(ses, job);
  return job;
}

const extLoadedNames = () => catalog().filter(e => extLoadedFolders.has(e.folder)).map(e => e.name);

// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { userExtDir, extDirs, ensureExtDir, extSessions, extErrors, extLoadedFolders, findExtensions, catalog, refreshCatalog, cacheTarget, cleanCopy, loadInto, unloadFrom, loadExtensions, extLoadedNames });
