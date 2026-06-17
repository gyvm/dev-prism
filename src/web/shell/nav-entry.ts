// Built to public/nav.js (see `build:nav`) and copied to dist/nav.js by Astro's
// publicDir. Frozen report HTML references it via a relative `../nav.js`, so the
// sidebar is injected at view-time (method Z): the report body stays frozen and
// self-contained, while the nav always reflects the latest deploy.
//
// The site root is derived from this module's own URL (`import.meta.url`) rather
// than `document.currentScript` (which is null for module scripts). nav.js sits
// at the site root, so its directory IS the root — making the sidebar links
// correct regardless of how deep the report page is nested.

import { SIDEBAR_STYLES, mountSidebar, sidebarHtml } from "./sidebar.ts";

function siteRoot(): string {
  try {
    // nav.js lives at <root>/nav.js → its directory is <root>/.
    return new URL(".", import.meta.url).href;
  } catch {
    return "/";
  }
}

function injectSidebar(): void {
  // Avoid double-injection if the script is somehow loaded twice.
  if (document.querySelector(".ghs-sb")) return;

  const style = document.createElement("style");
  style.textContent = SIDEBAR_STYLES;
  document.head.appendChild(style);

  const root = siteRoot();
  const container = document.createElement("div");
  container.innerHTML = sidebarHtml({
    reportsHref: root,
    exploreHref: new URL("explore", root).href,
    active: null,
  });
  const aside = container.firstElementChild;
  if (aside) document.body.appendChild(aside);

  mountSidebar(document);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectSidebar);
} else {
  injectSidebar();
}
