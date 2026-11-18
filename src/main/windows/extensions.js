// Janela "Extensões": instalar (navegador, Chrome Web Store, pasta/arquivo), listar e remover.
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, dialog, net, shell } = require('electron');
const { ctx, paths, BG, secured, alive } = require('../context');
const icon = paths.icon, preload = paths.preload;
const EXT = require('../extensions/files');
const accounts = require('../accounts');
const extensions = require('../extensions/catalog');
const ui = require('../main-window');

// ---------- Gerenciador de extensões (janela "Extensões") ----------
let extWin = null;
let lastScan = new Map();   // resultado da última busca no navegador

function openExtensions() {
  if (alive(extWin)) { if (extWin.isMinimized()) extWin.restore(); extWin.focus(); return; }
  extWin = new BrowserWindow({ width: 820, height: 720, minWidth: 600, minHeight: 480, parent: ctx.win, backgroundColor: BG, icon,
    title: 'CorollaHUB • Extensões', autoHideMenuBar: true, webPreferences: { ...secured, preload } });
  extWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  extWin.webContents.on('will-navigate', event => event.preventDefault());
  extWin.on('page-title-updated', event => event.preventDefault());
  extWin.on('closed', () => { extWin = null; });
  extWin.loadFile(paths.page('extensions'));
}

const publicExt = e => ({ folder: e.folder, id: e.id, name: e.name, version: e.version, description: e.description, sites: e.sites,
  icon: e.icon, source: e.source, error: extensions.extErrors.get(e.folder) || null, loaded: extensions.extLoadedFolders.has(e.folder) });

const safeFolderName = text => String(text || 'extensao').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'extensao';

const tempDir = () => fs.mkdtempSync(path.join(app.getPath('temp'), 'corollahub-ext-'));

// Um .zip às vezes traz a extensão dentro de uma subpasta.
function findManifestRoot(root) {
  if (fs.existsSync(path.join(root, 'manifest.json'))) return root;
  const subs = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory());
  for (const sub of subs) if (fs.existsSync(path.join(root, sub.name, 'manifest.json'))) return path.join(root, sub.name);
  throw Error('Não achei o manifest.json da extensão.');
}

async function installFromDir(src, folderName, owner) {
  const info = EXT.describe(src);
  EXT.validate(info);
  const sites = info.sites.length ? info.sites.join(', ') : 'nenhum site específico';
  const current = extensions.catalog().find(e => (info.id && e.id === info.id) || e.name === info.name);
  const { response } = await dialog.showMessageBox(owner, {
    type: 'question', buttons: [current ? 'Atualizar' : 'Instalar', 'Cancelar'], defaultId: 0, cancelId: 1, noLink: true,
    title: 'Instalar extensão',
    message: `${current ? 'Atualizar' : 'Instalar'} “${info.name}” ${info.version} em todas as contas?`,
    detail: (current ? `Versão instalada: ${current.version}\n\n` : '') +
      `Ela vai poder ler e alterar as páginas de: ${sites}.\n\nSó instale extensões de fontes em que você confia.`,
  });
  if (response !== 0) return { canceled: true };
  const folder = current?.source === 'app' ? current.folder : path.join(extensions.ensureExtDir(), safeFolderName(folderName || info.id || info.name));
  if (current && current.source === 'projeto') for (const ses of extensions.extSessions.keys()) extensions.unloadFrom(ses, current);
  EXT.copyClean(src, folder);
  extensions.refreshCatalog();
  const ext = extensions.catalog().find(e => e.folder === folder);
  if (!ext) return { error: 'A extensão foi copiada, mas não foi encontrada depois. Tente de novo.' };
  let ok = 0;
  for (const ses of extensions.extSessions.keys()) if (await extensions.loadInto(ses, ext)) ok++;
  ui.state();
  if (!ok && extensions.extSessions.size) return { error: extensions.extErrors.get(folder) || 'A extensão não carregou.' };
  return { ok: true, name: ext.name, version: ext.version, accounts: ok };
}

async function installFromArchive(buf, folderName, owner) {
  const temp = tempDir();
  try {
    EXT.unzip(EXT.crxToZip(buf), temp);
    return await installFromDir(findManifestRoot(temp), folderName, owner);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

async function installFromStore(link, owner) {
  const id = EXT.storeId(link);
  if (!id) return { error: 'Não achei o código da extensão nesse link. Cole o endereço da página dela na Chrome Web Store.' };
  const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${process.versions.chrome}` +
    `&acceptformat=crx2,crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`;
  let res;
  try { res = await net.fetch(url); } catch { return { error: 'Não consegui falar com a Chrome Web Store. Confira a internet.' }; }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || buf.length < 200) return { error: 'A loja não entregou essa extensão (ela pode não existir mais ou não estar disponível).' };
  return installFromArchive(buf, id, owner);
}

async function removeExtension(folder, owner) {
  const ext = extensions.catalog().find(e => e.folder === folder);
  if (!ext) return { error: 'Extensão não encontrada.' };
  if (ext.source !== 'app') return { error: 'Essa extensão está na pasta "extensions" do projeto; apague a pasta dela lá.' };
  const { response } = await dialog.showMessageBox(owner, { type: 'warning', buttons: ['Remover', 'Cancelar'], defaultId: 1, cancelId: 1, noLink: true,
    title: 'Remover extensão', message: `Remover “${ext.name}” de todas as contas?`, detail: 'Os dados que ela guardou em cada conta também deixam de ser usados.' });
  if (response !== 0) return { canceled: true };
  for (const ses of extensions.extSessions.keys()) extensions.unloadFrom(ses, ext);
  extensions.extLoadedFolders.delete(folder);
  extensions.extErrors.delete(folder);
  if (path.resolve(folder).startsWith(path.resolve(extensions.userExtDir()) + path.sep)) fs.rmSync(folder, { recursive: true, force: true });
  extensions.refreshCatalog();
  ui.state();
  return { ok: true, name: ext.name };
}

async function extCommand(cmd, value, owner) {
  if (cmd === 'ext-list') return { installed: extensions.catalog().map(publicExt), accounts: ctx.config.accounts.length, platform: process.platform };
  if (cmd === 'ext-scan') {
    const found = EXT.scanBrowsers();
    lastScan = new Map(found.map((e, i) => [String(i), e]));
    return found.map((e, i) => {
      const mine = extensions.catalog().find(c => c.id === e.id || path.basename(c.folder) === e.id || c.name === e.name);
      const status = !mine ? 'new' : EXT.versionKey(e.version) > EXT.versionKey(mine.version) ? 'update' : 'installed';
      return { key: String(i), name: e.name, version: e.version, description: e.description, sites: e.sites, icon: e.icon, browser: e.browser, profile: e.profile, status };
    });
  }
  if (cmd === 'ext-install-browser') {
    const e = lastScan.get(String(value?.key));   // só aceita o que a busca encontrou
    return e ? installFromDir(e.dir, e.id, owner) : { error: 'Faça a busca de novo.' };
  }
  if (cmd === 'ext-install-store') return installFromStore(value?.link, owner);
  if (cmd === 'ext-install-folder') {
    const r = await dialog.showOpenDialog(owner, { title: 'Pasta da extensão', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const dir = EXT.resolveDir(r.filePaths[0]);
    if (!dir) return { error: 'Essa pasta não tem o manifest.json de uma extensão.' };
    const idName = /^[a-p]{32}$/.test(path.basename(r.filePaths[0])) ? path.basename(r.filePaths[0]) : null;
    return installFromDir(dir, idName, owner);
  }
  if (cmd === 'ext-install-file') {
    const r = await dialog.showOpenDialog(owner, { title: 'Arquivo da extensão', properties: ['openFile'], filters: [{ name: 'Extensão (.crx, .zip)', extensions: ['crx', 'zip'] }] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    return installFromArchive(fs.readFileSync(r.filePaths[0]), null, owner);
  }
  if (cmd === 'ext-remove') return removeExtension(value?.folder, owner);
  if (cmd === 'ext-open-folder') { shell.openPath(extensions.ensureExtDir()); return {}; }
  if (cmd === 'reload-all') { accounts.reloadAll(); return {}; }
  return {};
}
const owns = wc => alive(extWin) && wc === extWin.webContents;
function close() { if (alive(extWin)) extWin.close(); }


// (exportado assim para funcionar mesmo com módulos que se usam mutuamente)
Object.assign(module.exports, { openExtensions, publicExt, safeFolderName, tempDir, findManifestRoot, installFromDir, installFromArchive, installFromStore, removeExtension, extCommand, owns, close });
