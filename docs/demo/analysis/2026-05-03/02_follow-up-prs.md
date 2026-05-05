## フォローアップが必要なPR

対象条件: PR本文・コメント・レビューに、未対応TODO、別PR/後続チケット、未解決レビュー、延期された実装、または後続リファクタの明示的な根拠があるもの。

### 📌 TODO（明示された後続アクション）
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)** — JWT有効期限の環境変数化と、ログアウト時のトークン無効化（ブロックリスト）を後続対応する。根拠: 未解決スレッドで「Will address in a follow-up PR to keep this diff focused.」「Need a token blocklist for that. Tracking in issue #510.」と明記。
- **[acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506)** — セキュリティ・バックエンド・フロントエンド観点のレビュー対応を進める。根拠: PR本文に「Needs review from alice (security), bob (backend), carol (frontend).」と記載。

### 🔍 NOTE（関連Issue・参考情報）
- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)** — REST全面置換案は取り下げ、併存型GraphQLを別RFCで検討する方針。根拠: コメントで「I'll open a separate RFC for the opt-in GraphQL endpoint approach. Closing this PR.」と記載。

### ❓ 要確認（対応の有無が不明）
- **[acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202)** — Redis依存のデプロイメントドキュメント追記が完了しているか確認が必要。根拠: レビューで「Worth noting the Redis dependency in the deployment docs.」と指摘がある一方、対応完了の記述はない。
