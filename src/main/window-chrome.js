// Controles nativos do Windows sobre a barra desenhada pelo aplicativo.
// Fora do Windows, mantém a moldura padrão do sistema.
function windowChrome(platform = process.platform) {
  return platform === 'win32' ? {
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#181b21', symbolColor: '#a1a9b6', height: 32 },
  } : {};
}
module.exports = windowChrome;
