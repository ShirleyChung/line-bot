# 先編譯 SorReqOrd CLI parser。GUI feature 不在 bot 服務中啟用。
FROM rust:1.82-slim AS sorlogparser-builder

WORKDIR /build/sorlogparser_rust
COPY sorlogparser_rust/Cargo.toml sorlogparser_rust/Cargo.lock ./
COPY sorlogparser_rust/src ./src
RUN cargo build --release --no-default-features

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
COPY --from=sorlogparser-builder /build/sorlogparser_rust/target/release/sor_logparser /app/bin/sor_logparser

# Cloud Run 會透過 PORT 環境變數指定埠號
ENV PORT=8080

# 啟動程式
CMD ["npm", "start"]
