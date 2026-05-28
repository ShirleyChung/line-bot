/**
 * 這裡放一些格式化相關的小工具
 */

/**
 * 將日期格式化成 M/D
 * @param {Date} date
 * @returns {string}
 */
export function formatMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 判斷是否為 URL 字串
 * @param {string} text
 * @returns {boolean}
 */
export function isUrl(text) {
  return /^https?:\/\/\S+$/i.test(text);
}

function formatNumber(value) {
  if (value == null || value === "") return "-";

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return String(value);
  }

  return n.toLocaleString("en-US");
}

function formatPrice(value) {
  if (value == null || value === "") return "-";

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return String(value);
  }

  // 整數就不要小數，ETF 這種小數保留 2 位
  if (Number.isInteger(n)) {
    return n.toLocaleString("en-US");
  }

  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatChange(value) {
  if (value == null || value === "") return "-";

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return String(value);
  }

  const absText = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });

  if (n > 0) return `+${absText}`;
  if (n < 0) return `-${absText}`;
  return "0";
}

function formatRatio(value) {
  if (value == null || value === "") return "-";

  const n = Number(value);

  if (!Number.isFinite(n)) {
    return String(value);
  }

  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatFundamentalLines(fundamentals) {
  if (!fundamentals) return [];

  const hasAnyValue = [
    fundamentals.eps,
    fundamentals.dividendYield,
    fundamentals.peRatio,
    fundamentals.pbRatio,
  ].some((value) => value != null && value !== "");

  if (!hasAnyValue) return [];

  const lines = [];
  const epsLabel = fundamentals.epsEstimated ? "EPS(估)" : "EPS";

  lines.push(`${epsLabel}：${formatRatio(fundamentals.eps)}`);
  lines.push(`殖利率：${formatRatio(fundamentals.dividendYield)}%`);

  if (fundamentals.peRatio != null || fundamentals.pbRatio != null) {
    lines.push(`本益比/PB：${formatRatio(fundamentals.peRatio)} / ${formatRatio(fundamentals.pbRatio)}`);
  }

  if (fundamentals.fiscalPeriod) {
    lines.push(`財報期：${fundamentals.fiscalPeriod}`);
  }

  return lines;
}

export function buildWatchPricesMessage(prices) {
  if (!prices || prices.length === 0) {
    return "你目前還沒有自選股。";
  }

  const twStocks = prices.filter(p => p.source === "TWSE_STOCK_DAY");
  const tpexStocks = prices.filter(p => p.source === "TPEX_TRADING_STOCK");
  const emergingStocks = prices.filter(p => (
    p.source === "TPEX_EMERGING_LATEST" ||
    p.source === "TPEX_EMERGING_HISTORICAL"
  ));
  const unknownTwStocks = prices.filter(p => p.source === "TAIWAN_STOCK");
  const usStocks = prices.filter(p => p.source === "FINNHUB");

  const lines = [];
  lines.push("最近收盤資訊");
  lines.push("");

  if (twStocks.length > 0) {
    lines.push("【上市】");
    const firstDate = twStocks.find((p) => p.found && p.date)?.date;
    if (firstDate) {
      lines.push(`資料日期：${firstDate}`);
    }

    for (const p of twStocks) {
      lines.push("");

      if (!p.found) {
        lines.push(`${p.symbol || "未知代碼"}`);
        lines.push(`查詢失敗：${p.message || "查無資料"}`);
        continue;
      }

      const name = p.name || "未取得名稱";
      const symbol = p.symbol || "";

      lines.push(`${name}：${symbol}`);
      lines.push(`價：${formatPrice(p.close)} ${formatChange(p.change)}`);
      lines.push(...formatFundamentalLines(p.fundamentals));
      lines.push(`成交量：${formatNumber(p.volume)}`);
    }

    lines.push("");
    lines.push("資料來源：TWSE 個股日成交資訊");
  }

  if (tpexStocks.length > 0) {
    if (twStocks.length > 0) {
      lines.push("");
    }
    lines.push("【上櫃】");
    const firstDate = tpexStocks.find((p) => p.found && p.date)?.date;
    if (firstDate) {
      lines.push(`資料日期：${firstDate}`);
    }

    for (const p of tpexStocks) {
      lines.push("");

      if (!p.found) {
        lines.push(`${p.symbol || "未知代碼"}`);
        lines.push(`查詢失敗：${p.message || "查無資料"}`);
        continue;
      }

      const name = p.name || "未取得名稱";
      const symbol = p.symbol || "";

      lines.push(`${name}：${symbol}`);
      lines.push(`價：${formatPrice(p.close)} ${formatChange(p.change)}`);
      lines.push(...formatFundamentalLines(p.fundamentals));
      lines.push(`成交量：${formatNumber(p.volume)}`);
    }

    lines.push("");
    lines.push("資料來源：TPEx 個股日成交資訊");
  }

  if (emergingStocks.length > 0) {
    if (twStocks.length > 0 || tpexStocks.length > 0) {
      lines.push("");
    }
    lines.push("【興櫃】");
    const firstDate = emergingStocks.find((p) => p.found && p.date)?.date;
    if (firstDate) {
      lines.push(`資料日期：${firstDate}`);
    }

    for (const p of emergingStocks) {
      lines.push("");

      if (!p.found) {
        lines.push(`${p.symbol || "未知代碼"}`);
        lines.push(`查詢失敗：${p.message || "查無資料"}`);
        continue;
      }

      const name = p.name || "未取得名稱";
      const symbol = p.symbol || "";

      lines.push(`${name}：${symbol}`);
      lines.push(`均價：${formatPrice(p.close)}`);
      if (p.high != null && p.low != null) {
        lines.push(`高/低：${formatPrice(p.high)} / ${formatPrice(p.low)}`);
      }
      lines.push(`成交量：${formatNumber(p.volume)}`);
    }

    lines.push("");
    const hasLatest = emergingStocks.some((p) => p.source === "TPEX_EMERGING_LATEST");
    lines.push(`資料來源：${hasLatest ? "TPEx 興櫃股票當日行情表" : "TPEx 興櫃個股歷史行情"}`);
  }

  if (unknownTwStocks.length > 0) {
    if (twStocks.length > 0 || tpexStocks.length > 0 || emergingStocks.length > 0) {
      lines.push("");
    }
    lines.push("【台股】");

    for (const p of unknownTwStocks) {
      lines.push("");
      lines.push(`${p.symbol || "未知代碼"}`);
      lines.push(`查詢失敗：${p.message || "查無資料"}`);
    }
  }

  if (usStocks.length > 0) {
    if (twStocks.length > 0 || tpexStocks.length > 0 || emergingStocks.length > 0 || unknownTwStocks.length > 0) {
      lines.push("");
    }
    lines.push("【美股】");

    for (const p of usStocks) {
      lines.push("");

      if (!p.found) {
        lines.push(`${p.symbol || "未知代碼"}`);
        lines.push(`查詢失敗：${p.message || "查無資料"}`);
        continue;
      }

      const name = p.name || p.symbol || "未取得名稱";
      const symbol = p.symbol || "";

      lines.push(`${name} (${symbol})`);
      lines.push(`價：$${formatPrice(p.close)} ${formatChange(p.change)} (${formatChange(p.changePercent)}%)`);
      lines.push(...formatFundamentalLines(p.fundamentals));
      
      if (p.high != null && p.low != null) {
        lines.push(`高/低：$${formatPrice(p.high)} / $${formatPrice(p.low)}`);
      }
    }

    lines.push("");
    lines.push("資料來源：Finnhub 即時報價");
  }

  return lines.join("\n").trim();
}

export function buildFuturesQuoteMessage(quote, request = {}) {
  if (!quote) {
    return "查無期貨報價。";
  }

  if (!quote.found) {
    const label = request.commodity
      ? `${request.commodity}${request.contract ? ` ${request.contract}` : ""}`
      : quote.symbol || "期貨";
    return `查詢失敗：${label}\n${quote.message || "查無資料"}`;
  }

  const lines = [];
  lines.push("【期貨報價】");
  lines.push("");

  const titleParts = [quote.name || quote.symbol];
  if (quote.symbol && quote.symbol !== quote.name) {
    titleParts.push(`(${quote.symbol})`);
  }
  lines.push(titleParts.join(" "));

  if (quote.time) {
    const sessionTag = quote.session ? `｜${quote.session}` : "";
    lines.push(`資料時間：${quote.time}${sessionTag}`);
  }

  const change = formatChange(quote.change);
  const pct = quote.changePercent ? ` (${quote.changePercent})` : "";
  lines.push(`價：${formatPrice(quote.close)} ${change}${pct}`);

  if (quote.open != null || quote.high != null || quote.low != null) {
    lines.push(`開/高/低：${formatPrice(quote.open)} / ${formatPrice(quote.high)} / ${formatPrice(quote.low)}`);
  }

  if (quote.previousClose != null) {
    lines.push(`前日收：${formatPrice(quote.previousClose)}`);
  }

  if (quote.volume != null) {
    lines.push(`成交量：${formatNumber(quote.volume)} 口`);
  }

  if (quote.openInterest != null) {
    lines.push(`未平倉：${formatNumber(quote.openInterest)} 口`);
  }

  lines.push("");
  lines.push("資料來源：Yahoo 奇摩股市");

  return lines.join("\n").trim();
}

export function buildNewsMessage(news, query = "") {
  const items = Array.isArray(news) ? news : [];

  if (items.length === 0) {
    return `目前查不到「${query}」相關新聞。`;
  }

  const lines = [];

  lines.push(`📰 「${query}」相關新聞`);
  lines.push("");

  for (const item of items.slice(0, 5)) {
    const date = item.publishedAt
      ? item.publishedAt.replace("T", " ").slice(0, 16)
      : "";

    lines.push(`• ${item.title}`);

    const source = item.provider
      ? `${item.source || "新聞來源"} / ${item.provider}`
      : item.source;

    if (source || date) {
      lines.push(`  ${source}${source && date ? "｜" : ""}${date}`);
    }

    if (item.description) {
      lines.push(`  ${item.description.slice(0, 80)}`);
    }

    if (item.url) {
      lines.push(`  ${item.url}`);
    }

    lines.push("");
  }

  return lines.join("\n").trim();
}
