(() => {
  "use strict";
  // Static document_start injection and install-time injection may reach the same page.
  const version = chrome.runtime.getManifest().version;
  if (globalThis.__cngContentVersion === version) return;
  document.dispatchEvent(new Event("cng:dispose-content"));
  globalThis.__cngContentVersion = version;
  const lifecycle = new AbortController();
  let disposed = false;
  const C = CNGCore;
  const CARDS = [
    "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-grid-video-renderer", "ytd-compact-video-renderer",
    "yt-lockup-view-model", "ytd-playlist-video-renderer", "ytd-playlist-panel-video-renderer",
    "ytd-reel-item-renderer", "yt-shorts-lockup-view-model", "ytm-shorts-lockup-view-model", "ytm-shorts-lockup-view-model-v2",
    "ytd-reel-video-renderer", "ytd-channel-renderer", "ytd-grid-channel-renderer",
    "ytd-backstage-post-thread-renderer", "ytd-backstage-post-renderer", "ytd-post-renderer", "ytm-video-with-context-renderer",
    "ytm-compact-video-renderer", ".ytp-ce-video", ".ytp-videowall-still"
  ].join(",");
  const SHELVES = "ytd-shelf-renderer,ytd-reel-shelf-renderer,ytd-rich-shelf-renderer,grid-shelf-view-model,yt-grid-shelf-view-model";
  const SHORT_CELL = ".ytGridShelfViewModelGridShelfItem,.yt-grid-shelf-view-model__grid-shelf-item";
  const PAGE_OWNERS = "ytd-video-owner-renderer,ytd-watch-metadata #owner,ytd-reel-video-renderer[is-active] #channel-info";
  const BYLINE_ACTIONS = "#byline-container,yt-content-metadata-view-model .ytContentMetadataViewModelMetadataRow:first-child,yt-content-metadata-view-model .yt-content-metadata-view-model__metadata-row:first-child,.ytContentMetadataViewModelMetadataRow:first-child,.yt-content-metadata-view-model__metadata-row:first-child,ytd-channel-name";
  const OWNER = [
    "ytd-channel-name a", "#channel-name a", "#byline a", "#byline-container a",
    "a.yt-simple-endpoint[href^='/@']", "a[href^='/channel/']", "a[href^='/user/']", "a[href^='/c/']",
    ".yt-content-metadata-view-model__metadata-row:first-child a", ".ytContentMetadataViewModelMetadataRow:first-child a",
    "a[href^='https://www.youtube.com/@']"
  ].join(",");
  const OWNER_NAME = "ytd-channel-name #text,#channel-name #text,#byline,.yt-content-metadata-view-model__metadata-row:first-child > span:first-child,.ytContentMetadataViewModelMetadataRow:first-child > span:first-child";
  const BLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"/><path d="m6 18 12-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  let rules = [], ready = false, scheduled = false, sequence = 0, toastTimer, gateRule = null, pageGeneration = 0;
  let findBlocked = C.matcher([]);
  let channelPage = null, pageVerifying = false;
  let pending = new Set();
  const dirtyShelves = new Set();
  const videos = new Map(), requests = new Map(), failed = new Map(), waiting = new Map();
  const observed = new WeakSet();
  const buttons = new WeakMap();
  const inspected = new WeakMap(), subscriptions = new Map(), subscriptionAliases = new Map();
  let subscriptionScan = false;
  let io;

  function subscriptionKeys(owner) {
    return [owner.channelId && "id:" + owner.channelId, owner.path && "path:" + C.normalize(owner.path)].filter(Boolean);
  }
  function learnSubscription(owner, subscribed) {
    let changed = false;
    const keys = subscriptionKeys(owner), id = owner.channelId && "id:" + owner.channelId;
    if (id) {
      if (!subscriptionAliases.has(id)) subscriptionAliases.set(id, new Set());
      for (const key of keys) subscriptionAliases.get(id).add(key);
      keys.push(...subscriptionAliases.get(id));
    }
    for (const key of keys) {
      if (subscriptions.get(key) !== subscribed) { subscriptions.set(key, subscribed); changed = true; }
    }
    if (changed && !subscriptionScan) {
      subscriptionScan = true;
      queueMicrotask(() => { subscriptionScan = false; if (!disposed && ready) scan(); });
    }
  }
  function subscriptionState(root) {
    const controls = root.querySelectorAll("ytd-subscribe-button-renderer,yt-subscribe-button-view-model,yt-subscription-notification-toggle-button-renderer");
    for (const control of controls) {
      if (control.closest("[hidden]")) continue;
      if (control.matches("yt-subscription-notification-toggle-button-renderer")) return true;
      if (control.hasAttribute("subscribed")) return control.getAttribute("subscribed") !== "false";
      const label = C.nameKey(control.textContent);
      if (/^(inscrito|inscrita|subscribed|unsubscribe|cancelar inscricao)\b/.test(label)) return true;
      if (/^(inscrever-se|subscribe)\b/.test(label)) return false;
    }
    return undefined;
  }
  function isSubscribed(root, owner) {
    const state = subscriptionState(root);
    if (typeof state === "boolean") learnSubscription(owner, state);
    const keys = subscriptionKeys(owner);
    const known = keys.find(key => subscriptions.has(key));
    const subscribed = state ?? (known ? subscriptions.get(known) : false);
    if (known && owner.channelId && owner.path) learnSubscription(owner, subscribed);
    return subscribed;
  }

  async function rpc(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Recarregue a página para ativar a extensão.");
    return response.value;
  }
  function remember(videoId, owner) {
    if (disposed) return;
    if (!C.VIDEO_ID.test(videoId) || !C.hasIdentity(owner)) return;
    videos.set(videoId, C.merge(videos.get(videoId), owner));
    if (videos.size > 1800) videos.delete(videos.keys().next().value);
    failed.delete(videoId);
    for (const root of waiting.get(videoId) || []) if (root.isConnected) enqueue(root);
    waiting.delete(videoId);
  }
  function rootOf(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const card = el?.closest(CARDS);
    if (!card) return null;
    const shorts = card.closest("ytm-shorts-lockup-view-model-v2") || card;
    const shortCell = shorts.closest(SHORT_CELL);
    if (shortCell) return shortCell;
    const rich = shorts.closest("ytd-rich-item-renderer");
    return rich && !rich.querySelector(SHELVES) ? rich : shorts;
  }
  function videoOf(root) {
    const direct = C.videoIdFromUrl(root.href || "");
    if (direct) return direct;
    for (const link of root.querySelectorAll("a[href*='watch?'],a[href*='/shorts/'],a[href*='/live/']")) {
      const id = C.videoIdFromUrl(link.href);
      if (id) return id;
    }
    const id = root.getAttribute("video-id");
    return C.VIDEO_ID.test(id) ? id : "";
  }
  function domOwner(root) {
    for (const link of root.querySelectorAll(OWNER)) {
      const path = C.channelPath(link.getAttribute("href"));
      if (path) {
        const image = link.querySelector("img") || root.querySelector("yt-avatar-shape img,#avatar img,#author-thumbnail img,yt-decorated-avatar-view-model img");
        return C.identity({ path, name: link.textContent || link.getAttribute("aria-label"), avatarUrl: image?.currentSrc || image?.src });
      }
    }
    const name = root.querySelector(OWNER_NAME)?.textContent;
    // A channel search result can have its own endpoint on the main link.
    if (root.matches("ytd-channel-renderer,ytd-grid-channel-renderer")) {
      for (const link of root.querySelectorAll("a[href]")) {
        const path = C.channelPath(link.href);
        if (path) return C.identity({ path, name: name || root.querySelector("#text,#channel-title")?.textContent });
      }
    }
    return C.identity({ name });
  }
  function ownerOf(root) {
    const id = videoOf(root), fromDom = domOwner(root), cached = videos.get(id);
    // DOM is fresh when YouTube recycles a renderer for a different video.
    return { videoId: id, owner: cached ? C.merge(fromDom, cached) : fromDom };
  }
  function inspect(root) {
    root.setAttribute("data-cng-probe", "cng-" + ++sequence);
    document.dispatchEvent(new CustomEvent("cng:inspect", { detail: root.getAttribute("data-cng-probe") }));
    root.removeAttribute("data-cng-probe");
  }
  function enqueue(root) {
    if (!root?.isConnected) return;
    pending.add(root);
    schedule();
  }
  function schedule() {
    if (scheduled || !ready || document.hidden) return;
    scheduled = true;
    requestAnimationFrame(flush);
  }
  function collect(node) {
    if (!node || (node.nodeType !== 1 && node.nodeType !== 9)) return;
    if (node.closest?.("[data-cng-ui]")) return;
    const parent = rootOf(node);
    if (parent) enqueue(parent);
    for (const el of node.querySelectorAll(CARDS)) enqueue(rootOf(el));
  }
  function scan() {
    collect(document);
    checkPage();
  }
  function flush() {
    if (disposed) return;
    scheduled = false;
    let count = 0;
    for (const root of pending) {
      pending.delete(root);
      if (root.isConnected) process(root);
      if (++count >= 60) break;
    }
    if (pending.size) schedule();
    for (const shelf of dirtyShelves) {
      dirtyShelves.delete(shelf);
      if (!shelf.isConnected) continue;
      // Include posts and channel cards too. A non-video carousel still has a header/CTA.
      const cards = [...shelf.querySelectorAll(CARDS)].filter(card => !card.querySelector(CARDS));
      const allHidden = cards.length > 0 && cards.every(card => {
        for (let el = card; el && el !== shelf; el = el.parentElement) if (el.classList.contains("cng-hidden")) return true;
        return false;
      });
      shelf.classList.toggle("cng-hidden", allHidden);
    }
  }
  function setVisibility(root, hidden, checking = false) {
    root.classList.toggle("cng-hidden", hidden);
    root.classList.toggle("cng-checking", checking);
    for (let shelf = root.parentElement?.closest(SHELVES); shelf; shelf = shelf.parentElement?.closest(SHELVES)) dirtyShelves.add(shelf);
  }
  function requestVideo(videoId, root) {
    if (!C.VIDEO_ID.test(videoId) || (failed.get(videoId) || 0) > Date.now()) return Promise.resolve(null);
    if (root) {
      if (!waiting.has(videoId)) waiting.set(videoId, new Set());
      waiting.get(videoId).add(root);
    }
    if (!requests.has(videoId)) {
      const request = rpc({ type: "resolveVideo", videoId }).then(owner => {
        remember(videoId, owner);
        return owner;
      }).catch(() => {
        failed.set(videoId, Date.now() + 60000);
        for (const el of waiting.get(videoId) || []) if (el.isConnected) enqueue(el);
        waiting.delete(videoId);
        return null;
      }).finally(() => { requests.delete(videoId); checkPage(); });
      requests.set(videoId, request);
    }
    return requests.get(videoId);
  }
  function process(root) {
    if (root.closest("[data-cng-ui]")) return;
    // Nested reels in a Shorts shelf must remain individually filterable.
    if (root.matches("ytd-rich-item-renderer") && root.querySelector("ytd-rich-shelf-renderer")) return;
    let { videoId, owner } = ownerOf(root);
    const probeKey = videoId + "|" + owner.channelId + "|" + owner.path;
    if (inspected.get(root) !== probeKey) {
      inspected.set(root, probeKey);
      inspect(root);
      owner = C.merge(owner, videos.get(videoId));
    }
    const blocked = findBlocked(owner);
    if (root.matches("ytd-reel-video-renderer") && root.hasAttribute("is-active")) {
      setVisibility(root, false);
      if (blocked) showGate(blocked);
    } else setVisibility(root, Boolean(blocked));
    if (blocked) return;
    if (!C.hasIdentity(owner) && !videoId) return;
    addButton(root, owner);
    // Only unresolved visible cards need a network lookup, and only with active rules.
    if (rules.length && videoId && !owner.channelId && !owner.path && !(failed.get(videoId) > Date.now())) {
      root.classList.add("cng-checking");
      if (!observed.has(root)) { observed.add(root); io.observe(root); }
    }
  }
  function addButton(root, owner, label = false) {
    let button = buttons.get(root);
    if (isSubscribed(root, owner)) { button?.remove(); return; }
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "cng-block" + (label ? " cng-block-label" : "");
      button.dataset.cngUi = "button";
      button.dataset.cngVersion = version;
      button.innerHTML = BLOCK_ICON;
      if (label) button.append(document.createTextNode(" Bloquear canal"));
      else {
        const caption = document.createElement("span");
        caption.className = "cng-block-text";
        caption.textContent = "Bloquear";
        button.append(caption);
      }
      button.addEventListener("click", async event => {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        button.disabled = true;
        try {
          let current = label ? pageOwner() : ownerOf(root).owner;
          const videoId = label ? C.videoIdFromUrl(location.href) : videoOf(root);
          if ((!current.channelId || !current.name) && videoId) {
            const resolved = await requestVideo(videoId, root);
            if (resolved) current = C.merge(current, resolved);
          }
          if (!C.hasIdentity(current)) throw new Error("Não consegui identificar o canal. Tente abrir o vídeo e bloquear por lá.");
          if (isSubscribed(root, current)) { button.remove(); return; }
          const rule = await rpc({ type: "block", channel: current });
          rules = [...rules.filter(r => r.id !== rule.id), rule];
          findBlocked = C.matcher(rules);
          scan();
          toast(`${rule.name || rule.handle || "Canal"} bloqueado.`, { label: "Desfazer", action: () => rpc({ type: "unblock", id: rule.id }) });
        } catch (error) { toast(error.message); }
        finally { button.disabled = false; }
      }, true);
      root.classList.add("cng-card");
      buttons.set(root, button);
    }
    if (label) {
      root.classList.add("cng-watch-actions");
      // Modern YouTube puts Subscribe next to the owner renderer, outside that renderer.
      const subscribe = root.querySelector(":scope > #subscribe-button,:scope > ytd-subscribe-button-renderer");
      if (subscribe && subscribe.nextElementSibling !== button) subscribe.after(button);
      else if (button.parentElement !== root) root.append(button);
    } else {
      const host = root.querySelector(BYLINE_ACTIONS);
      button.classList.toggle("cng-block-inline", Boolean(host));
      if (host) {
        host.classList.add("cng-inline-actions");
        if (button.parentElement !== host) host.append(button);
      } else if (button.parentElement !== root) root.append(button);
    }
    button.title = "Bloquear " + (owner.name || owner.handle || "canal deste vídeo");
    button.setAttribute("aria-label", button.title);
  }
  function toast(message, action) {
    let box = document.getElementById("cng-toast");
    if (!box) {
      box = document.createElement("div"); box.id = "cng-toast"; box.dataset.cngUi = "toast";
      box.setAttribute("role", "status"); document.documentElement.append(box);
    }
    box.replaceChildren(document.createTextNode(message));
    if (action) {
      const button = document.createElement("button"); button.textContent = action.label;
      button.onclick = async () => { try { await action.action(); box.remove(); } catch (error) { toast(error.message); } };
      box.append(button);
    }
    clearTimeout(toastTimer); toastTimer = setTimeout(() => box.remove(), 6500);
  }
  function watchActionsRoot() {
    return [...document.querySelectorAll("ytd-watch-metadata #owner")].find(root => !root.closest("[hidden]"))
      || [...document.querySelectorAll("ytd-video-owner-renderer")].find(root => !root.closest("[hidden]"));
  }
  function pageOwner() {
    const videoId = C.videoIdFromUrl(location.href);
    if (videoId) {
      const reel = document.querySelector("ytd-reel-video-renderer[is-active]");
      const owner = reel ? domOwner(reel) : domOwner(watchActionsRoot() || document.createElement("div"));
      return C.merge(owner, videos.get(videoId));
    }
    const path = C.channelPath(location.href);
    if (path) return C.merge(C.identity({ path, name: document.querySelector("ytd-page-header-renderer h1,yt-page-header-renderer h1,#channel-header #channel-name,#channel-name.ytd-c4-tabbed-header-renderer")?.textContent }), channelPage?.route === path ? channelPage.owner : null);
    return C.identity();
  }
  function pauseMedia(event) {
    if (!gateRule && !pageVerifying) return;
    if (event?.target instanceof HTMLMediaElement) event.target.pause();
    else for (const media of document.querySelectorAll("video,audio")) media.pause();
  }
  function showGate(rule) {
    gateRule = rule;
    document.documentElement.setAttribute("data-cng-gated", "");
    pauseMedia();
    let gate = document.getElementById("cng-gate");
    if (gate) return;
    gate = document.createElement("section"); gate.id = "cng-gate"; gate.dataset.cngUi = "gate";
    gate.setAttribute("aria-label", "Canal bloqueado pelo CanalNonGrato");
    const panel = document.createElement("div"); panel.className = "cng-gate-panel";
    const icon = document.createElement("div"); icon.className = "cng-gate-icon"; icon.innerHTML = BLOCK_ICON;
    const brand = document.createElement("p"); brand.className = "cng-gate-brand"; brand.textContent = "CANALNONGRATO";
    const title = document.createElement("h1"); title.textContent = "Esse canal ficou de fora.";
    const description = document.createElement("p"); description.textContent = `${rule.name || rule.handle || "Este canal"} está na sua lista de bloqueados.`;
    const home = document.createElement("a"); home.href = "https://www.youtube.com/"; home.textContent = "Voltar para o início";
    const unblock = document.createElement("button"); unblock.type = "button"; unblock.textContent = "Desbloquear canal";
    unblock.onclick = async () => {
      unblock.disabled = true;
      try { await rpc({ type: "unblock", id: gateRule.id }); toast("Canal desbloqueado. Você já pode dar play."); }
      catch (error) { toast(error.message); unblock.disabled = false; }
    };
    panel.append(icon, brand, title, description, home, unblock); gate.append(panel); document.documentElement.append(gate);
  }
  function clearGate() {
    gateRule = null;
    document.documentElement.removeAttribute("data-cng-gated");
    document.getElementById("cng-gate")?.remove();
  }
  async function checkPage() {
    if (!ready) return;
    const generation = pageGeneration, href = location.href;
    const videoId = C.videoIdFromUrl(href);
    let owner = pageOwner();
    if (!videoId) {
      const header = document.querySelector("ytd-page-header-renderer,yt-page-header-renderer,ytd-c4-tabbed-header-renderer");
      const state = header && subscriptionState(header);
      if (typeof state === "boolean") learnSubscription(owner, state);
    }
    pageVerifying = Boolean(rules.length && videoId && !C.hasIdentity(owner) && !(failed.get(videoId) > Date.now()));
    document.documentElement?.toggleAttribute("data-cng-verifying", pageVerifying);
    if (pageVerifying) pauseMedia();
    if (rules.length && videoId && !owner.channelId && !owner.path && !videos.has(videoId) && !requests.has(videoId) && !(failed.get(videoId) > Date.now())) {
      const resolved = await requestVideo(videoId);
      if (generation !== pageGeneration || href !== location.href) return;
      if (resolved) owner = C.merge(owner, resolved);
    }
    pageVerifying = false;
    document.documentElement?.removeAttribute("data-cng-verifying");
    const rule = findBlocked(owner);
    if (rule) showGate(rule); else clearGate();
    const ownerRoot = watchActionsRoot() || document.querySelector("ytd-reel-video-renderer[is-active] #channel-info");
    if (ownerRoot && C.hasIdentity(owner)) addButton(ownerRoot, owner, true);
  }
  document.addEventListener("cng:metadata", event => {
    if (typeof event.detail !== "string" || event.detail.length > 2000000) return;
    try {
      const payload = JSON.parse(event.detail);
      if (payload.channel) {
        const owner = C.identity(payload.channel), route = C.channelPath(location.href);
        if (route && (C.normalize(route) === C.normalize(owner.path) || route === "/channel/" + owner.channelId)) channelPage = { route, owner };
      }
      for (const entry of (payload.videos || []).slice(0, 2000)) {
        if (Array.isArray(entry)) remember(entry[0], C.identity(entry[1]));
      }
      for (const entry of (payload.subscriptions || []).slice(0, 10000)) {
        if (Array.isArray(entry) && typeof entry[1] === "boolean") learnSubscription(C.identity(entry[0]), entry[1]);
      }
      if (ready) scan();
    } catch { /* Ignore unrelated or malformed page events. */ }
  }, { signal: lifecycle.signal });
  const observer = new MutationObserver(records => {
    let pageChanged = false;
    for (const record of records) {
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (element?.closest("[data-cng-ui]")) continue;
      const root = rootOf(record.target);
      if (root) enqueue(root);
      for (const added of record.addedNodes) {
        collect(added);
        if (added.nodeType === 1 && (added.matches(PAGE_OWNERS) || added.querySelector(PAGE_OWNERS))) pageChanged = true;
      }
      if (element?.closest(PAGE_OWNERS + ",ytd-page-header-renderer,yt-page-header-renderer,ytd-c4-tabbed-header-renderer")) {
        pageChanged = true;
        const owner = pageOwner(), state = subscriptionState(element.closest("ytd-page-header-renderer,yt-page-header-renderer,ytd-c4-tabbed-header-renderer") || watchActionsRoot() || element);
        if (typeof state === "boolean") learnSubscription(owner, state);
      }
    }
    if (pageChanged) checkPage();
  });
  io = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      io.unobserve(entry.target); observed.delete(entry.target);
      const { videoId, owner } = ownerOf(entry.target);
      if (rules.length && videoId && !owner.channelId && !owner.path) requestVideo(videoId, entry.target);
    }
  }, { rootMargin: "160px" });
  observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "video-id", "is-active", "subscribed", "aria-label", "aria-pressed"] });
  document.addEventListener("play", pauseMedia, { capture: true, signal: lifecycle.signal });
  document.addEventListener("yt-navigate-start", () => { pageGeneration++; channelPage = null; pageVerifying = false; document.documentElement?.removeAttribute("data-cng-verifying"); pending.clear(); clearGate(); }, { signal: lifecycle.signal });
  for (const event of ["yt-navigate-finish", "yt-page-data-updated", "DOMContentLoaded", "popstate"]) {
    (event === "popstate" ? window : document).addEventListener(event, () => { scan(); }, { signal: lifecycle.signal });
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { schedule(); checkPage(); } }, { signal: lifecycle.signal });
  const onStorageChanged = (changes, area) => {
    if (area !== "local" || !changes.blockedChannels) return;
    rules = changes.blockedChannels.newValue || [];
    findBlocked = C.matcher(rules);
    scan();
  };
  chrome.storage.onChanged.addListener(onStorageChanged);
  document.addEventListener("cng:dispose-content", () => {
    disposed = true; ready = false; lifecycle.abort(); observer.disconnect(); io.disconnect(); pending.clear(); dirtyShelves.clear();
    clearTimeout(toastTimer); clearGate();
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch { /* The previous extension context can already be invalidated. */ }
    for (const button of document.querySelectorAll(".cng-block")) if (button.dataset.cngVersion === version) button.remove();
    delete globalThis.__cngContentVersion;
  }, { once: true, signal: lifecycle.signal });
  chrome.storage.local.get("blockedChannels").then(result => {
    if (disposed) return;
    rules = result.blockedChannels || []; findBlocked = C.matcher(rules); ready = true;
    document.dispatchEvent(new CustomEvent("cng:ready")); scan();
  }).catch(() => {});
})();
