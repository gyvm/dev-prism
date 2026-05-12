## 議論があったPR

対象条件: 実装方針、設計トレードオフ、レビューでの反対意見、要求変更、または方向転換がコメント・レビュー上で確認できるもの。

- **[acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502)**: Webpack完全撤廃を進める方針に対し、「1リリースは旧ビルドを残すべきか」が論点になった。結果: 「LEGACY_BUILD」フラグ付きで互換運用に変更され、根拠: 4/30の `CHANGES_REQUESTED` 後に「keep legacy webpack config behind LEGACY_BUILD flag」コミットが追加され、5/3に `APPROVED` へ転じた。  
- **[acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507)**: オンボーディングのステップ状態遷移（complete/skippedの定義）と、チーム招待API失敗時の復旧方針が繰り返し議論された。結果: 状態機械の明確化に加えて再試行+スキップ fallback と遷移分析イベントが実装され、根拠: 複数回の `CHANGES_REQUESTED` と「wizard gets stuck」指摘の後に修正コメント・関連コミットが入り最終 `APPROVED` となった。  
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)**: セッションCookie廃止後のJWT運用で、回転ロジック必須化と有効期限・失効戦略の扱いが論点になった。結果: `/auth/refresh` と回転方針の文書化は反映されたが一部は未確認で、根拠: `CHANGES_REQUESTED` を受けて修正後に承認された一方、スレッドでTTL環境変数化やログアウト時無効化は「follow-up PR」「issue #510」へ持ち越しと記録されている。  
- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)**: RESTをGraphQLへ全面置換する提案に対し、既存クライアント互換性と移行期間の設計トレードオフが争点になった。結果: 全面置換案は取り下げられて方向転換し、根拠: `CHANGES_REQUESTED` と追加コメントで「併存導入+段階移行」案が支持され、最終的に提案者が「別RFCを出す」としてPRをクローズした。
