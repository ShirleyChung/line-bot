import test from "node:test";
import assert from "node:assert/strict";

import { buildWatchPricesMessage } from "../src/utils/format.js";

test("台股股價訊息包含外資買進、賣出、買超與資料日", () => {
  const message = buildWatchPricesMessage([
    {
      symbol: "2330",
      name: "台積電",
      source: "TWSE_STOCK_DAY",
      found: true,
      date: "2026-07-30",
      close: 1000,
      change: 10,
      volume: 50000000,
      foreignTrading: {
        buy: 28519201,
        sell: 32476656,
        net: 3957455,
        date: "2026-07-30",
      },
    },
  ]);

  assert.match(message, /外資買進\/賣出：28,519,201 \/ 32,476,656 股/);
  assert.match(message, /外資買超：3,957,455 股/);
  assert.match(message, /外資資料日：2026-07-30/);
});

test("外資淨額為負數時顯示賣超及絕對股數", () => {
  const message = buildWatchPricesMessage([
    {
      symbol: "6488",
      name: "環球晶",
      source: "TPEX_TRADING_STOCK",
      found: true,
      date: "2026-07-30",
      close: 500,
      change: -5,
      volume: 1000000,
      foreignTrading: {
        buy: 2998203,
        sell: 4180933,
        net: -1182730,
        date: "2026-07-30",
      },
    },
  ]);

  assert.match(message, /外資賣超：1,182,730 股/);
  assert.doesNotMatch(message, /外資賣超：-/);
});
