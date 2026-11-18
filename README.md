# Projeto Pisca-Pisca

Um navegador para Windows que abre **várias contas do mesmo site lado a lado, numa janela só** — cada uma com o
próprio login, cookies e dados separados.

## Baixar e instalar

1. Vá em **[Releases](../../releases/latest)** e baixe um dos arquivos:
   - **`…-Setup-x.y.z.exe`** — instalador (cria atalhos na área de trabalho e no Menu Iniciar).
   - **`…-portatil.exe`** — versão portátil, roda sem instalar.
2. Abra o arquivo. Na primeira vez o Windows pode mostrar **“O Windows protegeu o computador”**, porque o app não
   tem assinatura digital paga. Clique em **Mais informações → Executar assim mesmo**.

Requisitos: Windows 10 ou 11 (64 bits).

## Recursos

- **Até 4 contas** em grade, colunas ou linhas. Arraste para trocar de lugar ou destacar uma conta numa janela própria.
- **Logins separados e salvos**, com a opção de esquecer o login de uma conta só.
- **Avisos e recarga automática** quando uma conta trava, não carrega ou perde a conexão.
- **Extensões do Chrome** em todas as contas — do navegador do PC, da Chrome Web Store ou de arquivo.
- **Pokédex de consulta** com filtro por tipos, regiões, tipo único, formas e lendários.
- **ChatGPT** numa janelinha flutuante.
- Nome, cor e atalhos de teclado para cada conta.

Mais detalhes em **[docs/GUIA.md](docs/GUIA.md)**.

## Desenvolvimento

Precisa do [Node.js](https://nodejs.org/) (versão 20 ou mais nova).

```bash
npm install
npm start        # abre o app pelo código-fonte
npm test         # testes
npm run dist     # gera os .exe em dist/ (no Windows)
```

No Windows também dá para dar dois cliques em `scripts/iniciar.cmd`.

```
src/main/       processo principal (janelas, contas, extensões, atalhos)
src/preload/    ponte segura entre as páginas e o processo principal
src/renderer/   páginas de cada janela
src/shared/     código usado pelos dois lados
assets/         ícones
test/           testes (node --test)
tools/          geradores de dados
scripts/        iniciador para rodar pelo código-fonte
docs/           guia de uso e arquitetura
```

A organização do código está explicada em **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**.

## Publicar uma versão

1. Atualize a versão no `package.json`.
2. Faça o commit e crie a tag: `git tag v1.0.1 && git push && git push origin v1.0.1`.
3. O GitHub Actions (`.github/workflows/release.yml`) roda os testes, gera os `.exe` e cria a Release.

## Créditos

- Dados e imagens da Pokédex: [PokéAPI](https://pokeapi.co/). Pokémon pertence aos seus respectivos donos;
  este é um projeto de fã, sem vínculo com eles.
- Extensões de terceiros não acompanham o app — cada pessoa instala as suas.
