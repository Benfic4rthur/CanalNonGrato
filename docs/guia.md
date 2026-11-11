# Guia do CanalNonGrato

[← Voltar à apresentação](../README.md)

## Bloquear um canal

- Nos vídeos e nas playlists, clique em **Bloquear**, junto ao nome do canal.
- No vídeo aberto, use **Bloquear canal**, ao lado de Inscrever-se.
- Nos cartões de Shorts, use o ícone de bloqueio.
- Pelo ícone da extensão, adicione um **@**, link de canal, ID, link de vídeo ou nome exato.

O canal entra na lista local e as abas abertas recebem a alteração automaticamente. A instalação e a atualização também tentam ativar o filtro nas abas já abertas. Recarregar o YouTube depois de instalar ou atualizar ajuda a encerrar scripts de versões anteriores.

## Identificar o canal com precisão

Prefira o botão no vídeo, um **@** ou um link. Quando possível, o canal fica salvo pelo ID imutável do YouTube e continua bloqueado se mudar de nome ou @. Os identificadores conhecidos são associados ao mesmo canal.

Nomes digitados sozinhos são comparados por nome exato, ignorando caixa, espaços extras e acentos. Canais diferentes com o mesmo nome também podem ser ocultados por essa regra. O bloqueio não procura trechos nos títulos dos vídeos.

## Gerenciar a lista

### Canais em que você é inscrito

O botão de bloqueio é ocultado nos canais em que você é inscrito, inclusive nas recomendações e nas playlists. Não é necessário abrir o vídeo ou a página de cada canal: a extensão lê a sua lista de inscrições no próprio YouTube, com a sessão que você já usa, e acompanha a paginação quando houver.

A lista fica em cache por até 30 minutos na sessão da aba, separada por conta. A consulta acontece ao carregar uma página sem cache válido; não há consulta individual por vídeo nem verificação contínua por temporizador. Mudanças de inscrição notificadas pelo YouTube também atualizam as outras abas abertas. Se o YouTube estiver indisponível, a extensão preserva os sinais de inscrição que conseguiu confirmar; uma falha de consulta não é interpretada como cancelamento de inscrição. Esses dados não são enviados ao ALLM4, ao GitHub ou a outro serviço.

Isso evita os botões junto ao autor e nos cartões do canal identificado como inscrito. O gerenciamento manual da lista de bloqueados continua disponível no painel; a mudança não apaga bloqueios que você já tenha criado.

### Buscar, desbloquear e abrir o painel

Abra o ícone do CanalNonGrato no navegador. A lista mostra o nome e a foto do canal; iniciais aparecem enquanto a imagem carrega ou quando não é possível obtê-la. Use a busca para encontrar um canal e **Desbloquear** para permitir que volte a aparecer.

**Abrir painel** leva à página maior de gerenciamento. O aviso de uma ação permite desfazer enquanto estiver visível.

## Exportar e importar

**Exportar** salva um backup JSON do CanalNonGrato. **Importar** acrescenta os canais do backup à lista atual, sem substituir os que já estavam nela e sem duplicar as mesmas regras.

O backup contém a sua lista de canais: guarde-o como um arquivo pessoal. Exporte antes de desinstalar a extensão, apagar o perfil ou trocar de navegador. A lista não é sincronizada com a conta do YouTube.

## Onde o filtro atua

| Área do YouTube | Comportamento |
| --- | --- |
| Página inicial e recomendações | Oculta cartões publicados pelos canais bloqueados. |
| Vídeos ao lado do player | Filtra as sugestões laterais. |
| Pesquisas | Oculta resultados de canais e vídeos identificados como bloqueados. |
| Shorts | Filtra cartões e trata links diretos do canal bloqueado. |
| Playlists e publicações | Oculta os itens identificados; prateleiras totalmente filtradas também somem. |
| Links diretos de canais e vídeos | Mostra uma barreira e pausa a reprodução. |
| Cartões de encerramento | Trata os cartões que fornecem um link de vídeo identificável. |

O bloqueio identifica **quem publicou o conteúdo**. Um vídeo de outro canal que mencione a mesma pessoa ou o mesmo assunto pode continuar aparecendo. Para filtrá-lo, bloqueie também o canal que o publicou.

## Atualizar

1. Baixe o ZIP da [última release estável](https://github.com/Benfic4rthur/CanalNonGrato/releases/latest).
2. Extraia e substitua os arquivos na pasta em que a extensão está instalada.
3. Abra `edge://extensions` ou `chrome://extensions` e clique em **Recarregar** no cartão do CanalNonGrato.
4. Recarregue as abas do YouTube.

Mantenha a pasta no mesmo lugar. Uma extensão carregada sem compactação não recebe atualizações automáticas pelas lojas.

## Limites e privacidade

O filtro atua na interface do YouTube **neste navegador**. Ele não altera a conta nem os servidores do YouTube, outros navegadores ou o aplicativo de celular.

O YouTube pode mudar seus formatos, e a extensão pode precisar de atualização. Se a identidade de um vídeo não puder ser obtida após uma falha de rede, ele poderá continuar visível.

A lista fica em `chrome.storage.local`. Metadados públicos do YouTube ajudam a identificar canais e associar nomes, IDs e @; essas consultas não enviam cookies da conta. Fotos podem ser carregadas dos servidores de imagens do YouTube/Google, sem enviar o endereço da página como referência. Não há servidor próprio nem rastreamento próprio.

O cache temporário usa `chrome.storage.session`. Desinstalar a extensão apaga os dados locais; exporte a lista para guardá-la.
