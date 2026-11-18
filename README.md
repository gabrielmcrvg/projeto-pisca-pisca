# CorollaHUB

Várias contas do **PokeIdle** em uma janela só — cada conta com o próprio login, lado a lado.

## Baixar e instalar

1. Vá em **[Releases](../../releases/latest)** e baixe um dos arquivos:
   - **`CorollaHUB-Setup-x.y.z.exe`** — instalador (atalhos na área de trabalho e no Menu Iniciar).
   - **`CorollaHUB-x.y.z-portatil.exe`** — versão portátil, roda sem instalar.
2. Abra o arquivo. Na primeira vez o Windows pode mostrar **“O Windows protegeu o computador”**, porque o app não
   tem assinatura digital paga. Clique em **Mais informações → Executar assim mesmo**.

Requisitos: Windows 10 ou 11 (64 bits).

## Recursos

- **Até 4 contas** em grade, colunas ou linhas — arraste para trocar de lugar ou destacar numa janela própria.
- **Logins separados e salvos**, com opção de esquecer o login de uma conta só.
- **Avisos e recarga automática** quando uma conta trava, não carrega ou perde a conexão com o jogo.
- **Extensões** do Chrome em todas as contas (do navegador do PC, da Chrome Web Store ou de arquivo).
- **Pokédex** com filtro por até 2 tipos, regiões, tipo único, formas e lendários.
- **ChatGPT** numa janelinha flutuante.

Detalhes e atalhos: **[docs/GUIA.md](docs/GUIA.md)**.

## Desenvolvimento

```bash
npm install
npm start        # abre o app pelo código-fonte
npm test         # testes
npm run dist     # gera os .exe em dist/ (no Windows)
```

No Windows também dá para dar dois cliques em `scripts/iniciar.cmd`.
Para ver como o código está organizado, leia **[docs/ARQUITETURA.md](docs/ARQUITETURA.md)**.

```
src/main/       processo principal (janelas, contas, extensões, atalhos)
src/preload/    ponte segura entre as páginas e o processo principal
src/renderer/   páginas: hub (janela principal), pokedex, extensions
src/shared/     código usado pelos dois lados (tipos)
assets/         ícones do app
test/           testes (node --test)
tools/          geradores de dados (Pokédex, emblemas)
scripts/        iniciador para rodar pelo código-fonte
docs/           guia de uso e arquitetura
```

## Publicar uma versão

1. Atualize a versão: `npm version 1.0.1 --no-git-tag-version` (ou edite o `package.json`).
2. Faça o commit e crie a tag: `git tag v1.0.1 && git push && git push origin v1.0.1`.
3. O GitHub Actions (`.github/workflows/release.yml`) roda os testes, gera os dois `.exe` e cria a Release.

## Créditos

- Dados e imagens da Pokédex: [PokéAPI](https://pokeapi.co/).
- Pokémon e PokeIdle pertencem aos seus donos; este é um projeto de fã, sem vínculo com eles.
- Extensões de terceiros não acompanham o app — cada pessoa instala as suas.
