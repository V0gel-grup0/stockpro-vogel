"use client";

import { useEffect } from "react";

function findFunnelSection() {
  const heading = Array.from(document.querySelectorAll<HTMLElement>("h2.card-title")).find(
    (item) => item.textContent?.trim() === "Funil comercial"
  );

  return heading?.closest("section.card") as HTMLElement | null;
}

function findFunnelScroller(section: HTMLElement) {
  return Array.from(section.querySelectorAll<HTMLElement>("div")).find(
    (element) => element.style.overflowX === "auto"
  ) || null;
}

export default function CrmFunnelTopScrollbar() {
  useEffect(() => {
    let activeSection: HTMLElement | null = null;
    let activeScroller: HTMLElement | null = null;
    let topScroller: HTMLDivElement | null = null;
    let spacer: HTMLDivElement | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let syncing = false;
    let frame = 0;

    const cleanupCurrent = () => {
      resizeObserver?.disconnect();
      resizeObserver = null;

      if (activeScroller) {
        activeScroller.removeEventListener("scroll", syncFromBottom);
        activeScroller.classList.remove("crm-funnel-bottom-scroll-hidden");
      }

      if (topScroller) {
        topScroller.removeEventListener("scroll", syncFromTop);
        topScroller.remove();
      }

      activeSection = null;
      activeScroller = null;
      topScroller = null;
      spacer = null;
    };

    const syncFromTop = () => {
      if (!topScroller || !activeScroller || syncing) return;
      syncing = true;
      activeScroller.scrollLeft = topScroller.scrollLeft;
      window.requestAnimationFrame(() => {
        syncing = false;
      });
    };

    const syncFromBottom = () => {
      if (!topScroller || !activeScroller || syncing) return;
      syncing = true;
      topScroller.scrollLeft = activeScroller.scrollLeft;
      window.requestAnimationFrame(() => {
        syncing = false;
      });
    };

    const updateWidth = () => {
      if (!activeScroller || !spacer || !topScroller) return;
      spacer.style.width = `${activeScroller.scrollWidth}px`;
      spacer.style.height = "1px";
      topScroller.scrollLeft = activeScroller.scrollLeft;
      topScroller.style.display =
        activeScroller.scrollWidth > activeScroller.clientWidth ? "block" : "none";
    };

    const mount = () => {
      const section = findFunnelSection();
      if (!section) {
        cleanupCurrent();
        return;
      }

      const scroller = findFunnelScroller(section);
      if (!scroller) {
        cleanupCurrent();
        return;
      }

      if (section === activeSection && scroller === activeScroller && topScroller?.isConnected) {
        updateWidth();
        return;
      }

      cleanupCurrent();

      activeSection = section;
      activeScroller = scroller;

      topScroller = document.createElement("div");
      topScroller.dataset.crmFunnelTopScrollbar = "true";
      topScroller.style.overflowX = "auto";
      topScroller.style.overflowY = "hidden";
      topScroller.style.width = "100%";
      topScroller.style.height = "18px";
      topScroller.style.margin = "2px 0 12px";
      topScroller.style.padding = "0";
      topScroller.style.scrollbarGutter = "stable";
      topScroller.setAttribute("aria-label", "Mover funil comercial para os lados");

      spacer = document.createElement("div");
      spacer.style.height = "1px";
      topScroller.appendChild(spacer);

      scroller.insertAdjacentElement("beforebegin", topScroller);
      scroller.classList.add("crm-funnel-bottom-scroll-hidden");

      topScroller.addEventListener("scroll", syncFromTop, { passive: true });
      scroller.addEventListener("scroll", syncFromBottom, { passive: true });

      resizeObserver = new ResizeObserver(updateWidth);
      resizeObserver.observe(scroller);
      const inner = scroller.firstElementChild;
      if (inner instanceof HTMLElement) resizeObserver.observe(inner);

      updateWidth();
    };

    const style = document.createElement("style");
    style.dataset.crmFunnelTopScrollbarStyle = "true";
    style.textContent = `
      .crm-funnel-bottom-scroll-hidden {
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .crm-funnel-bottom-scroll-hidden::-webkit-scrollbar {
        display: none;
      }
      [data-crm-funnel-top-scrollbar="true"] {
        scrollbar-width: auto;
        -webkit-overflow-scrolling: touch;
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
      cleanupCurrent();
      style.remove();
    };
  }, []);

  return null;
}
