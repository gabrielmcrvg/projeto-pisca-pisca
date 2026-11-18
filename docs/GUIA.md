# Guia de uso

## Contas

- Use **−** e **+** no topo para escolher quantas contas ficam abertas (1 a 4).
- **✕** fecha uma conta. O login dela continua salvo e volta quando a conta com o mesmo número for aberta de novo.
- Cada conta tem voltar, recarregar, endereço (Enter), zoom e áudio. Só a Conta 1 começa com som.
- **Disposição:** grade, colunas ou linhas. **⛶** amplia uma conta; **▦** restaura.
- **Trocar de lugar:** segure o nome da conta (⠿ Conta N) e solte sobre outra.
- **Destacar:** **⧉** abre a conta numa janela própria (ou arraste o nome para fora da janela). Para devolver,
  feche essa janela, use **⇲** nela ou clique no botão da conta no topo. A página não recarrega.
- **Nome e tipo:** duplo clique no nome para renomear; clique direito para escolher um dos 18 tipos.
- **Esquecer login:** clique direito no nome → *Esquecer login desta conta…*. Apaga cookies, dados e cache só daquela
  conta e volta para a tela de entrar. As outras contas não mudam.

Janelas de login abertas pelo site usam a sessão da conta que as abriu. As contas têm cookies e dados separados,
mas usam a mesma conexão/IP. O app não automatiza cliques nem jogadas.

## Avisos e recarga automática

Se uma conta travar, não carregar ou perder a conexão com o jogo (sem reconectar sozinha em 30 s):

- o painel fica vermelho e o indicador do topo acende;
- a janela pisca na barra de tarefas e o Windows mostra uma notificação;
- a conta é recarregada sozinha, com esperas de 10 s, 30 s, 1 min, 2 min e 5 min (depois pausa).

Sem internet, as contas esperam a conexão voltar e recarregam na hora. O botão **Auto** liga e desliga a recarga
automática. Se o jogo não conectar nem depois de recarregar, o aviso sugere entrar na conta de novo.

## Atalhos

| Atalho | O que faz |
| --- | --- |
| Ctrl+1…4 | Amplia/restaura a conta (ou traz a janela destacada) |
| Ctrl+0 | Volta para todas as contas |
| Ctrl+M | Liga/desliga o som da conta ativa |
| F5 / Ctrl+F5 | Recarrega a conta ativa / todas |
| Ctrl+P | Abre/fecha a Pokédex |
| Ctrl+G | Abre o ChatGPT no navegador |

## Pokédex

Botão **Pokédex** (ou Ctrl+P): uma telinha de consulta, sempre por cima das contas. Arraste pela barra vermelha;
**Esc** ou **✕** fecha e guarda os filtros.

- Até **2 tipos** (os dois precisam estar no Pokémon), uma ou mais **regiões**, **tipo único** (ex.: Fogo puro),
  formas regionais/alternativas e lendários/míticos.
- Cada botão mostra quantos Pokémon aparecem se for clicado; os que dariam zero ficam apagados.
- Busca por nome ou número (`/` ou Ctrl+F). O botão de copiar no card copia o nome.
- Imagens (sprites ou arte oficial) vêm do PokéAPI pela internet e só carregam quando o card aparece.

## Extensões

Botão **Extensões**: instale do Brave/Chrome/Edge/Vivaldi do PC (*Do navegador*), pelo link da Chrome Web Store
ou de uma pasta/arquivo `.crx`/`.zip`. Cada extensão vale para todas as contas, sem reiniciar o app — recarregue
as contas para ela aparecer nas páginas. Antes de instalar, o app mostra em quais sites ela vai rodar.

## ChatGPT

Botão **ChatGPT** (ou Ctrl+G): abre o chatgpt.com no seu navegador padrão, onde o login (inclusive com Google)
funciona normalmente.

## Atualização do jogo

Quando o jogo lança uma versão nova, o HUB percebe (a mesma consulta que faz aparecer o botão "Atualizar agora")
e recarrega as contas sozinho, uma de cada vez, com um aviso no Windows e no grupo do WhatsApp
(opção em **Alertas**). Para desligar: menu do botão de
teclado → **Atualizar o jogo sozinho** (aí o HUB só avisa).

## Alertas

Botão **Alertas** no topo. Avisa no grupo do WhatsApp e/ou como notificação do Windows:

- **Shiny** apareceu, capturado ou fugiu, com os contadores de cada conta e o total;
- **Estoque** baixo, por conta: Ultra Ball, potes (todos os tipos somados) e revives (somados). Avisa uma vez e
  só de novo depois de repor. Os potes são reconhecidos sozinhos quando curam um pokémon; o revive você marca em
  *Quais itens contam como pote e revive*, pela quantidade que aparece na mochila;
- **Pokémon bom**: capturou um pokémon com nota a partir do valor escolhido (padrão 3,5 de 10);
- **Atualização do jogo**.

No grupo, o bot também responde comandos com os números das contas deste HUB: **/estoque**, **/ultra**,
**/potes**, **/revives**, **/shinies**, **/status** (se cada conta está on ou off) e **/ajuda** (dá para desligar em Alertas → Onde avisar).

O HUB só lê as mensagens que o jogo já recebe (nada é enviado ao jogo). Os contadores da Pokédex do servidor
evitam contar o mesmo shiny duas vezes, mesmo depois de recarregar. Se o WhatsApp estiver desconectado, até 20
avisos esperam e saem quando ele voltar.

## WhatsApp do bot

Menu do botão de teclado → **WhatsApp do bot…**. O HUB entra no número do bot como aparelho conectado
(igual ao WhatsApp Web) e manda os alertas num grupo:

1. Ative o número do bot no WhatsApp de um celular e crie um grupo com ele e quem vai receber os alertas.
2. No HUB, clique em **Conectar com QR code** e escaneie com o celular do bot
   (*Aparelhos conectados → Conectar um aparelho*). Longe do celular? Use **Gerar código** com o número do bot
   e digite o código em *Conectar com número de telefone*.
3. Escolha o grupo e clique em **Mandar teste**.

A conexão fica salva e volta sozinha quando o app abre. Usa uma biblioteca não oficial (Baileys): o WhatsApp pode
banir o número do bot, então não use o seu número pessoal.

## Onde ficam os dados

Tudo em `%APPDATA%\Quadra`: logins de cada conta, preferências (`preferences.json`), extensões (`extensions\`) a
conexão do bot do WhatsApp (`whatsapp-sessao\`) e os contadores de shiny e estoque (`shinies.json`, `alertas.json`).
Trocar ou atualizar o `.exe` não apaga nada.
