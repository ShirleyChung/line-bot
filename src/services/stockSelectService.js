import { db } from "./firestore.js";
import { fetchTaiwanStockLatest } from "./taiwanStockService.js";
import { fetchUSStockLatest } from "./finnhubService.js";

/**
 * 簡化版市場判斷：
 * - 純英文字母通常視為美股代碼
 * - 其他格式預設走台股查詢
 * @param {string} symbol - 股票代碼
 * @returns {string} 市場代碼 "US" 或 "TW"
 */
function detectMarket(symbol) {
  const code = String(symbol).trim().toUpperCase();
  if (/^[A-Z]+$/.test(code) && code.length >= 1 && code.length <= 5) {
    return "US";
  }
  return "TW";
}

/**
 * 正規化股票代碼，移除 .TW 與 .TWO 後綴
 * @param {string} symbol - 股票代碼
 * @returns {string} 正規化後的代碼
 */
function normalizeSymbol(symbol) {
  // 使用者可能輸入 2330.TW / 2330.TWO，儲存時統一只保留股票代碼。
  return String(symbol).trim().toUpperCase().replace(".TW", "").replace(".TWO", "");
}

/**
 * 將股票加入使用者自選股。
 * 使用 Firestore subcollection 讓每個使用者的 watchlist 可以獨立查詢與排序。
 * @param {string} lineUserId - LINE 使用者 ID
 * @param {string} symbol - 股票代碼
 * @returns {Promise<object>} 操作結果
 */
export async function addWatchStock(lineUserId, symbol) {
  const code = normalizeSymbol(symbol);
  const market = detectMarket(code);

  if (!lineUserId) {
    throw new Error("addWatchStock 缺少 lineUserId");
  }

  const ref = db
    .collection("users")
    .doc(lineUserId)
    .collection("watchlist")
    .doc(code);

  const snap = await ref.get();

  if (snap.exists) {
    await ref.set(
      {
        symbol: code,
        market: market,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return {
      ok: true,
      symbol: code,
      market: market,
      message: `${code} 已經在你的自選股中。`,
    };
  }

  await ref.set({
    symbol: code,
    market: market,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    ok: true,
    symbol: code,
    market: market,
    message: `已加入自選股：${code}`,
  };
}

/**
 * 從使用者自選股移除指定股票
 * @param {string} lineUserId - LINE 使用者 ID
 * @param {string} symbol - 股票代碼
 * @returns {Promise<object>} 操作結果
 */
export async function removeWatchStock(lineUserId, symbol) {
  const code = normalizeSymbol(symbol);

  const ref = db
    .collection("users")
    .doc(lineUserId)
    .collection("watchlist")
    .doc(code);

  const snap = await ref.get();

  if (!snap.exists) {
    return {
      ok: false,
      message: `你的自選股裡沒有 ${code}`
    };
  }

  await ref.delete();

  return {
    ok: true,
    message: `已從自選股移除：${code}`
  };
}

/**
 * 列出使用者的所有自選股
 * @param {string} lineUserId - LINE 使用者 ID
 * @returns {Promise<object>} 包含股票清單的結果物件
 */
export async function listWatchStocks(lineUserId) {
  const snap = await db
    .collection("users")
    .doc(lineUserId)
    .collection("watchlist")
    .orderBy("createdAt", "asc")
    .get();

  const stocks = snap.docs.map(doc => doc.data());

  if (stocks.length === 0) {
    return {
      ok: true,
      stocks: [],
      message: "你目前還沒有自選股。"
    };
  }

  return {
    ok: true,
    stocks,
    message: "以下是你的自選股。"
  };
}

/**
 * 取得使用者自選股的股價與基本資料
 * @param {string} lineUserId - LINE 使用者 ID
 * @returns {Promise<object>} 包含股價資訊的結果物件
 */
export async function getWatchPrices(lineUserId) {
  const list = await listWatchStocks(lineUserId);

  if (!list.stocks || list.stocks.length === 0) {
    return {
      ok: true,
      prices: [],
      message: "你目前還沒有自選股。"
    };
  }

  const listResult = await listWatchStocks(lineUserId);

  if (!listResult.ok) {
    return listResult;
  }

  const stocks = listResult.stocks || [];

  if (stocks.length === 0) {
    return {
      ok: true,
      prices: [],
      message: "你目前還沒有自選股。",
    };
  }

  const prices = [];

  for (const stock of stocks) {
    console.log("[getWatchPrices] Processing stock:", stock.symbol);
    const symbol = normalizeSymbol(stock.symbol);
    const market = stock.market || detectMarket(symbol);

    try {
      let price;
      if (market === "US") {
        price = await fetchUSStockLatest(symbol);
      } else {
        price = await fetchTaiwanStockLatest(symbol);
      }
      prices.push(price);
    } catch (err) {
      console.error(`[getWatchPrices] ${market} fetch failed:`, symbol, err);

      // 單一股票查詢失敗時保留錯誤在結果中，避免整份自選股回覆被中斷。
      prices.push({
        symbol,
        found: false,
        source: market === "US" ? "FINNHUB" : "TAIWAN_STOCK",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    ok: true,
    prices,
    message: "以下是你的自選股最近收盤資訊。",
  };
}
