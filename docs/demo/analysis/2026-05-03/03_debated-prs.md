## 議論があったPR

対象条件: 実装方針、設計トレードオフ、レビューでの反対意見、要求変更、または方向転換がコメント・レビュー上で確認できるもの。

- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)**: RESTを全面廃止してGraphQLへ置換する方針の是非が議論され、互換性と移行期間の設計が争点になった。結果: 全面置換案はクローズされ、GraphQLは併存導入を前提に別RFCへ方向転換。根拠: 変更要求で「既存クライアント破壊リスク」と「移行戦略不足」が指摘され、作者コメントで「別RFCを開くため本PRを閉じる」と明示された。
- **[acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507)**: オンボーディングのステップ状態遷移定義と、チーム招待API失敗時の回復戦略が複数回の変更要求で議論された。結果: 状態機械の明確化に加え、最大3回リトライと失敗後のskipフォールバック、遷移分析イベント追加で承認。根拠: Bobの2回の「CHANGES_REQUESTED」とCarolの同意コメント後、修正報告コメントと最終承認が記録されている。
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)**: セッションCookieからJWTへ移行する際のリフレッシュ運用と有効期限・失効ポリシーの扱いが議論された。結果: `/auth/refresh` とローテーション方針の追加で承認された一方、TTLの環境変数化とログアウト時失効は別対応に持ち越し。根拠: Aliceの変更要求後に承認へ転じ、レビューThreadで「follow-up PR」「issue #510」への切り分けが明記されている。
- **[acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502)**: WebpackからViteへの全面移行に対し、移行直後の安全策として旧ビルド系統を一時保持すべきかが議論された。結果: `LEGACY_BUILD` フラグで旧経路を1リリース併存させる方針で合意し承認。根拠: Carolの変更要求コメント後に「LEGACY_BUILD flag」への謝意付き承認が付き、該当修正コミットも追加されている。
