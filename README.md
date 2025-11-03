# 素人一本 投票集計システム

## プロジェクト概要
- **名前**: 素人一本 (Suppon Ippon) Voting System
- **目的**: IPPONグランプリのような大喜利イベントでの審査員投票をリアルタイムで集計・表示するシステム
- **主な機能**:
  - 5名の審査員がスマホからIPPON投票
  - PC画面でリアルタイム集計表示
  - 3名以上の投票で自動的にIPPON判定・音声再生
  - ラウンドごとのリセット機能

## 公開URL

### サンドボックス環境（開発・テスト用）
- **PC集計画面**: https://3000-ino1fwmbejreorbjcx9b7-02b9cc79.sandbox.novita.ai/
- **審査員1**: https://3000-ino1fwmbejreorbjcx9b7-02b9cc79.sandbox.novita.ai/judge/1
- **審査員2**: https://3000-ino1fwmbejreorbjcx9b7-02b9cc79.sandbox.novita.ai/judge/2
- **審査員3**: https://3000-ino1fwmbejreorbjcx9b7-02b9cc79.sandbox.novita.ai/judge/3
- **審査員4**: https://3000-ino1fwmbejreorbjcx9b7-02b9cc79.sandbox.novita.ai/judge/4
- **審査員5**: https://3000-ino1fwmbejreorbjcx9b7-02b9cc79.sandbox.novita.ai/judge/5
- **API**: https://3000-ino1fwmbejreorbjcx9b7-02b9cc79.sandbox.novita.ai/api/status

## システム構成

### デザインコンセプト
- **カラースキーム**: 黄色ベース（素人一本ロゴに合わせた配色）
- **PC画面**: 黄金のグラデーション背景、黒枠の審査員カード、赤い一本バナー
- **審査員画面**: 黄色背景、黒と赤の一本ボタン、ロゴの浮遊アニメーション
- **視覚効果**: リップルエフェクト、フラッシュアニメーション、グロー効果

### 技術スタック
- **フロントエンド**: HTML + TailwindCSS + Axios
- **バックエンド**: Hono (TypeScript)
- **データベース**: Cloudflare D1 (SQLite)
- **デプロイ**: Cloudflare Pages
- **開発サーバー**: Wrangler + PM2

### データモデル

#### Sessions テーブル
- セッション（お題ごと）の管理
- `id`: セッションID
- `round_number`: ラウンド番号
- `is_active`: アクティブ状態（1=現在のセッション）
- `created_at`: 作成日時

#### Judges テーブル
- 審査員情報
- `id`: 審査員ID
- `name`: 審査員名（審査員1〜5）
- `judge_number`: 審査員番号（1〜5）
- `created_at`: 作成日時

#### Votes テーブル
- 投票記録
- `id`: 投票ID
- `session_id`: セッションID（外部キー）
- `judge_id`: 審査員ID（外部キー）
- `voted`: 投票状態（0=未投票、1=投票済み）
- `voted_at`: 投票日時

### APIエンドポイント

#### GET /api/status
現在のセッション状態を取得
```json
{
  "sessionId": 1,
  "roundNumber": 1,
  
  "votes": {
    "1": true,
    "2": false,
    "3": true,
    "4": false,
    "5": true
  },
  "voteCount": 3,
  "isIppon": true,
  "timestamp": 1762161983349
}
```

#### POST /api/vote
審査員の投票を送信（トグル式）
```json
{
  "judgeNumber": 1
}
```

#### POST /api/yo
YO〜イベントを送信
```json
{
  "judgeNumber": 1
}
```

#### GET /api/yo/latest
最新のYO〜イベントを取得
```json
{
  "hasYo": true,
  "judgeNumber": 1,
  "judgeName": "審査員1",
  "timestamp": "2025-11-03 10:33:11"
}
```

#### POST /api/reset
次のお題へリセット（新しいセッションを作成）

## 使用方法

### イベント運営者（PC画面）
1. PC集計画面にアクセス: https://3000-ino1fwmbejreorbjcx9b7-02b9cc79.sandbox.novita.ai/
2. 回答者が回答した後、審査員に投票を促す
3. リアルタイムで投票状況が表示される
4. 3名以上が投票すると「IPPON!」バナーが表示され、音声が再生される
5. 次のお題に移る際は「次のお題へリセット」ボタンをクリック

### 審査員（スマホ）
1. 各自の審査員ページにアクセス（1〜5）
2. **一本ボタン**：IPPONと思ったら赤い「一本」ボタンをタップ
   - タップすると即座にサーバーへ投票を送信
   - 画面にフラッシュエフェクトと「✓ 送信完了」メッセージが表示
   - スマホが振動します（対応端末のみ）
3. **YO〜ボタン**：青い「YO〜」ボタンをタップ
   - PC画面から「YO〜」音声が流れます
   - 「✓ YO〜送信」メッセージが2秒間表示されます
   - スマホが3回振動します（対応端末のみ）
4. 次のお題にリセットされると自動的にフィードバックが消えます

**重要**: 一本ボタンは1回お題につき1回タップするだけ。取り消し機能はありません。

## 開発情報

### ローカル開発
```bash
# ビルド
npm run build

# PM2で起動
pm2 start ecosystem.config.cjs

# ログ確認
pm2 logs webapp --nostream

# 再起動
fuser -k 3000/tcp 2>/dev/null || true
npm run build
pm2 restart webapp

# データベースリセット
npm run db:reset
```

### デプロイ（Cloudflare Pages）
```bash
# 1. Cloudflare API認証設定（初回のみ）
# Deploy タブでAPI keyを設定してから setup_cloudflare_api_key を実行

# 2. D1データベース作成（初回のみ）
npx wrangler d1 create webapp-production
# 出力されたdatabase_idをwrangler.jsonc に設定

# 3. マイグレーション適用
npm run db:migrate:prod

# 4. Cloudflare Pagesプロジェクト作成（初回のみ）
npx wrangler pages project create webapp --production-branch main

# 5. デプロイ
npm run deploy:prod
```

## 完了済み機能
- ✅ 5名の審査員投票システム
- ✅ リアルタイム投票集計（PC画面）
- ✅ 3名以上でIPPON判定
- ✅ 音声自動再生（PC画面のみ - IPPON音声）
- ✅ **YO〜ボタン機能**（審査員画面→PC画面で音声再生）
- ✅ ラウンドリセット機能
- ✅ レスポンシブデザイン（PC・スマホ対応）
- ✅ Cloudflare D1データベース連携
- ✅ ワンタップ投票（シンプルな信号送信）
- ✅ 視覚的フィードバック（フラッシュエフェクト、リップルアニメーション）
- ✅ 触覚フィードバック（スマホ振動）
- ✅ ラウンド変更時の自動リセット表示

## 今後の拡張案
- 📊 投票履歴・統計表示
- 🏆 得点システムの追加
- 👥 審査員名のカスタマイズ
- 🎨 テーマカラーの変更機能
- 📱 QRコード自動生成（審査員用URL）
- 🔔 通知機能（審査員への投票リマインド）

## デプロイ状態
- **プラットフォーム**: Cloudflare Pages
- **ステータス**: ✅ 開発環境で稼働中
- **最終更新**: 2025-11-03

## プロジェクト構造
```
webapp/
├── src/
│   └── index.tsx          # Honoアプリケーション（API + ページ）
├── public/
│   └── ippon.m4a          # IPPON音声ファイル
├── migrations/
│   └── 0001_initial_schema.sql  # D1データベーススキーマ
├── dist/                  # ビルド出力
├── ecosystem.config.cjs   # PM2設定
├── wrangler.jsonc         # Cloudflare設定
└── package.json           # 依存関係・スクリプト
```

## トラブルシューティング

### 音声が再生されない
- ブラウザの自動再生ポリシーにより、最初のクリック後でないと音声が再生されない場合があります
- PC画面をクリックしてからイベントを開始してください

### 投票が反映されない
- ネットワーク接続を確認してください
- API status エンドポイントで状態を確認: `/api/status`

### データベースをリセットしたい
```bash
npm run db:reset
pm2 restart webapp
```
