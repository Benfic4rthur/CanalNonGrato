const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../extension/core.js');
const id = 'UC' + 'a'.repeat(22), other = 'UC' + 'b'.repeat(22);

test('IDs imutáveis têm precedência sobre nomes e @ iguais', () => {
  assert.equal(C.matches({ channelId: id, name: 'MW Informática', path: '/@mw' }, { channelId: other, name: 'MW Informática', path: '/@mw' }), false);
  assert.equal(C.matches({ channelId: id, name: 'Antigo' }, { channelId: id, name: 'Novo', path: '/@novo' }), true);
});
test('normaliza nomes exatos, espaços e acentos sem bloquear por trecho', () => {
  assert.equal(C.matches({ name: 'MW Informática' }, { name: '  MW  informatica\u200b ' }), true);
  assert.equal(C.matches({ name: 'MW Informática' }, { name: 'MW Informática Extra' }), false);
  assert.equal(C.matches({ channelId: id, name: 'MW Informática' }, { name: 'MW Informática' }), true);
});
test('reconhece URLs canônicas, handles Unicode e rejeita outros hosts', () => {
  assert.deepEqual(C.identity(null), { channelId: '', path: '', handle: '', name: '' });
  assert.equal(C.channelPath('https://www.youtube.com/@Informa%C3%A7%C3%A3o/videos'), '/@Informação');
  assert.equal(C.channelPath('https://evil.example/@mw'), '');
  assert.equal(C.channelPath('https://youtube.com.evil.example/channel/' + id), '');
  assert.equal(C.identity({ path: '/channel/' + id }).channelId, id);
  assert.equal(C.videoIdFromUrl('https://www.youtube.com/shorts/mwVideo0001'), 'mwVideo0001');
  assert.equal(C.videoIdFromUrl('https://evil.example/watch?v=mwVideo0001'), '');
});
test('aliases preservam o bloqueio de handles conhecidos', () => {
  assert.equal(C.matches({ channelId: id, path: '/@novo', paths: ['/@antigo'] }, { path: '/@antigo' }), true);
  assert.equal(C.matches({ channelId: id, path: '/@mw', name: 'MW' }, { channelId: other, name: 'MW' }), false);
});
test('extrai proprietário de renderers clássicos e do lockup moderno', () => {
  const channel = { browseEndpoint: { browseId: id, canonicalBaseUrl: '/@mw' } };
  const data = { items: [
    { compactVideoRenderer: { videoId: 'mwVideo0001', shortBylineText: { runs: [{ text: 'MW Informática', navigationEndpoint: channel }] } } },
    { lockupViewModel: { contentId: 'mwModern001', metadata: { lockupMetadataViewModel: { metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: 'MW Informática', commandRuns: [{ onTap: { innertubeCommand: channel } }] } }] }] } } } } } }
  ] };
  const entries = new Map(C.videoEntries(data));
  assert.equal(entries.get('mwVideo0001').channelId, id);
  assert.equal(entries.get('mwModern001').channelId, id);
  assert.equal(entries.get('mwModern001').name, 'MW Informática');
});
test('leitura de JSON não executa JS e respeita chaves dentro de strings', () => {
  const data = { videoDetails: { channelId: id, author: 'Nome com } e " e \\' } };
  assert.deepEqual(C.jsonAfter('var ytInitialPlayerResponse = ' + JSON.stringify(data) + '; badCode()', 'var ytInitialPlayerResponse ='), data);
  assert.equal(C.jsonAfter('var ytInitialPlayerResponse = executeMe()', 'var ytInitialPlayerResponse ='), null);
});
test('Shorts sem byline usam ID único nos parâmetros e dispensam consulta de rede', () => {
  const params = Buffer.from('\x08\x14\xba\x01\x18' + id, 'latin1').toString('base64url');
  const data = { shortsLockupViewModel: { onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: 'shortMW0001', params } } } } };
  assert.equal(new Map(C.videoEntries(data)).get('shortMW0001').channelId, id);
  assert.equal(C.rendererIdentity({ onTap: { innertubeCommand: { reelWatchEndpoint: { params: 'invalid' } } } }).channelId, '');
});
test('índice de bloqueio mantém a semântica de IDs, nomes e aliases', () => {
  const rules = [{ channelId: id, path: '/@mw', paths: ['/@antigo'], name: 'MW Informática' }, { name: 'Manual' }];
  const find = C.matcher(rules);
  for (const candidate of [{ channelId: id, name: 'Novo' }, { channelId: other, path: '/@mw', name: 'MW Informática' }, { path: '/@antigo' }, { name: 'MW informatica' }, { path: '/@manual', name: 'Manual' }, { name: 'Livre' }]) {
    assert.equal(find(candidate), rules.find(rule => C.matches(rule, candidate)));
  }
});
test('fotos só usam hosts do YouTube, preservam o perfil e pedem miniatura pequena', () => {
  assert.equal(C.avatarUrl('https://yt3.ggpht.com/photo=s900-c-k'), 'https://yt3.ggpht.com/photo=s88-c-k');
  assert.equal(C.avatarUrl('https://untrusted.example/track'), '');
  assert.equal(C.avatarUrl('javascript:alert(1)'), '');
  assert.equal(C.avatarUrl('https://yt3.ggpht.com.evil.example/photo'), '');
  const owner = C.identity({ channelId: id, avatarUrl: 'https://yt3.ggpht.com/photo=s88-c-k' });
  assert.equal(C.merge(owner, { name: 'Novo nome' }).avatarUrl, owner.avatarUrl);
  assert.equal(C.avatarFrom([{ url: 'https://yt3.ggpht.com/photo=s900-c-k', width: 900 }]), owner.avatarUrl);
});

test('inscrições usam IDs explícitos e a seção de inscrições, nunca nomes ou recomendações', () => {
  const entries = C.subscriptionEntries({
    items: [
      { subscribeButtonRenderer: { channelId: id, subscribed: true } },
      { subscribeButtonViewModel: { channelId: other, subscribed: false } },
      { guideSubscriptionsSectionRenderer: { items: [{ guideEntryRenderer: { navigationEndpoint: { browseEndpoint: { browseId: id, canonicalBaseUrl: '/@mw' } } } }] } },
      { channelRenderer: { channelId: other, title: { simpleText: 'MW Informática' } } }
    ]
  });
  assert(entries.some(([owner, value]) => owner.channelId === id && value === true));
  assert(entries.some(([owner, value]) => owner.channelId === other && value === false));
  assert(!entries.some(([owner, value]) => owner.channelId === other && value === true));
  assert.deepEqual(C.subscriptionEntries({ subscribeButtonRenderer: { channelId: 'bad', subscribed: true } }), []);
});

test('lista de inscrições extrai IDs, handles e continuação somente do conteúdo do feed', () => {
  const renderer = { channelId: id, title: { simpleText: 'Meu canal' }, navigationEndpoint: { browseEndpoint: { browseId: id, canonicalBaseUrl: '/@meucanal' } } };
  const result = C.subscriptionPage({
    contents: { items: [{ channelRenderer: renderer }, { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'next-page' } } } }] },
    guide: { channelRenderer: { ...renderer, channelId: other } }
  });
  assert.equal(result.channels.length, 1);
  assert.equal(result.channels[0].path, '/@meucanal');
  assert.deepEqual(result.continuations, ['next-page']);
  const next = C.subscriptionPage({ onResponseReceivedActions: [{ appendContinuationItemsAction: { continuationItems: [{ channelRenderer: { ...renderer, channelId: other } }] } }] });
  assert.equal(next.channels[0].channelId, other);
});
