# Dev Prism AI分析連携計画

## 目的

Exploreで現在表示している集計結果を、利用者がChatGPT・Codex CLI・Claude Codeなどへ貼り付けられる一般的なMarkdownとして出力する。Dev Prism自身はAI CLI/APIを起動せず、静的サイト構成と既存のDuckDB-WASM集計を維持する。

## 方針

- `Scope`と既存の型付きView Modelから、AI専用の集計コンテキストを生成する。
- MarkdownコピーとWebMCPのread-onlyツールは同じ`AnalysisContext`を利用する。
- PR本文、レビュー本文、コメント本文、PR単位のタイトル・URL・番号、SQL、DWHファイルは出力しない。
- 時系列は最新52バケットまでとし、Markdownは30,000文字以内にする。上限超過時は古い時系列から縮約する。
- `null`は欠損・計算不能として保持し、空データを「問題なし」と解釈しない説明を添える。
- WebMCPはfeature detection付きのprogressive enhancementとし、未対応環境ではコピー機能を利用する。
- 新しいnpm依存、APIキー、サーバー、外部実行環境は追加しない。

## データフロー

1. Exploreが適用済みの`Scope`、現在のView、共有DuckDB-WASM runnerを保持する。
2. `src/ai/analysis-context.ts`がViewに対応する既存query関数を実行する。
3. View Modelから、PR単位の情報を除いた集計専用の`AnalysisContext`を構築する。
4. `src/ai/analysis-prompts.ts`のテンプレートが、`src/ai/analysis-markdown.ts`のformatterでMarkdownを生成する。
5. Explore UIはClipboard APIへコピーし、権限拒否時は読み取り専用textareaを表示する。
6. `document.modelContext`が存在する場合だけ`get_dev_prism_analysis_context`を登録する。

## View別のコンテキスト

| View | 収録する集計 |
|---|---|
| flow | DORA現在値・前期間差分、工程別中央値・件数、工程別推移、PR活動量 |
| review | レビューなし率、レビュー・コメント推移、作成者/レビュアー相関、レビュアー別待ち時間 |
| timeline | 工程別中央値・件数、工程別推移、最大中央値の工程候補 |
| wip | オープンPR数、レビュー待ち数、最古PR年齢、年齢分布 |

`wip`は既存の画面仕様に合わせ、期間フィルターを外して実行時点のスナップショットとして扱う。元の選択値は`requestedScope`に残し、クエリに使った有効Scopeと区別する。

## プロンプトとMarkdown

4種類のテンプレートを型付きレジストリで管理する。

- フロー改善分析
- レビュー遅延・負荷分析
- ステージ別ボトルネック分析
- オープンPR滞留分析

各テンプレートは、入力データだけを根拠にすること、事実・推測・追加確認事項を分けること、データにない原因を断定しないこと、日本語で`要約 / 根拠 / 仮説 / 改善案 / 追加確認事項`を出力することを指示する。

コピー形式は次の固定セクションとする。

```markdown
# Dev Prism AI Analysis

## Analysis request
...

## Scope
...

## Metric definitions
...

## Aggregated data
...

## Limitations
...
```

参照ページURLは既存の`scopeToSearchParams`を使って現在Scopeを再構成する。これにより、表示中の画面とコピー内容のScopeがずれない。

## WebMCP試作

Chrome公式のImperative APIに合わせて、次のread-onlyツールだけを登録する。

```text
get_dev_prism_analysis_context
```

入力は`{ "templateId": "flow | review | timeline | wip" }`のみ許可し、余分なキー、未知のtemplate、任意SQL、ファイルアクセス、状態変更は拒否する。ツールには次のアノテーションを付ける。

```json
{
  "readOnlyHint": true,
  "consequentialHint": false,
  "untrustedContentHint": true
}
```

登録時の`AbortSignal`はReact islandの破棄時にabortし、実行時の`AbortSignal`はキャンセルを伝播する。cross-origin公開設定は使わない。

## 変更ファイル

- `src/ai/analysis-context.ts`: 集計コンテキスト型・生成・縮約
- `src/ai/analysis-prompts.ts`: 4種類のプロンプトレジストリ
- `src/ai/analysis-markdown.ts`: Markdown formatter、エスケープ、文字数制限
- `src/ai/*.test.ts`: コンテキストとformatterの純粋/準純粋関数テスト
- `src/web/islands/ExploreAiActions.tsx`: テンプレート選択、コピー、fallback
- `src/web/islands/Explore.tsx`: 現在Scope、runner、クエリ状態との接続
- `src/web/webmcp.ts`: WebMCP feature detection、登録、入力検証
- `src/web/webmcp.d.ts`: WebMCP最小ambient declaration
- `src/web/shell/explore-styles.ts` / `src/ui/theme.css`: AI操作のスタイル
- `README.md`: 利用方法とデータ境界

## 検証

```bash
npm run typecheck
npm test
npm run web:check
npm run web:build
```
