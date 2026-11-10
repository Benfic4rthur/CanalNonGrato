# Desenvolver e verificar

[← Voltar à apresentação](../README.md)

Requer **Node.js 22+**. Os testes de navegador usam Microsoft Edge e um perfil temporário; não acessam o perfil pessoal do usuário.

```sh
npm ci
npm run build
npm test
```

Para executar partes da suíte:

```sh
npm run test:unit
npm run test:browser
```

O executável padrão do Edge nos testes fica em `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`. Para outro caminho, configure `EDGE_PATH` antes de executar a suíte.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| [`extension/`](../extension/) | Produto instalável, sem framework ou dependências de execução. |
| [`extension/core.js`](../extension/core.js) | Identidades, normalização, leitura de metadados e índice de bloqueio. |
| [`extension/background.js`](../extension/background.js) | Resolução de canais, gravações, importação e ativação em abas abertas. |
| [`extension/content.js`](../extension/content.js) | Filtragem da página, botões e barreiras de acesso direto. |
| [`extension/manager.js`](../extension/manager.js) | Lista, bloqueio, desbloqueio, fotos e backups. |
| [`scripts/bridge-main.js`](../scripts/bridge-main.js) | Leitor de metadados no contexto MAIN da página. |
| [`tests/`](../tests/) | Testes unitários e de navegador, com respostas determinísticas para os metadados. |

## Build

`npm run build` gera os ícones PNG, o leitor de metadados em `extension/bridge.js` e `dist/CanalNonGrato-VERSÃO.zip`. A versão do pacote vem de `extension/manifest.json`.

O bundle MAIN tem um caminho próprio porque o Chromium deduplica scripts pelo caminho entre contextos. As dependências `@playwright/test` e `sharp` são apenas de desenvolvimento; não entram no ZIP.

Depois de editar, rode o build e clique em **Recarregar** no cartão da extensão em `edge://extensions`. Recarregue o YouTube para encerrar scripts antigos que o navegador tiver mantido na página.

## Cobertura dos testes

A suíte verifica identidades e aliases, normalização, mudanças de nome/@, renderers clássicos, cartões modernos, Shorts v2 sem byline, conteúdo dinâmico, desbloqueio entre abas, links diretos, reprodução pausada, backups, importação, gravações concorrentes e ativação em abas antigas.

Também cobre prateleiras vazias de postagens, células de Shorts sem espaços reservados, fotos de canais existentes e ociosidade com 500 cartões adicionais. Os perfis temporários são removidos ao terminar.

## Verificação opcional no YouTube real

```sh
node scripts/live-smoke.cjs
```

Essa verificação abre o YouTube em um perfil temporário e sem login, bloqueia um canal de exemplo na pesquisa e confere um link direto e um cartão da lateral. Ela depende da disponibilidade e do formato atual do YouTube. As capturas ficam em `artifacts/`, fora do pacote e do repositório.

## Como o filtro evita trabalho contínuo

- Manifest V3: o processo de fundo dorme quando está ocioso. Não há verificações periódicas nem servidores próprios.
- O observador agrupa elementos alterados; IDs, caminhos e nomes são consultados por índices, em lotes de até 60 cartões.
- Os dados da página identificam canais primeiro. Consultas auxiliares ao YouTube são feitas quando necessárias, com no máximo duas simultâneas, tempo limite e cache de sessão limitado.
- Cartões novos e elementos reutilizados pelo YouTube são verificados durante a navegação e o carregamento contínuo.
- A ativação em abas existentes evita scripts e botões duplicados.

O suporte inclui renderers clássicos, `yt-lockup-view-model` e Shorts v2. Novos formatos do YouTube podem exigir ajustes nos seletores ou na leitura de metadados.

## Capa do repositório

```sh
npm run docs:images
```

A composição é vetorial e usa o ícone original do CanalNonGrato. O script gera SVG editável e PNG em `.github/assets/`, com nomes e dados ilustrativos. Esses arquivos não entram na extensão instalada.
