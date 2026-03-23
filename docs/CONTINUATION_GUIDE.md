# 継続ガイド

このプロジェクトフォルダを別の場所へ移動した後でも、次回の作業で継続しやすいように現状を整理する。

## 1. プロジェクトの中心
移動対象のプロジェクトフォルダはこの Web アプリ側。

- 現在: `C:\WebApp\GaussianSplattingMaker`

ただし、実際の GS 実行スタックは別フォルダにある。

- `C:\GaussianSplatting`

そのため、Web アプリのフォルダだけ移動しても、ローカル GS スタックの場所が変わらない限り、`data/local-stack.json` の内容が正しければ継続可能。

## 2. 次回継続時に最初に確認するファイル
- `docs/SPECIFICATION.md`
- `docs/IMPLEMENTATION_LOG.md`
- `data/local-stack.json`
- `server.js`
- `public/app.js`
- `public/index.html`

## 3. フォルダ移動後に確認すること

### 3.1 Web アプリ自体
移動後の新しい場所で以下を実行。

```powershell
npm start
```

### 3.2 ローカル GS スタック参照先
`data/local-stack.json` に記載された以下のパスが実在すること。

- `gaussianSplattingRoot`
- `repoPath`
- `rawDataPath`
- `envPath`
- `scriptsPath`

もし `C:\GaussianSplatting` 側も移動した場合は、必ず `data/local-stack.json` を新しいパスへ書き換えること。

## 4. 現時点での実装境界

### Web アプリ側でやること
- プロジェクト管理
- 画像アップロード
- ジョブ開始
- ログ表示
- ローカル実行環境への橋渡し

### ローカル GS スタック側でやること
- COLMAP 前処理
- Gaussian Splatting 学習
- 将来的な viewer / 出力処理

## 5. 現在の重要な事実
- 複数画像モードはローカルスクリプト起動まで接続済み
- 単画像モードはスキャフォールドのみ
- 動画モードは未実装
- 404 だったアップロード画像の配信は修正済み
- COLMAP 4.0.2 への CLI 差分対応も済み

## 6. 次回の最優先タスク候補
1. 正常な複数画像セットで end-to-end 検証
2. `train.py` 成功時の output ディレクトリ確認
3. 生成結果を UI に結びつける
4. 単画像 GS エンジン候補を選定して接続する

## 7. 次回指示の出し方の例
移動後のフォルダで、次のように指示すれば継続しやすい。

- `docs/SPECIFICATION.md と docs/IMPLEMENTATION_LOG.md を読んで続きから進めてください`
- `local-stack.json を見て複数画像モードの実走確認をしてください`
- `単画像モードの実エンジン接続を進めてください`

## 8. 補足
もし Web アプリの移動先が変わっても、ローカル GS スタックをそのまま `C:\GaussianSplatting` に残す運用なら、基本的には `local-stack.json` をそのまま使える。

逆に、`C:\GaussianSplatting` 側も一緒に移動する場合は、
`data/local-stack.json` の書き換えが最重要になる。
