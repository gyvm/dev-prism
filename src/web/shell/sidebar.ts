// Single source of truth for the app shell's collapsible sidebar.
//
// It is consumed two ways with identical markup/behavior:
//   1. Astro `Layout.astro` server-renders `sidebarHtml()` + `SIDEBAR_STYLES`
//      into the gallery and Explore pages, then calls `mountSidebar()` from a
//      bundled `<script>`.
//   2. `nav-entry.ts` (built to public/nav.js) injects the same sidebar at
//      view-time over the self-contained frozen report HTML (method Z), so the
//      report body stays frozen while the nav is always the latest deploy.
//
// The sidebar is a `position: fixed` overlay rail: it never enters layout flow,
// so it does not disturb a frozen report's grid. Pure DOM — no framework.

export type SidebarActive = "reports" | "explore" | null;

export type SidebarLinks = Readonly<{
  /** href for the Reports gallery (index). */
  reportsHref: string;
  /** href for the Explore page. */
  exploreHref: string;
  /** which entry to mark as current, if any. */
  active?: SidebarActive;
}>;

const TOGGLE_ID = "ghs-sidebar-toggle";
const NAV_ID = "ghs-sidebar-nav";
const STORAGE_KEY = "ghs-sidebar-open";

function link(href: string, label: string, key: Exclude<SidebarActive, null>, active: SidebarActive): string {
  const current = active === key ? ' aria-current="page"' : "";
  const activeClass = active === key ? " ghs-sb__link--active" : "";
  return `<a class="ghs-sb__link${activeClass}" href="${href}" data-key="${key}"${current}>${label}</a>`;
}

/**
 * Markup for the sidebar. Rendered collapsed by default; `mountSidebar` restores
 * the persisted open state on load to avoid a flash when the user pinned it open.
 */
export function sidebarHtml(links: SidebarLinks): string {
  const active = links.active ?? null;
  return `<aside class="ghs-sb" data-open="false">
  <button id="${TOGGLE_ID}" class="ghs-sb__toggle" type="button"
          aria-expanded="false" aria-controls="${NAV_ID}" aria-label="ナビゲーションを開閉">
    <span class="ghs-sb__bars" aria-hidden="true"></span>
  </button>
  <nav id="${NAV_ID}" class="ghs-sb__nav" aria-label="メインナビゲーション">
    <span class="ghs-sb__brand">PR Analytics</span>
    ${link(links.reportsHref, "Reports", "reports", active)}
    ${link(links.exploreHref, "Explore", "explore", active)}
  </nav>
</aside>`;
}

// Scoped with a `ghs-sb` prefix so it never collides with report/explore styles.
// Palette follows DESIGN.md tokens (cyan accent, no purple).
export const SIDEBAR_STYLES = `
.ghs-sb { position: fixed; top: 0; left: 0; z-index: 1000; font-family: ui-sans-serif, system-ui, sans-serif; }
.ghs-sb__toggle { position: fixed; top: 12px; left: 12px; width: 40px; height: 40px; display: grid; place-items: center;
  z-index: 2; background: #ffffff; border: 1px solid #d6dee8; border-radius: 8px; cursor: pointer; box-shadow: 0 1px 3px rgba(16,24,40,.08); }
.ghs-sb__toggle:hover { border-color: #0891b2; }
.ghs-sb__toggle:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
.ghs-sb__bars, .ghs-sb__bars::before, .ghs-sb__bars::after { content: ""; display: block; width: 18px; height: 2px;
  background: #202733; border-radius: 2px; transition: transform .18s ease, opacity .18s ease; }
.ghs-sb__bars::before { transform: translateY(-6px); }
.ghs-sb__bars::after { transform: translateY(4px); }
.ghs-sb[data-open="true"] .ghs-sb__bars { background: transparent; }
.ghs-sb[data-open="true"] .ghs-sb__bars::before { transform: translateY(0) rotate(45deg); }
.ghs-sb[data-open="true"] .ghs-sb__bars::after { transform: translateY(-2px) rotate(-45deg); }
.ghs-sb__nav { position: fixed; top: 0; left: 0; width: 220px; height: 100vh; box-sizing: border-box; z-index: 1;
  padding: 64px 14px 18px; background: #ffffff; border-right: 1px solid #d6dee8; box-shadow: 2px 0 12px rgba(16,24,40,.10);
  display: flex; flex-direction: column; gap: 4px; transform: translateX(-100%); transition: transform .2s ease; }
.ghs-sb[data-open="true"] .ghs-sb__nav { transform: translateX(0); }
.ghs-sb__brand { font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #728091;
  padding: 4px 10px 10px; }
.ghs-sb__link { display: block; padding: 9px 10px; border-radius: 6px; font-size: 14px; font-weight: 600; color: #202733;
  text-decoration: none; }
.ghs-sb__link:hover { background: #eef3f8; }
.ghs-sb__link:focus-visible { outline: 2px solid #2563eb; outline-offset: -2px; }
.ghs-sb__link--active { color: #0891b2; background: #eef3f8; }
.ghs-sb__backdrop { position: fixed; inset: 0; z-index: 999; background: rgba(16,24,40,.28); border: 0; opacity: 0;
  pointer-events: none; transition: opacity .2s ease; }
.ghs-sb[data-open="true"] ~ .ghs-sb__backdrop, .ghs-sb__backdrop[data-show="true"] { opacity: 1; pointer-events: auto; }
@media (prefers-reduced-motion: reduce) {
  .ghs-sb__nav, .ghs-sb__bars, .ghs-sb__bars::before, .ghs-sb__bars::after, .ghs-sb__backdrop { transition: none; }
}
`;

function readPersistedOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistOpen(open: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // Private mode / disabled storage — state simply doesn't persist.
  }
}

/**
 * Wires the sidebar found within `root`: toggle button, persisted open state,
 * a backdrop for narrow screens, and Escape-to-close. Idempotent per element
 * (guards against double-mounting). Returns silently if no sidebar is present.
 */
export function mountSidebar(root: ParentNode = document): void {
  const aside = root.querySelector<HTMLElement>(".ghs-sb");
  const toggle = root.querySelector<HTMLButtonElement>(`#${TOGGLE_ID}`);
  if (!aside || !toggle || aside.dataset.mounted === "true") return;
  aside.dataset.mounted = "true";

  // Backdrop covers content while the rail is open on narrow viewports; clicking
  // it closes the rail. It lives as a sibling of the sidebar.
  const backdrop = document.createElement("button");
  backdrop.className = "ghs-sb__backdrop";
  backdrop.type = "button";
  backdrop.tabIndex = -1;
  backdrop.setAttribute("aria-hidden", "true");
  aside.after(backdrop);

  const setOpen = (open: boolean): void => {
    aside.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    backdrop.dataset.show = String(open);
    persistOpen(open);
  };

  toggle.addEventListener("click", () => setOpen(aside.dataset.open !== "true"));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && aside.dataset.open === "true") {
      setOpen(false);
      toggle.focus();
    }
  });

  setOpen(readPersistedOpen());
}
