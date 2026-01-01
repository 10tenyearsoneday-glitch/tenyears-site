# 十年一日 靜態模板（可直接上線）

## 1) 本機預覽
用 VS Code 開啟資料夾後，裝「Live Server」外掛 → 右鍵 `index.html` → Open with Live Server

## 2) GitHub Pages 上線（推薦，完全不用 Netlify）
1. 在 GitHub 建立新 repo（例如：tenyears-site）
2. 把這個資料夾裡的檔案全部上傳到 repo 根目錄
3. GitHub → Settings → Pages
   - Build and deployment：Deploy from a branch
   - Branch：main / (root)
4. 等 1~2 分鐘，會給你網址

## 3) Netlify 上線（如果你要）
Site settings → Build & deploy：
- Build command：留空
- Publish directory：留空或 `.`

> 你先前會「自己跑出來」是因為 repo 裡的 `netlify.toml` 有寫 build/base/publish（會覆蓋 UI 設定）。
> 直接把 `netlify.toml` 刪掉或改成你想要的值即可。

