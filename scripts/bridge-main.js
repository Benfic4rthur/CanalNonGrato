/* Read only YouTube's own renderer metadata. Bundled with core.js for MAIN. */
(() => {
  "use strict";
  const version = "__CNG_VERSION__";
  if (globalThis.__cngBridgeInstalled === version) return;
  globalThis.__cngBridgeLifecycle?.abort();
  globalThis.__cngBridgeInstalled = version;
  const lifecycle = globalThis.__cngBridgeLifecycle = new AbortController();
  const listen = (name, handler) => document.addEventListener(name, handler, { signal: lifecycle.signal });
  const C = globalThis.CNGCore;
  const subscriptionChanges = new Map();
  let scheduled = false, account = null, generation = 0;
  const broadcast = window.top === window && typeof BroadcastChannel === "function" ? new BroadcastChannel("cng:subscription-changes:v1") : null;
  lifecycle.signal.addEventListener("abort", () => broadcast?.close(), { once: true });
  function emit(payload) {
    if (!lifecycle.signal.aborted) document.dispatchEvent(new CustomEvent("cng:metadata", { detail: JSON.stringify(payload) }));
  }
  function subscriptionBatch(channels) {
    for (let i = 0; i < channels.length; i += 400) emit({ subscriptions: channels.slice(i, i + 400).map(owner => [owner, subscriptionChanges.get(owner.channelId) ?? true]) });
  }
  function syncSubscriptions() {
    if (window.top !== window) return;
    const cfg = window.ytcfg;
    if (typeof cfg?.get !== "function") return;
    const loggedIn = cfg.get("LOGGED_IN");
    if (typeof loggedIn !== "boolean") return;
    if (loggedIn && !cfg.get("DATASYNC_ID") && !cfg.get("DELEGATED_SESSION_ID")) return;
    const scope = loggedIn ? JSON.stringify([cfg.get("DATASYNC_ID"), cfg.get("DELEGATED_SESSION_ID"), cfg.get("SESSION_INDEX")]) : "signed-out";
    if (scope === account) return;
    account = scope;
    const current = ++generation;
    subscriptionChanges.clear();
    emit({ resetSubscriptions: true });
    if (!loggedIn) return;
    // Session cache is per account and per tab, expires after 30 min, and never
    // leaves YouTube. One list read replaces hundreds of per-channel requests.
    const cacheKey = "cng:subscriptions:v1";
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey));
      if (cached?.scope === scope && Date.now() - cached.at < 1800000 && Array.isArray(cached.channels) && cached.channels.length <= 10000) {
        subscriptionBatch(cached.channels.map(C.identity).filter(owner => owner.channelId));
        return;
      }
    } catch { /* Storage can be disabled; synchronization still works. */ }
    (async () => {
      const response = await fetch("/feed/channels", { credentials: "include", signal: AbortSignal.timeout(15000) });
      if (!response.ok || (response.url && new URL(response.url).pathname !== "/feed/channels")) throw new Error("Subscription list unavailable");
      const html = await response.text();
      const data = C.jsonAfter(html, "var ytInitialData =") || C.jsonAfter(html, "ytInitialData =") || C.jsonAfter(html, 'window["ytInitialData"] =');
      if (!data?.contents || data.responseContext?.mainAppWebResponseContext?.loggedOut === true) throw new Error("Subscription list not recognized");
      const channels = new Map(), visited = new Set();
      let pending = [C.subscriptionPage(data)], pages = 0;
      const deadline = Date.now() + 60000;
      const context = cfg.get("INNERTUBE_CONTEXT");
      while (pending.length && channels.size < 10000 && pages++ < 50) {
        if (current !== generation || lifecycle.signal.aborted || Date.now() > deadline) return;
        const page = pending.shift();
        for (const owner of page.channels) channels.set(owner.channelId, owner);
        subscriptionBatch(page.channels);
        for (const token of page.continuations) {
          if (visited.has(token)) throw new Error("Repeated subscription continuation");
          visited.add(token);
          if (!context?.client) throw new Error("Missing continuation context");
          const next = await fetch("/youtubei/v1/browse", {
            method: "POST", credentials: "include", signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json", "X-Youtube-Client-Name": "1", "X-Youtube-Client-Version": context.client.clientVersion, "X-Goog-AuthUser": String(cfg.get("SESSION_INDEX") || "0") },
            body: JSON.stringify({ context, continuation: token })
          });
          if (!next.ok) throw new Error("Subscription continuation unavailable");
          const nextData = await next.json();
          if (!nextData.onResponseReceivedActions && !nextData.onResponseReceivedEndpoints && !nextData.continuationContents) throw new Error("Invalid subscription continuation");
          pending.push(C.subscriptionPage(nextData));
        }
      }
      if (pending.length || current !== generation || lifecycle.signal.aborted) return;
      const confirmed = [...channels.values()].filter(owner => subscriptionChanges.get(owner.channelId) !== false);
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ scope, at: Date.now(), channels: confirmed })); } catch {}
    })().catch(() => { /* Keep known positive states, never turn a failed read into an unsubscribe. */ });
  }
  function publish(data) {
    const videos = C.videoEntries(data);
    const subscriptions = C.subscriptionEntries(data).filter(([owner, subscribed]) => !subscriptionChanges.has(owner.channelId) || subscriptionChanges.get(owner.channelId) === subscribed);
    const metadata = data?.metadata?.channelMetadataRenderer;
    const channel = metadata ? C.identity({ channelId: metadata.externalId, path: metadata.vanityChannelUrl || metadata.channelUrl, name: metadata.title }) : null;
    if (videos.length || channel || subscriptions.length) emit({ videos, channel, subscriptions });
  }
  function collect(event) {
    syncSubscriptions();
    if (event?.detail?.response) publish(event.detail.response);
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      if (lifecycle.signal.aborted) return;
      scheduled = false;
      for (const data of [window.ytInitialData, window.ytInitialPlayerResponse, document.querySelector("ytd-app")?.data, document.querySelector("ytd-watch-flexy")?.playerData, document.querySelector("ytd-guide-renderer")?.data]) {
        if (data) publish(data);
      }
      for (const section of document.querySelectorAll("ytd-guide-section-renderer,ytd-guide-subscriptions-section-renderer")) {
        if (section.data) publish(section.matches("ytd-guide-subscriptions-section-renderer") ? { guideSubscriptionsSectionRenderer: section.data } : { guideSectionRenderer: section.data });
      }
    }, 40);
  }
  listen("cng:inspect", event => {
    const token = event.detail;
    if (typeof token !== "string" || !/^cng-\d+$/.test(token)) return;
    const node = document.querySelector(`[data-cng-probe="${token}"]`);
    if (!node) return;
    for (const el of [node, ...node.querySelectorAll("yt-lockup-view-model,ytd-rich-grid-media,ytd-video-renderer,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,yt-shorts-lockup-view-model,ytd-subscribe-button-renderer")]) {
      if (el.data) publish(el.data);
    }
  });
  listen("yt-subscribe-state-changed", event => {
    const { channelId, subscribed } = event.detail || {};
    if (C.CHANNEL_ID.test(channelId) && typeof subscribed === "boolean") {
      subscriptionChanges.set(channelId, subscribed);
      try { sessionStorage.removeItem("cng:subscriptions:v1"); } catch {}
      publish({ channelId, subscribed });
      if (account && account !== "signed-out") broadcast?.postMessage({ account, channelId, subscribed });
    }
  });
  if (broadcast) broadcast.onmessage = event => {
    const update = event.data;
    if (update?.account !== account || !C.CHANNEL_ID.test(update.channelId) || typeof update.subscribed !== "boolean") return;
    subscriptionChanges.set(update.channelId, update.subscribed);
    try { sessionStorage.removeItem("cng:subscriptions:v1"); } catch {}
    publish({ channelId: update.channelId, subscribed: update.subscribed });
  };
  for (const name of ["yt-page-data-updated", "yt-navigate-finish", "yt-player-updated", "DOMContentLoaded", "cng:ready"]) listen(name, collect);
})();
