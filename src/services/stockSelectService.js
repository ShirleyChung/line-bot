import { db } from "./firestore.js";

function normalizeSymbol(symbol) {
  return String(symbol).trim().toUpperCase().replace(".TW", "").replace(".TWO", "");
}

function isValidTaiwanStockSymbol(symbol) {
  return /^[0-9]{4,6}$/.test(symbol);
}

export async function addWatchStock(lineUserId, symbol) {
  const code = normalizeSymbol(symbol);

  if (!lineUserId) {
    throw new Error("addWatchStock 缺少 lineUserId");
  }

  if (!isValidTaiwanStockSymbol(code)) {
    return {
      ok: false,
      message: `股票代碼格式看起來不正確：${symbol}`,
    };
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
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return {
      ok: true,
      symbol: code,
      message: `${code} 已經在你的自選股中。`,
    };
  }

  await ref.set({
    symbol: code,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    ok: true,
    symbol: code,
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

export async function fetchTwseDailyAll() {
  const url = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`TWSE API failed: ${res.status}`);
  }

  return await res.json();
}

export async function getTwsePriceMap() {
  const rows = await fetchTwseDailyAll();

  const map = new Map();

  for (const row of rows) {
    const symbol =
      row.Code ||
      row["證券代號"] ||
      row["證券代號 "];

    if (!symbol) continue;

    map.set(String(symbol).trim(), row);
  }

  return map;
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

  const twseMap = await getTwsePriceMap();

  const prices = [];

  for (const stock of list.stocks) {
    const code = stock.symbol;
    const row = twseMap.get(code);

    if (!row) {
      prices.push({
        symbol: code,
        found: false,
        message: "查不到上市股資料，可能是上櫃、興櫃、ETF，或今日資料尚未更新。"
      });
      continue;
    }

    prices.push({
      symbol: code,
      name: row.Name || row["證券名稱"],
      close: row.ClosingPrice || row["收盤價"],
      change: row.Change || row["漲跌價差"],
      open: row.OpeningPrice || row["開盤價"],
      high: row.HighestPrice || row["最高價"],
      low: row.LowestPrice || row["最低價"],
      volume: row.TradeVolume || row["成交股數"],
      found: true
    });
  }

  return {
    ok: true,
    prices
  };
}