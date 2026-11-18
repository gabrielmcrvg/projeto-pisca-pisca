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
| Ctrl+G | Abre/recolhe o ChatGPT |

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

Botão **ChatGPT** (ou Ctrl+G): o chatgpt.com numa janelinha flutuante no canto inferior direito, sempre por cima
das contas. Arraste pela barra do topo; mude o tamanho pelas bordas. A seta recolhe para uma barrinha. O login,
a posição, o tamanho e a última conversa ficam salvos. Login com Google pode recusar navegadores embutidos — nesse
caso, entre com e-mail e senha.

## Onde ficam os dados

Tudo em `%APPDATA%\Quadra`: logins de cada conta, preferências (`preferences.json`) e extensões (`extensions\`).
Trocar ou atualizar o `.exe` não apaga nada.
