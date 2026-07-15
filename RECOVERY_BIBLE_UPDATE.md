# 恢復本聖經服務更新說明

## 2026年7月更新

### 變更原因
恢復本聖經網站從舊版 `https://recoveryversion.com.tw/Style0A/026/` 改版為新版 SPA 應用 `https://recoveryversion.com.tw/`。

### 主要變更

1. **每日經節功能** - ✅ 正常運作
   - 使用 puppeteer-core 爬取新版網站
   - 支援隨機經節查詢
   - 支援明確經節查詢（例如：創1:1、出4:1-3）

2. **經節查詢功能** - ✅ 部分支援
   - 支援明確經節查詢（書卷+章+節）
   - 關鍵字搜尋功能暫時停用

3. **暫時停用的功能**
   - 註解查詢 (`queryRecoveryBibleNotes`)
   - 生命讀經查詢 (`queryLifeStudyExcerpt`)
   - 綱目列表 (`getBookOutlineLeafItems`, `getBookOutlineReminderItems`)

### 技術細節

- 新增依賴：`puppeteer-core`
- 需要設定環境變數：`PUPPETEER_EXECUTABLE_PATH`（指向Chrome執行檔）
- Cloud Run部署需要安裝Chrome
- 逾時設定：瀏覽器操作15秒，網路請求30秒

### 已知限制

- 經文文本清理可能不完美（註解和串珠參考的移除）
- 較長的經節可能在句尾被截斷
- 需要較多資源（瀏覽器啟動）

### Cloud Run部署注意事項

Dockerfile需要安裝Chrome:
```dockerfile
RUN apt-get update && apt-get install -y \
    chromium \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```
