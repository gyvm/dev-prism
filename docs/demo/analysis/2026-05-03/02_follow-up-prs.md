## フォローアップが必要なPR

対象条件: PR本文・コメント・レビューに、未対応TODO、別PR/後続チケット、未解決レビュー、延期された実装、または後続リファクタの明示的な根拠があるもの。

### 📌 TODO（明示された後続アクション）
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)** — JWT有効期限の環境変数化と、ログアウト時のトークン無効化（ブロックリスト）を後続で実装する。根拠: 未解決スレッドで「Token expiry should be configurable via environment variable, not hardcoded to 15m.」への返答として「Will address in a follow-up PR」と明言し、別スレッドでも「Need a token blocklist for that. Tracking in issue #510.」と記載。
- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)** — REST置換ではなく併存前提のGraphQL方針をRFCとして再提案する。根拠: 作者コメントで「I'll open a separate RFC for the opt-in GraphQL endpoint approach. Closing this PR.」と明示。
- **[acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506)** — セキュリティ・バックエンド・フロントエンドの担当レビューを完了させる。根拠: PR本文に「Needs review from alice (security), bob (backend), carol (frontend).」とあり、レビューが未提出。

### ❓ 要確認（対応の有無が不明）
- **[acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202)** — Redis依存のデプロイ文書追記が実施済みか確認する。根拠: レビューで「Worth noting the Redis dependency in the deployment docs.」と指摘がある一方、本文・コメント上に対応完了の記載がない。
