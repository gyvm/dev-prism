## 全体進捗

週全体は、フロントエンド基盤刷新と認証・オンボーディング・決済の主要改修を進めつつ、障害復旧と運用監視の強化を同時に進めた。

### フロントエンド開発基盤の刷新
WebpackからViteへ全面移行し、テスト基盤もVitestへ移行してビルド高速化と設定整理を進め、レビュー指摘に対応して「LEGACY_BUILD」フラグも追加した。あわせてReact 19へのアップグレードを完了し、依存関係を更新した。  
関連PR: [acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502), [acme-corp/web-app#300](https://github.com/acme-corp/web-app/pull/300)

### 認証とAPI防御の強化
セッションCookieをJWTへ移行し、リフレッシュトークンのローテーションと `/auth/refresh` を実装して認証基盤を更新した。加えてRedisベースのスライディングウィンドウ型レート制限を公開APIに導入し、OAuth 2.0 PKCEの利用手順もドキュメント化した。  
関連PR: [acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504), [acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202), [acme-corp/api-server#301](https://github.com/acme-corp/api-server/pull/301)

### オンボーディングフローの再設計
オンボーディングを4ステップ構成に再編し、`pending/active/complete/skipped` を持つ状態機械へ置き換えた。レビュー指摘に対応してチーム招待API失敗時の指数バックオフ再試行、3回失敗後のスキップ導線、ステップ遷移分析イベントを追加した。  
関連PR: [acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507)

### 決済領域の基盤整備
分散していた支払い処理をPaymentServiceへ集約し、Stripeエラー処理の責務をサービス層へ移して呼び出し側を簡素化した。並行してStripe Checkout/BillingとWebhook実装が進み、チェックアウト統合テストで主要フローの検証範囲を拡張した。  
関連PR: [acme-corp/web-app#55](https://github.com/acme-corp/web-app/pull/55), [acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506), [acme-corp/web-app#302](https://github.com/acme-corp/web-app/pull/302)

### 運用安定化と可観測性の強化
SSEベースのシステムヘルスダッシュボードを追加し、CPU・メモリ・遅延・エラー率の集約と7日保持のクリーンアップジョブを導入した。あわせて本番ビルド失敗のENV不足修正と、障害化したデプロイ設定の緊急リバートで復旧対応を実施した。  
関連PR: [acme-corp/api-server#88](https://github.com/acme-corp/api-server/pull/88), [acme-corp/api-server#503](https://github.com/acme-corp/api-server/pull/503), [acme-corp/cli-tools#500](https://github.com/acme-corp/cli-tools/pull/500)

### UI/UX改善
設定画面にダークモード切替を追加し、ローカル保存とCSSカスタムプロパティ適用まで実装した。ログイン失敗後にボタンが復帰しない不具合も修正し、再試行できる導線に改善した。  
関連PR: [acme-corp/web-app#501](https://github.com/acme-corp/web-app/pull/501), [acme-corp/web-app#101](https://github.com/acme-corp/web-app/pull/101)
