import { fetchTwseLatestClose } from "./twseStockDayService.js";
import {
  fetchTpexEmergingLatestAverage,
  fetchTpexListedLatestClose,
} from "./tpexStockService.js";
import { fetchTaiwanEtfPremium } from "./yahooEtfPremiumService.js";

function isFound(price) {
  return Boolean(price && price.found);
}

function shouldTryEtfPremium(symbol) {
  const code = String(symbol || "").trim().toUpperCase();
  return /^00\d{2,4}[A-Z]?$/.test(code);
}

async function withEtfPremium(price) {
  if (!isFound(price)) {
    return price;
  }

  if (!shouldTryEtfPremium(price.symbol)) {
    return price;
  }

  try {
    const premium = await fetchTaiwanEtfPremium(price.symbol);
    if (premium.found && premium.premiumPercent != null) {
      return {
        ...price,
        etfPremiumPercent: premium.premiumPercent,
      };
    }
  } catch (err) {
    console.warn("[fetchTaiwanStockLatest] ETF 折溢價查詢失敗：", price.symbol, err);
  }

  return price;
}

export async function fetchTaiwanStockLatest(symbol, dateYmd) {
  const code = String(symbol).trim().toUpperCase();
  const attempts = [];

  const twse = await fetchTwseLatestClose(code, dateYmd);
  attempts.push(twse);
  if (isFound(twse)) {
    return withEtfPremium({
      ...twse,
      market: "TWSE",
    });
  }

  let tpexListed;
  try {
    tpexListed = await fetchTpexListedLatestClose(code, dateYmd);
  } catch (err) {
    tpexListed = {
      symbol: code,
      found: false,
      source: "TPEX_TRADING_STOCK",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  attempts.push(tpexListed);
  if (isFound(tpexListed)) {
    return withEtfPremium(tpexListed);
  }

  let tpexEmerging;
  try {
    tpexEmerging = await fetchTpexEmergingLatestAverage(code, dateYmd);
  } catch (err) {
    tpexEmerging = {
      symbol: code,
      found: false,
      source: "TPEX_EMERGING_HISTORICAL",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  attempts.push(tpexEmerging);
  if (isFound(tpexEmerging)) {
    return withEtfPremium(tpexEmerging);
  }

  return {
    symbol: code,
    found: false,
    source: "TAIWAN_STOCK",
    message:
      "查無上市、上櫃或興櫃資料，可能是代碼錯誤、休市日、本月份尚無交易，或資料來源暫時無法查詢。",
    attempts,
  };
}
