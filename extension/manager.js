(() => {
  "use strict";
  const C = CNGCore;
  const full = document.body.classList.contains("dashboard");
  const version = chrome.runtime.getManifest().version;
  const icons = {
    block: '<circle cx="12" cy="12" r="8.5"/><path d="m6 18 12-12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    unlock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14v3"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };
  const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  let rules = [], messageTimeout;
  const app = document.getElementById("app");
  app.innerHTML = `
    ${full ? `<aside class="sidebar"><a class="brand" href="options.html"><img src="icons/mark.svg" alt="" width="38" height="38"><span>Canal<span class="brand-accent">NonGrato</span></span></a><p class="sidebar-caption">SEU FEED, SUAS REGRAS.</p><div class="sidebar-nav">${svg("block")} Canais bloqueados <span id="nav-count">0</span></div><div class="sidebar-bottom">${svg("shield")}<p>O controle fica com você.<br><span>Sem conta. Sem rastreamento.</span></p><small>VERSÃO ${version}</small></div></aside>` : ""}
    <main>
      <header class="topbar">${!full ? `<a class="brand" href="options.html" target="_blank"><img src="icons/mark.svg" alt="" width="32" height="32"><span>Canal<span class="brand-accent">NonGrato</span></span></a>` : '<span class="breadcrumb">SEU ESPAÇO / CANAIS BLOQUEADOS</span>'}<span class="status"><i></i> Filtro ativo</span></header>
      <section class="hero"><div><span class="eyebrow">UM POUCO MAIS DE PAZ NO FEED</span><h1>Menos ruído.<br>Mais do que importa<span class="accent">.</span></h1><p>Escolha quem fica fora do seu YouTube.</p></div><div class="hero-mark" aria-hidden="true"><img src="icons/mark.svg" alt=""></div></section>
      <div class="workspace">
        <section class="add-panel"><div class="section-heading"><span class="section-icon">${svg("plus")}</span><div><h2>Adicionar um canal</h2><p>Bloqueie por @, link ou nome exato.</p></div></div>
          <form id="add-form"><label class="sr-only" for="channel-input">Canal para bloquear</label><div class="input-row"><input id="channel-input" name="channel" placeholder="@canal ou link do YouTube" autocomplete="off" spellcheck="false" required maxlength="500"><button id="add-button" class="primary" type="submit">${svg("plus")}<span>Bloquear</span></button></div><p class="field-hint">Prefira o @ ou link: o bloqueio acompanha o canal.</p></form>
          ${full ? `<div class="tip"><span>${svg("block")}</span><p><strong>Viu um canal que não quer ver?</strong>Use o botão de bloqueio no canto do vídeo. Ele desaparece e vem para esta lista.</p></div><div class="coverage"><span class="eyebrow">ONDE O FILTRO ATUA</span><ul><li>${svg("check")} Página inicial e recomendações</li><li>${svg("check")} Vídeos ao lado do player</li><li>${svg("check")} Pesquisa e Shorts</li><li>${svg("check")} Página do canal e links de vídeos</li></ul><p>O filtro atua neste navegador. O YouTube muda com frequência; se algum formato escapar, a extensão pode precisar de atualização.</p></div>` : ""}
        </section>
        <section class="list-panel" aria-labelledby="list-title"><div class="list-heading"><h2 id="list-title">Canais não gratos <span id="count">0</span></h2><span class="list-caption">Você decide.</span></div><div class="search-box">${svg("search")}<label class="sr-only" for="search-input">Buscar na lista de bloqueados</label><input id="search-input" type="search" placeholder="Buscar na sua lista" autocomplete="off"></div><div id="channel-list" role="list" aria-label="Canais bloqueados"></div><div class="list-summary" id="list-summary"></div></section>
      </div>
      <footer><div class="backup-actions"><button id="export-button" class="text-button" title="Salvar cópia dos canais bloqueados">${svg("download")} Exportar</button><button id="import-button" class="text-button" title="Importar lista do CanalNonGrato">${svg("upload")} Importar</button><input id="import-file" class="sr-only" type="file" accept="application/json,.json" tabindex="-1"></div>${!full ? `<button id="open-options" class="text-button">Abrir painel ${svg("arrow")}</button>` : '<span class="privacy-note">Salvo só neste navegador.</span>'}</footer>
      <div id="feedback" role="status" aria-live="polite" hidden></div>
    </main>`;
  const list = document.getElementById("channel-list");
  const input = document.getElementById("channel-input");
  async function rpc(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Não foi possível concluir.");
    return response.value;
  }
  function feedback(text, undo = null, error = false) {
    const box = document.getElementById("feedback");
    clearTimeout(messageTimeout); box.replaceChildren(document.createTextNode(text));
    box.classList.toggle("error", error); box.hidden = false;
    if (undo) {
      const button = document.createElement("button"); button.type = "button"; button.textContent = "Desfazer";
      button.onclick = async () => { try { await undo(); box.hidden = true; } catch (err) { feedback(err.message, null, true); } };
      box.append(button);
    }
    messageTimeout = setTimeout(() => { box.hidden = true; }, 6500);
  }
  function render() {
    const term = C.nameKey(document.getElementById("search-input").value);
    const filtered = rules.filter(r => C.nameKey([r.name, r.handle, r.channelId, r.path].join(" ")).includes(term)).sort((a, b) => b.addedAt - a.addedAt);
    document.getElementById("count").textContent = rules.length;
    if (full) document.getElementById("nav-count").textContent = rules.length;
    document.getElementById("list-summary").textContent = rules.length ? `${rules.length} ${rules.length === 1 ? "canal bloqueado" : "canais bloqueados"} · Vale em todas as abas do YouTube` : "Os canais que você bloquear aparecem aqui.";
    list.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("div"); empty.className = "empty";
      const mark = document.createElement("div"); mark.className = "empty-mark"; mark.innerHTML = svg(term ? "search" : "block");
      const title = document.createElement("h3"); title.textContent = term ? "Nenhum canal encontrado" : "Seu feed começa com você";
      const description = document.createElement("p"); description.textContent = term ? "Tente outro nome ou @ na busca." : "Bloqueie pelo botão nos vídeos ou adicione um canal acima.";
      empty.append(mark, title, description); list.append(empty); return;
    }
    const fragment = document.createDocumentFragment();
    for (const rule of filtered) {
      const row = document.createElement("div"); row.className = "channel-row"; row.setAttribute("role", "listitem");
      const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.setAttribute("aria-hidden", "true");
      const display = rule.name || rule.handle || rule.channelId || rule.path;
      avatar.textContent = display.replace(/^@/, "").split(/\s+/).slice(0, 2).map(word => [...word][0] || "").join("").toUpperCase().slice(0, 2);
      if (C.avatarUrl(rule.avatarUrl)) {
        const image = document.createElement("img"); image.src = C.avatarUrl(rule.avatarUrl);
        image.alt = ""; image.width = 40; image.height = 40; image.loading = "lazy"; image.decoding = "async"; image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove(), { once: true });
        avatar.append(image);
      }
      const details = document.createElement("div"); details.className = "channel-details";
      const name = document.createElement("strong"); name.textContent = display; name.title = display;
      const handle = document.createElement("span"); handle.textContent = rule.handle || (rule.channelId ? "Canal identificado pelo ID" : rule.path || "Bloqueado pelo nome exato");
      details.append(name, handle);
      const button = document.createElement("button"); button.type = "button"; button.className = "unblock";
      button.innerHTML = svg("unlock") + '<span>Desbloquear</span>';
      button.title = "Desbloquear " + display; button.setAttribute("aria-label", button.title);
      button.onclick = async () => {
        button.disabled = true;
        try {
          await rpc({ type: "unblock", id: rule.id });
          feedback("Canal desbloqueado.", () => rpc({ type: "block", channel: rule }));
        } catch (error) { button.disabled = false; feedback(error.message, null, true); }
      };
      row.append(avatar, details, button); fragment.append(row);
    }
    list.append(fragment);
  }
  document.getElementById("add-form").addEventListener("submit", async event => {
    event.preventDefault();
    const value = input.value.trim(); if (!value) return;
    const button = document.getElementById("add-button"); button.disabled = true; button.querySelector("span").textContent = "Bloqueando…";
    try {
      const owner = await rpc({ type: "resolveChannel", input: value });
      const rule = await rpc({ type: "block", channel: owner });
      input.value = ""; feedback(`${rule.name || rule.handle || "Canal"} bloqueado.`);
    } catch (error) { feedback(error.message, null, true); }
    finally { button.disabled = false; button.querySelector("span").textContent = "Bloquear"; }
  });
  document.getElementById("search-input").addEventListener("input", render);
  document.getElementById("open-options")?.addEventListener("click", () => rpc({ type: "openOptions" }));
  document.getElementById("export-button").addEventListener("click", () => {
    const backup = { app: "CanalNonGrato", version: 1, exportedAt: new Date().toISOString(), channels: rules };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "CanalNonGrato-backup.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    feedback("Cópia da lista exportada.");
  });
  const fileInput = document.getElementById("import-file");
  document.getElementById("import-button").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    try {
      const file = fileInput.files[0]; if (!file) return;
      if (file.size > 4000000) throw new Error("O arquivo deve ter até 4 MB.");
      const data = JSON.parse(await file.text());
      if (data.app !== "CanalNonGrato" || data.version !== 1 || !Array.isArray(data.channels)) throw new Error("Escolha um backup JSON do CanalNonGrato.");
      const count = await rpc({ type: "import", channels: data.channels });
      feedback(`${count} ${count === 1 ? "canal importado" : "canais importados"}.`);
    } catch (error) { feedback(error instanceof SyntaxError ? "O arquivo não é um JSON válido." : error.message, null, true); }
    finally { fileInput.value = ""; }
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.blockedChannels) { rules = changes.blockedChannels.newValue || []; render(); }
  });
  chrome.storage.local.get("blockedChannels").then(data => { rules = data.blockedChannels || []; render(); rpc({ type: "refreshAvatars" }).catch(() => {}); }).catch(error => feedback(error.message, null, true));
})();
