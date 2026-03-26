# GaussianSplattingMaker

GaussianSplattingMaker は、画像または動画からローカルの Gaussian Splatting パイプラインを実行し、`.splat` データを生成・管理する軽量 Web アプリです。

本プロジェクトは、厳密な3D再構成専用ではなく、`.splat` をローカルで生成して表示・検証・配布しやすくすることを重視しています。単一画像モードも、完全な3D化ではなく、表示向け `.splat` の生成を含む用途を前提にしています。

## 現在の機能

- 単一画像モードと複数画像モード
- 画像アップロード
- 動画アップロードと自動フレーム抽出
- 単一画像からの擬似ビュー生成
- ローカル COLMAP / Gaussian Splatting 実行
- `point_cloud.ply` から `.splat` への変換
- ジョブ進行表示
- 実行ログ表示
- 学習中断
- 学習再開
- 学習ステップ指定
- 動画の目標フレーム数指定
- プロジェクト履歴保存

## 動作概要

### 複数画像 / 動画モード

1. アップロードした画像または動画を `data/uploads/` に保存
2. 動画の場合は FFmpeg でフレーム抽出
3. 抽出フレームを目標フレーム数まで均等間引き
4. `C:\GaussianSplatting\RAW_Data\<scene>` にステージング
5. `prepare_colmap_scene.bat` を実行
6. `train_scene.bat` を実行
7. `point_cloud.ply` を `.splat` に変換
8. `data/exports/` に保存

### 単一画像モード

単一画像モードは、1枚画像をそのまま3D再構成するのではなく、擬似ビューを生成して `.splat` 表示向けの入力へ接続する構成です。

## 学習ステップ

UI から以下を選択できます。

- `7000`
- `15000`
- `30000`
- `50000`

開始時に選んだ値がジョブの `targetIterations` として使用されます。中断後に再開した場合も引き継がれます。

## 動画フレーム制御

動画は品質プリセットに応じた FPS で抽出したあと、目標フレーム数まで均等間引きして COLMAP に渡します。

抽出 FPS:

- `fast`: `8fps`
- `standard`: `12fps`
- `high`: `24fps`

目標フレーム数:

- `64`
- `96`
- `120`
- `180`
- `240`
- `300`

## 学習中断 / 再開

- 実行中ジョブは UI から中断できます
- 中断時はプロセスツリーを停止し、ジョブ状態を `paused` に保存します
- 再開時は可能なら最新の `chkpnt*.pth` から継続します
- 学習完了後に中断していた場合は export フェーズから再開します

## ローカル構成

- Web アプリ: `C:\WebApp\GaussianSplattingMaker`
- GS 実行環境: `C:\GaussianSplatting`
- 設定ファイル: `C:\WebApp\GaussianSplattingMaker\data\local-stack.json`

## 起動

```powershell
npm start
```

ブラウザで `http://localhost:3100` を開きます。

## API

- `GET /api/status`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/assets`
- `POST /api/projects/:id/generate`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/pause`
- `POST /api/jobs/:id/resume`

## 制約

- 単一画像モードは観測情報が1枚分しかないため、背面や隠れた面は推定になります
- 複数画像 / 動画モードでも、入力品質が低いと COLMAP と学習結果は不安定になります
- `.splat` が生成済みでも、ビューア側の対応状況によっては正常表示されない場合があります

## 関連ドキュメント

- 要件定義: [`docs/REQUIREMENTS.md`](/C:/WebApp/GaussianSplattingMaker/docs/REQUIREMENTS.md)
- 仕様書: [`docs/SPECIFICATION.md`](/C:/WebApp/GaussianSplattingMaker/docs/SPECIFICATION.md)
- 継続ガイド: [`docs/CONTINUATION_GUIDE.md`](/C:/WebApp/GaussianSplattingMaker/docs/CONTINUATION_GUIDE.md)
