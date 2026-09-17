"use client";

import { useEffect } from "react";

function findFunnelSection() {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h2.card-title")).find(
    (item) => item.textContent?.trim() === "Funil comercial"
  );

  return heading?.closest("section.card") as HTMLElement | null;
}

function findFunnelScroller(section: HTMLElement) {
  return (
    Array.from(section.querySelectorAll<HTMLElement>("div")).find(
      (element) => element.style.overflowX === "auto"
    ) || null
  );
}

export default function CrmFunnelTopScrollbar() {
  useEffect(() => {
    let activeScroller: HTMLElement | null = null;
    let activeInner: HTMLElement | null = null;
    let frame = 0;

    const cleanup = () => {
      if (activeScroller) {
        activeScroller.classList.remove("crm-funnel-scrollbar-on-top");
      }
      if (activeInner) {
        activeInner.classList.remove("crm-funnel-scrollbar-content");
      }
      activeScroller = null;
      activeInner = null;
    };

    const mount = () => {
      const section = findFunnelSection();
      const scroller = section ? findFunnelScroller(section) : null;
      const inner = scroller?.firstElementChild;

      if (!scroller || !(inner instanceof HTMLElement)) {
        cleanup();
        return;
      }

      if (scroller === activeScroller && inner === activeInner) return;

      cleanup();
      activeScroller = scroller;
      activeInner = inner;

      scroller.classList.add("crm-funnel-scrollbar-on-top");
      inner.classList.add("crm-funnel-scrollbar-content");
    };

    const style = document.createElement("style");
    style.dataset.crmFunnelTopScrollbarStyle = "true";
    style.textContent = `
      .crm-funnel-scrollbar-on-top {
        transform: rotateX(180deg);
        padding-bottom: 0 !important;
        padding-top: 10px;
        scrollbar-color: #64748b #0f172a;
        scrollbar-width: auto;
      }

      .crm-funnel-scrollbar-on-top > .crm-funnel-scrollbar-content {
        transform: rotateX(180deg);
      }

      .crm-funnel-scrollbar-on-top::-webkit-scrollbar {
        height: 12px;
      }

      .crm-funnel-scrollbar-on-top::-webkit-scrollbar-track {
        background: #0f172a;
        border-radius: 999px;
      }

      .crm-funnel-scrollbar-on-top::-webkit-scrollbar-thumb {
        background: #64748b;
        border-radius: 999px;
        border: 2px solid #0f172a;
      }

      .crm-funnel-scrollbar-on-top::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
      }
    `;
    document.head.appendChild(style);

    const scheduleMount = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(mount);
    };

    mount();

    const observer = new MutationObserver(scheduleMount);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", scheduleMount);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleMount);
      window.cancelAnimationFrame(frame);
      cleanup();
      style.remove();
    };
  }, []);

  return null;
}
