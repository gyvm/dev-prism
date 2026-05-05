## 議論があったPR

対象条件: 実装方針、設計トレードオフ、レビューでの反対意見、要求変更、または方向転換がコメント・レビュー上で確認できるもの。

- **[acme-corp/api-server#508](https://github.com/acme-corp/api-server/pull/508)**: REST全面置換か、RESTを維持した段階的なGraphQL導入かで方針が分かれた。結果: 全面置換案は取り下げられ、別RFCで「併設アプローチ」を検討する方向に転換。根拠: CHANGES_REQUESTEDで互換性と移行期間が要求され、PRコメントでも「/graphqlを追加して移行期間を設けるべき」と合意され、作者がクローズ宣言。
- **[acme-corp/api-server#507](https://github.com/acme-corp/api-server/pull/507)**: オンボーディングのステップ状態遷移定義と、team invite失敗時の復旧戦略が争点になった。結果: 状態機械の明確化に加えて、指数バックオフ再試行と3回失敗後のskipフォールバックが追加されて承認。根拠: Bobの2回のCHANGES_REQUESTEDとCarolの補足コメント後、修正報告コメントと最終APPROVEDが記録。
- **[acme-corp/api-server#504](https://github.com/acme-corp/api-server/pull/504)**: JWT移行で、最低限必要な回転フローをPR内で完結させるか、設定性や失効制御を後続に分けるかが論点になった。結果: refresh endpointと回転ポリシー文書化はPR内で反映された一方、TTL環境変数化とログアウト時失効は後続対応に分離。根拠: CHANGES_REQUESTEDで回転ロジック追加が要求されてAPPROVEDに至り、未解決スレッドで「follow-up PR」「issue #510」が明示。
- **[acme-corp/web-app#502](https://github.com/acme-corp/web-app/pull/502)**: Webpack完全撤去を即時適用するか、移行期間の退避策を残すかが議論された。結果: 「LEGACY_BUILD」フラグで旧ビルドを1サイクル維持する折衷案に変更されて承認。根拠: CHANGES_REQUESTEDでレガシー維持が要求され、fixコミットでフラグ追加とドキュメント化後にAPPROVED。
