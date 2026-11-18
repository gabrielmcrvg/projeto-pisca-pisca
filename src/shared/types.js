// Os 18 tipos: nome em português, cor do emblema e cor do desenho em pixel art.
// Usado pela janela principal, pela Pokédex e pelo processo principal (Node).
const QUADRA_TYPES = {
  normal:   { name: 'Normal',   color: '#A8A49A', glyph: '#2B2A26' },
  fire:     { name: 'Fogo',     color: '#F0703A', glyph: '#FFF4E2' },
  water:    { name: 'Água',     color: '#3A92E6', glyph: '#F4F1E8' },
  electric: { name: 'Elétrico', color: '#F2C230', glyph: '#3A2B05' },
  grass:    { name: 'Planta',   color: '#4FB25A', glyph: '#F4F1E8' },
  ice:      { name: 'Gelo',     color: '#5FC9DA', glyph: '#103B44' },
  fighting: { name: 'Lutador',  color: '#C4423A', glyph: '#FFF0EE' },
  poison:   { name: 'Venenoso', color: '#A256B0', glyph: '#FBF0FD' },
  ground:   { name: 'Terrestre',color: '#D9B25E', glyph: '#3B2B0C' },
  flying:   { name: 'Voador',   color: '#8FA6E8', glyph: '#162447' },
  psychic:  { name: 'Psíquico', color: '#E8578E', glyph: '#FFF1F6' },
  bug:      { name: 'Inseto',   color: '#9DB33A', glyph: '#1F2608' },
  rock:     { name: 'Pedra',    color: '#B0935A', glyph: '#FBF4E4' },
  ghost:    { name: 'Fantasma', color: '#6E5C9E', glyph: '#F1ECFF' },
  dragon:   { name: 'Dragão',   color: '#5B63D6', glyph: '#EEF0FF' },
  dark:     { name: 'Sombrio',  color: '#6B5A4E', glyph: '#F6EEE8' },
  steel:    { name: 'Aço',      color: '#9DA8B8', glyph: '#1C2430' },
  fairy:    { name: 'Fada',     color: '#E58FC4', glyph: '#FFF6FB' },
};
if (typeof module !== 'undefined') module.exports = QUADRA_TYPES;
