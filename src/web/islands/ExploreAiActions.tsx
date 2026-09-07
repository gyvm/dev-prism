import { useEffect, useRef, useState } from "react";

import {
  buildAnalysisContext,
  type AnalysisTemplateId,
} from "../../ai/analysis-context.js";
import { getAnalysisPrompt } from "../../ai/analysis-prompts.js";
import { isAnalysisTemplateId } from "../../ai/analysis-markdown.js";
import type { Scope } from "../../analyses/scope.js";
import { isScopeParamName, scopeToSearchParams } from "../../analyses/scope-url.js";
import type { DwhQueryRunner } from "../../warehouse/runner.js";
import { registerWebMcpAnalysisTool } from "../webmcp.js";
import type { ViewId } from "../views/registry.js";

type Props = Readonly<{
  view: ViewId;
  scope: Scope;
  runner: DwhQueryRunner | null;
  queryReady: boolean;
  onContextError: (error: unknown) => void;
}>;

type CopyState = "idle" | "copying" | "copied" | "fallback" | "error";

/** Keeps the reference URL aligned with the same scope serializer as Explore. */
function referenceUrl(scope: Scope): string {
  const params = new URLSearchParams(window.location.search);
  for (const name of [...params.keys()]) {
    if (isScopeParamName(name)) params.delete(name);
  }
  for (const [name, value] of scopeToSearchParams(scope)) params.set(name, value);
  const query = params.toString();
  return `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}`;
}

export default function ExploreAiActions({
  view,
  scope,
  runner,
  queryReady,
  onContextError,
}: Props) {
  const [selected, setSelected] = useState<AnalysisTemplateId>(view);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [markdown, setMarkdown] = useState("");
  const [error, setError] = useState<string | null>(null);
  const runnerRef = useRef<DwhQueryRunner | null>(runner);
  const scopeRef = useRef(scope);
  const readyRef = useRef(queryReady);
  const referenceUrlRef = useRef(referenceUrl(scope));

  runnerRef.current = runner;
  scopeRef.current = scope;
  readyRef.current = queryReady;
  referenceUrlRef.current = referenceUrl(scope);

  useEffect(() => {
    setSelected(view);
    setCopyState("idle");
    setMarkdown("");
    setError(null);
  }, [view]);

  // A single registration reads refs at execution time, so filter/view changes
  // are visible to WebMCP without leaving stale tool closures registered.
  useEffect(() => {
    const controller = new AbortController();
    void registerWebMcpAnalysisTool(
      async (templateId, signal) => {
        const currentRunner = runnerRef.current;
        if (!currentRunner || !readyRef.current) {
          throw new Error("Exploreの集計が完了していません。");
        }
        if (signal.aborted) throw new DOMException("Tool execution was cancelled", "AbortError");
        const context = await buildAnalysisContext(
          currentRunner,
          templateId,
          scopeRef.current,
          new Date(),
          referenceUrlRef.current,
        );
        if (signal.aborted) throw new DOMException("Tool execution was cancelled", "AbortError");
        return context;
      },
      controller.signal,
    ).catch(() => {
      // WebMCP is progressive enhancement. A registration failure must not
      // affect the copy fallback or the Explore dashboard.
    });
    return () => controller.abort();
  }, []);

  const definition = getAnalysisPrompt(selected);
  const disabled = runner === null || !queryReady || copyState === "copying";

  const copyPrompt = async (): Promise<void> => {
    if (!runner || !queryReady) return;
    setCopyState("copying");
    setMarkdown("");
    setError(null);
    try {
      const context = await buildAnalysisContext(
        runner,
        selected,
        scope,
        new Date(),
        referenceUrl(scope),
      );
      const prompt = definition.buildPrompt(context);
      setMarkdown(prompt);
      try {
        if (!navigator.clipboard) throw new Error("Clipboard API is unavailable");
        await navigator.clipboard.writeText(prompt);
        setCopyState("copied");
      } catch {
        setCopyState("fallback");
      }
    } catch (caught) {
      setCopyState("error");
      setError("AI分析用コンテキストの生成に失敗しました。");
      onContextError(caught);
    }
  };

  return (
    <section className="explore-ai-actions" aria-labelledby="explore-ai-title">
      <div className="explore-ai-heading">
        <div>
          <h2 id="explore-ai-title">AI分析</h2>
          <p className="explore-ai-description">現在のExplore集計をMarkdownにして、AIへ貼り付けます。</p>
        </div>
        <span className="explore-ai-readonly">外部サービスは起動しません</span>
      </div>
      <div className="explore-ai-controls">
        <label className="explore-field" htmlFor="explore-ai-template">
          <span>分析テンプレート</span>
          <select
            id="explore-ai-template"
            value={selected}
            aria-describedby="explore-ai-template-description"
            onChange={(event) => {
              if (isAnalysisTemplateId(event.target.value)) {
                setSelected(event.target.value);
                setCopyState("idle");
                setMarkdown("");
                setError(null);
              }
            }}
          >
            <option value="flow">フロー改善分析</option>
            <option value="review">レビュー遅延・負荷分析</option>
            <option value="timeline">ステージ別ボトルネック分析</option>
            <option value="wip">オープンPR滞留分析</option>
          </select>
        </label>
        <button type="button" className="explore-ai-copy" disabled={disabled} onClick={() => void copyPrompt()}>
          プロンプトをコピー
        </button>
      </div>
      <p id="explore-ai-template-description" className="explore-ai-description">
        {definition.description}
      </p>
      {copyState === "copying" && <p className="explore-ai-status" role="status">集計結果をMarkdownへ整形中…</p>}
      {copyState === "copied" && (
        <p className="explore-ai-status" role="status" aria-live="polite">
          プロンプトをクリップボードへコピーしました。
        </p>
      )}
      {copyState === "fallback" && (
        <p className="explore-ai-status" role="status" aria-live="polite">
          自動コピーできませんでした。下の内容を手動でコピーしてください。
        </p>
      )}
      {copyState === "error" && (
        <p className="explore-ai-status is-error" role="alert">
          {error ?? "AI分析用コンテキストの生成に失敗しました。"}
        </p>
      )}
      {markdown && copyState === "fallback" && (
        <textarea
          className="explore-ai-fallback"
          aria-label="コピーするMarkdown"
          readOnly
          value={markdown}
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
    </section>
  );
}
