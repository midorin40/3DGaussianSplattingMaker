# GaussianSplattingMaker

ローカルの Gaussian Splatting 実行環境を Web UI から操作するためのプロジェクト管理アプリです。

単なるアップロード画面ではなく、プロジェクト作成から素材管理、ジョブ実行、ログ確認、`.splat` 出力までを一貫して扱えるように設計しています。

## Portfolio Highlights

- ローカル前提のワークフローを Web アプリとして整理
- 単一画像、複数画像、動画の入力を同じ UI で扱えるように統合
- COLMAP / 学習 / export をジョブとして扱い、中断・再開に対応
- ファイルベースの永続化で、外部 DB に依存しない構成を採用
- 実行中ジョブの状態をファイルで保持し、再開可能な運用を実現

## What It Does

- プロジェクト作成
- 画像 / 動画アップロード
- 動画フレーム抽出
- 学習ジョブの開始
- 学習中断 / 再開
- `.ply` から `.splat` への export
- プロジェクトとジョブの履歴管理

## Tech Stack

- Node.js
- vanilla JavaScript
- file-based JSON storage
- local process orchestration via batch scripts
- FFmpeg
- COLMAP / Gaussian Splatting tooling

## Architecture

- `server.js`
  - HTTP API とジョブ制御の中心
- `storage/`
  - JSON ベースの保存層
- `run/`
  - 実行用ディレクトリとランタイム準備
- `pipelines/`
  - 単一画像 / 複数画像 / 動画のパイプライン定義
- `domain/`
  - project / job / artifact のデータモデル

## Runtime Data

正規の保存先は `data/runtime/` です。

- `data/runtime/projects/projects.json`
- `data/runtime/jobs/jobs.json`
- `data/runtime/artifacts/artifacts.json`
- `data/runtime/uploads/`
- `data/runtime/logs/`
- `data/runtime/exports/`

## Run

```powershell
npm start
```

ブラウザで `http://localhost:3200` を開きます。

## Design Notes

- UI はローカル作業の進行を見やすくすることを優先
- 実行中ジョブは状態をファイルに保存
- export までの流れを API として追跡可能に設計

## Known Constraints

- 単一画像モードは観測情報が少ないため、推定誤差を含みます。
- 入力品質が低いと COLMAP と学習結果は不安定になります。
- `.splat` の表示結果はビューア側の対応状況に依存します。

## References

- [docs/SPECIFICATION.md](/C:/WebApp/GaussianSplattingMaker/docs/SPECIFICATION.md)
- [docs/CONTINUATION_GUIDE.md](/C:/WebApp/GaussianSplattingMaker/docs/CONTINUATION_GUIDE.md)
