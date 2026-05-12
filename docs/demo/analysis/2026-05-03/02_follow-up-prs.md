## フォローアップが必要なPR

対象条件: PR本文・コメント・レビューに、未対応TODO、別PR/後続チケット、未解決レビュー、延期された実装、または後続リファクタの明示的な根拠があるもの。

### 📌 TODO（明示された後続アクション）
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)** — JWT有効期限の環境変数化と、ログアウト時失効に向けたトークンブロックリスト対応を後続で実施。根拠: 未解決スレッドで「Token expiry should be configurable via environment variable, not hardcoded to 15m.」に対して作者が「Will address in a follow-up PR」、別スレッドでも「Need a token blocklist for that. Tracking in issue #510.」と明記。
- **[acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506)** — セキュリティ・バックエンド・フロントエンド観点のレビュー実施。根拠: PR本文に「Needs review from alice (security), bob (backend), carol (frontend).」と明示され、レビューが未提出。
- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)** — REST置換ではなく併存方針でのGraphQL導入案をRFCとして起票。根拠: クローズ時コメントで作者が「I'll open a separate RFC for the opt-in GraphQL endpoint approach. Closing this PR.」と明記。

### ❓ 要確認（対応の有無が不明）
- **[acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202)** — Redis依存のデプロイメントドキュメント追記の要否確認。根拠: レビューで「Worth noting the Redis dependency in the deployment docs.」と指摘があるが、対応完了の記述はPRデータ上で確認できない。
