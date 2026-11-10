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
  const api = Object.freeze({ VIDEO_ID, CHANNEL_ID, clean, normalize, nameKey, avatarUrl, avatarFrom, channelPath, identity, hasIdentity, matches, matcher, merge, textOf, rendererIdentity, videoIdFromUrl, videoEntries, jsonAfter });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else globalThis.CNGCore = api;
})();
