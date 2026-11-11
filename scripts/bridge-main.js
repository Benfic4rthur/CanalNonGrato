/* Read only YouTube's own renderer metadata. Bundled with core.js for MAIN. */
(() => {
  "use strict";
  if (globalThis.__cngBridgeInstalled) return;
  globalThis.__cngBridgeInstalled = true;
  const C = globalThis.CNGCore;
  const subscriptionChanges = new Map();
  let scheduled = false;
  function publish(data) {
    const videos = C.videoEntries(data);
    const subscriptions = C.subscriptionEntries(data).filter(([owner, subscribed]) => !subscriptionChanges.has(owner.channelId) || subscriptionChanges.get(owner.channelId) === subscribed);
    const metadata = data?.metadata?.channelMetadataRenderer;
    const channel = metadata ? C.identity({ channelId: metadata.externalId, path: metadata.vanityChannelUrl || metadata.channelUrl, name: metadata.title }) : null;
    if (videos.length || channel || subscriptions.length) document.dispatchEvent(new CustomEvent("cng:metadata", { detail: JSON.stringify({ videos, channel, subscriptions }) }));
  }
  function collect(event) {
    if (event?.detail?.response) publish(event.detail.response);
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      for (const data of [window.ytInitialData, window.ytInitialPlayerResponse, document.querySelector("ytd-app")?.data, document.querySelector("ytd-watch-flexy")?.playerData, document.querySelector("ytd-guide-renderer")?.data]) {
        if (data) publish(data);
      }
      for (const section of document.querySelectorAll("ytd-guide-section-renderer,ytd-guide-subscriptions-section-renderer")) {
        if (section.data) publish(section.matches("ytd-guide-subscriptions-section-renderer") ? { guideSubscriptionsSectionRenderer: section.data } : { guideSectionRenderer: section.data });
      }
    }, 40);
  }
  document.addEventListener("cng:inspect", event => {
    const token = event.detail;
    if (typeof token !== "string" || !/^cng-\d+$/.test(token)) return;
    const node = document.querySelector(`[data-cng-probe="${token}"]`);
    if (!node) return;
    for (const el of [node, ...node.querySelectorAll("yt-lockup-view-model,ytd-rich-grid-media,ytd-video-renderer,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,yt-shorts-lockup-view-model,ytd-subscribe-button-renderer")]) {
      if (el.data) publish(el.data);
    }
  });
  document.addEventListener("yt-subscribe-state-changed", event => {
    const { channelId, subscribed } = event.detail || {};
    if (C.CHANNEL_ID.test(channelId) && typeof subscribed === "boolean") { subscriptionChanges.set(channelId, subscribed); publish({ channelId, subscribed }); }
  });
  for (const name of ["yt-page-data-updated", "yt-navigate-finish", "yt-player-updated", "DOMContentLoaded", "cng:ready"]) document.addEventListener(name, collect);
})();
