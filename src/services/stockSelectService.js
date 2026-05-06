import { db } from "./firestore.js";
import { fetchTwseLatestClose } from "./twseStockDayService.js";
import { fetchUSStockLatest } from "./finnhubService.js";

function detectMarket(symbol) {
  const code = String(symbol).trim().toUpperCase();
  if (/^[A-Z]+$/.test(code) && code.length >= 1 && code.length <= 5) {
    return "US";
  }
  return "TW";
}

function normalizeSymbol(symbol) {
  return String(symbol).trim().toUpperCase().replace(".TW", "").replace(".TWO", "");
}

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
        price = await fetchTwseLatestClose(symbol);
      }
      prices.push(price);
    } catch (err) {
      console.error(`[getWatchPrices] ${market} fetch failed:`, symbol, err);

      prices.push({
        symbol,
        found: false,
        source: market === "US" ? "FINNHUB" : "TWSE_STOCK_DAY",
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