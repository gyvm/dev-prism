import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactElement } from "react";

import { resolveScope, type Grain, type Scope } from "../../analyses/scope.js";
import { scopeToSearchParams } from "../../analyses/scope-url.js";
import { getWasmRunner } from "../duckdb-runner.js";
import { queryFilterOptions, scopeFromUrl } from "../explore.js";
import { VIEWS, type ViewId } from "../views/registry.js";
import MultiSelect from "./MultiSelect.js";
import PeriodPicker from "./PeriodPicker.js";

// One Explore view. The island is mounted per route (/explore/<view>/), so the
// `view` prop is fixed for its lifetime — navigation remounts it. The DuckDB
// runner deliberately does NOT live here: it is a module-scope singleton
// (duckdb-runner.ts) so an Astro ClientRouter navigation reuses the booted WASM
// instead of paying the multi-second boot again. See docs/explore-views-plan.md.

type Draft = Readonly<{
  from: Date | null;
  to: Date | null;
  grain: Grain;
  repos: readonly string[];
  users: readonly string[];
  includeBots: boolean;
}>;

type Options = Readonly<{ repos: string[]; users: string[] }>;

function draftFromScope(scope: Scope): Draft {
  return {
    from: scope.from,
    to: scope.to,
    grain: scope.grain,
    repos: [...scope.repos],
    users: [...scope.users],
    includeBots: scope.includeBots,
  };
}

function scopeFromDraft(draft: Draft): Scope {
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

export default function Explore({ view }: { view: ViewId }) {
  const definition = VIEWS[view];
  const [status, setStatus] = useState("DuckDB-WASM を起動中…");
  const [content, setContent] = useState<ReactElement | null>(null);
  const [initialScope] = useState<Scope>(() => scopeFromUrl(window.location.search, new Date()));
  const [draft, setDraft] = useState<Draft>(() => draftFromScope(initialScope));
  const [options, setOptions] = useState<Options>({ repos: [], users: [] });
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

  // Boot (or reuse) the runner, then load filter options and run the initial
  // scope. The runner is never closed here — it is owned by the page session.
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
    void run(scopeFromDraft(draftFromScope(initialScope)));
    return () => {
      disposed = true;
    };
    // Mount-only: run/initialScope are stable for the component's lifetime.
  }, [run, initialScope]);

  const applyDraft = (next: Draft): void => {
    setDraft(next);
    void run(scopeFromDraft(next));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void run(scopeFromDraft(draft));
  };

  return (
    <main className="explore-main">
      <header>
        <h1>{definition.label}</h1>
        <form className="explore-filters" aria-label="フィルタ" onSubmit={onSubmit}>
          <PeriodPicker
            from={draft.from}
            to={draft.to}
            onPreset={(from, to) => applyDraft({ ...draft, from, to })}
            onRange={(from, to) => setDraft({ ...draft, from, to })}
          />
          <label className="explore-field">
            <span>粒度</span>
            <select
              name="grain"
              value={draft.grain}
              onChange={(event) => setDraft({ ...draft, grain: event.target.value as Grain })}
            >
              <option value="day">日</option>
              <option value="week">週</option>
              <option value="month">月</option>
            </select>
          </label>
          <div className="explore-field">
            <span>Repos</span>
            <MultiSelect
              label="Repos"
              options={options.repos}
              selected={draft.repos}
              onChange={(repos) => setDraft({ ...draft, repos })}
            />
          </div>
          <div className="explore-field">
            <span>Users</span>
            <MultiSelect
              label="Users"
              options={options.users}
              selected={draft.users}
              onChange={(users) => setDraft({ ...draft, users })}
            />
          </div>
          <label className="explore-field">
            <span>Bot を含む</span>
            <input
              type="checkbox"
              name="includeBots"
              checked={draft.includeBots}
              onChange={(event) => setDraft({ ...draft, includeBots: event.target.checked })}
            />
          </label>
          <button type="submit">更新</button>
        </form>
        <p className="explore-status" role="status">{status}</p>
      </header>
      {content}
    </main>
  );
}
