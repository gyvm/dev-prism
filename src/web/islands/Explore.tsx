import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { resolveScope, type Grain, type Scope } from "../../analyses/scope.js";
import { scopeToSearchParams } from "../../analyses/scope-url.js";
import { createWasmRunner, type WasmRunner } from "../duckdb-runner.js";
import { buildExploreHtml, scopeFromUrl } from "../explore.js";
import PeriodPicker from "./PeriodPicker.js";

// Client-only island port of the former vanilla `main.ts`. React owns the DOM
// shell, the controlled filter state, and the period picker; the heavy lifting
// (DuckDB-WASM runner, scope parsing, analyses, renderers) stays in the
// framework-free modules above, preserving Reports/Explore parity.

type Draft = Readonly<{
  from: Date | null;
  to: Date | null;
  grain: Grain;
  reposText: string;
  usersText: string;
  includeBots: boolean;
}>;

function parseList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function draftFromScope(scope: Scope): Draft {
  return {
    from: scope.from,
    to: scope.to,
    grain: scope.grain,
    reposText: scope.repos.join(", "),
    usersText: scope.users.join(", "),
    includeBots: scope.includeBots,
  };
}

function scopeFromDraft(draft: Draft): Scope {
  return resolveScope({
    from: draft.from,
    to: draft.to,
    grain: draft.grain,
    repos: parseList(draft.reposText),
    users: parseList(draft.usersText),
    includeBots: draft.includeBots,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dateLabel(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "—";
}

// The report renderers ship hover/tooltip behavior as inline <script> tags.
// innerHTML does not execute them, so re-create each script element to run it.
function activateScripts(root: HTMLElement): void {
  for (const old of [...root.querySelectorAll("script")]) {
    const fresh = document.createElement("script");
    for (const attr of [...old.attributes]) fresh.setAttribute(attr.name, attr.value);
    fresh.textContent = old.textContent;
    old.replaceWith(fresh);
  }
}

export default function Explore() {
  const [status, setStatus] = useState("DuckDB-WASM を起動中…");
  const [initialScope] = useState<Scope>(() => scopeFromUrl(window.location.search, new Date()));
  const [draft, setDraft] = useState<Draft>(() => draftFromScope(initialScope));
  const runnerRef = useRef<WasmRunner | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  // Monotonic guard: a slower earlier run must not overwrite a newer one.
  const generation = useRef(0);

  const run = useCallback(async (scope: Scope): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner) return;
    const gen = ++generation.current;
    const query = scopeToSearchParams(scope).toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    setStatus("集計中…");
    try {
      const html = await buildExploreHtml(runner, scope);
      if (gen !== generation.current) return; // superseded by a later run
      const el = resultsRef.current;
      if (el) {
        el.innerHTML = html;
        activateScripts(el);
      }
      setStatus(`集計完了 (${dateLabel(scope.from)} 〜 ${dateLabel(scope.to)})`);
    } catch (error) {
      if (gen === generation.current) setStatus(`エラー: ${errorMessage(error)}`);
    }
  }, []);

  // Boot the WASM runner once, then run the initial scope.
  useEffect(() => {
    let disposed = false;
    createWasmRunner()
      .then((runner) => {
        if (disposed) {
          void runner.close();
          return;
        }
        runnerRef.current = runner;
        void run(scopeFromDraft(draftFromScope(initialScope)));
      })
      .catch((error) => setStatus(`エラー: ${errorMessage(error)}`));
    return () => {
      disposed = true;
      void runnerRef.current?.close();
      runnerRef.current = null;
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
        <h1>Explore</h1>
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
          <label className="explore-field">
            <span>Repos</span>
            <input
              type="text"
              name="repos"
              placeholder="owner/name, …"
              value={draft.reposText}
              onChange={(event) => setDraft({ ...draft, reposText: event.target.value })}
            />
          </label>
          <label className="explore-field">
            <span>Users</span>
            <input
              type="text"
              name="users"
              placeholder="login, …"
              value={draft.usersText}
              onChange={(event) => setDraft({ ...draft, usersText: event.target.value })}
            />
          </label>
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
      <div ref={resultsRef}></div>
    </main>
  );
}
