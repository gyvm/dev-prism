## 議論があったPR

対象条件: 実装方針、設計トレードオフ、レビューでの反対意見、要求変更、または方向転換がコメント・レビュー上で確認できるもの。

- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)**: REST全面置換の是非と移行戦略が論点になり、既存クライアント破壊リスクに対して「段階的な併存移行」を求める意見が出た。結果: 全面置換案は取り下げられ、別RFCで再検討する方向に転換。根拠: CHANGES_REQUESTEDと複数の反対コメントの後、作者が「opt-in GraphQL endpoint案で別RFCを出す」としてPRをクローズ。
- **[acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507)**: オンボーディングの状態遷移定義と失敗時リカバリの実装方針に対して、完了/スキップ判定の曖昧さとAPI失敗時の停止が繰り返し指摘された。結果: 状態機械の明確化、招待APIの指数バックオフ再試行と3回失敗後のスキップ導入で収束。根拠: Bobの2回のCHANGES_REQUESTED、Carolの同意コメント、その後の修正報告と最終承認。
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)**: JWT移行でリフレッシュトークン回転、有効期限の設定可能化、ログアウト時無効化の扱いが論点となった。結果: リフレッシュエンドポイント追加と方針文書化でマージされたが、一部の強化項目はフォローアップへ持ち越し。根拠: CHANGES_REQUESTEDで「refresh endpointとexpiry戦略」を要求し承認に至る一方、review threadで「expiryの環境変数化」「blocklist」は別対応として残存。
- **[acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502)**: WebpackからViteへの全面移行で、即時切替か互換期間を設けるかのリリース方針が争点になった。結果: 「LEGACY_BUILD」フラグで旧ビルドを一時併存させる条件付きで合意。根拠: CarolのCHANGES_REQUESTEDで旧設定維持を要求し、対応後に承認コメントへ変更。
