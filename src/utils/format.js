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

export function buildWatchPricesMessage(prices) {
  if (!prices || prices.length === 0) {
    return "你目前還沒有自選股。";
  }

  const firstDate = prices.find((p) => p.found && p.date)?.date;

  const lines = [];

  lines.push("最近收盤資訊");
  if (firstDate) {
    lines.push(`資料日期：${firstDate}`);
  }

  for (const p of prices) {
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
    lines.push(`成交量：${formatNumber(p.volume)}`);
  }

  lines.push("");
  lines.push("資料來源：TWSE 個股日成交資訊，非盤中即時報價。");

  return lines.join("\n");
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

    if (item.source || date) {
      lines.push(`  ${item.source}${item.source && date ? "｜" : ""}${date}`);
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