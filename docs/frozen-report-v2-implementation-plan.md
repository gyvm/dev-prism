# 凍結レポート v2 実装計画

[ADR 0001](adr/0001-frozen-report-information-architecture.md)（情報設計）と [ADR 0002](adr/0002-ai-prompt-architecture.md)（AI プロンプト実装アーキテクチャ）を実装する計画。各フェーズは **green で着地**（typecheck + tests、可能なら demo 目視）し、フェーズ単位でコミット→レビュー→指摘対応する。

## 実装ステータス（2026-06-22, branch `claude/frozen-report-v2`, 全 Phase 完了 / tests 345 green）

- **Phase 1 ✅** DORA 正直化（Revert タイトル検知, in-memory+SQL, マージ数ラベル）— code-reviewer approve
- **Phase 2 ✅** スキル発見廃止→埋め込みプロンプトレジストリ — review P1(順序)/P2 対応済
- **Phase 3 ✅** 3バンドの問い別レイアウト, AIタイトル render 所有 — review approve, P2 対応済
- **Phase 4 ✅** debated→follow-up 統合(💬), review-balance 新設, size 全廃, ドキュメント同期
- 残課題（軽微・別PR可）: metric-cards の「DORAメトリクス」h2 重複(Explore 共有), プロンプト本文の先頭H2整形, demo 成果物(docs/demo)の旧id・AI 再生成は Copilot トークン要, dev-prism-summary の in-memory/SQL parity テスト追加(現状 compute.test のみ)

## ベースライン（2026-06-22）

- typecheck: green / tests: **345 passed**（**WIP 適用状態で確認済み green**）。
- 作業ツリーに未コミット WIP あり（`dev-prism-summary` の candidate から `reason`/`prompt`/`trend` を剥がし、metric-grid を撤去する方向＝ADR と整合。リードタイム二重表示は WIP で既に大半解消）。green なので土台として採用。
- `NormalizedPullRequest` に `title` あり（Revert 検知可）、`labels` あり。**base ブランチ名は未保持**（デフォルトブランチ判定は不可）。

## フェーズ分割

### Phase 1 — DORA 指標の正直化（ADR 0001 §4）

独立・最小。**in-memory と SQL の2経路を同時に直す**（parity 契約 `query.ts:6-8`）。

- **in-memory** `src/analyses/dora-metrics/internal/dora.ts`:
  - `isFailureFix` を「`title` が `/^Revert "/`（GitHub 既定の revert PR タイトル）にマッチ」へ変更。`FAILURE_LABELS` 定数を削除。ラベルは見ない（ADR「ラベル運用ゼロで成立」）。
- **SQL** `src/analyses/dora-metrics/query.ts`（**レビューで判明・追加**）:
  - 自前の `FAILURE_LABELS` + `pr_labels` JOIN を撤去し、`is_failure` を `pr.title LIKE 'Revert "%'` に。`pull_requests.title`（`schema.ts:82` VARCHAR）あり、parity 維持可能。
  - `query.test.ts` のラベル系期待を Revert タイトル系へ書き換え。
- `deploymentFrequency`（= merged PR 件数）はそのまま。base ブランチ未保持のため「デフォルトブランチへの」限定はせず「マージ数」と正直に名乗る（base 収集は YAGNI）。
- `metric-cards.tsx`（`:18,24,31,41`）の表示ラベル：「デプロイ頻度」→「マージ数」、変更失敗率/MTTR の説明文を Revert 由来に。
- **テスト（同一コミットで co-edit、レビューで判明）**: `dora.test.ts`（label→Revert）、`metric-cards.test.ts:25-30`（厳密なツールチップ文字列を新文言へ）、`query.test.ts`。

**着地条件**: typecheck + tests green。

### Phase 2 — AI プロンプト基盤（ADR 0002）

- **プロンプト本文を `src/prompts/<id>.md` に新設**（見出し無しの本体のみ。ADR 0002 §5）。id は ADR 0001 準拠で改名:
  - `flow-analyst`（旧 `00_flow-analyst`）
  - `project-progress`（旧 `01_project-progress`）
  - `follow-up`（旧 `02_follow-up-prs`、`03_debated-prs` の議論観点を統合）
  - `review-balance`（新規・PR レビューのバランス所見）
- **埋め込み（方式C）= コード生成（レビュー反映で build ライフサイクルから分離）**:
  - `scripts/gen-prompts.mjs`: `src/prompts/*.md` を読み、`src/prompts/generated.ts`（`export const PROMPTS: Record<string,string>`、verbatimModuleSyntax 対応の値 export、import は `.js` 拡張子）を出力。
  - **`generated.ts` をコミットし、`src/` 配下に置く**＝tsc が src からコンパイルし `dist` に乗る＝**Dockerfile も `prebuild` も不要**（Dockerfile は `scripts/` を COPY しないため `prebuild` 連鎖は ENOENT で壊れる。だから build と分離する）。
  - 生成は手動/CI 用の独立スクリプト `"gen:prompts": "node scripts/gen-prompts.mjs"`。**`build` には連鎖させない**。
  - **ドリフト検出テスト**（レビュー反映）: ジェネレータをメモリ実行し、コミット済み `generated.ts` と一致を assert する軽量テストを追加。
  - 実行時 FS ゼロ、`dist` に必ず同梱。
- **`src/analyses/ai/registry.ts` 新設**: `AI_REGISTRY: Record<string, { title: string; prompt: string }>`。`prompt` は `generated.ts` の `PROMPTS[id]`、`title` は固定セクション見出し。
- **`ai-runner.ts`**: `CopilotSdkRunnerOptions` から `skillDirectories` 削除。`AiRunnerInput` を `{ id; prompt; payload }` へ。送信プロンプト = `prompt 本文 + "\n\n入力JSON:\n" + JSON`。`Use the "X" skill` 撤去。
- **`analyze.ts`**: `discoverAiSkillIds` 削除。AI 実行は `AI_REGISTRY` を反復。`runAiAnalysis` がレジストリの `prompt` を runner に渡す。`AnalyzeOptions.skillsRoot` 削除。
- **`orchestrate.ts`**: `skillsRoot` / `discoverAiSkillIds` / `skillDirectories` 配線撤去。runner は `AI_REGISTRY` を前提に生成。**`validateAiModel` を削除する discovery 分岐の外へ出す**（レビュー反映：今は `aiSkillIds.length>0` 分岐内 `:96-101` にあり、撤去するとモデル検証が消える）。
- **`cli/report.ts`**: `--skills` / `skillsRoot` 撤去。
- **`tsconfig.json:22`**: `include` から `"skills/**/*.ts"` を削除（レビュー反映：削除後の dead glob）。
- **SKILL.md の本文を `src/prompts/*.md` へ移植してから** `skills/` ディレクトリ削除（レビュー反映：内容移植が先）。
- **`analyze.test.ts`**: `discoverAiSkillIds` テスト削除。skillId→id 改名、`skillsRoot` 引数削除、期待 id を新セットに。runner stub の引数を `{ id, prompt, payload }` に。
- この時点で render は旧ロジックのまま新 id を描画（壊れない）。`report.test.ts` が旧 id を参照していれば追従修正。

**着地条件**: typecheck + tests green。`npm run report -- --skip-ai` で compute のみのレポートが生成できる。

### Phase 3 — render の情報設計再編（ADR 0001 §1–3, ADR 0002 §4–5）

`src/pipeline/stages/render.tsx`。

- `AI_SECTION_ORDER` / `DETAIL_SECTION_ORDER` のプレフィックス sort を撤去。
- **3セクションを明示配列でレイアウト**（順序の唯一の源）:
  - ①開発メトリクス: `dora-metrics`（数値+前週比）→ `pr-timeline` → `flow-analyst`（AI: その数字に効いた PR / 問い）
  - ②開発内容の要約: `project-progress` → `follow-up` → 来週確認（open PR; 当面は follow-up の AI 内に内包 or dev-prism-summary の open 系データを利用）
  - ③PR レビュー: `review-correlation` → `review-balance`（AI）
- **固定タイトルを render が所有**: 各 AI セクションは `<h2>{title}</h2>` を render が被せ、本文（見出し無し markdown）を流す。`renderMarkdownSection` を title 受け取り型に。
- **dora + dev-prism-summary の責務（レビュー反映で確定）**:
  - **数値の唯一の源 = `dora-metrics`(metric-cards)**。WIP が既に dev-prism-summary から metric-grid を撤去済みなので、リードタイム数値の二重表示は構造的に解消済み。Phase 3 は**metric-grid を再追加しない**ことを担保するだけ。
  - **`dev-prism-summary` = 候補リスト（closed=効いた PR / open=来週確認）のデータ表示**。AI（flow-analyst / follow-up）は同じ PR 群に**散文の解釈**を足す役割で、リストの実体は決定的な dev-prism-summary が持つ（AI 依存を増やさない）。
  - `analystComment` が散文中にリードタイム中央値を再掲する点は許容（カードの数字ではなく解釈）。
- **テスト（レビュー反映）**: `report.test.ts`（空配列ヘッダ）に加え **`src/report/frozen-report.test.ts:57-66`** を必ず更新対象に。`frozen-report.ts:14,149` が `renderReportHtml` を共有するため、レイアウト変更で `<script src>`/`<link href>` のアサーションが壊れうる。`page-styles.ts` のセクション関連クラスも調整。

**着地条件**: typecheck + tests green。demo 生成で3セクション構成を目視。

### Phase 4 — 仕上げ・デモ確認・ドキュメント同期

- プロンプト本文を新セクション見出し/役割に整合（flow-analyst は「その数字に効いた PR + 問い」、follow-up は議論 PR を内包、review-balance 新設）。
- `npm run demo` で `docs/demo` を再生成し目視。
- 全 green 最終確認（typecheck + tests）。
- ADR 0001/0002 のステータス節に実装済みを追記。glossary 整合確認。

## リスク・要確認

1. **base ブランチ未保持**: 「デフォルトブランチへのマージ」を厳密には測れない。Phase 1 は「マージ数」と正直表示で回避。
2. **DORA の in-memory/SQL 二重実装**: `query.ts` も同時に Revert 化しないと parity が**サイレントに崩れる**（`query.test.ts` はラベル経路を通すため検出されない）。Phase 1 で両方直す。
3. **frozen-report が renderer を共有**: `frozen-report.ts` が `renderReportHtml` を再利用。Phase 3 の render 改変は `frozen-report.test.ts` を壊す。フェーズ内で更新。
4. **方式C の build 連鎖**: `prebuild` 連鎖は Dockerfile が `scripts/` 非 COPY のため壊れる。生成を build から分離し `generated.ts` をコミット（src 配下→tsc 同梱）。ドリフトテストで同期担保。
5. **generated.ts のコミット**: tsx 経路（test/dev）参照のためコミット必須。
6. **Phase 2/3 の id 依存**: Phase 2 で id 改名後も render が壊れないこと（描画は全 markdown を出すため順序のみ影響）を担保。テストはフェーズ内で追従。
7. **コミット規約**: `Co-Authored-By: Claude` や `Generated with Claude Code` を含めない（プロジェクト規約）。
