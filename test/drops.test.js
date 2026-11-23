const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { DROP_TYPES, readDrops } = require('../src/main/drops');

const selected = DROP_TYPES.map(item => item.id);
const death = drops => ({ k: 'morte', quem: 'selvagem', drops });

test('reconhece os cinco drops raros com os IDs usados pelo jogo', () => {
  const result = readDrops(death(selected.map(itemId => ({ itemId: Number(itemId), qtd: 1 }))), selected);
  assert.deepEqual(result.map(item => item.id), selected);
  assert.equal(result.find(item => item.id === '70018').name, 'Osso de Sacrifício');
});

test('soma quantidades do mesmo item e respeita a seleção', () => {
  const result = readDrops(death([
    { itemId: 70011, qtd: 2 }, { itemId: '70011', qtd: '3' }, { itemId: 70000, qtd: 1 },
  ]), ['70011']);
  assert.deepEqual(result, [{ id: '70011', name: 'Fragmento de Chave', quantity: 5 }]);
});

test('aceita nome conhecido sem ID e quantidade omitida', () => {
  assert.deepEqual(readDrops(death([{ nome: 'Key Fragment' }]), selected), [
    { id: '70011', name: 'Fragmento de Chave', quantity: 1 },
  ]);
  assert.equal(readDrops(death([{ itemId: 999, nome: 'Key Fragment' }]), selected).length, 0);
});

test('ignora quantidades inválidas e itens comuns ou desconhecidos', () => {
  const invalid = [0, -1, 0.5, 'abc', Infinity, Number.MAX_SAFE_INTEGER + 1];
  assert.equal(readDrops(death([
    ...invalid.map(qtd => ({ itemId: 70011, qtd })), null,
    { itemId: 203, qtd: 10 }, { itemId: 999, qtd: 1 },
  ]), selected).length, 0);
  assert.deepEqual(readDrops(death(null), selected), []);
});

test('compras e morte do jogador não são drops; recompensa de boss é aceita', () => {
  const drops = [{ itemId: 70000, qtd: 1 }];
  for (const event of [{ k: 'compra', drops }, { k: 'morte', quem: 'jogador', drops }, null]) {
    assert.deepEqual(readDrops(event, selected), []);
  }
  assert.equal(readDrops({ k: 'bossMorto', drops }, selected).length, 1);
});

function loadAlerts(savedConfig = {}, savedData = {}) {
  const context = { config: { alertas: savedConfig, whatsapp: {}, accounts: [] } };
  const fakeFs = { readFileSync: () => JSON.stringify(savedData), writeFileSync() {} };
  const fakeUpdate = { events: new EventEmitter() };
  const sandbox = {
    module: { exports: {} }, structuredClone, Buffer,
    setTimeout: () => 1, clearTimeout() {},
    require(name) {
      if (name === 'node:fs') return fakeFs;
      if (name === 'electron') return {
        app: { getPath: () => 'unused' }, Notification: { isSupported: () => false },
      };
      if (name === './context') return { ctx: context, paths: {} };
      if (name === './config') return { label: a => a.name, save() {} };
      if (name === './gameupdate') return fakeUpdate;
      if (name === './drops') return { DROP_TYPES, readDrops };
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/alerts.js'), 'utf8'), sandbox);
  const alerts = sandbox.module.exports;
  const messages = [];
  alerts.events.on('alert', event => messages.push(event));
  const send = (id, message) => alerts.handle({ id, name: 'Conta ' + id }, {
    kind: 'in', opcode: 1, data: JSON.stringify(message),
  });
  return { alerts, messages, send, context };
}

test('eventos reais de batalha chegam à central e ao canal WhatsApp com conta e quantidade', () => {
  const { alerts, messages, send } = loadAlerts();
  assert.equal(alerts.config().drops.ids.length, 5);
  send(2, { t: 'batalha', ev: [death([{ itemId: 70011, nome: 'Key Fragment', qtd: 2 }])] });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].tipo, 'drop');
  assert.equal(messages[0].conta, 2);
  assert.match(messages[0].text, /Conta 2.*2 × Fragmento de Chave.*\d{2}h\d{2}/);
  assert.equal(alerts.summary().historico.length, 1);
});

test('atualização da mochila e mensagens enviadas não produzem alerta de drop', () => {
  const { alerts, messages, send } = loadAlerts({ ultra: { on: false }, potes: { on: false, ids: [] }, revives: { on: false, ids: [] } });
  send(1, { t: 'estado', estado: { items: { 70011: 1 } } });
  send(1, { t: 'estado', estado: { items: { 70011: 20 } } });
  alerts.handle({ id: 1, name: 'Conta 1' }, {
    kind: 'out', opcode: 1, data: JSON.stringify({ t: 'batalha', ev: [death([{ itemId: 70011 }])] }),
  });
  assert.equal(messages.length, 0);
});

test('preferências desativam itens específicos ou todos, inclusive em configurações antigas', () => {
  const { alerts, messages, send } = loadAlerts();
  alerts.setConfig({ drops: { ids: ['70011', '999', '70011'] } });
  assert.deepEqual(Array.from(alerts.config().drops.ids), ['70011']);
  send(1, { t: 'batalha', ev: [death([{ itemId: 70000 }])] });
  assert.equal(messages.length, 0);
  alerts.setConfig({ drops: { on: false } });
  send(1, { t: 'batalha', ev: [death([{ itemId: 70011 }])] });
  assert.equal(messages.length, 0);
  alerts.setConfig({ drops: { on: true } });
  send(1, { t: 'batalha', ev: [death([{ itemId: 70011 }])] });
  assert.equal(messages.length, 1);
});

test('drops consecutivos iguais e contas diferentes geram avisos separados', () => {
  const { messages, send } = loadAlerts();
  const message = { t: 'batalha', ev: [death([{ itemId: 70018, qtd: 1 }])] };
  send(1, message); send(1, message); send(4, message);
  assert.equal(messages.length, 3);
  assert.deepEqual(messages.map(event => event.conta), [1, 1, 4]);
});

test('WhatsApp desligado mantém o histórico e eventos malformados não interrompem alertas', () => {
  const { alerts, messages, send } = loadAlerts({ whatsapp: false });
  send(1, { t: 'batalha', ev: {} });
  alerts.handle({ id: 1 }, { kind: 'in', opcode: 1, data: '{"drops":' });
  send(1, { t: 'batalha', ev: [death([{ itemId: 70013 }])] });
  assert.equal(messages.length, 0);
  assert.equal(alerts.summary().historico.length, 1);
});


test('estoque raro distingue mochila ainda desconhecida de uma mochila vazia recebida', () => {
  const { alerts, send, context } = loadAlerts();
  context.config.accounts = [{ id: 1, name: 'Conta 1' }];
  assert.equal(alerts.summary().contas[0].itemsKnown, false);
  send(1, { t: 'estado', estado: { balls: { 4: 100 } } });
  assert.equal(alerts.summary().contas[0].itemsKnown, false);
  send(1, { t: 'estado', estado: { items: {} } });
  assert.equal(alerts.summary().contas[0].itemsKnown, true);
});

test('estoque raro acompanha ganhos e gastos mesmo com alertas de drop desligados', () => {
  const { alerts, send, messages, context } = loadAlerts({ drops: { on: false, ids: [] }, ultra: { on: false }, potes: { on: false, ids: [] }, revives: { on: false, ids: [] } });
  context.config.accounts = [{ id: 1, name: 'Conta 1' }, { id: 2, name: 'Conta 2' }];
  send(1, { t: 'estado', estado: { items: { 70000: 10, 70011: 3 } } });
  send(2, { t: 'estado', estado: { items: { 70000: 4 } } });
  send(1, { t: 'estado', estado: { items: { 70000: 8 } } });
  const contas = alerts.summary().contas;
  assert.equal(contas[0].items['70000'], 8);
  assert.equal(contas[0].items['70011'], undefined);
  assert.equal(contas[1].items['70000'], 4);
  assert.equal(contas.every(c => c.itemsKnown), true);
  assert.equal(messages.filter(m => m.tipo === 'drop').length, 0);
});

test('estoque salvo em versões anteriores continua disponível', () => {
  const { alerts, context } = loadAlerts({}, { estoque: { 1: { items: { 70012: 7 }, balls: {} } } });
  context.config.accounts = [{ id: 1, name: 'Conta 1' }];
  assert.equal(alerts.summary().contas[0].itemsKnown, true);
  assert.equal(alerts.summary().contas[0].items['70012'], 7);
});

test('um array malformado não confirma leitura da mochila', () => {
  const { alerts, send, context } = loadAlerts();
  context.config.accounts = [{ id: 1, name: 'Conta 1' }];
  send(1, { t: 'estado', estado: { items: [] } });
  assert.equal(alerts.summary().contas[0].itemsKnown, false);
});
