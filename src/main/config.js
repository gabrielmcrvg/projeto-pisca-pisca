// Preferências do app (preferences.json na pasta de dados): contas, disposição, chat e Pokédex.
const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const { ctx, START_URL, MODES } = require('./context');
const { MAX } = require('./layout');
const TYPES = require('../shared/types');

const TYPE_KEYS = Object.keys(TYPES);
const TYPE_NAMES = Object.fromEntries(TYPE_KEYS.map(t => [t, TYPES[t].name]));
const defaultType = id => ['fire', 'water', 'grass', 'electric'][(id - 1) % 4];
const label = a => a.name || `Conta ${a.id}`;

const configPath = () => path.join(app.getPath('userData'), 'preferences.json');
let saveTimer;
function save() {
  clearTimeout(saveTimer);
  const { config } = ctx;
  const accounts = config.accounts.map(({ loading, error, ...a }) => a);
  fs.writeFileSync(configPath(), JSON.stringify({ mode: config.mode, autoReload: config.autoReload, chat: config.chat, pokedex: config.pokedex, accounts }, null, 2));
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }

const fresh = id => ({ id, name: '', type: defaultType(id), url: START_URL, zoom: 0.8, muted: id !== 1, detached: null, loading: false, error: '' });

function loadConfig() {
  const fallback = { mode: 'grid', autoReload: true, chat: {}, pokedex: {}, accounts: [1, 2, 3, 4].map(fresh) };
  try {
    const saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    const seen = new Set(), accounts = [];
    (Array.isArray(saved.accounts) ? saved.accounts : []).forEach((a, i) => {
      const id = Number.isInteger(a?.id) ? a.id : i + 1; // arquivos antigos não tinham id
      if (id < 1 || id > MAX || seen.has(id) || accounts.length >= MAX) return;
      seen.add(id);
      const name = typeof a.name === 'string' ? a.name.trim().slice(0, 20) : '';
      const type = TYPE_KEYS.includes(a.type) ? a.type : defaultType(id);
      accounts.push({ ...fresh(id), ...a, id, name, type, loading: false, error: '' });
    });
    if (!accounts.length) throw Error();
    const obj = v => (v && typeof v === 'object' ? v : {});
    return { mode: MODES.includes(saved.mode) ? saved.mode : 'grid', autoReload: saved.autoReload !== false,
      chat: obj(saved.chat), pokedex: obj(saved.pokedex), accounts };
  } catch { return fallback; }
}

module.exports = { TYPES, TYPE_KEYS, TYPE_NAMES, defaultType, label, save, saveSoon, fresh, loadConfig };
