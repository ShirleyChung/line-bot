# 使用 Node 20，因為 Cloud Run 很適合這種 HTTP 服務
FROM node:20-slim

# 設定工作目錄
WORKDIR /app

# 先複製 package 檔，利用 Docker layer cache
COPY package*.json ./

# 安裝正式環境相依套件
RUN npm install --omit=dev

# 複製所有程式碼
COPY . .

# Cloud Run 會透過 PORT 環境變數指定埠號
ENV PORT=8080

# 啟動程式
CMD ["npm", "start"]
