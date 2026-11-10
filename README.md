# CanalNonGrato

<img src="extension/icons/mark.svg" alt="Ícone do CanalNonGrato" width="88" />

Extensão para Microsoft Edge (também compatível com Chrome) que mantém uma lista local de canais indesejados no YouTube. Interface em português, ícone próprio e nenhum framework no pacote instalado.

## Baixar e instalar

**[Baixar CanalNonGrato 1.0.3 (.zip)](https://github.com/Benfic4rthur/CanalNonGrato/releases/download/v1.0.3/CanalNonGrato-1.0.3.zip)** — gratuito, para Edge e Chrome no computador. A distribuição é direta; a extensão não está nas lojas dos navegadores.

Extraia o ZIP e guarde a pasta em um lugar fixo. Depois:

### Microsoft Edge

1. Abra `edge://extensions` na barra de endereços do Edge.
2. Ative **Modo do desenvolvedor** e clique em **Carregar sem pacote** / **Carregar sem compactação** (Load unpacked, dependendo da versão e do idioma).
3. Selecione a pasta extraída que contém o arquivo `manifest.json`. Se você clonou este repositório, selecione a pasta `extension`.
4. Fixe o CanalNonGrato no menu de extensões e recarregue as abas do YouTube.

### Google Chrome

1. Abra `chrome://extensions` na barra de endereços do Chrome.
2. Ative **Modo do desenvolvedor** e clique em **Carregar sem compactação** (Load unpacked).
3. Selecione a pasta extraída que contém o arquivo `manifest.json`, ou a pasta `extension` se clonou este repositório.
4. Fixe o ícone e recarregue as abas do YouTube.

Também há um ZIP pronto em `dist/CanalNonGrato-1.0.3.zip`. Para instalar a partir dele, extraia e selecione a pasta que contém o `manifest.json`. Mantenha essa pasta no mesmo lugar depois da instalação. Não precisa executar npm, instalar dependências ou rodar um servidor para usar a extensão.

Instruções oficiais: [Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading) · [Google Chrome](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked). Atualizações são manuais: baixe o novo pacote, substitua os arquivos na pasta e clique em Recarregar no cartão da extensão.

## Usar

- Clique em **Bloquear** junto ao autor dos vídeos e das playlists, ou no ícone de bloqueio dos cartões de Shorts. No vídeo aberto, use **Bloquear canal**, ao lado de Inscrever-se.
- Abra o ícone da extensão para adicionar um **@**, link de canal, ID, link de vídeo ou nome exato.
- Use **Desbloquear** na lista para permitir o canal novamente. As abas abertas recebem a alteração automaticamente; o aviso também permite desfazer a última ação.
- Use **Abrir painel** para gerenciar a lista em uma página maior. A busca filtra a lista; **Exportar** e **Importar** fazem backup em JSON sem substituir os canais já bloqueados.
- A lista mostra a foto de perfil do canal. Canais já bloqueados recebem as fotos automaticamente; iniciais são usadas enquanto a imagem carrega ou quando não é possível obtê-la.

Prefira o botão no vídeo, um @ ou um link. Quando possível, o canal fica salvo pelo ID imutável do YouTube e continua bloqueado se mudar de nome ou @. Nomes digitados sozinhos são comparados por nome exato (ignorando caixa, espaços extras e acentos); canais diferentes com o mesmo nome também podem ser ocultados por essa regra.

## Cobertura

O filtro trata a página inicial, recomendações laterais, resultados de pesquisa, cartões de Shorts, playlists, publicações de canais e cartões de encerramento que forneçam um link de vídeo. Links diretos de vídeos, Shorts e canais bloqueados recebem uma barreira, e a reprodução é pausada. Prateleiras cujos vídeos estão todos bloqueados também são ocultadas.

O suporte inclui renderers clássicos e os novos `yt-lockup-view-model` e Shorts v2. Elementos novos e cartões reutilizados pelo YouTube são verificados durante a navegação e o carregamento contínuo.

O bloqueio atua na interface do YouTube **neste navegador**. Não altera a conta nem os servidores do YouTube, nem outros navegadores ou aplicativos. O YouTube pode alterar seus formatos; nenhum filtro de interface pode garantir que todas as mudanças futuras estejam cobertas. Se não for possível obter a identidade de um vídeo após uma falha de rede, ele poderá continuar visível. Formatos que escaparem precisam de atualização dos seletores ou da leitura de metadados.

## Leveza e privacidade

- JavaScript, CSS e SVG locais, sem dependências na extensão instalada, fontes externas ou rastreamento.
- Manifest V3: o processo de fundo dorme quando está ocioso. Sem verificações periódicas ou servidores próprios.
- A instalação/atualização ativa o filtro em abas do YouTube já abertas, inclusive documentos antigos mantidos pela navegação interna do site. A ativação é protegida contra scripts e botões duplicados.
- O observador agrupa os elementos alterados; a filtragem usa índices de IDs, caminhos e nomes. Trabalho dividido em lotes de até 60 cartões.
- Dados da página identificam os canais primeiro. Consultas auxiliares ao YouTube ocorrem somente quando necessárias, com no máximo duas simultâneas, tempo limite e cache de sessão limitado. As consultas de metadados não enviam cookies da conta.
- Lista em `chrome.storage.local`: não sincroniza nem sai do navegador. Cache temporário em `chrome.storage.session`. Desinstalar apaga esses dados; exporte a lista para guardá-la.
- Para obter identidades e fotos, a extensão consulta páginas públicas dos canais no YouTube. As fotos de 88 pixels carregam sob demanda pelos servidores de imagens do YouTube/Google, sem enviar o endereço da página como referência. Não há rastreamento próprio.
- Permissões: armazenamento da extensão, execução do filtro nas abas existentes e acesso aos domínios do YouTube. Sem acesso geral ao histórico ou cookies.

## Desenvolvimento e verificação

Requer Node.js 22+ e Microsoft Edge instalado para os testes de navegador.

```sh
npm ci
npm run build
npm test
```

`npm run build` gera os ícones PNG, o leitor de metadados para o contexto MAIN e o ZIP. As dependências de desenvolvimento (`@playwright/test` e `sharp`) não são distribuídas na extensão.

Os testes cobrem identidades, normalização, alterações de nome/@, cartões antigos e atuais, Shorts v2 sem byline, conteúdo dinâmico, desbloqueio entre abas, barreiras de acesso direto, reprodução pausada, backup, importação, gravações concorrentes, ativação em abas antigas sem recarregar, prateleiras vazias de postagens, células de Shorts sem espaços reservados, fotos de canais existentes e ociosidade com 500 cartões adicionais. Os testes usam um perfil temporário do Edge e respostas determinísticas para os metadados.

Para conferir o site real em um perfil temporário e sem login:

```sh
node scripts/live-smoke.cjs
```

Esse teste bloqueia o MW Informática na pesquisa, verifica um link direto e um cartão da lateral de um vídeo. O perfil temporário é removido ao terminar. Capturas ficam em `artifacts/` e não entram no ZIP. O teste depende da disponibilidade e do formato atual do YouTube.

Estrutura: `extension/` é o produto instalável; `scripts/` contém a montagem e a verificação no site real; `tests/` contém a suíte de regressão. Após editar o código, rode o build e clique em **Recarregar** no cartão da extensão em `edge://extensions`. O filtro é ativado nas abas existentes; ao atualizar versões anteriores a 1.0.1, recarregar o YouTube uma vez também encerra os scripts da versão antiga que o navegador tiver mantido na página.
