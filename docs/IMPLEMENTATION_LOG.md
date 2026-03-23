# 実装ログ

## 2026-03-22 実施内容

### 1. Web アプリ初期構築
- `C:\WebApp\GaussianSplattingMaker` に Node ベースの軽量 Web アプリを作成
- 依存を抑えたローカル実行構成で開始

### 2. 方向転換
- 当初のプロンプト生成寄り UI を廃止
- ユーザー要件に合わせて、画像アップロード中心の GS 制作アプリへ再構築
- エージェント会話前提を外し、GS パイプライン中心の設計へ変更

### 3. UI / API 再設計
- プロジェクト作成機能を追加
- 単画像 / 複数画像モードを追加
- 画像アップロード機能を追加
- ジョブ進行表示を追加
- 保存済みプロジェクト履歴を追加

### 4. ローカル GS リポジトリ構築
- `C:\GaussianSplatting` を新規作成
- `graphdeco-inria/gaussian-splatting` を `--recursive` でクローン
- `RAW_Data` フォルダを作成

### 5. 実行環境構築
- Miniconda を `C:\Users\Lida\miniconda3` に導入
- `C:\GaussianSplatting\envs\gaussian_splatting_cuda12` を作成
- PyTorch 2.1.2 + CUDA 12.1 を導入
- `numpy 1.26.4` と `opencv-python 4.8.1` の整合を調整
- CUDA 拡張をビルド
  - fused_ssim
  - simple_knn
  - diff_gaussian_rasterization

### 6. COLMAP 導入
- conda 版は時間がかかるため採用せず
- 公式 Windows CUDA バイナリを使用
- `C:\GaussianSplatting\tools\COLMAP` に展開
- `COLMAP.bat -h` の起動確認を実施

### 7. 補助スクリプト追加
- 環境作成
- 環境有効化
- 動画フレーム抽出
- COLMAP ラッパー
- scene 前処理
- train 実行

### 8. Web アプリとの接続
- `data/local-stack.json` を追加
- Web アプリからローカル GS スタックの場所を参照可能にした
- 複数画像モードで以下のローカル処理へ接続
  - `prepare_colmap_scene.bat`
  - `train_scene.bat`
- 実行ログ保存機能を追加
- 実行ログの UI 表示を追加

### 9. バグ修正
- 日本語文字化け修正
- `/uploads/...` が Windows パス正規化で 404 になる問題を修正
- COLMAP 4.0.2 に合わせて `convert.py` の GPU オプション名を更新
  - `SiftExtraction.use_gpu` -> `FeatureExtraction.use_gpu`
  - `SiftMatching.use_gpu` -> `FeatureMatching.use_gpu`
- Windows の bat 起動方式を修正し、Node から順次 spawn する形へ変更

## 現在の状態

### 動作確認済み
- Web アプリ起動
- API ステータス取得
- アップロード画像の配信
- 単画像プロジェクト作成
- 単画像スキャフォールドジョブ完了
- 複数画像モードでローカルバッチ起動
- COLMAP 側エラーが Web アプリのログへ返ることを確認

### 未完了
- 正常な実データでの複数画像 end-to-end 成功確認
- train.py 完了後の成果物連携
- 単画像 GS エンジンの本接続
- 動画入力の実装

## 注意事項
- 今回の複数画像検証では、極小・不正 PNG を使ったため COLMAP 側で失敗している
- これは配線不良ではなく、入力データ不正による想定どおりの失敗
- 正常な複数画像を使えば、次の検証段階に進める状態まで来ている

### 10. .splat エクスポート追加
- ply2splat を Conda 環境へ導入
- export_splat.bat を追加
- train.py 完了後に point_cloud.ply を検出して .splat へ変換する処理を server.js に追加
- /exports/... 配信とダウンロードリンク表示を追加
- ただし end-to-end の成功確認は正常な実画像セットでの再検証が必要


### 11. 動画の自動複数画像化
- 複数画像モードで mp4 / mov / webm を受け付けるように変更
- バックエンドで ffmpeg により動画からフレーム抽出して input フォルダへ配置する処理を追加
- 出力に usedVideoInput / extractedFrameCount を追加
- UI に動画対応表記と動画プレースホルダ表示を追加


### 12. 動画の自動複数画像化の仕上げ
- server.js に動画判定、品質別 fps 決定、FFmpeg 抽出実行ヘルパーを追加
- /api/status と local-stack.json を動画対応済みへ更新
- UI のアップロード案内、資産表示、出力表示を動画対応へ調整
- 複数画像モードでは動画1本からフレーム抽出後に COLMAP へ接続する構成を完成


### 13. 単画像の擬似複数視点化
- generate_single_views.py を追加
- generate_single_scene.bat を追加
- 単画像モードで 1 枚の入力画像から擬似的な別角度画像を生成する処理を server.js に追加
- 生成された擬似ビューをそのまま既存の COLMAP / train.py / .splat エクスポートへ接続
- UI に単画像モードの新挙動と擬似ビュー情報を表示するよう更新
