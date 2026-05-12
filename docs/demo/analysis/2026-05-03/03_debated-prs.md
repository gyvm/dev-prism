## 議論があったPR

対象条件: 実装方針、設計トレードオフ、レビューでの反対意見、要求変更、または方向転換がコメント・レビュー上で確認できるもの。

- **[acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502)**: Webpack全面撤去方針に対し「1リリースは旧構成をフラグで残すべき」という互換性の議論。結果: `LEGACY_BUILD` フラグ追加後に承認。根拠: Carolが `CHANGES_REQUESTED` で要求し、その後「LEGACY_BUILD flag」対応を確認して `APPROVED`。
- **[acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507)**: オンボーディングの状態遷移定義と障害時リカバリー設計が争点。結果: 状態遷移の明確化、招待API失敗時の再試行とスキップ導入、分析イベント追加で承認。根拠: Bobの複数回 `CHANGES_REQUESTED` と Carol の同調コメントの後、修正報告コメントと最終 `APPROVED` がある。
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)**: セッション廃止後のJWT運用で「refreshフロー必須」と「失効・期限設定の扱い」が議論。結果: `/auth/refresh` とローテーション方針の追加で承認、期限の環境変数化とログアウト時失効は別対応に持ち越し。根拠: Aliceの `CHANGES_REQUESTED` 後に修正コミット `fix504a` `fix504b` と `APPROVED`、スレッドで issue #510 追跡が明示。
- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)**: RESTを全面置換するGraphQL移行案に対し、互換性維持と段階移行を求める反対意見。結果: 置換案は採用されずクローズされ、追加導入RFCへ方針転換。根拠: Aliceの `CHANGES_REQUESTED` と Bob/Dave のリスク指摘に対し、作者が「別RFCを開く」とコメントしてPRを閉じている。
