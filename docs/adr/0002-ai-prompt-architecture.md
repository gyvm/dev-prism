# ADR 0002: AI プロンプトの実装アーキテクチャ（スキル発見の廃止・埋め込み・明示レジストリ）

- ステータス: Accepted
- 日付: 2026-06-22
- 決定方法: grilling（壁打ち）で確定
- スコープ: Node/Copilot パイプラインの AI プロンプト実行のみ。Claude Code 配布面（`commands/`+`agents/`、未実装）は対象外。
- 関連: [ADR 0001](0001-frozen-report-information-architecture.md)、[[product-direction-config]]、[[frontend-direction]]、`src/pipeline/ai-runner.ts`、`src/pipeline/stages/analyze.ts`、`src/pipeline/stages/render.tsx`

## コンテキスト

現状の AI セクションは **Copilot Skill 発見機構**に依存している。

- プロンプトは `skills/0N_name/SKILL.md` に存在。
- `discoverAiSkillIds()` が **FS を走査**して `SKILL.md` を持つディレクトリを発見、**`0N_` プレフィックスで sort** ＝ 実行/表示順。
- 実行は Copilot SDK に `skillDirectories` を渡し、`Use the "{skillId}" skill` という間接指示で **Copilot 側がスキル本文をロード**する。**プロンプト本文をアプリコードは一切読んでいない。**

### 問題

1. **配布で AI が黙死している。** `Dockerfile` は `src` / `dist` を積むが `skills/` を積まない。公開 Docker Action では `skills/` が存在せず `discoverAiSkillIds("skills")` が空配列 → AI 分析が丸ごとスキップされる。
2. **拡張性が製品方針と矛盾。** スキルを足せば分析が増える設計だが、ターゲットは「設定もプロンプトも書きたくない人」（[[product-direction-config]]）。ユーザー拡張は不要。
3. **`0N_` プレフィックスが順序を担っている。** ファイル名で順序を表現しているため、ADR 0001 の「数字 → 理由 → チャート」交互配置（compute と AI を跨ぐ）が表現できない。
4. **間接層が無駄。** `Use the "X" skill` を介して Copilot にロードさせる必要がない。

## 決定

### 1. プロンプトはアプリ側が全文を直接送る（スキル発見の廃止）

- AI 実行は **プロンプト全文をアプリが組み立てて SDK に直接送る**。`skillDirectories` と `Use the "X" skill` 間接層を**撤去**。Copilot SDK は「ただの LLM 呼び出し」に降格。
- `AiRunnerInput` を `{ skillId, payload }` → `{ id, prompt, payload }`（プロンプト本文を含む）へ変更。`createCopilotSdkRunner` から `skillDirectories` オプションを削除。
- ユーザーによるプロンプト拡張は廃止（built-in 固定セット）。

### 2. プロンプトは `.md` で著し、ビルドで埋め込む（方式C）

- 著者体験のため **1プロンプト = 1 `.md` ファイル**（`src/prompts/*.md`）。
- **コード生成で文字列化し、生成物 `src/prompts/generated.ts` を `src/` 配下にコミットする**（`export const PROMPTS`）。tsc が src からコンパイルし `dist` に同梱されるため、**`Dockerfile` も `prebuild` も変更不要**。
  - 生成は `build` ライフサイクルに連鎖させない（独立 `gen:prompts` スクリプト）。理由: `Dockerfile` は `scripts/` を COPY しないため `prebuild` 連鎖は ENOENT で壊れる。
  - コミット済み `generated.ts` の同期は**ドリフト検出テスト**（ジェネレータをメモリ実行し一致を assert）で担保。
- 結果：**実行時 FS アクセスゼロ・必ず `dist` に同梱**。`Dockerfile` の `skills/` 非同梱問題が構造的に消える。
- 注意：`build` は `tsc` のみで `.md` を `dist` にコピーしないため、**生の `.md` を実行時に読む方式（F）は採らない**（コピー漏れ＝再び黙死するため）。`generated.ts` をコミットするのは tsx（test/dev）経路でも参照するため。

### 3. 発見を明示レジストリへ置換（`0N_` プレフィックス廃止）

- `discoverAiSkillIds()` の FS 走査＋プレフィックス sort を撤去。
- **`AI_REGISTRY`** を新設（`COMPUTE_REGISTRY` と同型の明示的マップ）。compute と AI で **レジストリは2本のまま**（型を混ぜない・最小差分）。`analyze.ts` の `[...Object.keys(COMPUTE_REGISTRY), ...aiSkillIds]` を `...Object.keys(AI_REGISTRY)` に差し替え。
- id から `0N_` プレフィックスを除去（`00_flow-analyst` → `flow-analyst` 等）。

### 4. 「存在」と「順序」の分離

- **レジストリ＝何が存在するか（カタログ）。順序は持たない。**
- **`render.tsx`＝順序。** ADR 0001 の3セクションに id を名指しで並べた**明示的配列**が唯一の順序の源。compute と AI を跨いで交互配置するため、レジストリでは表現できない。
- `AI_SECTION_ORDER` / `DETAIL_SECTION_ORDER` のプレフィックス sort を廃止。
- レポートの並びを変える時は **`render.tsx` の配列1箇所**だけを編集する。

```
セクション①開発メトリクス:  [dora-metrics, pr-timeline, flow-analyst]
セクション②開発内容の要約:  [project-progress, follow-up, 来週確認]
セクション③PRレビュー:      [review-correlation, review-balance]
```

### 5. タイトルは固定・render が所有

- セクション見出しは **`render.tsx`（または `AI_REGISTRY` の `title`）が所有**し、`<h2>{title}</h2>` を被せる。
- プロンプト本文は**見出し無しの本体だけ**を返す。「必ず `## Flow Analyst` で始める」契約は廃止。

## 影響を受けるファイル

| ファイル | 変更 |
|---|---|
| `src/prompts/*.md`（新規） | プロンプト本文（見出し無し本体）。id 改名（ADR 0001 準拠：`flow-analyst` / `project-progress` / `follow-up`〔debated 統合〕/ `review-balance`〔新規〕）。 |
| ビルド（`package.json` / 新 codegen or esbuild） | `.md` を文字列に埋め込むステップ。 |
| `src/analyses/ai/registry.ts`（新規） | `AI_REGISTRY`（id → `{ title, prompt }`）。 |
| `src/pipeline/ai-runner.ts` | `skillDirectories` 撤去。`AiRunnerInput` を `{ id, prompt, payload }` 化。プロンプト全文を直接送信。 |
| `src/pipeline/stages/analyze.ts` | `discoverAiSkillIds` 撤去。`AI_REGISTRY` から実行。`runAiAnalysis` がレジストリのプロンプトを渡す。 |
| `src/pipeline/orchestrate.ts` | `skillsRoot` / `discoverAiSkillIds` / `skillDirectories` 配線を撤去。 |
| `src/cli/report.ts` | `--skills` / `skillsRoot` オプション撤去。 |
| `src/pipeline/stages/render.tsx` | 3セクションの明示レイアウト。固定タイトル。プレフィックス sort 廃止。 |
| `skills/`（削除） | ディレクトリごと撤去。 |
| `Dockerfile` | 追加対応不要（プロンプトが `dist` に埋め込まれるため自動解決）。 |

## 旧成果物の扱い

- 過去レポートの分析 JSON/md（凍結・コミット済み、[[frontend-direction]]）は**無視**。AI md は再生成不可なので旧ファイル名のまま残るが問題なし。新レポートから新 id を使う。**v0.1.0 の破壊的変更として受容・移行なし**（[[product-direction-config]]）。

## 選択肢と却下理由

- **生 `.md` を実行時に読む（方式F）** — `tsc` が `.md` を運ばず、コピー漏れで Action が再び黙死するため却下。
- **compute と AI を1つの統合レジストリ（タグ付きユニオン）に統合** — 可能だが型が混ざる。2本維持の方が最小差分かつ型が綺麗なため却下。
- **Copilot スキル発見を維持し Dockerfile に `skills/` を COPY 追加するだけ** — 拡張性が製品方針と矛盾し、間接層も残るため却下。
