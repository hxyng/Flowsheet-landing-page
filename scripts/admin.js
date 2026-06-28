/* Admin signup viewer.
   Reads the token-protected list from /api/signups?token=... and polls every
   few seconds, so new signups appear as soon as someone submits the form.
   The token is kept only in this browser (sessionStorage); it is never
   committed or sent anywhere but your own API. */
(function () {
  "use strict";

  const gate = document.querySelector("[data-gate]");
  const gateErr = document.querySelector("[data-gate-err]");
  const tokenInput = document.querySelector("[data-token]");
  const panel = document.querySelector("[data-panel]");
  const countEl = document.querySelector("[data-count]");
  const rowsEl = document.querySelector("[data-rows]");
  const emptyEl = document.querySelector("[data-empty]");
  const liveEl = document.querySelector("[data-live]");
  const forgetBtn = document.querySelector("[data-forget]");

  const KEY = "fs_admin_token";
  const POLL_MS = 4000;
  let token = "";
  let timer = null;
  let seen = new Set(); // emails already rendered, to flag new arrivals

  // Allow a token via ?token= or #token= so a bookmarked URL just works.
  const fromUrl = () => {
    const q = new URLSearchParams(location.search).get("token");
    if (q) return q;
    const h = new URLSearchParams(location.hash.replace(/^#/, "")).get("token");
    return h || "";
  };

  const fmt = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const render = (emails) => {
    // newest first
    const list = emails.slice().sort((a, b) =>
      String(b.at || "").localeCompare(String(a.at || "")));
    countEl.textContent = list.length.toLocaleString();
    emptyEl.hidden = list.length > 0;
    rowsEl.innerHTML = list
      .map((r) => {
        const fresh = r.email && !seen.has(r.email.toLowerCase()) && seen.size > 0;
        return (
          '<tr class="' + (fresh ? "fresh" : "") + '">' +
          '<td class="email">' + esc(r.email || "") + "</td>" +
          '<td class="when">' + esc(fmt(r.at)) + "</td></tr>"
        );
      })
      .join("");
    seen = new Set(list.map((r) => (r.email || "").toLowerCase()));
  };

  const tick = async () => {
    try {
      const res = await fetch("/api/signups?token=" + encodeURIComponent(token), {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = await res.json();
      if (!data || !Array.isArray(data.emails)) {
        // token wrong / not set, or admin view not enabled
        stop();
        showGate("That token didn't return the list. Check SIGNUPS_ADMIN_TOKEN, then try again.");
        return;
      }
      render(data.emails);
      liveEl.textContent = "live · updated " + new Date().toLocaleTimeString();
    } catch (_) {
      liveEl.textContent = "reconnecting…";
    }
  };

  const start = () => {
    panel.classList.add("show");
    gate.classList.remove("show");
    seen = new Set();
    tick();
    timer = setInterval(tick, POLL_MS);
  };

  const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

  const showGate = (msg) => {
    panel.classList.remove("show");
    gate.classList.add("show");
    if (msg) { gateErr.textContent = msg; gateErr.hidden = false; }
    else { gateErr.hidden = true; }
    tokenInput.focus();
  };

  gate.addEventListener("submit", (e) => {
    e.preventDefault();
    token = tokenInput.value.trim();
    if (!token) { showGate("Enter your admin token."); return; }
    sessionStorage.setItem(KEY, token);
    start();
  });

  forgetBtn.addEventListener("click", () => {
    stop();
    token = "";
    sessionStorage.removeItem(KEY);
    tokenInput.value = "";
    showGate();
  });

  // Boot: prefer a URL token, then a remembered one, else show the gate.
  token = fromUrl() || sessionStorage.getItem(KEY) || "";
  if (token) { tokenInput.value = token; sessionStorage.setItem(KEY, token); start(); }
  else showGate();
})();
