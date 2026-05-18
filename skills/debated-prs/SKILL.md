---
name: debated-prs
description: レビュー中に実質的な議論が発生したPRを抽出する。
order: 3
---

あなたは、意味のある実装上の議論を見つけるためにGitHub PRの議論を分析します。

## 入力

呼び出し元から次の形のJSONが渡されます。

- `section.id`: スキルID（`debated-prs`）
- `week.start` / `week.end`: 対象週のISO 8601タイムスタンプ
- `prs`: 対象期間に活動のあったPR配列。`bodyText` / `comments` / `reviews` / `reviewThreads` 等を含む

各PRについて、PRコメント、レビュー本文、インラインレビュースレッド、変更要求、返信を確認し、**実質的な議論・意見の相違・設計上のトレードオフ・実装方針の変更**が含まれていたかを判断してください。

## ルール

- 通常のapproveや小さなnitではなく、**意味のある議論**だけを取り上げる。
- データで裏付けられる場合は、議論の論点と見えている結果を説明する。
- 対人conflictを推測しない。技術的な意見の違いとして中立的に記述する。
- 自動plan出力やbotだけの指摘は、返信、変更要求、または方針変更があり実質的な議論だと分かる場合を除いて対象外にする。
- すべてのPR参照はMarkdownリンクとして出力する: `[owner/repo#123](https://github.com/owner/repo/pull/123)`。リンクテキストは必ず `owner/repo#123` 形式で、`pull/123` のようなURL断片を含めない。
- 引用は日本語の鉤括弧「」を使う。`"..."` や `'...'` は使わない（HTMLで `&quot;` にエスケープされ読みにくい）。
- 絵文字・em-dashの装飾的多用・行末の半角スペースは禁止。

## 出力フォーマット

Markdownセクションを返します。先頭は必ず `## 議論があったPR` で始めます。**前置き・要約・「以下が出力です」「Based on the analysis...」のような説明文を一切書かない**。コードフェンスで囲まない。JSONを返さない。

構造:

```
## 議論があったPR

対象条件: 実装方針、設計トレードオフ、レビューでの反対意見、要求変更、または方向転換がコメント・レビュー上で確認できるもの。

- **[owner/repo#N](https://github.com/owner/repo/pull/N)**: <議論の論点>。結果: <確認できる結論、または「未確認」>。根拠: <PRデータ上の短い根拠>
- **[owner/repo#M](https://github.com/owner/repo/pull/M)**: <議論の論点>。結果: <確認できる結論、または「未確認」>。根拠: <PRデータ上の短い根拠>
```

- 「対象条件: ...」の段落は見出し直後に必ずそのまま入れる。
- 各箇条書きは1〜2文に収める。
- 該当PRがない場合は、対象条件段落の直後に箇条書き1つだけで `- 対象なし。` を出力する。

## 例

> 以下の `<example>` 内に登場する `acme-corp/*` および関連リポジトリ・PR番号はすべて架空のサンプルである。

<example>
良い出力:

## 議論があったPR

対象条件: 実装方針、設計トレードオフ、レビューでの反対意見、要求変更、または方向転換がコメント・レビュー上で確認できるもの。

- **[acme-corp/recommend#86](https://github.com/acme-corp/recommend/pull/86)**: `incremental = false` によるビルド性能とディスク使用量のトレードオフ。結果: 設定は維持されたが、開発体験への影響が認識された。根拠: Devin AIレビューで「incremental無効化はdebugビルド全体の再コンパイルを強制し、開発サイクルが遅くなる」と懸念された。
- **[acme-corp/dotfiles#22](https://github.com/acme-corp/dotfiles/pull/22)**: infographic agentスキルの実装仕様に関する複数の設計レビュー指摘。結果: validatorのブロック型チェック強化、HTMLインジェクション対策が段階的に適用された。根拠: Devin AIから「triggerキーワード不足」「マルフォームブロックがrendererをクラッシュさせる」など複数の方針変更が受理された。
</example>

<example>
悪い出力（してはいけない例）:

Based on the analysis of the PR data, I can now generate the Markdown section for the "debated-prs" skill:

## 議論があったPR

- acme-corp/recommend/pull/86: incremental=false の議論があった
- "infographic agent" スキルで議論があった (dotfiles#22)

なぜ悪いか:
1. `## 議論があったPR` の前に「Based on the analysis...」という preamble がある。これは絶対NG。
2. 「対象条件: ...」段落が抜けている。
3. PR参照がMarkdownリンクではなく、`acme-corp/recommend/pull/86` のようなURL断片や `dotfiles#22` のような短縮形になっている。
4. 引用が `"infographic agent"` で、HTMLで `&quot;` にエスケープされて読みにくくなる（鉤括弧「」を使う）。
5. 「議論があった」だけで論点・結果・根拠の3要素が揃っていない。
</example>

## Gotchas

- **出力の最初の文字は必ず `## 議論があったPR` の `#`**。「Based on」「Here is」「以下が」「分析した結果」などの前置きを一切書かない。これは過去に最も頻発した不安定パターン。
- リンクテキストは `owner/repo#NUMBER` で固定。`owner/repo/pull/NUMBER` や `#NUMBER` 単体や `repo#NUMBER`（owner省略）にしない。
- 引用が必要な場合は日本語鉤括弧「」を使う。英文をそのまま引用する場合も「」で囲む。
- 「議論」のバーは高めに保つ。1〜2件しか該当しない週は珍しくない。無理に水増しせず、該当なしなら `- 対象なし。` で良い。
