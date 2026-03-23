# GaussianSplattingMaker 仕様書

## 1. 目的
GaussianSplattingMaker は、ユーザーがアップロードした画像や写真をもとに Gaussian Splatting 用の3Dデータ生成フローを実行・管理する Web アプリである。

本アプリの主目的は以下。

- 画像アップロードから GS 生成ジョブ開始までを Web UI で完結させる
- 複数画像入力時に、ローカルの COLMAP と Gaussian Splatting 実行環境へ接続する
- 単画像入力時には、1枚画像から擬似的な複数視点画像を生成して既存の GS パイプラインへ接続する
- 動画入力時に自動でフレーム抽出し、複数画像ワークフローへ接続する

## 2. 現在の実装範囲

### 2.1 実装済み
- プロジェクト作成
- 単画像 / 複数画像モード切り替え
- 画像アップロード
- アップロード画像のプレビュー表示
- ジョブ開始 API
- ジョブ進行状況表示
- 実行ログ表示
- プロジェクト履歴保存
- ローカル GS スタック情報の取得

### 2.2 実装済みの実行接続
#### 複数画像モード
以下のローカルスタックに接続済み。

- COLMAP
- graphdeco-inria/gaussian-splatting
- Conda 環境
- CUDA 拡張モジュール

Web アプリから複数画像ジョブを開始すると、内部的に以下の流れになる。

1. 画像を `data/uploads/<projectId>` に保存
2. 画像を `C:\GaussianSplatting\RAW_Data\<scene>` にステージング
3. `prepare_colmap_scene.bat` を実行
4. `train_scene.bat` を実行
5. ログを `data/job-logs/<projectId>.log` に保存
6. ジョブ状態を Web UI に反映

#### 単画像モード
単画像モードは、1枚画像から擬似的な別角度画像を生成し、その生成画像群を COLMAP と Gaussian Splatting に渡す。

現在の流れ。

1. 1枚画像をアップロード
2. 擬似視点画像を自動生成
3. 生成画像を input フォルダへ配置
4. prepare_colmap_scene.bat を実行
5. train_scene.bat を実行
6. point_cloud.ply から .splat を生成

この方式は、ドット絵、イラスト、正面素材、平面的な被写体に向く。

## 3. 想定ユーザー
- 3D 制作を試したい個人クリエイター
- 商品や小物を簡易3D化したい制作者
- Gaussian Splatting 実験を行いたい開発者
- ローカル環境で GS ワークフローを扱いたいユーザー

## 4. 画面仕様

### 4.1 メイン画面
以下のセクションを持つ。

- Hero セクション
- プロジェクト設定フォーム
- 画像アップロード欄
- 現在のプロジェクト状態
- ジョブ進行状況
- 実行ログ
- アップロード済み画像一覧
- 生成結果
- 保存済みプロジェクト履歴

### 4.2 入力フォーム
入力項目は以下。

- プロジェクト名
- モード
  - 単画像モード
  - 複数画像モード
- 被写体タイプ
- 品質プリセット
- 背景処理
- メモ

### 4.3 画像・動画アップロード
対応形式。

- png
- jpg
- jpeg
- webp

現在は画像のみ対応。
動画アップロードは未対応。

## 5. バックエンド仕様

### 5.1 主な API
- `GET /api/status`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/assets`
- `POST /api/projects/:id/generate`
- `GET /api/jobs/:id`

### 5.2 ステータス API
`/api/status` は、ローカル GS スタックとの接続状況を返す。

現在返す情報。

- `singleImageWorkflow`
- `singleImageExecution`
- `multiImageExecution`
- `videoUpload`
- `agentConversation`
- `stack`

### 5.3 データ保存先
Web アプリ側。

- プロジェクト: `data/projects.json`
- ジョブ: `data/jobs.json`
- アップロード画像: `data/uploads/`
- ジョブログ: `data/job-logs/`
- ローカルスタック設定: `data/local-stack.json`

## 6. ローカル GS 実行環境
現在、Web アプリから参照しているローカル実行環境は以下。

- ルート: `C:\GaussianSplatting`
- リポジトリ: `C:\GaussianSplatting\gaussian-splatting`
- 生データ: `C:\GaussianSplatting\RAW_Data`
- Conda 環境: `C:\GaussianSplatting\envs\gaussian_splatting_cuda12`
- スクリプト: `C:\GaussianSplatting\scripts`
- COLMAP: `C:\GaussianSplatting\tools\COLMAP\COLMAP.bat`

## 7. 補助スクリプト
ローカル側に以下を配置済み。

- `create_env.bat`
- `activate_env.bat`
- `build_extensions.bat`
- `extract_frames.bat`
- `colmap.bat`
- `prepare_colmap_scene.bat`
- `train_scene.bat`

## 8. 現在の制約

### 8.1 単画像モード
- 擬似複数視点生成ベースで実行可能
- 背面や隠れた面は推定になる
- 写真よりもドット絵、イラスト、平面的素材と相性が良い

### 8.2 複数画像モード
- ローカル実行開始までは接続済み
- 実ジョブの成否は入力画像品質と COLMAP / train.py の条件に依存する
- 検証時、壊れた極小 PNG では当然失敗する
- 正常な複数枚画像での実走確認は今後の実データで行う前提

### 8.3 動画モード
- 未実装
- FFmpeg は導入済み
- 将来はフレーム抽出経由で複数画像モードに接続する想定

## 9. 今後の優先実装候補
1. 単画像モードの実データによる end-to-end 検証
2. 複数画像の実データによる end-to-end 検証
3. model 出力ディレクトリと viewer 接続
4. 単画像用の高品質な深度推定ベース生成への拡張
5. 失敗ログの UI 表示改善

## 10. 重要な設計方針
- エージェント会話は必須機能ではない
- GS 生成パイプライン中心のアプリとする
- 単画像は必須要件だが、実装段階は分ける
- 複数画像モードを先に本接続する
- ローカル実行環境と Web UI の境界を明確に保つ

## 11. .splat エクスポート
複数画像モードでは、学習完了後に最新の point_cloud.ply を検出し、ply2splat を使って .splat を生成する。
生成された .splat は Web アプリ側の data/exports に保存され、UI からダウンロードできる。
単画像モードでは .splat はまだ生成されない。


## 12. 動画入力の自動複数画像化
複数画像モードでは mp4 / mov / webm を受け付ける。
動画がアップロードされた場合、バックエンドは ffmpeg を使ってフレーム抽出し、その抽出画像群を COLMAP 入力として扱う。
抽出フレーム数は品質プリセットに応じて変わり、結果画面で確認できる。

