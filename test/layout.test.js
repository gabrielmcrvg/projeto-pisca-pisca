const test = require('node:test');
const assert = require('node:assert/strict');
const { layout, TOP, HEADER, MAX } = require('../src/main/layout');

for (const mode of ['grid', 'columns', 'rows']) for (const [w, h] of [[900, 650], [1480, 960], [1920, 1080]]) {
  test(`${mode} ${w}x${h}: de 1 a ${MAX} telas dentro da janela, sem sobreposição`, () => {
    for (let n = 1; n <= MAX; n++) {
      const rects = layout(w, h, mode, n);
      assert.equal(rects.length, n);
      for (const a of rects) {
        assert(a.x >= 0 && a.y >= TOP);
        assert(a.x + a.width <= w);
        assert(a.y + a.height <= h, `${n} telas: passou da altura`);
        assert(a.height > HEADER);
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = rects[i], b = rects[j];
        assert(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${n} telas: ${i} e ${j} se sobrepõem`);
      }
    }
  });
}

test('Grade com 3 telas estica a última linha', () => {
  const [a, b, c] = layout(1480, 960, 'grid', 3);
  assert.equal(a.y, b.y);
  assert(c.y > a.y);
  assert(c.width > a.width * 1.9);
});

test('Ampliar qualquer conta mantém somente ela visível', () => {
  for (let n = 1; n <= MAX; n++) for (let i = 0; i < n; i++) {
    const r = layout(1480, 960, 'grid', n, i);
    assert.equal(r.filter(Boolean).length, 1);
    assert(r[i].width > 1400);
  }
});
