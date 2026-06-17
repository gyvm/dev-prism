import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { resolveScope, type Scope } from "../../analyses/scope.js";
import { scopeToSearchParams } from "../../analyses/scope-url.js";
import { createWasmRunner, type WasmRunner } from "../duckdb-runner.js";
import { buildExploreHtml, scopeFromUrl } from "../explore.js";
import { scopeFromForm } from "../filters.js";

// Client-only island port of the former vanilla `main.ts`. React owns the DOM
// shell, status, and filter form; the heavy lifting (DuckDB-WASM runner, scope
// parsing, analyses, renderers) stays in the framework-free modules above, so
// Reports/Explore parity and the scope unit tests are untouched.

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function dateValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

// The report renderers ship hover/tooltip behavior as inline <script> tags.
// innerHTML does not execute them, so re-create each script element to run it
// (identical to the former main.ts activateScripts).
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
  // Initial scope from the URL (client:only, so window is available at init).
  const [scope] = useState<Scope>(() => scopeFromUrl(window.location.search, new Date()));
  const runnerRef = useRef<WasmRunner | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  // Monotonic guard: a slower earlier run must not overwrite a newer one.
  const generation = useRef(0);

  const run = useCallback(async (next: Scope): Promise<void> => {
    const runner = runnerRef.current;
    if (!runner) return;
    const gen = ++generation.current;
    const query = scopeToSearchParams(next).toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
    setStatus("集計中…");
    try {
      const html = await buildExploreHtml(runner, next);
      if (gen !== generation.current) return; // superseded by a later submit
      const el = resultsRef.current;
      if (el) {
        el.innerHTML = html;
        activateScripts(el);
      }
      setStatus(`集計完了 (${dateValue(next.from)} 〜 ${dateValue(next.to)})`);
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
        void run(scope);
      })
      .catch((error) => setStatus(`エラー: ${errorMessage(error)}`));
    return () => {
      disposed = true;
      void runnerRef.current?.close();
      runnerRef.current = null;
    };
    // Mount-only: `run`/`scope` are stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (formRef.current) void run(scopeFromForm(formRef.current));
  };

  return (
    <main className="explore-main">
      <header>
        <h1>Explore</h1>
        <form ref={formRef} className="explore-filters" aria-label="フィルタ" onSubmit={onSubmit}>
          <label className="explore-field">
            <span>From</span>
            <input type="date" name="from" defaultValue={dateValue(scope.from)} />
          </label>
          <label className="explore-field">
            <span>To</span>
            <input type="date" name="to" defaultValue={dateValue(scope.to)} />
          </label>
          <label className="explore-field">
            <span>粒度</span>
            <select name="grain" defaultValue={scope.grain}>
              <option value="day">日</option>
              <option value="week">週</option>
              <option value="month">月</option>
            </select>
          </label>
          <label className="explore-field">
            <span>Repos</span>
            <input type="text" name="repos" placeholder="owner/name, …" defaultValue={scope.repos.join(", ")} />
          </label>
          <label className="explore-field">
            <span>Users</span>
            <input type="text" name="users" placeholder="login, …" defaultValue={scope.users.join(", ")} />
          </label>
          <label className="explore-field">
            <span>Bot を含む</span>
            <input type="checkbox" name="includeBots" defaultChecked={scope.includeBots} />
          </label>
          <button type="submit">更新</button>
        </form>
        <p className="explore-status" role="status">{status}</p>
      </header>
      <div ref={resultsRef}></div>
    </main>
  );
}
