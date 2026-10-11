# 開発者向け情報（triangle-calc）

利用者向けの説明は [README.md](README.md) にあります。

## ファイル構成

```
index.html             画面（スタイルを含む）
js/geometry.js         三角形の計算（一般三角形・直角三角形・テーパー・座標、角度の読み取りと度分秒）。Node でも読み込み可
js/app.js              画面処理（作図、ドラッグ、結果の表示、テーマ、入力の保存、Service Worker の登録）
sw.js                  オフライン用のキャッシュ処理（Service Worker）
manifest.webmanifest   アプリとして追加するための設定
icons/                 アプリアイコン（tools/make_icons.py で作る）
docs/screenshots/      README 用のスクリーンショット（tools/screenshots.py で撮る）
tests/test.js          検算テスト
.github/workflows/     push 時の自動テスト
```

## 更新して公開するとき

- `index.html`・`js/`・`icons/` を変更したら、**`sw.js` 先頭の `VERSION` を必ず上げてから** push してください。上げないと、すでに使っている人の端末に古いファイルが残り続けます
- 画面の見た目を変えたときは、`docs/screenshots/` の画像も撮り直してください（撮影手順は `tools/screenshots.py` の先頭）
- GitHub Pages は main ブランチのルートを公開しています

## テスト

```
node tests/test.js    # 不一致があれば終了コード 1
```

## 実装のメモ

- **一般三角形**（`solveTriangle`）：辺 `s[i]` と、その向かいの角 `g[i]`（度）。未知は null。戻り値は解の配列（0〜2 個）か `{ error }`。3 辺から角を出すときは acos の引数を [−1, 1] に収めてから計算します
- **2 辺と挟まない角**：sin が 1 との差 1e-12 以内なら直角の 1 解として扱います
- **作図**：一般三角形は B を原点、C を +X 方向に置きます。`frame` が図全体を余白つきで 560×320 に収め、逆変換（`inv`）も返します
- **ドラッグ**：つまみ（`.hd`）の pointerdown で拡大率を固定（`frozen`）し、指を離すまで図が動かないようにします。ポインタの位置は SVG の `getScreenCTM` で図の座標に直し、`inv` で長さの座標に戻します。値の刻みは図の大きさの 1/300 以下で最大の 10 のべき（`stepOf`）
- **入力の保存**：localStorage のキー `sankaku-inputs`（入力欄・点の数・表示桁）と `sankaku-tab`。読み書きはすべて try/catch で囲み、保存できない環境でも動きます
- **テーマ**：QC Workbench の全ツールで共通のキー `qc-workbench-theme`
