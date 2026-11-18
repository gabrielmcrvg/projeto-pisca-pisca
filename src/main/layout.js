


const TOP = 68, GAP = 10, HEADER = 44, MAX = 4;

// Quantas colunas e linhas usar para `n` telas em cada modo.
function grid(n, mode) {
  if (mode === 'columns') return { cols: n, rows: 1 };
  if (mode === 'rows') return { cols: 1, rows: n };
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

// Retorna um retângulo por tela (ou null para telas escondidas pelo "ampliar").
// Na grade, a última linha incompleta é esticada para ocupar toda a largura.
function layout(width, height, mode, count = 4, focus = -1) {
  const n = Math.max(0, Math.min(MAX, count | 0));
  const one = focus >= 0 && focus < n;
  const { cols, rows } = one ? { cols: 1, rows: 1 } : grid(n, mode);
  return Array.from({ length: n }, (_, i) => {
    if (one && focus !== i) return null;
    const index = one ? 0 : i;
    const row = Math.floor(index / cols), col = index % cols;
    const inRow = row === rows - 1 ? n - cols * (rows - 1) : cols;
    const perRow = one ? 1 : inRow;
    const x1 = GAP + Math.floor((width - GAP) * col / perRow);
    const x2 = Math.floor((width - GAP) * (col + 1) / perRow);
    const y1 = TOP + GAP + Math.floor((height - TOP - GAP) * row / rows);
    const y2 = TOP + Math.floor((height - TOP - GAP) * (row + 1) / rows);
    return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(HEADER + 1, y2 - y1) };
  });
}
module.exports = { layout, grid, TOP, GAP, HEADER, MAX };
