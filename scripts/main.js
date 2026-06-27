/* Flowsheet landing interactions: reveal, hero demo, and graph animations.
   Quiet motion, green accents, no theatrics. */

(function () {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GAUGE_CIRC = 2 * Math.PI * 84; // r=84

  /* ---- Sticky nav ---- */
  const nav = document.querySelector("[data-nav]");
  const onScroll = () => nav && nav.classList.toggle("is-scrolled", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- Mobile burger ---- */
  const burger = document.querySelector("[data-burger]");
  const links = document.querySelector(".nav__links");
  if (burger && links) {
    burger.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      Object.assign(links.style, open
        ? { display: "flex", position: "fixed", flexDirection: "column", top: "70px", left: "0", right: "0", background: "rgba(243,247,242,0.97)", padding: "1rem var(--page-x)", borderBottom: "1px solid var(--line)", gap: "0.25rem" }
        : { display: "" });
    });
  }

  /* ---- Counters ---- */
  const animateCount = (el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    if (reduce) { el.textContent = prefix + target.toFixed(decimals) + suffix; return; }
    const dur = 1400; const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = prefix + target.toFixed(decimals) + suffix;
    };
    requestAnimationFrame(tick);
  };

  /* ---- Graph finalizers (also used by screenshot harness) ---- */
  const fillGauge = (g) => {
    const pct = parseFloat(g.dataset.gauge) / 100;
    const fill = g.querySelector("[data-gauge-fill]");
    if (fill) fill.style.strokeDashoffset = String(GAUGE_CIRC * (1 - pct));
  };
  const fillBars = (wrap) => wrap.querySelectorAll("[data-bar]").forEach((b) => { b.style.width = b.dataset.bar + "%"; });
  const fillConf = (root) => root.querySelectorAll("[data-conf]").forEach((c) => { c.style.width = c.dataset.conf + "%"; });
  const drawLine = (lc) => lc.classList.add("is-drawn");
  const staggerChips = (wrap) => wrap.querySelectorAll(".chip").forEach((c, i) => { c.style.transitionDelay = (i * 0.05) + "s"; });

  window.__finalizeCharts = function () {
    document.querySelectorAll("[data-count]").forEach((el) => {
      const t = parseFloat(el.dataset.count);
      el.textContent = (el.dataset.prefix || "") + t.toFixed(parseInt(el.dataset.decimals || "0", 10)) + (el.dataset.suffix || "");
    });
    document.querySelectorAll("[data-gauge]").forEach(fillGauge);
    document.querySelectorAll("[data-bars]").forEach(fillBars);
    document.querySelectorAll(".overlay").forEach(fillConf);
    document.querySelectorAll("[data-linechart]").forEach(drawLine);
  };

  /* ---- Reveal + lazy graph triggers ---- */
  const seen = new WeakSet();
  const trigger = (el) => {
    if (seen.has(el)) return;
    seen.add(el);
    el.classList.add("is-in");
    el.querySelectorAll && el.querySelectorAll("[data-count]").forEach(animateCount);
    if (el.matches("[data-gauge]") || el.querySelector?.("[data-gauge]"))
      el.querySelectorAll("[data-gauge]").forEach(fillGauge);
    if (el.querySelector?.("[data-bars]")) el.querySelectorAll("[data-bars]").forEach(fillBars);
    if (el.querySelector?.("[data-conf]")) fillConf(el);
    if (el.matches("[data-linechart]")) drawLine(el);
    if (el.querySelector?.("[data-chips]")) el.querySelectorAll("[data-chips]").forEach(staggerChips);
  };

  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { trigger(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.08, rootMargin: "0px 0px 6% 0px" });

    document.querySelectorAll(".reveal, [data-linechart], [data-gauge]").forEach((el) => io.observe(el));
    // chips stagger setup up front
    document.querySelectorAll("[data-chips]").forEach(staggerChips);
  } else {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    window.__finalizeCharts();
  }

  /* ---- Hero token resolution demo ---- */
  const demo = document.querySelector("[data-demo]");
  if (demo) {
    const tokenEl = demo.querySelector("[data-token]");
    const caretEl = demo.querySelector("[data-caret]");
    const stateChip = demo.querySelector("[data-prov-state]");
    const lockBtn = demo.querySelector("[data-lock]");
    const cursor = demo.querySelector("[data-cursor]");
    const receipt = demo.querySelector("[data-prov]");
    const token = "ebitda[q3]";

    // Glide the pointer to the Lock button, tap it, then lock the value.
    const moveCursorThenLock = () => {
      if (reduce || !cursor || !lockBtn) { lock(); return; }
      const panelRect = demo.getBoundingClientRect();
      cursor.style.left = (panelRect.width * 0.42) + "px";
      cursor.style.top = (panelRect.height * 0.42) + "px";
      cursor.classList.add("is-active");
      requestAnimationFrame(() => setTimeout(() => {
        const b = lockBtn.getBoundingClientRect();
        cursor.style.left = (b.left - panelRect.left + b.width / 2) + "px";
        cursor.style.top = (b.top - panelRect.top + b.height / 2) + "px";
      }, 90));
      setTimeout(() => {
        cursor.classList.add("is-click");
        lockBtn.classList.add("is-pressed");
        setTimeout(() => { lockBtn.classList.remove("is-pressed"); lock(); }, 230);
        setTimeout(() => cursor.classList.remove("is-click"), 430);
        setTimeout(() => cursor.classList.remove("is-active"), 1150);
      }, 90 + 1200);
    };

    const lock = () => {
      if (!stateChip) return;
      stateChip.textContent = "Ratified";
      stateChip.classList.remove("pill--draft");
      stateChip.classList.add("pill--ratified");
      if (lockBtn) { lockBtn.textContent = "Locked"; lockBtn.classList.add("is-locked"); }
      if (tokenEl) { tokenEl.textContent = "$128.4M"; tokenEl.style.color = "var(--ink)"; tokenEl.style.fontFamily = "var(--font-sans)"; tokenEl.style.fontWeight = "700"; }
    };

    // Pop the receipt out of the just-typed token (eases in).
    const popReceipt = () => {
      if (receipt) { receipt.classList.remove("is-armed"); receipt.classList.add("is-popped"); }
      if (tokenEl) { tokenEl.classList.add("is-flash"); setTimeout(() => tokenEl.classList.remove("is-flash"), 660); }
    };

    if (reduce) {
      if (tokenEl) tokenEl.textContent = token;
      if (caretEl) caretEl.style.display = "none";
    } else {
      if (receipt) receipt.classList.add("is-armed");
      let started = false;
      const run = () => {
        if (started) return; started = true;
        let i = 0;
        const type = () => {
          if (i <= token.length) { tokenEl.textContent = token.slice(0, i); i++; setTimeout(type, 90); }
          else { if (caretEl) caretEl.style.display = "none"; popReceipt(); setTimeout(moveCursorThenLock, 1400); }
        };
        setTimeout(type, 800);
      };
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && run()), { threshold: 0.5 });
        io.observe(demo);
      } else run();
    }
    if (lockBtn) lockBtn.addEventListener("click", lock);
  }

  /* ---- Email capture ======================================================
     Set your form endpoint ONCE here. Sign up free at https://formspree.io,
     create a form, and paste its URL below (Getform / Formspark also work).
     Every [data-form] on the page submits here over HTTPS via fetch.
     NOTE: the Content-Security-Policy in vercel.json only allows posting to
     formspree.io. If you switch providers, add that domain to both
     connect-src and form-action there, or the browser will block it.        */
  const FORM_ENDPOINT = "https://formspree.io/f/YOUR_FORM_ID";
  const formReady = FORM_ENDPOINT && !/YOUR_FORM_ID/i.test(FORM_ENDPOINT);
  if (!formReady) console.warn("[Flowsheet] Email capture is not live yet: set FORM_ENDPOINT in scripts/main.js to your form URL.");

  document.querySelectorAll("[data-form]").forEach((form) => {
    form.setAttribute("action", FORM_ENDPOINT);
    const btn = form.querySelector("button");
    const input = form.querySelector("input[type='email']");
    const label = btn ? btn.textContent : "";
    const flash = (msg) => { if (btn) { btn.textContent = msg; setTimeout(() => { btn.textContent = label; }, 2600); } };

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!input || !input.checkValidity()) { if (input) input.reportValidity(); return; }
      if (!formReady) { flash("Add your form endpoint"); return; }
      if (btn) { btn.disabled = true; btn.textContent = "Sending..."; }
      try {
        const res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: { Accept: "application/json" },
          body: new FormData(form),
        });
        if (res.ok) {
          input.value = "";
          if (btn) { btn.textContent = "Thanks. You are on the list."; btn.classList.add("is-locked"); }
        } else {
          if (btn) btn.disabled = false;
          flash("Something went wrong");
        }
      } catch (_) {
        if (btn) btn.disabled = false;
        flash("Network error, try again");
      }
    });
  });
})();
