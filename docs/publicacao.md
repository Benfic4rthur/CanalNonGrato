# Publicar uma atualização

[← Voltar à apresentação](../README.md)

Os pacotes são distribuídos pelas [Releases deste repositório](https://github.com/Benfic4rthur/CanalNonGrato/releases). A página oficial fica em [allm4.com/canalnongrato](https://allm4.com/canalnongrato/).

## Preparar o pacote

1. Atualize a versão em `extension/manifest.json`, `package.json` e `package-lock.json` e a identificação em `extension/LEIA-ME.txt`.
2. Rode `npm ci`, `npm run build` e `npm test`.
3. Confira `dist/CanalNonGrato-VERSÃO.zip` e envie o código correspondente ao GitHub.
4. Em **Releases → Draft a new release**, escolha a tag da versão, anexe o ZIP, marque como **Latest** e publique como release estável, com a opção de pré-release desmarcada.

O `manifest.json` deve estar na raiz do ZIP. Os arquivos automáticos **Source code** do GitHub não são o pacote de instalação. A regra de `.gitignore` mantém apenas o ZIP atual no controle de versão; revise-a ao trocar de versão se também quiser manter esse arquivo em `dist/` no repositório.

Exemplo pelo GitHub CLI, **depois de preparar e enviar a versão 1.0.4**:

```sh
gh release create v1.0.4 dist/CanalNonGrato-1.0.4.zip --repo Benfic4rthur/CanalNonGrato --target main --latest --title "CanalNonGrato 1.0.4" --generate-notes
```

## Downloads do site

O site do ALLM4 consulta a **última release estável** deste repositório. Versão, tamanho e ZIP devem pertencer à mesma release. O nome esperado é `CanalNonGrato-VERSÃO.zip`; o nome estável `CanalNonGrato.zip` também é aceito.

Uma release completa atualiza os downloads sem republicar o site. **Somente enviar commits ou criar uma tag não publica um pacote:** a release precisa estar publicada com o ZIP anexado.

A consulta ocorre ao abrir a página, ao voltar à aba e a cada cinco minutos enquanto ela estiver visível. Se a consulta falhar ou o pacote estiver incompleto, o site encaminha para a página da última release, sem oferecer um ZIP antigo.

## Atualizar no navegador

A instalação continua sendo manual, fora das lojas do Chrome e do Edge. Para atualizar, extraia a nova versão na pasta instalada, substitua os arquivos e clique em **Recarregar** no cartão da extensão em `edge://extensions` ou `chrome://extensions`. Recarregue também as abas do YouTube.

Os dados ficam no perfil do navegador. Recomende exportar um backup antes de desinstalar ou trocar de perfil.
