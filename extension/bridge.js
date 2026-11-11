/* Shared, dependency-free identity rules. Runs in the worker and both script worlds. */
(() => {
  "use strict";
  const VIDEO_ID = /^[\w-]{11}$/;
  const CHANNEL_ID = /^UC[\w-]{22}$/;
  const clean = (value) => typeof value === "string" ? value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim().slice(0, 200) : "";
  const normalize = (value) => clean(value).normalize("NFKC").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
  const nameKey = (value) => normalize(value).normalize("NFD").replace(/\p{Diacritic}/gu, "");
  function avatarUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["yt3.ggpht.com", "yt3.googleusercontent.com", "lh3.googleusercontent.com"].includes(url.hostname) && url.href.length < 2048 ? url.href.replace(/=s\d+(?=-|$)/, "=s88") : "";
    } catch { return ""; }
  }
  function avatarFrom(thumbnails) {
    return (Array.isArray(thumbnails) ? [...thumbnails].sort((a, b) => (a.width || 0) - (b.width || 0)) : []).map(item => ({ ...item, url: avatarUrl(item.url) })).find(item => item.url && (item.width || 88) >= 88)?.url || "";
  }
  function channelPath(value) {
    try {
      const url = new URL(value, "https://www.youtube.com");
      if (!["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) return "";
      const path = decodeURIComponent(url.pathname).replace(/\/+$/, "");
      return /^(\/@[^/]+|\/channel\/UC[\w-]{22}|\/(c|user)\/[^/]+)(\/.*)?$/i.exec(path)?.[1] || "";
    } catch { return ""; }
  }
  function identity(value = {}) {
    if (!value || typeof value !== "object") value = {};
    const path = channelPath(value.path || value.url || (value.handle ? "/" + value.handle.replace(/^\/?@?/, "@") : ""));
    const channelId = CHANNEL_ID.test(value.channelId) ? value.channelId : (/^\/channel\/(UC[\w-]{22})$/.exec(path)?.[1] || "");
    const photo = avatarUrl(value.avatarUrl);
    return { channelId, path, handle: path.startsWith("/@") ? path.slice(1) : "", name: clean(value.name), ...(photo ? { avatarUrl: photo } : {}) };
  }
  const hasIdentity = (value) => Boolean(value && (value.channelId || value.path || value.name));
  function matches(rule, candidate) {
    const a = identity(rule), b = identity(candidate);
    // Different immutable IDs must never match just because the display names match.
    if (a.channelId && b.channelId) return a.channelId === b.channelId;
    const paths = [a.path, ...(rule.paths || [])].filter(Boolean).map(normalize);
    if (b.path && paths.includes(normalize(b.path))) return true;
    const names = [a.name, ...(rule.names || [])].filter(Boolean).map(nameKey);
    const ruleIsName = !a.channelId && !a.path;
    const candidateIsName = !b.channelId && !b.path;
    return (ruleIsName || candidateIsName) && Boolean(b.name) && names.includes(nameKey(b.name));
  }
  function merge(a, b) {
    const first = identity(a), second = identity(b);
    return identity({ channelId: second.channelId || first.channelId, path: second.path || first.path, name: second.name || first.name, avatarUrl: second.avatarUrl || first.avatarUrl });
  }
  function matcher(rules) {
    const ids = new Map(), paths = new Map(), names = new Map(), manualNames = new Map();
    const add = (index, key, rule) => {
      if (!key) return;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(rule);
    };
    for (const rule of rules) {
      const owner = identity(rule);
      add(ids, owner.channelId, rule);
      for (const path of [owner.path, ...(rule.paths || [])]) add(paths, normalize(path), rule);
      for (const name of [owner.name, ...(rule.names || [])]) {
        add(names, nameKey(name), rule);
        if (!owner.channelId && !owner.path) add(manualNames, nameKey(name), rule);
      }
    }
    return raw => {
      const owner = identity(raw);
      const possible = [
        ...(ids.get(owner.channelId) || []), ...(paths.get(normalize(owner.path)) || []),
        ...((owner.channelId || owner.path ? manualNames : names).get(nameKey(owner.name)) || [])
      ];
      return possible.find(rule => matches(rule, owner));
    };
  }
  function textOf(value) {
    if (typeof value === "string") return clean(value);
    if (!value) return "";
    return clean(value.simpleText || value.content || (typeof value.text === "string" ? value.text : "") || value.runs?.map(r => r.text || "").join(""));
  }
  function channelFromText(value) {
    if (!value || typeof value !== "object") return identity({ name: textOf(value) });
    const name = textOf(value);
    const queue = [value];
    for (let i = 0; i < queue.length && i < 120; i++) {
      const node = queue[i];
      if (!node || typeof node !== "object") continue;
      const endpoint = node.browseEndpoint;
      if (endpoint && (CHANNEL_ID.test(endpoint.browseId) || channelPath(endpoint.canonicalBaseUrl))) {
        return identity({ channelId: endpoint.browseId, path: endpoint.canonicalBaseUrl, name });
      }
      for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
    return identity({ name });
  }
  function rendererIdentity(node) {
    if (!node || typeof node !== "object") return identity();
    // Search Shorts can omit the byline but carry the owner in their reel endpoint.
    // Accept only a unique canonical channel ID from length-delimited protobuf strings.
    const reel = node.onTap?.innertubeCommand?.reelWatchEndpoint || node.navigationEndpoint?.reelWatchEndpoint;
    if (reel?.params && typeof reel.params === "string" && reel.params.length < 16000) {
      try {
        const binary = atob(decodeURIComponent(reel.params).replace(/-/g, "+").replace(/_/g, "/"));
        const ids = [...new Set([...binary.matchAll(/\x18(UC[\w-]{22})/g)].map(match => match[1]))];
        if (ids.length === 1) return identity({ channelId: ids[0] });
      } catch { /* Other Shorts formats use the normal metadata/fetch fallback. */ }
    }
    if (CHANNEL_ID.test(node.channelId) && (node.author || node.ownerChannelName)) {
      return identity({ channelId: node.channelId, name: node.author || node.ownerChannelName, path: node.ownerProfileUrl });
    }
    for (const key of ["shortBylineText", "ownerText", "longBylineText", "channelName", "authorText"]) {
      const found = channelFromText(node[key]);
      if (hasIdentity(found)) return found;
    }
    const metadata = node.metadata?.lockupMetadataViewModel || node.lockupMetadataViewModel;
    const rows = metadata?.metadata?.contentMetadataViewModel?.metadataRows || [];
    for (const part of rows[0]?.metadataParts || []) {
      const found = channelFromText(part.text);
      if (found.channelId || found.path) return found;
    }
    return identity();
  }
  function videoIdFromUrl(value) {
    try {
      const url = new URL(value, "https://www.youtube.com");
      if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) return "";
      const id = url.searchParams.get("v") || /^\/(?:shorts|embed|live)\/([\w-]{11})/.exec(url.pathname)?.[1] || (url.hostname === "youtu.be" ? url.pathname.slice(1) : "");
      return VIDEO_ID.test(id) ? id : "";
    } catch { return ""; }
  }
  function videoEntries(data) {
    const queue = [data], seen = new WeakSet(), result = new Map();
    for (let i = 0; i < queue.length && i < 60000; i++) {
      const node = queue[i];
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      const endpointId = node.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
      const id = VIDEO_ID.test(node.videoId) ? node.videoId : VIDEO_ID.test(node.contentId) ? node.contentId : VIDEO_ID.test(endpointId) ? endpointId : "";
      if (id) {
        const owner = rendererIdentity(node);
        if (hasIdentity(owner)) result.set(id, merge(result.get(id), owner));
      }
      for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
    return [...result];
  }
  // Subscription state is read from YouTube's own data, never inferred from a name.
  function subscriptionEntries(data) {
    const queue = [data], seen = new WeakSet(), result = [];
    for (let i = 0; i < queue.length && i < 60000; i++) {
      const node = queue[i];
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      const button = node.subscribeButtonRenderer || node.subscribeButtonViewModel || node.subscriptionButtonViewModel;
      if (button && typeof button.subscribed === "boolean") {
        const owner = identity({ channelId: button.channelId });
        if (owner.channelId) result.push([owner, button.subscribed]);
      }
      if (typeof node.subscribed === "boolean" && CHANNEL_ID.test(node.channelId)) result.push([identity(node), node.subscribed]);
      const section = node.guideSubscriptionsSectionRenderer || (node.guideSectionRenderer && /^(inscricoes|subscriptions)$/.test(nameKey(textOf(node.guideSectionRenderer.title))) ? node.guideSectionRenderer : null);
      if (section) {
        const entries = [section];
        for (let j = 0; j < entries.length && j < 10000; j++) {
          const entry = entries[j];
          if (!entry || typeof entry !== "object") continue;
          if (entry.guideEntryRenderer) {
            const owner = channelFromText(entry.guideEntryRenderer);
            if (owner.channelId || owner.path) result.push([owner, true]);
          }
          for (const child of Object.values(entry)) if (child && typeof child === "object") entries.push(child);
        }
      }
      for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
    return result;
  }
  // Only call for /feed/channels responses. The guide can contain just a small
  // subset of subscriptions; channel cards in this feed are the actual list.
  function subscriptionPage(data) {
    const queue = [data?.contents, data?.continuationContents, data?.onResponseReceivedActions, data?.onResponseReceivedEndpoints];
    const seen = new WeakSet(), channels = new Map(), continuations = new Set();
    for (let i = 0; i < queue.length && i < 120000; i++) {
      const node = queue[i];
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      const renderer = node.channelRenderer || node.gridChannelRenderer;
      if (renderer) {
        const endpoint = channelFromText(renderer.navigationEndpoint);
        const owner = identity({ channelId: renderer.channelId || endpoint.channelId, path: endpoint.path, name: textOf(renderer.title) });
        if (owner.channelId) channels.set(owner.channelId, owner);
        // Subscription menus have unrelated endpoints; do not traverse them.
        continue;
      }
      const continuation = node.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || node.nextContinuationData?.continuation;
      if (typeof continuation === "string" && continuation.length < 20000) continuations.add(continuation);
      for (const child of Object.values(node)) if (child && typeof child === "object") queue.push(child);
    }
    return { channels: [...channels.values()], continuations: [...continuations] };
  }
  // Extract a balanced JSON object, without evaluating any page JavaScript.
  function jsonAfter(source, marker) {
    const index = source.indexOf(marker);
    if (index === -1) return null;
    const start = source.indexOf("{", index + marker.length);
    if (start === -1 || start > index + marker.length + 30) return null;
    let depth = 0, quoted = false, escaped = false;
    for (let i = start; i < source.length; i++) {
      const char = source[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        try { return JSON.parse(source.slice(start, i + 1)); } catch { return null; }
      }
    }
    return null;
  }
  const api = Object.freeze({ VIDEO_ID, CHANNEL_ID, clean, normalize, nameKey, avatarUrl, avatarFrom, channelPath, identity, hasIdentity, matches, matcher, merge, textOf, rendererIdentity, videoIdFromUrl, videoEntries, subscriptionEntries, subscriptionPage, jsonAfter });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.CNGCore = api;
})();

/* Read only YouTube's own renderer metadata. Bundled with core.js for MAIN. */
(() => {
  "use strict";
  const version = "1.0.5";
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
