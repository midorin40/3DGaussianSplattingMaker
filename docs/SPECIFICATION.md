# GaussianSplattingMaker 仕様書

## 1. システム概要

GaussianSplattingMaker は、ローカルの Gaussian Splatting 実行環境に対して、ブラウザからプロジェクト作成、入力アップロード、ジョブ実行、ログ確認、`.splat` 出力管理を行う Web アプリです。

## 2. 実装構成

### 2.1 Web アプリ

- サーバー: [`server.js`](/C:/WebApp/GaussianSplattingMaker/server.js)
- フロント: [`public/index.html`](/C:/WebApp/GaussianSplattingMaker/public/index.html), [`public/app.js`](/C:/WebApp/GaussianSplattingMaker/public/app.js), [`public/styles.css`](/C:/WebApp/GaussianSplattingMaker/public/styles.css)
- 起動: `npm start`

### 2.2 永続データ

- プロジェクト: `data/projects.json`
- ジョブ: `data/jobs.json`
- アップロード: `data/uploads/`
- ジョブログ: `data/job-logs/`
- export: `data/exports/`
- ローカルスタック設定: `data/local-stack.json`

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

不正値は以下に正規化します。

- `trainingSteps`: `30000`
- `videoFrameTarget`: `96`

### 3.2 モード

#### 単一画像モード

- 入力は1ファイルのみ
- 動画は不可
- 擬似ビュー生成を行ったうえで GS パイプラインへ接続
- 完全な3D再構成ではなく、`.splat` 表示向けの擬似多視点入力として扱う

#### 複数画像モード

- 2枚以上の画像、または動画1本を受け付ける
- 動画はフレーム抽出後に複数画像扱いへ変換する

### 3.3 動画入力

品質プリセットに応じて抽出 FPS を決めます。

- `fast`: `8fps`
- `standard`: `12fps`
- `high`: `24fps`

抽出後は `videoFrameTarget` の値まで均等間引きして学習入力に使います。

### 3.4 学習ジョブ

ジョブは以下の情報を保持します。

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
- 実行中プロセスツリーを `taskkill` で停止
- ジョブを `paused` に更新
- 最新の `chkpnt*.pth` を探索し保存

### 3.7 学習再開

- `POST /api/jobs/:id/resume`
- `paused` ジョブのみ再開可能
- `trainingCompleted` 済みなら export から再開
- `preparationCompleted` 済みなら training から再開
- 最新 checkpoint があれば `--start_checkpoint` で継続

### 3.8 `.splat` 出力

- 学習完了後、最新の `point_cloud.ply` を探索
- `export_splat.bat` を使って `ply2splat.exe` で `.splat` 化
- 出力先は `data/exports/<projectId>.splat`

## 4. API 仕様

### 4.1 `GET /api/status`

返却内容:

- アプリ名
- 機能フラグ
- ローカルスタック設定

### 4.2 `GET /api/projects`

保存済みプロジェクト一覧を返します。

### 4.3 `POST /api/projects`

プロジェクトを新規作成します。

### 4.4 `GET /api/projects/:id`

指定プロジェクトを返します。

### 4.5 `POST /api/projects/:id/assets`

Base64 データを受け取り、アップロードファイルを保存します。

### 4.6 `POST /api/projects/:id/generate`

ジョブ開始 API です。

リクエストでは `trainingSteps` と `videoFrameTarget` を受け取り、開始時の値を優先してプロジェクトへ反映します。

### 4.7 `GET /api/jobs/:id`

指定ジョブと関連プロジェクトを返します。

### 4.8 `POST /api/jobs/:id/pause`

ジョブ中断。

### 4.9 `POST /api/jobs/:id/resume`

ジョブ再開。

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

- 単一画像モードは観測情報不足のため、構造的な推定誤差を含む
- 動画からの学習品質は抽出フレーム数、目標フレーム数、ブレに依存する
- `.splat` の正常表示はビューア側のフォーマット対応にも依存する
- サーバー再起動をしないと `server.js` の変更は反映されない
