"use strict";
importScripts("core.js");
const C = CNGCore;
const KEY = "blockedChannels";
let writeQueue = Promise.resolve();
const lookups = new Map();
let activeLookups = 0;
const waiters = [];
let avatarRefresh = null;

// YouTube can keep an existing document alive across many SPA navigations. Static
// document_start scripts alone never activate in tabs opened before installation.
async function attachExistingTabs() {
  const tabs = await chrome.tabs.query({ url: ["https://www.youtube.com/*", "https://youtube.com/*", "https://m.youtube.com/*"] });
  await Promise.allSettled(tabs.filter(tab => !tab.discarded).map(async tab => {
    const target = { tabId: tab.id };
    await chrome.scripting.insertCSS({ target, files: ["content.css"] });
    await chrome.scripting.executeScript({ target, files: ["bridge.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target, files: ["core.js", "content.js"], world: "ISOLATED" });
  }));
}
chrome.runtime.onInstalled.addListener(() => { attachExistingTabs().then(refreshAvatars).catch(console.warn); });
chrome.runtime.onStartup.addListener(() => { attachExistingTabs().catch(console.warn); });

async function fetchPage(path) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Endereço inválido.");
  const response = await fetch("https://www.youtube.com" + path, { credentials: "omit", signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("O YouTube não respondeu. Tente novamente.");
  return response.text();
}
async function limited(work) {
  if (activeLookups >= 2) await new Promise(resolve => waiters.push(resolve));
  activeLookups++;
  try { return await work(); }
  finally { activeLookups--; waiters.shift()?.(); }
}
async function resolveVideo(videoId) {
  if (!C.VIDEO_ID.test(videoId)) throw new Error("Vídeo inválido.");
  if (lookups.has(videoId)) return lookups.get(videoId);
  const job = limited(async () => {
    const key = "video:" + videoId;
    const cached = (await chrome.storage.session.get(key))[key];
    if (cached && Date.now() - cached.at < 86400000) return cached.owner;
    const html = await fetchPage("/watch?v=" + videoId);
    const player = C.jsonAfter(html, "var ytInitialPlayerResponse =") || C.jsonAfter(html, "ytInitialPlayerResponse =");
    const owner = C.rendererIdentity(player?.videoDetails);
    if (!owner.channelId) throw new Error("Não foi possível identificar o canal deste vídeo.");
    const profile = /"ownerProfileUrl"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(html)?.[1];
    if (profile) { try { Object.assign(owner, C.merge(owner, { path: JSON.parse(profile) })); } catch {} }
    const entries = await chrome.storage.session.get(null);
    const videoKeys = Object.keys(entries).filter(k => k.startsWith("video:"));
    if (videoKeys.length >= 1500) await chrome.storage.session.remove(videoKeys.sort((a, b) => entries[a].at - entries[b].at).slice(0, 300));
    await chrome.storage.session.set({ [key]: { owner, at: Date.now() } });
    return owner;
  });
  lookups.set(videoId, job);
  // Bound the in-memory cache too. Session storage survives worker suspension.
  if (lookups.size > 500) lookups.delete(lookups.keys().next().value);
  try { return await job; }
  catch (error) { lookups.delete(videoId); throw error; }
}
async function resolveChannel(input) {
  const raw = C.clean(input);
  let owner;
  if (C.CHANNEL_ID.test(raw)) owner = C.identity({ channelId: raw, path: "/channel/" + raw });
  else if (raw.startsWith("@")) owner = C.identity({ handle: raw });
  else if (/^(https?:\/\/|(?:www\.)?youtube\.com\/|\/)/i.test(raw)) {
    const url = /^(?:www\.)?youtube\.com\//.test(raw) ? "https://" + raw : raw;
    const videoId = C.videoIdFromUrl(url);
    if (videoId) return resolveVideo(videoId);
    owner = C.identity({ path: C.channelPath(url) });
    if (!owner.path) throw new Error("Cole um link de canal ou vídeo do YouTube.");
  } else return C.identity({ name: raw });
  const html = await limited(() => fetchPage(owner.path || "/channel/" + owner.channelId));
  const channelId = /<meta\b[^>]*itemprop="(?:channelId|identifier)"[^>]*content="(UC[\w-]{22})"/.exec(html)?.[1]
    || /"externalId"\s*:\s*"(UC[\w-]{22})"/.exec(html)?.[1]
    || /"channelId"\s*:\s*"(UC[\w-]{22})"/.exec(html)?.[1];
  const data = C.jsonAfter(html, "var ytInitialData =") || C.jsonAfter(html, "ytInitialData =");
  const metadata = data?.metadata?.channelMetadataRenderer;
  const resolved = C.merge(owner, { channelId: metadata?.externalId || channelId, path: metadata?.vanityChannelUrl || metadata?.channelUrl || owner.path, name: metadata?.title, avatarUrl: C.avatarFrom(metadata?.avatar?.thumbnails) });
  if (!resolved.channelId) throw new Error("Canal não encontrado. Confira o @ ou o link.");
  return resolved;
}
async function readRules() { return (await chrome.storage.local.get(KEY))[KEY] || []; }
function refreshAvatars() {
  if (avatarRefresh) return avatarRefresh;
  avatarRefresh = (async () => {
    const rules = await readRules();
    await Promise.allSettled(rules.filter(rule => !C.avatarUrl(rule.avatarUrl) && (rule.channelId || rule.path)).map(async rule => {
      const key = "avatar-attempt:" + rule.id;
      if (Date.now() - ((await chrome.storage.session.get(key))[key] || 0) < 86400000) return;
      await chrome.storage.session.set({ [key]: Date.now() });
      const owner = await resolveChannel(rule.channelId ? "/channel/" + rule.channelId : rule.path);
      if (!owner.avatarUrl) return;
      // Read the latest list inside the write queue so an avatar never restores an unblocked rule.
      const job = writeQueue.then(async () => {
        const current = await readRules();
        if (!current.some(item => item.id === rule.id && !item.avatarUrl)) return;
        await chrome.storage.local.set({ [KEY]: current.map(item => item.id === rule.id ? { ...item, avatarUrl: owner.avatarUrl } : item) });
      });
      writeQueue = job.catch(() => {});
      await job;
    }));
  })().finally(() => { avatarRefresh = null; });
  return avatarRefresh;
}
async function addRule(raw) {
  let owner = C.identity(raw);
  if (!C.hasIdentity(owner)) throw new Error("Informe um canal.");
  if (!owner.channelId && owner.path) {
    try { owner = C.merge(owner, await resolveChannel(owner.path)); } catch { /* A known handle still works offline. */ }
  }
  const rules = await readRules();
  const existing = rules.find(rule => C.matches(rule, owner));
  const rule = {
    ...C.merge(existing, owner), id: existing?.id || crypto.randomUUID(), addedAt: existing?.addedAt || Date.now(),
    names: [...new Set([...(existing?.names || []), existing?.name, owner.name].filter(Boolean))],
    paths: [...new Set([...(existing?.paths || []), existing?.path, owner.path].filter(Boolean))]
  };
  await chrome.storage.local.set({ [KEY]: [...rules.filter(r => r.id !== rule.id), rule] });
  if (!rule.avatarUrl && (rule.channelId || rule.path)) refreshAvatars().catch(console.warn);
  return rule;
}
async function handle(message) {
  switch (message.type) {
    case "refreshAvatars": await refreshAvatars(); return true;
    case "resolveVideo": return resolveVideo(message.videoId);
    case "resolveChannel": return resolveChannel(message.input);
    case "block": return addRule(message.channel);
    case "unblock": {
      const rules = await readRules();
      await chrome.storage.local.set({ [KEY]: rules.filter(rule => rule.id !== message.id) });
      return true;
    }
    case "import": {
      const incoming = message.channels;
      if (!Array.isArray(incoming) || incoming.length > 10000) throw new Error("Arquivo inválido ou grande demais (máximo de 10 mil canais).");
      const rules = await readRules();
      let count = 0;
      for (const item of incoming) {
        const owner = C.identity(item);
        if (!C.hasIdentity(owner)) throw new Error("O arquivo contém um canal inválido.");
        const existing = rules.find(r => C.matches(r, owner));
        if (existing) continue;
        rules.push({ ...owner, id: crypto.randomUUID(), addedAt: Date.now(), names: [...new Set([owner.name, ...(Array.isArray(item.names) ? item.names.slice(0, 50).map(C.clean) : [])].filter(Boolean))], paths: [...new Set([owner.path, ...(Array.isArray(item.paths) ? item.paths.slice(0, 50).map(C.channelPath) : [])].filter(Boolean))] });
        count++;
      }
      await chrome.storage.local.set({ [KEY]: rules });
      return count;
    }
    case "openOptions": await chrome.runtime.openOptionsPage(); return true;
    default: throw new Error("Ação inválida.");
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== "string") return;
  const mutation = ["block", "unblock", "import"].includes(message.type);
  // Serialize read/modify/write operations across tabs, without blocking metadata lookups.
  const job = mutation ? writeQueue.then(() => handle(message)) : handle(message);
  if (mutation) writeQueue = job.catch(() => {});
  job.then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error.message || "Não foi possível concluir." }));
  return true;
});
