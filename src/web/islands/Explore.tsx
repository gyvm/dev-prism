import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactElement } from "react";

import { resolveScope, type Scope } from "../../analyses/scope.js";
import { scopeToSearchParams } from "../../analyses/scope-url.js";
import { siteBase } from "../base-path.js";
import { getWasmRunner } from "../duckdb-runner.js";
import { queryFilterOptions, scopeFromUrl } from "../explore.js";
import { isViewId, VIEW_IDS, VIEWS, type ViewId } from "../views/registry.js";
import ExploreFilters, { type ExploreFilterOptions, type ExploreFilterValue } from "./ExploreFilters.js";

// One persistent Explore shell. Changing a view swaps only its analysis below
// the filters; DuckDB-WASM and the selected scope remain in the same island.

function draftFromScope(scope: Scope): ExploreFilterValue {
  return {
    from: scope.from,
    to: scope.to,
    grain: scope.grain,
    repos: [...scope.repos],
    users: [...scope.users],
    includeBots: scope.includeBots,
  };
}

function scopeFromDraft(draft: ExploreFilterValue): Scope {
  return resolveScope({
    from: draft.from,
    to: draft.to,
    grain: draft.grain,
    repos: [...draft.repos],
    users: [...draft.users],
    includeBots: draft.includeBots,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dateLabel(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "—";
}

function viewFromPathname(pathname: string): ViewId | null {
  const segment = pathname.split("/").filter(Boolean).at(-1);
  return isViewId(segment) ? segment : null;
}

export default function Explore({ view }: { view: ViewId }) {
  const [activeView, setActiveView] = useState(view);
  const definition = VIEWS[activeView];
  const [status, setStatus] = useState("DuckDB-WASM を起動中…");
  const [content, setContent] = useState<ReactElement | null>(null);
  const [initialScope] = useState<Scope>(() => scopeFromUrl(window.location.search, new Date()));
  const [draft, setDraft] = useState<ExploreFilterValue>(() => draftFromScope(initialScope));
  const [options, setOptions] = useState<ExploreFilterOptions>({ repos: [], users: [] });
  // Monotonic guard: a slower earlier run must not overwrite a newer one.
  const generation = useRef(0);

  const run = useCallback(
    async (scope: Scope): Promise<void> => {
      const gen = ++generation.current;
      const query = scopeToSearchParams(scope).toString();
      window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
      setStatus("集計中…");
      try {
        const runner = await getWasmRunner();
        const element = await definition.render(runner, scope);
        if (gen !== generation.current) return; // superseded by a later run
        setContent(element);
        setStatus(`集計完了 (${dateLabel(scope.from)} 〜 ${dateLabel(scope.to)})`);
      } catch (error) {
        if (gen === generation.current) setStatus(`エラー: ${errorMessage(error)}`);
      }
    },
    [definition],
  );

  // Boot (or reuse) the runner, then load filter options. The runner is never
  // closed here — it is owned by the page session.
  useEffect(() => {
    let disposed = false;
    getWasmRunner()
      .then((runner) => {
        if (disposed) return;
        queryFilterOptions(runner)
          .then((loaded) => {
            if (!disposed) setOptions(loaded);
          })
          .catch(() => {
            /* options are a convenience; a failure should not block analyses */
          });
      })
      .catch(() => {
        /* run() surfaces the boot error; don't double-report it here */
      });
    return () => {
      disposed = true;
    };
  }, []);

  // A view switch intentionally reuses the current draft and changes only the
  // analysis content rendered below the tab bar.
  useEffect(() => {
    void run(scopeFromDraft(draft));
  }, [run]);

  useEffect(() => {
    const onPopState = () => {
      const next = viewFromPathname(window.location.pathname);
      if (next) setActiveView(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const applyDraft = (next: ExploreFilterValue): void => {
    setDraft(next);
    void run(scopeFromDraft(next));
  };

  const applyCurrentDraft = (): void => {
    void run(scopeFromDraft(draft));
  };

  const viewHref = (id: ViewId) => `${siteBase()}explore/${id}/${window.location.search}`;

  const changeView = (event: MouseEvent<HTMLAnchorElement>, id: ViewId): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (id === activeView) return;
    window.history.pushState(null, "", viewHref(id));
    setActiveView(id);
  };

  return (
    <main className="explore-main">
      <header>
        <h1>Explore</h1>
        <ExploreFilters
          value={draft}
          options={options}
          onChange={setDraft}
          onPreset={applyDraft}
          onSubmit={applyCurrentDraft}
        />
        <p className="explore-status" role="status" aria-live="polite">
          {status}
        </p>
      </header>
      <nav className="explore-tabs" aria-label="ビュー">
        {VIEW_IDS.map((id) => (
          <a
            key={id}
            className={id === activeView ? "explore-tab is-active" : "explore-tab"}
            href={viewHref(id)}
            aria-current={id === activeView ? "page" : undefined}
            onClick={(event) => changeView(event, id)}
          >
            {VIEWS[id].label}
          </a>
        ))}
      </nav>
      {content}
    </main>
  );
}
