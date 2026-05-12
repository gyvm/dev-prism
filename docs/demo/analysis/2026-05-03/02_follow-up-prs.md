## フォローアップが必要なPR

対象条件: PR本文・コメント・レビューに、未対応TODO、別PR/後続チケット、未解決レビュー、延期された実装、または後続リファクタの明示的な根拠があるもの。

### 📌 TODO（明示された後続アクション）
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)** — JWT有効期限の環境変数化と、ログアウト後トークン無効化（ブロックリスト）の後続対応。根拠: 未解決スレッドで「Token expiry should be configurable via environment variable」と指摘があり、作者が「Will address in a follow-up PR」、別スレッドでも「Need a token blocklist for that. Tracking in issue #510.」と明言。
- **[acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506)** — セキュリティ・バックエンド・フロントエンド観点のレビュー実施とマージ判断。根拠: PR本文に「Needs review from alice (security), bob (backend), carol (frontend).」とあり、レビューがまだ付いていない。
- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)** — REST置換ではなく併存前提のGraphQL導入方針をRFCとして整理する。根拠: クローズ時コメントで「I'll open a separate RFC for the opt-in GraphQL endpoint approach.」と明記。

### ❓ 要確認（対応の有無が不明）
- **[acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202)** — Redis依存のデプロイ文書追記が別PRで対応済みか確認。根拠: レビューコメントに「Worth noting the Redis dependency in the deployment docs.」があるが、このPR内で対応完了の記述はない。
