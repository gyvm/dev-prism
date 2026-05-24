## フォローアップが必要なPR

対象条件: PR本文・コメント・レビューに、未対応TODO、別PR/後続チケット、未解決レビュー、延期された実装、または後続リファクタの明示的な根拠があるもの。

### 📌 TODO（明示された後続アクション）
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)** — JWT有効期限の環境変数化と、ログアウト後トークン無効化（blocklist）を後続で実装。根拠: 未解決スレッドで「Will address in a follow-up PR to keep this diff focused.」「Need a token blocklist for that. Tracking in issue #510.」と明記。
- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)** — REST置き換えではなく併存前提のGraphQL導入方針をRFCとして起票。根拠: PRコメントで「I'll open a separate RFC for the opt-in GraphQL endpoint approach. Closing this PR.」と明記。
- **[acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506)** — セキュリティ・バックエンド・フロントエンド観点のレビュー対応を進める。根拠: PR本文に「Needs review from alice (security), bob (backend), carol (frontend).」と明記。

### ❓ 要確認（対応の有無が不明）
- **[acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202)** — Redis依存のデプロイ文書追記が完了済みか確認。根拠: レビューで「Worth noting the Redis dependency in the deployment docs.」と指摘がある一方、対応完了の記述がない。
