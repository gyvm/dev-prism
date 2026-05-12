## 全体進捗

週全体は、開発基盤の刷新と主要機能の実装を進めながら、認証・運用安定化・決済領域の土台を同時に強化した。

### フロントエンド実行基盤の刷新
WebpackからViteへの全面移行を完了し、環境変数・動的import・CI・Storybook・テスト構成まで新ビルド系へ統合した。あわせてReact 19へアップグレードし、チェックアウトE2E追加で回帰検知を強化した。  
関連PR: [acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502), [acme-corp/web-app#300](https://github.com/acme-corp/web-app/pull/300), [acme-corp/web-app#302](https://github.com/acme-corp/web-app/pull/302)

### 認証・API防御の強化
セッションCookieをJWTへ移行し、レビュー指摘を受けてリフレッシュエンドポイント追加とローテーション方針の文書化まで完了した。公開APIにはRedisベースのスライディングウィンドウ制限を導入し、OAuth 2.0 PKCE例を含む認証ガイドも更新した。  
関連PR: [acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504), [acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202), [acme-corp/api-server#301](https://github.com/acme-corp/api-server/pull/301)

### オンボーディングフロー再設計
オンボーディングを段階型フローへ再構成し、`pending/active/complete/skipped` の明示的ステートマシンで遷移条件を整理した。招待API失敗時の指数バックオフ再試行、3回失敗後のスキップ導線、遷移分析イベント追加まで反映した。  
関連PR: [acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507)

### 決済基盤の再編とStripe拡張
散在していた支払い処理をPaymentServiceへ集約し、呼び出し側がStripeエラー詳細を意識しない構成に整理した。これを土台にStripe Checkout/BillingとWebhook実装の大規模PRが立ち上がり、横断レビュー待ちまで進んだ。  
関連PR: [acme-corp/web-app#55](https://github.com/acme-corp/web-app/pull/55), [acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506)

### 可観測性強化と緊急復旧対応
CPU・メモリ・レイテンシ・エラー率をSSE配信するヘルスダッシュボードを追加し、7日保持の自動クリーンアップを導入した。本番DockerfileのENV欠落修正と、ステージング障害を起こしたデプロイ設定の緊急リバートで運用復旧を優先した。  
関連PR: [acme-corp/api-server#88](https://github.com/acme-corp/api-server/pull/88), [acme-corp/api-server#503](https://github.com/acme-corp/api-server/pull/503), [acme-corp/cli-tools#500](https://github.com/acme-corp/cli-tools/pull/500)

### UI改善とAPI移行方針の整理
設定画面にダークモード切替を追加し、localStorage永続化とCSSカスタムプロパティ適用まで実装した。認証失敗後にログインボタンが復帰しない不具合を修正し、REST全面置換のGraphQL提案は互換性リスクを理由にクローズして段階導入RFCへ方針転換した。  
関連PR: [acme-corp/web-app#501](https://github.com/acme-corp/web-app/pull/501), [acme-corp/web-app#101](https://github.com/acme-corp/web-app/pull/101), [acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)
