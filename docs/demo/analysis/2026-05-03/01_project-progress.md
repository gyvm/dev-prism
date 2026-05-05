## 全体進捗

週全体は、フロントエンド基盤刷新と認証・決済・オンボーディングの機能強化を進めつつ、運用安定化の即応とAPI移行方針の整理まで前進した。

### フロントエンド基盤の刷新
フロントエンドはWebpack 5からVite 6へ全面移行し、ビルド時間を4分10秒から18秒まで短縮したうえで、環境変数・動的import・エイリアス・CI/Storybook/Test基盤まで置き換えた。あわせてReact 19へのアップグレードも完了した。  
関連PR: [acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502), [acme-corp/web-app#300](https://github.com/acme-corp/web-app/pull/300)

### オンボーディングフローの再設計
オンボーディングは「account setup→team invite→workspace config→tutorial」の新フローへ再設計し、ステップ状態を `pending/active/complete/skipped` で明示化した。レビュー指摘を受けて、team invite失敗時の指数バックオフ再試行（最大3回）とスキップ導線、遷移分析イベントを追加した。  
関連PR: [acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507)

### 認証・API保護の強化
認証はセッションCookieからJWT（15分アクセストークン/7日リフレッシュ）へ移行し、リフレッシュエンドポイントとローテーション方針の実装・文書化まで完了した。公開APIにはRedisベースのスライディングウィンドウ型レート制限を導入し、超過時429とRetry-Afterを返す運用にした。  
関連PR: [acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504), [acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202), [acme-corp/api-server#301](https://github.com/acme-corp/api-server/pull/301)

### 決済領域の整備と拡張着手
既存の分散していた決済処理をPaymentServiceへ集約し、呼び出し側に漏れていたStripeエラー処理もサービス層へ移して保守性を上げた。さらにStripe Checkout/BillingとWebhook対応の実装を進め、レビュー待ちの状態まで到達した。  
関連PR: [acme-corp/web-app#55](https://github.com/acme-corp/web-app/pull/55), [acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506), [acme-corp/web-app#302](https://github.com/acme-corp/web-app/pull/302)

### 運用安定化と可観測性の改善
CPU・メモリ・レイテンシ・エラー率をSSE配信するリアルタイムメトリクスダッシュボードを追加し、7日保持のクリーンアップジョブも組み込んだ。あわせて、ステージング停止を招いたデプロイ設定の緊急リバートと、本番Docker起動不全の環境変数欠落修正を短時間で反映した。  
関連PR: [acme-corp/api-server#88](https://github.com/acme-corp/api-server/pull/88), [acme-corp/cli-tools#500](https://github.com/acme-corp/cli-tools/pull/500), [acme-corp/api-server#503](https://github.com/acme-corp/api-server/pull/503)

### UX改善とAPI移行方針の整理
ユーザー向けには設定画面のダークモード追加と、認証失敗後にログインボタンが復帰しない不具合の修正を反映した。一方でREST全廃を前提にしたGraphQL全面移行案はクローズし、段階移行のRFCへ方針転換した。  
関連PR: [acme-corp/web-app#501](https://github.com/acme-corp/web-app/pull/501), [acme-corp/web-app#101](https://github.com/acme-corp/web-app/pull/101), [acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)
