## 全体進捗

週全体は、開発基盤の刷新と主要ユーザーフローの強化を進めながら、決済導入・運用安定化・API方針整理を同時に前進させた。

### フロントエンド基盤刷新
Webフロントは Webpack から Vite へ全面移行し、レビュー対応として LEGACY_BUILD フラグで移行期間の後方互換を確保した。あわせて React 19 へ更新し、ビルドと依存関係の更新を完了した。  
関連PR: [acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502), [acme-corp/web-app#300](https://github.com/acme-corp/web-app/pull/300)

### ユーザー導線の改善
オンボーディングは4ステップ構成へ再設計し、状態機械・再試行・スキップフォールバック・遷移分析を追加して途中離脱しにくい流れにした。設定画面にはダークモード切替と永続化を導入し、体験の選択性を広げた。  
関連PR: [acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507), [acme-corp/web-app#501](https://github.com/acme-corp/web-app/pull/501)

### 認証とAPI保護の強化
API認証はセッションCookieからJWTへ移行し、refreshエンドポイントとローテーション方針を実装した。公開APIにはRedisベースのスライディングウィンドウ制限を適用し、過負荷時に429とRetry-Afterを返す防御を追加した。  
関連PR: [acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504), [acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202), [acme-corp/api-server#301](https://github.com/acme-corp/api-server/pull/301)

### 決済機能の実装前進
分散していた決済ロジックを PaymentService に集約し、呼び出し側からStripe固有のエラー処理を分離した。Stripe Checkout/Billing とWebhookを含む統合実装は起票され、レビュー投入可能な状態まで進んだ。  
関連PR: [acme-corp/web-app#55](https://github.com/acme-corp/web-app/pull/55), [acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506), [acme-corp/web-app#302](https://github.com/acme-corp/web-app/pull/302)

### 運用安定化と障害対応
システムヘルスメトリクスのSSEダッシュボードと7日保持のクリーンアップジョブを追加し、監視運用を強化した。本番ENV不足の起動障害修正と壊れたデプロイ設定の緊急リバートで、停止リスクを短時間で解消した。  
関連PR: [acme-corp/api-server#88](https://github.com/acme-corp/api-server/pull/88), [acme-corp/api-server#503](https://github.com/acme-corp/api-server/pull/503), [acme-corp/cli-tools#500](https://github.com/acme-corp/cli-tools/pull/500)

### API進化方針の収束
REST全面置換のGraphQL提案は、既存クライアントへの破壊的影響と移行計画不足がレビューで指摘され、クローズされた。結論として、REST併存の段階導入を別RFCで検討する方向が明確になった。  
関連PR: [acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)
