/* Explicit block actions only. Use YouTube's authenticated native service; no
 * cookies or authentication tokens are read or copied by the extension. */
(() => {
  "use strict";
  const version = "__CNG_VERSION__";
  if (globalThis.__cngCleanupVersion === version) return;
  globalThis.__cngCleanupLifecycle?.abort();
  const lifecycle = globalThis.__cngCleanupLifecycle = new AbortController();
  globalThis.__cngCleanupVersion = version;
  if (window.top !== window) return;
  const C = globalThis.CNGCore, jobs = new Map();
  const rowData = row => row?.data || row?.polymerController?.data || row?.inst?.data;
  const source = () => {
    const cfg = window.ytcfg;
    if (cfg?.get("LOGGED_IN") === false) return "";
    const id = cfg?.get("DATASYNC_ID") || cfg?.get("DELEGATED_SESSION_ID");
    return id ? JSON.stringify([id, cfg.get("DELEGATED_SESSION_ID"), cfg.get("SESSION_INDEX")]) : "";
  };
  function check(job) {
    if (job.cancelled || lifecycle.signal.aborted || source() !== job.account) throw new Error("A operação foi interrompida porque o bloqueio ou a conta mudou.");
    if (document.getElementById("tubeorder-lock")) throw new Error("Aguarde o TubeOrder terminar de organizar a lista e tente bloquear novamente.");
  }
  const emit = detail => document.dispatchEvent(new CustomEvent("cng:cleanup-result", { detail: JSON.stringify(detail) }));
  async function native(job, endpoint, anchor) {
    check(job);
    anchor ||= document.querySelector("ytd-app");
    if (!anchor) throw new Error("O YouTube ainda não está pronto para atualizar a lista.");
    const detail = { actionName: "yt-service-request", optionalAction: false, args: [anchor, endpoint], returnValue: [] };
    anchor.dispatchEvent(new CustomEvent("yt-action", { bubbles: true, composed: true, detail }));
    const request = detail.returnValue.find(value => typeof value?.ajaxPromise?.then === "function");
    if (!request) throw new Error("O YouTube não disponibilizou o comando de atualização.");
    anchor.dispatchEvent(new CustomEvent("yt-service-request-sent", { bubbles: true, composed: true, detail: request }));
    let timer;
    try {
      const response = await Promise.race([request.ajaxPromise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("O YouTube demorou para confirmar. Confira a lista antes de tentar novamente.")), 20000); })]);
      check(job);
      const data = response?.data || response;
      if (!data || data.error) throw new Error("O YouTube recusou a atualização.");
      anchor.dispatchEvent(new CustomEvent("yt-service-request-completed", { bubbles: true, composed: true, detail: response }));
      return data;
    } finally { clearTimeout(timer); }
  }
  async function page(job, path) {
    check(job);
    const response = await fetch(path, { credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15000) });
    check(job);
    if (!response.ok || (response.url && new URL(response.url).origin !== location.origin)) throw new Error("Não consegui consultar sua lista no YouTube.");
    const html = await response.text();
    const data = C.jsonAfter(html, "var ytInitialData =") || C.jsonAfter(html, "ytInitialData =") || C.jsonAfter(html, 'window["ytInitialData"] =');
    if (!data || data.responseContext?.mainAppWebResponseContext?.loggedOut === true) throw new Error("Entre no YouTube para concluir a atualização.");
    return data;
  }
  function visibleRows() {
    const url = new URL(location.href);
    if (url.searchParams.get("list") !== "WL" || !["/watch", "/playlist"].includes(url.pathname)) return [];
    return [...document.querySelectorAll("ytd-playlist-panel-video-renderer,ytd-playlist-video-renderer")].filter(row => {
      const list = rowData(row.closest("ytd-playlist-panel-renderer,ytd-playlist-video-list-renderer"));
      return !row.closest("[hidden]") && (!list?.playlistId || list.playlistId === "WL");
    });
  }
  function endpointFor(row, setVideoId) {
    for (const item of rowData(row)?.menu?.menuRenderer?.items || []) {
      const endpoint = item.menuServiceItemRenderer?.serviceEndpoint, edit = endpoint?.playlistEditEndpoint;
      if (endpoint?.commandMetadata?.webCommandMetadata?.apiUrl !== "/youtubei/v1/browse/edit_playlist" || edit?.playlistId !== "WL" || edit.actions?.length !== 1 || edit.actions[0].action !== "ACTION_REMOVE_VIDEO" || edit.actions[0].setVideoId !== setVideoId) continue;
      if ((edit.clientActions || []).some(action => action.playlistRemoveVideosAction && (action.playlistRemoveVideosAction.setVideoIds?.length !== 1 || action.playlistRemoveVideosAction.setVideoIds[0] !== setVideoId))) continue;
      return JSON.parse(JSON.stringify(endpoint));
    }
    return { commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: "/youtubei/v1/browse/edit_playlist" } }, playlistEditEndpoint: { playlistId: "WL", actions: [{ action: "ACTION_REMOVE_VIDEO", setVideoId }] } };
  }
  async function removeEntry(job, entry) {
    check(job);
    if (job.removed.has(entry.setVideoId) || !C.matches(job.rule, entry.owner)) return;
    const row = visibleRows().find(row => {
      const data = rowData(row);
      return data?.videoId === entry.videoId && (data.playlistSetVideoId || data.setVideoId) === entry.setVideoId;
    });
    const result = await native(job, endpointFor(row, entry.setVideoId), row);
    if (result.status !== "STATUS_SUCCEEDED") throw new Error("O YouTube não confirmou a remoção do Assistir mais tarde.");
    job.removed.add(entry.setVideoId);
    // A playing item can be retained as a temporary playback entry by YouTube.
    // Only remove its visible row after the saved-list mutation was confirmed.
    for (const current of visibleRows()) {
      const data = rowData(current);
      if (data?.videoId === entry.videoId && (data.playlistSetVideoId || data.setVideoId) === entry.setVideoId) current.remove();
    }
  }
  async function removeWatchLater(job) {
    // The playing video's own row is handled before the full list fetch.
    const currentId = C.videoIdFromUrl(location.href);
    const rows = visibleRows().sort((a, b) => Number(rowData(b)?.videoId === currentId) - Number(rowData(a)?.videoId === currentId));
    for (const row of rows) {
      const data = rowData(row), setVideoId = data?.playlistSetVideoId || data?.setVideoId;
      if (C.VIDEO_ID.test(data?.videoId) && typeof setVideoId === "string" && setVideoId) await removeEntry(job, { videoId: data.videoId, setVideoId, owner: C.rendererIdentity(data) });
    }
    let next = C.watchLaterPage(await page(job, "/playlist?list=WL"));
    const visited = new Set(), deadline = Date.now() + 120000;
    for (let count = 0; count < 100; count++) {
      if (!next.recognized) throw new Error("Não consegui confirmar todos os itens do Assistir mais tarde.");
      for (const entry of next.entries) await removeEntry(job, entry);
      if (!next.continuations.length) return;
      if (next.continuations.length !== 1 || visited.has(next.continuations[0]) || Date.now() > deadline) break;
      const token = next.continuations[0]; visited.add(token);
      next = C.watchLaterPage(await native(job, { commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: "/youtubei/v1/browse" } }, continuationCommand: { token, request: "CONTINUATION_REQUEST_TYPE_BROWSE" } }));
    }
    throw new Error("A lista é grande demais para concluir de uma vez. Tente bloquear novamente para continuar.");
  }
  async function unsubscribe(job) {
    let owner = C.identity(job.rule);
    if (!owner.channelId && owner.path) {
      const data = await page(job, owner.path);
      owner = C.merge(owner, { channelId: data.metadata?.channelMetadataRenderer?.externalId });
    }
    if (!owner.channelId) throw new Error("Use o @ ou link do canal para confirmar também o cancelamento da inscrição.");
    const path = "/channel/" + owner.channelId;
    const data = await page(job, path);
    const states = C.subscriptionEntries(data).filter(([candidate]) => candidate.channelId === owner.channelId);
    if (states.some(([, subscribed]) => subscribed === false) && !states.some(([, subscribed]) => subscribed === true)) return;
    if (!states.some(([, subscribed]) => subscribed === true)) throw new Error("Não consegui confirmar se você é inscrito nesse canal.");
    let endpoint;
    const queue = [data];
    for (let i = 0; i < queue.length && i < 120000; i++) {
      const node = queue[i];
      if (!node || typeof node !== "object") continue;
      if (node.commandMetadata?.webCommandMetadata?.apiUrl === "/youtubei/v1/subscription/unsubscribe" && node.unsubscribeEndpoint?.channelIds?.length === 1 && node.unsubscribeEndpoint.channelIds[0] === owner.channelId) { endpoint = node; break; }
      for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
    if (!endpoint) throw new Error("O YouTube não disponibilizou o comando de cancelar a inscrição deste canal.");
    const result = await native(job, endpoint);
    let confirmed = C.subscriptionEntries(result).some(([candidate, subscribed]) => candidate.channelId === owner.channelId && subscribed === false);
    if (!confirmed) confirmed = C.subscriptionEntries(await page(job, path)).some(([candidate, subscribed]) => candidate.channelId === owner.channelId && subscribed === false);
    if (!confirmed) throw new Error("O YouTube não confirmou o cancelamento da inscrição.");
    job.unsubscribed = true;
    document.dispatchEvent(new CustomEvent("yt-subscribe-state-changed", { detail: { channelId: owner.channelId, subscribed: false } }));
  }
  document.addEventListener("cng:cancel-cleanup", event => { const job = jobs.get(event.detail); if (job) job.cancelled = true; }, { signal: lifecycle.signal });
  document.addEventListener("cng:cleanup", event => {
    if (typeof event.detail !== "string" || event.detail.length > 10000) return;
    let request;
    try { request = JSON.parse(event.detail); } catch { return; }
    if (!request || typeof request.requestId !== "string" || request.requestId.length > 100 || !C.hasIdentity(request.rule) || jobs.has(request.requestId)) return;
    const job = { ...request, account: source(), removed: new Set(), unsubscribed: false };
    if (!job.account) { emit({ requestId: request.requestId, removed: 0, errors: ["Entre no YouTube para remover os vídeos e cancelar a inscrição."] }); return; }
    jobs.set(job.requestId, job);
    (async () => {
      const errors = [];
      // A failure in one operation must not prevent the other from completing.
      for (const work of [removeWatchLater, unsubscribe]) {
        try { check(job); await work(job); } catch (error) { errors.push(error.message); }
      }
      emit({ requestId: job.requestId, removed: job.removed.size, unsubscribed: job.unsubscribed, errors });
    })().finally(() => jobs.delete(job.requestId));
  }, { signal: lifecycle.signal });
})();
