# GaussianSplattingMaker 仕様書

## 1. 概要

GaussianSplattingMaker は、ローカルの Gaussian Splatting 実行環境に対して、ブラウザからプロジェクト作成、素材アップロード、ジョブ実行、ログ確認、`.splat` 出力管理を行う Web アプリです。

このプロジェクトは、厳密な 3D 再構成専用ツールではありません。表示、検証、配布に使える `.splat` をローカルで生成・管理することを重視します。

## 2. 実装構成

### 2.1 Web アプリ

- サーバー: [`server.js`](/C:/WebApp/GaussianSplattingMaker/server.js)
- エントリ: [`index.js`](/C:/WebApp/GaussianSplattingMaker/index.js)
- フロントエンド: [`public/index.html`](/C:/WebApp/GaussianSplattingMaker/public/index.html), [`public/app.js`](/C:/WebApp/GaussianSplattingMaker/public/app.js), [`public/styles.css`](/C:/WebApp/GaussianSplattingMaker/public/styles.css)
- 起動: `npm start`

### 2.2 永続データ

現在の正規保存先は `data/runtime/` です。

- プロジェクト: `data/runtime/projects/projects.json`
- ジョブ: `data/runtime/jobs/jobs.json`
- アーティファクト: `data/runtime/artifacts/artifacts.json`
- アップロード素材: `data/runtime/uploads/`
- ジョブログ: `data/runtime/logs/`
- export: `data/runtime/exports/`
- キャッシュ: `data/runtime/cache/`
- マニフェスト: `data/runtime/manifests/`
- ローカルスタック設定: `data/local-stack.json`

旧 `data/projects.json` / `data/jobs.json` / `data/uploads/` / `data/job-logs/` / `data/exports/` は初回移行時の入力として読み取ります。`data/v2/` も同様に互換取り込み対象です。

### 2.3 外部実行スタック

- ルート: `C:\GaussianSplatting`
- リポジトリ: `C:\GaussianSplatting\gaussian-splatting`
- 生データ: `C:\GaussianSplatting\RAW_Data`
- 仮想環境: `C:\GaussianSplatting\envs\gaussian_splatting_cuda12`
- スクリプト: `C:\GaussianSplatting\scripts`

## 3. 機能仕様

### 3.1 プロジェクト作成

入力項目:

- `name`
- `mode`
- `subjectType`
- `qualityPreset`
- `backgroundMode`
- `trainingSteps`
- `videoFrameTarget`
- `notes`

`trainingSteps` の許容値:

- `7000`
- `15000`
- `30000`
- `50000`

`videoFrameTarget` の許容値:

- `64`
- `96`
- `120`
- `180`
- `240`
- `300`

不正値の正規化:

- `trainingSteps` -> `30000`
- `videoFrameTarget` -> `96`

### 3.2 モード

#### 単一画像モード

- 入力は 1 ファイル
- 動画は不可
- 擬似ビュー生成を行ってから GS パイプラインへ接続
- 完全な 3D 再構成ではなく、`.splat` 表示向けの単一画像ベース入力として扱う

#### 複数画像 / 動画モード

- 2 枚以上の画像、または 1 本以上の動画を受け付ける
- 動画はフレーム抽出後に複数画像として扱う

### 3.3 動画入力

品質プリセットごとの抽出 FPS:

- `fast`: `8fps`
- `standard`: `12fps`
- `high`: `24fps`

抽出後は `videoFrameTarget` まで間引きして学習入力に使います。

### 3.4 学習ジョブ

ジョブが保持する代表的な状態:

- `status`
- `progress`
- `currentStage`
- `sceneDir`
- `modelDir`
- `logPath`
- `targetIterations`
- `targetVideoFrames`
- `latestPlyPath`
- `exportPath`
- `exportUrl`
- `pausedAt`
- `lastCheckpointPath`
- `lastCheckpointIteration`
- `preparationCompleted`
- `trainingCompleted`

### 3.5 ジョブ状態

- `queued`
- `running`
- `paused`
- `completed`
- `failed`

### 3.6 学習中断

- `POST /api/jobs/:id/pause`
- 実行中プロセスを `taskkill` で停止
- ジョブを `paused` に更新
- 最新の `chkpnt*.pth` を探索して保持

### 3.7 学習再開

- `POST /api/jobs/:id/resume`
- `paused` ジョブのみ再開可能
- `trainingCompleted` 済みなら export から再開
- `preparationCompleted` 済みなら training から再開
- 最新 checkpoint があれば `--start_checkpoint` で継続

### 3.8 `.splat` 出力

- 学習完了後に最新の `point_cloud.ply` を探索
- `export_splat.bat` を使って `ply2splat.exe` で `.splat` を生成
- 出力先は `data/runtime/exports/<projectId>.splat`

## 4. API 仕様

### 4.1 `GET /api/status`

返却項目:

- アプリ名
- 機能フラグ
- ローカル保存先

### 4.2 `GET /api/projects`

保存済みプロジェクト一覧を返します。

### 4.3 `POST /api/projects`

プロジェクトを新規作成します。

### 4.4 `GET /api/projects/:id`

指定プロジェクトを返します。

### 4.5 `POST /api/projects/:id/assets`

Base64 画像を受け取り、アップロードファイルを保存します。

### 4.6 `POST /api/projects/:id/generate`

ジョブ開始 API です。

- `trainingSteps` と `videoFrameTarget` を受け取る
- 開始時の値を優先してプロジェクトへ反映する

### 4.7 `GET /api/jobs/:id`

指定ジョブと関連プロジェクトを返します。

### 4.8 `POST /api/jobs/:id/pause`

ジョブを中断します。

### 4.9 `POST /api/jobs/:id/resume`

ジョブを再開します。

## 5. フロントエンド仕様

画面セクション:

- Hero
- プロジェクト設定フォーム
- アップロード領域
- 現在のプロジェクト状態
- ジョブ進行状況
- 実行ログ
- 入力アセット一覧
- 出力情報
- プロジェクト履歴

操作項目:

- 学習ステップ
- 目標フレーム数
- `プロジェクトを作成`
- `GS 生成を開始`
- `学習を中断`
- `学習を再開`

## 6. 既知の制約

- 単一画像モードは観測情報が少ないため、背面や隠れ面の推定誤差を含みます。
- 複数画像 / 動画モードでも、入力品質が低いと COLMAP と学習結果は不安定になります。
- `.splat` の正常表示はビューア側の対応状況にも依存します。
- サーバー再起動をしない限り `server.js` の変更は反映されません。

## 7. 補足

この仕様書の正規構成は現在のルート実装です。`v2` は移行前の設計名として残っているだけで、通常運用の主系ではありません。
