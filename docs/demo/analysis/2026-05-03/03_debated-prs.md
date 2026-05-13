## 議論があったPR

対象条件: 実装方針、設計トレードオフ、レビューでの反対意見、要求変更、または方向転換がコメント・レビュー上で確認できるもの。

- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)**: REST全面置換の方針に対し、既存クライアント互換性と移行期間をどう扱うかで反対意見が集中した。結果: 置換案はクローズされ、GraphQLを併設する別RFCへ方向転換。根拠: CHANGES_REQUESTEDで互換性リスクが指摘され、PRコメントで併設案へ切り替えてクローズする旨が記録された。
- **[acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507)**: オンボーディングの状態遷移定義と失敗時リカバリ実装で、完了/スキップ判定とタイムアウト時の挙動が争点になった。結果: 明示的な状態機械に加え、3回までの指数バックオフ再試行とスキップ導線を導入して承認。根拠: 2回のCHANGES_REQUESTEDと、その後の修正コメント・承認レビューが確認できる。
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)**: JWT移行で、リフレッシュローテーション必須化と失効戦略の範囲が議論になった。結果: `/auth/refresh` とローテーション方針の追加でマージ、ただし有効期限の環境変数化とログアウト時無効化は未確認。根拠: CHANGES_REQUESTED後に対応コミットで承認へ進んだ一方、レビューThreadで「follow-up PR」と「issue #510」継続が明記された。
- **[acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502)**: Webpack→Vite全面移行に対し、互換性維持のため旧ビルド経路を一定期間残すべきかが論点になった。結果: `LEGACY_BUILD` フラグで旧構成を一時保持する方針が採用され承認。根拠: CHANGES_REQUESTED後に関連fixコミットが追加され、最終レビューで了承された。
