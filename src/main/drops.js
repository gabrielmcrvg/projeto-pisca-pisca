// IDs e campos conferidos em pokeidle.io/sessao-hunt.mjs e shared/sacrificio.mjs.
// Somente eventos de derrota confirmam drops; a mochila também muda por compras e trocas.
const DROP_TYPES = [
  { id: '70000', name: 'Boss Token', serverName: 'Bronze Boss Token' },
  { id: '70011', name: 'Fragmento de Chave', serverName: 'Key Fragment' },
  { id: '70012', name: 'Fragmento de Shiny Stone', serverName: 'Shiny Stone Fragment' },
  { id: '70013', name: 'Fragmento de Bicicleta', serverName: 'Bicycle Fragment' },
  { id: '70018', name: 'Osso de Sacrifício', serverName: 'Sacrifice Bone' },
];

function readDrops(event, selectedIds) {
  if (!event || !(event.k === 'bossMorto' || (event.k === 'morte' && event.quem === 'selvagem'))) return [];
  if (!Array.isArray(event.drops) || !Array.isArray(selectedIds)) return [];
  const selected = new Set(selectedIds.map(String));
  const amounts = new Map();
  for (const drop of event.drops) {
    if (!drop || typeof drop !== 'object') continue;
    const type = DROP_TYPES.find(item => drop.itemId != null
      ? item.id === String(drop.itemId)
      : item.serverName === drop.nome);
    const quantity = drop.qtd == null ? 1 : Number(drop.qtd);
    if (!type || !selected.has(type.id) || !Number.isSafeInteger(quantity) || quantity < 1) continue;
    const total = (amounts.get(type.id) || 0) + quantity;
    if (Number.isSafeInteger(total)) amounts.set(type.id, total);
  }
  return DROP_TYPES.filter(item => amounts.has(item.id)).map(item => ({
    id: item.id, name: item.name, quantity: amounts.get(item.id),
  }));
}

module.exports = { DROP_TYPES, readDrops };
