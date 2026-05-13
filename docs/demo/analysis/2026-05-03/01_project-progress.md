## 全体進捗

週全体は、フロントエンド基盤刷新と運用安定化を進めつつ、オンボーディング・認証・決済の主要フローを実装レベルで前進させた。

### フロントエンド開発基盤の刷新
WebアプリはWebpackからViteへの全面移行を完了し、レビュー指摘を受けて「LEGACY_BUILD」退避経路を追加したうえでマージした。あわせてReact 19への更新も完了し、依存関係の近代化を進めた。  
関連PR: [acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502), [acme-corp/web-app#300](https://github.com/acme-corp/web-app/pull/300)

### ユーザー導線の改善
オンボーディングは段階状態を明示したステートマシン化に加え、チーム招待失敗時の指数バックオフ再試行と3回失敗後スキップを導入して完了率低下リスクを下げた。設定画面のダークモード追加と、失敗後に再試行できないログイン不具合の解消も完了した。  
関連PR: [acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507), [acme-corp/web-app#501](https://github.com/acme-corp/web-app/pull/501), [acme-corp/web-app#101](https://github.com/acme-corp/web-app/pull/101)

### 認証とAPI保護の強化
セッションCookieからJWTへ移行し、レビューで求められたリフレッシュトークン回転と `/auth/refresh` を追加して承認に到達した。さらに公開APIにRedisベースのスライディングウィンドウ制限を適用し、OAuth 2.0 PKCE手順のドキュメントも整備した。  
関連PR: [acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504), [acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202), [acme-corp/api-server#301](https://github.com/acme-corp/api-server/pull/301)

### 決済領域の再編と拡張
散在していた決済処理をPaymentServiceへ集約し、呼び出し側の責務を削減した。並行してチェックアウトE2Eテストを追加し、Stripe Checkout/Billing統合PRは実装を積み上げてレビュー待ちまで進んだ。  
関連PR: [acme-corp/web-app#55](https://github.com/acme-corp/web-app/pull/55), [acme-corp/web-app#302](https://github.com/acme-corp/web-app/pull/302), [acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506)

### 監視強化と障害対応の即応
システムヘルスメトリクスのSSEダッシュボードを追加し、7日保持のクリーンアップ方針まで実装して監視運用を強化した。加えて、ステージング停止を招いたデプロイ設定の差し戻しと、本番Docker起動不全を起こす環境変数欠落の緊急修正を短時間で収束させた。  
関連PR: [acme-corp/api-server#88](https://github.com/acme-corp/api-server/pull/88), [acme-corp/cli-tools#500](https://github.com/acme-corp/cli-tools/pull/500), [acme-corp/api-server#503](https://github.com/acme-corp/api-server/pull/503)

### APIアーキテクチャ方針の整理
REST全面置換のGraphQL移行案は、既存クライアント影響と移行戦略不足がレビューで指摘され、置換ではなく併存導入を別RFCで検討する方針に切り替えてクローズした。  
関連PR: [acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)
