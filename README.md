# GaussianSplattingMaker

画像や動画をアップロードし、Gaussian Splatting の生成フローを進めるための軽量 Web アプリです。

## 現在の実装範囲

- 単画像モードと複数画像モードの切り替え
- 画像アップロード
- 動画アップロードと自動フレーム抽出
- 単画像からの擬似複数視点生成
- プロジェクト作成
- GS 生成ジョブの開始と進行表示
- ローカル実行ログ表示
- .splat エクスポート連携
- プロジェクト履歴保存

## 現在の動作状態

- 単画像モード
  1枚画像を擬似的な複数視点画像へ展開し、既存の COLMAP と Gaussian Splatting パイプラインへ接続します。
- 複数画像モード
  この PC 上の COLMAP と graphdeco-inria/gaussian-splatting に接続されています。
- 動画入力
  mp4 / mov / webm を受け付け、FFmpeg で自動的にフレーム抽出して複数画像ワークフローへ渡します。

## 起動

```powershell
npm start
```

ブラウザで http://localhost:3100 を開いてください。

## ローカルスタック

- Web アプリ: C:\WebApp\GaussianSplattingMaker
- GS 実行環境: C:\GaussianSplatting
- 設定ファイル: C:\WebApp\GaussianSplattingMaker\data\local-stack.json

## 補足

- 単画像モードは擬似視点生成ベースなので、見えていない背面は推定的な結果になります。
- 複数画像モードは、入力内容によって COLMAP の再構成に失敗することがあります。
- 動画入力の配線とフレーム抽出は接続済みです。
- .splat の end-to-end 成功確認は、十分な視差を持つ実データで行うのが前提です。
