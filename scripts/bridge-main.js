/* Read only YouTube's own renderer metadata. Bundled with core.js for MAIN. */
(() => {
  "use strict";
  if (globalThis.__cngBridgeInstalled) return;
  globalThis.__cngBridgeInstalled = true;
  const C = globalThis.CNGCore;
  let scheduled = false;
  function publish(data) {
    const videos = C.videoEntries(data);
    const metadata = data?.metadata?.channelMetadataRenderer;
    const channel = metadata ? C.identity({ channelId: metadata.externalId, path: metadata.vanityChannelUrl || metadata.channelUrl, name: metadata.title }) : null;
    if (videos.length || channel) document.dispatchEvent(new CustomEvent("cng:metadata", { detail: JSON.stringify({ videos, channel }) }));
  }
  function collect(event) {
    if (event?.detail?.response) publish(event.detail.response);
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      for (const data of [window.ytInitialData, window.ytInitialPlayerResponse, document.querySelector("ytd-app")?.data, document.querySelector("ytd-watch-flexy")?.playerData]) {
        if (data) publish(data);
      }
    }, 40);
  }
  document.addEventListener("cng:inspect", event => {
    const token = event.detail;
    if (typeof token !== "string" || !/^cng-\d+$/.test(token)) return;
    const node = document.querySelector(`[data-cng-probe="${token}"]`);
    if (!node) return;
    for (const el of [node, ...node.querySelectorAll("yt-lockup-view-model,ytd-rich-grid-media,ytd-video-renderer,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,yt-shorts-lockup-view-model")]) {
      if (el.data) publish(el.data);
    }
  });
  for (const name of ["yt-page-data-updated", "yt-navigate-finish", "yt-player-updated", "DOMContentLoaded", "cng:ready"]) document.addEventListener(name, collect);
})();
