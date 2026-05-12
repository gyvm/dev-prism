## 全体進捗

週全体は、フロントエンド基盤の大規模刷新と認証・決済・運用領域の機能強化を同時に進め、高リスク提案は方針見直しで収束させた。

### フロントエンド開発基盤の刷新
Webpack から Vite への全面移行でビルド時間を「4分10秒→18秒」まで短縮し、レビュー指摘に対応して `LEGACY_BUILD` フラグで旧ビルドを1サイクル併存可能にした。あわせて React 19 へ更新し、依存関係を追従させた。  
関連PR: [acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502), [acme-corp/web-app#300](https://github.com/acme-corp/web-app/pull/300)

### ユーザー体験フローの改善
オンボーディングを4段ステップへ再設計し、状態遷移の明確化に加えて招待API失敗時の指数バックオフ再試行とスキップ導線、ステップ遷移分析を追加した。設定画面のダークモード導入と、認証失敗後にログインボタンが復帰しない不具合も解消した。  
関連PR: [acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507), [acme-corp/web-app#501](https://github.com/acme-corp/web-app/pull/501), [acme-corp/web-app#101](https://github.com/acme-corp/web-app/pull/101)

### 認証と公開API保護の強化
Session Cookie を JWT（15分/7日）へ移行し、レビュー要求に応えて refresh エンドポイントとローテーション方針を実装・文書化した。加えて Redis ベースのスライディングウィンドウ型レート制限を公開APIへ適用し、OAuth 2.0 PKCEガイドを更新した。  
関連PR: [acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504), [acme-corp/api-server#202](https://github.com/acme-corp/api-server/pull/202), [acme-corp/api-server#301](https://github.com/acme-corp/api-server/pull/301)

### 決済ドメインの基盤化と実装前進
分散していた決済処理を PaymentService に集約して呼び出し側の責務を削減し、エラーハンドリングもサービス層へ統合した。チェックアウトE2Eテストを追加して回帰を抑えつつ、Stripe Checkout/Billing と webhook 実装はレビュー待ちまで到達した。  
関連PR: [acme-corp/web-app#55](https://github.com/acme-corp/web-app/pull/55), [acme-corp/web-app#302](https://github.com/acme-corp/web-app/pull/302), [acme-corp/web-app#506](https://github.com/acme-corp/web-app/pull/506)

### 可観測性と本番安定化
SSE配信のシステムヘルスダッシュボードを追加し、CPU・メモリ・遅延・エラー率の集約と7日保持のクリーンアップ運用を導入した。あわせてステージング障害のデプロイ設定ロールバックと、本番Docker起動失敗のENV不足修正を短時間で収束した。  
関連PR: [acme-corp/api-server#88](https://github.com/acme-corp/api-server/pull/88), [acme-corp/cli-tools#500](https://github.com/acme-corp/cli-tools/pull/500), [acme-corp/api-server#503](https://github.com/acme-corp/api-server/pull/503)

### API進化方針の整理
REST全面置換のGraphQL移行案は、既存クライアント影響と移行戦略不足が指摘されクローズされた。代替として、REST併存の段階導入を前提にRFC化する方向へ合意した。  
関連PR: [acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)
