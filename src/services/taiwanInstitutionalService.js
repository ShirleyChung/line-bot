const CACHE_TTL_MS = 60 * 1000;
const cache = new Map();

const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

function parseNumber(value) {
  if (value == null) return null;
  const normalized = String(value).replace(/,/g, "").trim();
  if (!normalized || normalized === "--" || normalized === "---") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeDate(date) {
  const digits = String(date || "").replace(/\D/g, "");
  if (digits.length === 8) return digits;
  return "";
}

function formatAdDate(dateYmd) {
  const digits = normalizeDate(dateYmd);
  if (digits.length !== 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function convertRocDateToAd(value) {
  const match = String(value || "").match(/^(\d+)\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return "";
  return `${Number(match[1]) + 1911}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

async function fetchJson(cacheKey, url, referer) {
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const response = await fetch(url, {
    headers: {
      ...HEADERS,
      "Referer": referer,
    },
    redirect: "follow",
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`法人買賣資料查詢失敗：HTTP ${response.status}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("法人買賣資料來源回傳格式錯誤");
  }

  cache.set(cacheKey, { cachedAt: now, data: json });
  return json;
}

async function fetchTwseForeignTrading(symbol, dateYmd) {
  const date = normalizeDate(dateYmd);
  const url =
    "https://www.twse.com.tw/rwd/zh/fund/T86" +
    `?date=${encodeURIComponent(date)}` +
    "&selectType=ALLBUT0999" +
    "&response=json";
  const json = await fetchJson(
    `TWSE:${date}`,
    url,
    "https://www.twse.com.tw/zh/trading/foreign/t86.html"
  );

  if (json?.stat !== "OK") return null;

  const fields = Array.isArray(json.fields) ? json.fields : [];
  const codeIndex = fields.indexOf("證券代號");
  const buyIndex = fields.findIndex((field) => field.startsWith("外陸資買進股數"));
  const sellIndex = fields.findIndex((field) => field.startsWith("外陸資賣出股數"));
  const netIndex = fields.findIndex((field) => field.startsWith("外陸資買賣超股數"));
  const row = (json.data || []).find(
    (item) => String(item?.[codeIndex] || "").trim().toUpperCase() === symbol
  );

  if (!row || buyIndex < 0 || sellIndex < 0 || netIndex < 0) return null;

  return {
    buy: parseNumber(row[buyIndex]),
    sell: parseNumber(row[sellIndex]),
    net: parseNumber(row[netIndex]),
    date: formatAdDate(json.date || date),
    source: "TWSE T86",
  };
}

async function fetchTpexForeignTrading(symbol, dateYmd) {
  const digits = normalizeDate(dateYmd);
  const date = digits
    ? `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`
    : "";
  const url =
    "https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade" +
    `?date=${encodeURIComponent(date)}` +
    "&type=Daily" +
    "&response=json";
  const json = await fetchJson(
    `TPEX:${date}`,
    url,
    "https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html"
  );

  const table = Array.isArray(json?.tables) ? json.tables[0] : null;
  const row = (table?.data || []).find(
    (item) => String(item?.[0] || "").trim().toUpperCase() === symbol
  );
  if (!row) return null;

  // TPEx 前三個數值欄位是外資及陸資（不含外資自營商）的買進、賣出、買賣超股數。
  return {
    buy: parseNumber(row[2]),
    sell: parseNumber(row[3]),
    net: parseNumber(row[4]),
    date: convertRocDateToAd(table.date),
    source: "TPEx dailyTrade",
  };
}

export async function fetchTaiwanForeignTrading(symbol, market, date) {
  const code = String(symbol || "").trim().toUpperCase();
  const dateYmd = normalizeDate(date);
  if (!code || (market !== "TWSE" && market !== "TPEX")) return null;

  return market === "TWSE"
    ? fetchTwseForeignTrading(code, dateYmd)
    : fetchTpexForeignTrading(code, dateYmd);
}
