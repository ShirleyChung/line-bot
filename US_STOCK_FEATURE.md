# 美股自選股功能說明

## 功能概述

此 LINE Bot 現在支援台股與美股的自選股管理功能。美股價格使用 Finnhub API 查詢。

## 新增功能

### 1. 美股股價查詢
- 支援美股代碼查詢（例如：QCOM, NVDA, AAPL, TSLA）
- 使用 Finnhub API 獲取即時報價
- 顯示股價、漲跌、漲跌幅、最高/最低價

### 2. 自選股管理
- 可同時管理台股與美股自選股
- 自動識別市場（英文字母 = 美股，數字 = 台股）
- 查詢自選股時會分別顯示台股與美股資訊

## 使用方式

### 查詢單一股票
```
查 NVDA
QCOM 股價
2330 現在多少
```

### 加入自選股
```
加入 NVDA
幫我追蹤 QCOM
加入自選股 AAPL
```

### 移除自選股
```
移除 NVDA
刪除 QCOM
不要追蹤 AAPL
```

### 列出自選股
```
我的自選股
列出股票
```

### 查詢自選股股價
```
自選股股價
我的自選股股價
```

## 技術實作

### 新增檔案
1. **src/services/finnhubService.js**
   - 整合 Finnhub API
   - 提供美股報價與公司資料查詢
   - 實作快取機制（60秒）

### 修改檔案

1. **package.json**
   - 新增 `finnhub` 套件依賴

2. **src/services/stockSelectService.js**
   - 新增 `detectMarket()` 函式自動識別市場
   - 修改 `addWatchStock()` 儲存市場資訊
   - 修改 `getWatchPrices()` 根據市場選擇對應 API

3. **src/llm/toolDispatcher.js**
   - 新增 `detectMarket()` 函式
   - 修改 `get_stock_price` 支援美股查詢
   - 匯入 `fetchUSStockLatest` 服務

4. **src/llm/tools.js**
   - 更新工具描述，說明支援台股與美股
   - 更新參數說明與範例

5. **src/utils/format.js**
   - 修改 `buildWatchPricesMessage()` 分別顯示台股與美股
   - 美股顯示格式包含漲跌幅百分比
   - 美股顯示高/低價資訊

6. **src/config/env.js**
   - 新增 `FINNHUB_API_KEY` 環境變數
   - 更新系統提示詞，說明美股支援

7. **.evn.example**
   - 新增 Finnhub API Key 設定範例

## 環境變數設定

需要在環境變數中設定 Finnhub API Key：

```bash
FINNHUB_API_KEY=your_finnhub_api_key
```

### 取得 Finnhub API Key
1. 前往 https://finnhub.io/
2. 註冊免費帳號
3. 在 Dashboard 取得 API Key
4. 免費方案每分鐘可呼叫 60 次

## 市場識別規則

系統自動識別股票代碼屬於哪個市場：

- **美股**：純英文字母，長度 1-5 個字元（例如：NVDA, QCOM, AAPL）
- **台股**：包含數字的代碼（例如：2330, 2454, 006208）

## 資料來源

- **台股**：證交所 TWSE 個股日成交資訊（非即時）
- **美股**：Finnhub 即時報價

## 回應格式範例

### 台股與美股混合顯示
```
最近收盤資訊

【台股】
資料日期：2026-05-06

台積電：2330
價：1,020 +5
成交量：15,234,567

資料來源：TWSE 個股日成交資訊

【美股】

NVIDIA Corporation (NVDA)
價：$450.25 +12.35 (+2.82%)
高/低：$455.00 / $445.50

資料來源：Finnhub 即時報價
```

## 注意事項

1. Finnhub 免費方案有 API 呼叫限制（60次/分鐘）
2. 系統已實作 60 秒快取，減少 API 呼叫次數
3. 美股為即時報價，台股為收盤價（非即時）
4. 股價資訊僅供參考，不構成投資建議
