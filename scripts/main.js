/* FlowSheet landing interactions. Kept minimal and Tesla-quiet:
   color and state transitions, no scale or bounce theatrics. */

(function () {
  "use strict";

  /* ---- Sticky header state ---- */
  const header = document.querySelector("[data-header]");
  const onScroll = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 12);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- Reveal on scroll ---- */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* ---- Mobile menu (lightweight) ---- */
  const toggle = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector(".site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.style.display === "flex";
      nav.style.display = open ? "" : "flex";
      nav.style.position = "fixed";
      nav.style.flexDirection = "column";
      nav.style.top = "68px";
      nav.style.left = "0";
      nav.style.right = "0";
      nav.style.background = "rgba(255,255,255,0.96)";
      nav.style.padding = "1rem var(--page-x)";
      nav.style.borderBottom = "1px solid var(--cloud)";
      toggle.setAttribute("aria-expanded", String(!open));
    });
  }

  /* ---- Hero token resolution demo ----
     Types ebitda[q3], reveals the provenance card, then lets the user
     (or an auto-timer) lock the value. The lock is the single amber moment. */
  const demo = document.querySelector("[data-demo]");
  if (demo && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const tokenEl = demo.querySelector("[data-token]");
    const caretEl = demo.querySelector("[data-caret]");
    const provCard = demo.querySelector("[data-prov]");
    const stateChip = demo.querySelector("[data-prov-state]");
    const lockBtn = demo.querySelector("[data-lock]");
    const token = "ebitda[q3]";

    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      let i = 0;
      const type = () => {
        if (i <= token.length) {
          tokenEl.textContent = token.slice(0, i);
          i += 1;
          setTimeout(type, 95);
        } else {
          if (caretEl) caretEl.style.display = "none";
          setTimeout(() => provCard && provCard.classList.add("is-shown"), 350);
          setTimeout(autoLock, 2600);
        }
      };
      setTimeout(type, 700);
    };

    const lock = () => {
      if (!stateChip || !lockBtn) return;
      stateChip.textContent = "Ratified";
      stateChip.classList.remove("chip--draft");
      stateChip.classList.add("chip--ratified");
      lockBtn.textContent = "Locked";
      lockBtn.classList.add("is-locked");
      if (tokenEl) {
        tokenEl.textContent = "$128.4M";
        tokenEl.style.color = "var(--carbon)";
        tokenEl.style.fontFamily = "var(--font-display)";
        tokenEl.style.fontWeight = "600";
      }
    };
    const autoLock = () => lock();
    if (lockBtn) lockBtn.addEventListener("click", lock);

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && run()),
        { threshold: 0.4 }
      );
      io.observe(demo);
    } else {
      run();
    }
  } else if (demo) {
    /* reduced motion: show resolved state immediately */
    const provCard = demo.querySelector("[data-prov]");
    const tokenEl = demo.querySelector("[data-token]");
    const caretEl = demo.querySelector("[data-caret]");
    if (tokenEl) tokenEl.textContent = "ebitda[q3]";
    if (caretEl) caretEl.style.display = "none";
    if (provCard) provCard.classList.add("is-shown");
  }

  /* ---- Demo CTA form ---- */
  const form = document.querySelector("[data-form]");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input");
      const btn = form.querySelector("button");
      if (input && input.checkValidity()) {
        btn.textContent = "Thanks. Check your inbox.";
        btn.classList.add("is-locked");
        input.value = "";
      }
    });
  }
})();
