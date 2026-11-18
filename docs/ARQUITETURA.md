# Arquitetura

O CorollaHUB é um app [Electron](https://www.electronjs.org/) organizado no padrão de três camadas:
**processo principal** (Node.js, controla janelas e sessões), **preload** (a ponte segura) e **páginas**
(HTML/CSS/JS sem acesso ao Node).

```
src/
├── main/                      Processo principal
│   ├── index.js               Entrada: flags do Chromium, instância única, inicialização
│   ├── context.js             Estado compartilhado (ctx), constantes e caminhos
│   ├── config.js              preferences.json: carregar e salvar
│   ├── main-window.js         Janela principal: cria, posiciona os painéis, envia o estado
│   ├── accounts.js            Contas: sessão e página de cada uma, destacar, renomear, esquecer login
│   ├── layout.js              Cálculo da grade/colunas/linhas (puro, testado)
│   ├── monitor.js             Saúde de uma conta: quedas, travamentos, recarga (puro, testado)
│   ├── recorder.js            Grava as mensagens que o jogo recebe (opcional, para os alertas)
│   ├── whatsapp.js            Bot de alertas: conexão (Baileys), grupo escolhido, fila de envio
│   ├── alerts.js              Central de alertas: onde avisar, estoque (Ultra Ball, potes, revives), pokémon com nota alta
│   ├── commands.js            Comandos no grupo (/estoque, /shinies…)
│   ├── shiny.js               Detecta shiny visto/capturado/fugiu nas mensagens do jogo; contadores
│   ├── gameupdate.js          Versão nova do jogo (/saude) → recarrega as contas sozinho
│   ├── health.js              Liga o monitor às contas: avisos, notificações, internet
│   ├── shortcuts.js           Atalhos de teclado
│   ├── menus.js               Menus nativos (ajuda e nome da conta)
│   ├── ipc.js                 Comandos vindos das páginas (com verificação de remetente)
│   ├── windows/
│   │   ├── chat.js            Botão do ChatGPT (abre no navegador)
│   │   ├── pokedex.js         Telinha da Pokédex
│   │   ├── extensions.js      Gerenciador de extensões
│   │   ├── whatsapp.js        Janela "WhatsApp do bot" (conectar e escolher o grupo)
│   │   └── alerts.js          Janela "Alertas"
│   └── extensions/
│       ├── catalog.js         Extensões instaladas e carregamento em cada conta
│       └── files.js           Manifesto, .crx/.zip e busca nos navegadores do PC
├── preload/preload.js         Expõe só window.quadra.command / onState / onUi
├── renderer/                  Páginas (uma pasta por janela)
│   ├── shared/theme.css       Tema: cores, botões, indicadores, emblemas
│   ├── hub/                   Janela principal
│   ├── pokedex/               Pokédex (data.js = dados gerados do PokéAPI)
│   ├── extensions/            Gerenciador de extensões
│   ├── whatsapp/              Conectar o bot e escolher o grupo
│   └── alerts/                O que avisar, estoque das contas, últimos alertas
└── shared/types.js            Os 18 tipos (usado pelo main e pelas páginas)
```

## Como as partes conversam

- As páginas chamam `window.quadra.command(nome, valor)`; o `ipc.js` confere se quem mandou é uma janela do
  próprio app antes de executar.
- O processo principal manda o estado para a página com `state` (painéis, contas, avisos, botões ativos).
- Os módulos do `main` se usam mutuamente; por isso cada um exporta com `Object.assign(module.exports, …)`
  e o estado compartilhado fica em `ctx` (`context.js`), em vez de variáveis globais.

## Contas e sessões

Cada conta é uma `WebContentsView` com a sessão `persist:quadra-account-N`: cookies, armazenamento e extensões
ficam separados por conta. O jogo roda com `sandbox`, `contextIsolation` e sem acesso ao Node; permissões do
navegador (câmera, notificações etc.) são negadas.

## Testes

`npm test` roda os testes de `test/` (layout e monitor de saúde) com o executor nativo do Node.

## Ferramentas

- `tools/build-pokedex-data.py` — gera `src/renderer/pokedex/data.js` a partir dos CSVs do PokéAPI.
- `tools/build-type-emblems.py` — gera os emblemas de tipo em pixel art (SVG).
- `scripts/iniciar.cmd` — roda pelo código-fonte no Windows (instala o Electron na primeira vez).
