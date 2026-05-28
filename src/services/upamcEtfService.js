// services/upamcEtfService.js
// 統一投信 (UPAMC) ETF 成分股抓取。
// 資料來源：https://www.ezmoney.com.tw/ETF/Fund/AssetExcelNPOI?fundCode=XXX
// 該站會在第一次訪問時下發 __nxquid cookie 並 302 一次，
// 帶上 cookie 後才會回 OOXML xlsx。檔案內含 T-1 完整 PCF。

import zlib from "node:zlib";

const BASE = "https://www.ezmoney.com.tw";
const INIT_PATH = "/ETF";
const PCF_PATH = "/ETF/Fund/AssetExcelNPOI";
const UNIT_MARKET_RATIO_PATH = "/ETF/Transaction/UnitMarketRatio";

const COMMON_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
};

// 公開 ETF 代碼 → 站內 fundCode。從 ezmoney /ETF 首頁列表抓到。
// 若投信再發新 ETF，將代碼加進來即可。
export const UPAMC_CODE_MAP = Object.freeze({
  "00981A": "49YTW",
  "00403A": "63YTW",
  "00939":  "46YTW",
  "00988A": "61YTW",
  "00757":  "36YTW",
  "00853B": "37YTW",
  "00931B": "44YTW",
  "00966B": "47YTW",
  "009811": "50YTW",
});

export function isUpamcEtf(symbol) {
  const code = String(symbol || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(UPAMC_CODE_MAP, code);
}

const UPAMC_PREMIUM_CACHE_TTL_MS = 60 * 1000;
const upamcPremiumCache = new Map();

// 取 __nxquid cookie。第一次打 /ETF 會回 302 + Set-Cookie，照單收下即可。
async function fetchNxquidCookie() {
  const res = await fetch(BASE + INIT_PATH, {
    method: "GET",
    headers: COMMON_HEADERS,
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie") || "";
  const m = setCookie.match(/__nxquid=([^;]+)/);
  if (!m) {
    throw new Error(`統一投信 cookie 取得失敗（HTTP ${res.status}）`);
  }
  return `__nxquid=${m[1]}`;
}

function getSetCookieHeaders(res) {
  if (typeof res.headers.getSetCookie === "function") {
    return res.headers.getSetCookie();
  }
  const one = res.headers.get("set-cookie");
  return one ? [one] : [];
}

function pickCookie(setCookies, name) {
  for (const raw of setCookies || []) {
    const m = String(raw).match(new RegExp(`(?:^|\\s)${name}=([^;]+)`));
    if (m) return `${name}=${m[1]}`;
  }
  return null;
}

async function downloadPcfXlsx(fundCode) {
  const cookie = await fetchNxquidCookie();
  const url = `${BASE}${PCF_PATH}?fundCode=${encodeURIComponent(fundCode)}`;
  const res = await fetch(url, {
    headers: { ...COMMON_HEADERS, Cookie: cookie },
  });
  if (!res.ok) {
    throw new Error(`統一投信 PCF 下載失敗 HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // OOXML zip 開頭一定是 PK\x03\x04
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error("統一投信 PCF 內容不是 xlsx（可能被導回 HTML，cookie 失效）");
  }
  return buf;
}

// 從 ZIP 取單一檔案內容。只支援 store(0) 與 deflate(8)，符合 Excel 寫出的格式。
function readZipEntry(zipBuf, wantedName) {
  let off = 0;
  while (off + 30 <= zipBuf.length) {
    const sig = zipBuf.readUInt32LE(off);
    if (sig !== 0x04034b50) break; // 已到 Central Directory
    const method = zipBuf.readUInt16LE(off + 8);
    const compressedSize = zipBuf.readUInt32LE(off + 18);
    const nameLen = zipBuf.readUInt16LE(off + 26);
    const extraLen = zipBuf.readUInt16LE(off + 28);
    const name = zipBuf.slice(off + 30, off + 30 + nameLen).toString("utf8");
    const dataStart = off + 30 + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (name === wantedName) {
      const raw = zipBuf.slice(dataStart, dataEnd);
      if (method === 0) return raw;
      if (method === 8) return zlib.inflateRawSync(raw);
      throw new Error(`不支援的 ZIP 壓縮方式：${method}`);
    }
    off = dataEnd;
  }
  throw new Error(`xlsx 內找不到檔案：${wantedName}`);
}

// 解 sharedStrings.xml，回傳字串陣列（依序對應 sheet 中 t="s" 的 v 索引）。
function parseSharedStrings(xml) {
  const out = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRegex.exec(xml)) !== null) {
    const inner = m[1];
    let text = "";
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm;
    while ((tm = tRegex.exec(inner)) !== null) {
      text += decodeXmlEntities(tm[1]);
    }
    out.push(text);
  }
  return out;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// 把 sheet1.xml 解成 rows[]，每列是 { A: value, B: ..., ... }。
// 值會自動 dereference sharedStrings。
function parseSheet(xml, sharedStrings) {
  const rows = [];
  const rowRegex = /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(xml)) !== null) {
    const rowNum = Number(rm[1]);
    const cellsXml = rm[2];
    const row = { __r: rowNum };
    // 抓整顆 <c ...>...</c>；attrs 與 inner 分開處理，避免屬性順序造成 regex 卡死。
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cellRegex.exec(cellsXml)) !== null) {
      const attrs = cm[1];
      const inner = cm[2];
      const refMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!refMatch) continue;
      const col = refMatch[1];
      const typeMatch = attrs.match(/\bt="([^"]+)"/);
      const type = typeMatch ? typeMatch[1] : "n";
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (!vMatch) continue;
      const raw = decodeXmlEntities(vMatch[1]);
      let value;
      if (type === "s") {
        value = sharedStrings[Number(raw)] || "";
      } else if (type === "inlineStr") {
        const tm = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        value = tm ? decodeXmlEntities(tm[1]) : raw;
      } else {
        value = raw;
      }
      row[col] = value;
    }
    rows.push(row);
  }
  return rows;
}

// 民國 yyy/mm/dd → 西元 yyyy/mm/dd
function rocToAd(rocDate) {
  const m = String(rocDate || "").match(/(\d{2,3})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return rocDate || null;
  const year = Number(m[1]) + 1911;
  return `${year}/${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}`;
}

function extractHoldings(rows) {
  // 表頭有兩種：
  //   股票型：A=股票代號, B=股票名稱, C=股數,   D=持股權重
  //   債券型：A=債券代號, B=債券名稱, C=發行人, D=面額, E=持股權重
  // 動態找出表頭與權重欄位所在的欄母。
  let headerIdx = -1;
  let codeCol = null;
  let nameCol = null;
  let ratioCol = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    for (const col of Object.keys(r)) {
      if (col === "__r") continue;
      const v = r[col];
      if (typeof v !== "string") continue;
      if (/代號$/.test(v)) codeCol = col;
      else if (/名稱$/.test(v)) nameCol = col;
      else if (v === "持股權重") ratioCol = col;
    }
    if (codeCol && nameCol && ratioCol) {
      headerIdx = i;
      break;
    }
    codeCol = nameCol = ratioCol = null;
  }
  if (headerIdx < 0) return [];

  const holdings = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const code = (r[codeCol] || "").trim();
    const name = (r[nameCol] || "").trim();
    const ratio = (r[ratioCol] || "").trim();
    if (!code || !name || !ratio) continue;
    // 只接受百分比格式的權重列，避免誤吃多區塊報表中第二段（如 009811 美股 lot 段）的股數欄。
    if (!/^-?\d+(\.\d+)?\s*%$/.test(ratio)) continue;
    holdings.push({
      rank: holdings.length + 1,
      code,
      name,
      ratio,
    });
  }
  return holdings;
}

function extractDate(rows, sharedStrings) {
  // 資料日期：115/05/27 通常落在 A1。保險起見也掃 sharedStrings。
  const a1 = rows.find((r) => r.__r === 1)?.A;
  const candidates = [a1, ...sharedStrings];
  for (const v of candidates) {
    if (!v) continue;
    const m = String(v).match(/資料日期[：:]\s*(\d{2,3}\/\d{1,2}\/\d{1,2})/);
    if (m) return rocToAd(m[1]);
  }
  return null;
}

function parseUnitMarketRatioResponse(text) {
  const payload = JSON.parse(text);
  const parts = String(payload || "").split("|");

  if (parts.length < 2) {
    return null;
  }

  const positive = parts[0] ? JSON.parse(parts[0]) : [];
  const negative = parts[1] ? JSON.parse(parts[1]) : [];
  const points = [...positive, ...negative];

  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  let latest = null;
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const ts = Number(p[0]);
    const value = Number(p[1]);
    if (!Number.isFinite(ts) || !Number.isFinite(value)) continue;
    if (!latest || ts > latest.ts) {
      latest = { ts, value };
    }
  }

  return latest ? latest.value : null;
}

export async function fetchUpamcEtfPremium(symbol) {
  const code = String(symbol || "").trim().toUpperCase();
  const fundCode = UPAMC_CODE_MAP[code];

  if (!fundCode) {
    throw new Error(`統一投信無此 ETF：${code}`);
  }

  const now = Date.now();
  const cached = upamcPremiumCache.get(code);
  if (cached && now - cached.cachedAt < UPAMC_PREMIUM_CACHE_TTL_MS) {
    return cached.data;
  }

  const nxquid = await fetchNxquidCookie();
  const pageUrl = `${BASE}${UNIT_MARKET_RATIO_PATH}?fundCode=${encodeURIComponent(fundCode)}&agree=y`;
  const pageRes = await fetch(pageUrl, {
    method: "GET",
    headers: {
      ...COMMON_HEADERS,
      Cookie: nxquid,
    },
    redirect: "follow",
  });

  const pageText = await pageRes.text();

  if (!pageRes.ok) {
    throw new Error(`統一投信折溢價頁面讀取失敗 HTTP ${pageRes.status}`);
  }

  const tokenMatch = pageText.match(
    /name="__RequestVerificationToken"\s+type="hidden"\s+value="([^"]+)"/
  );
  if (!tokenMatch) {
    throw new Error("統一投信折溢價頁面缺少驗證資訊");
  }

  const csrfHidden = tokenMatch[1];
  const setCookies = getSetCookieHeaders(pageRes);
  const aspSession = pickCookie(setCookies, "ASP.NET_SessionId");
  const csrfCookie = pickCookie(setCookies, "__RequestVerificationToken");

  if (!aspSession || !csrfCookie) {
    throw new Error("統一投信折溢價頁面缺少必要 cookie");
  }

  const postRes = await fetch(`${BASE}${UNIT_MARKET_RATIO_PATH}`, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: BASE,
      Referer: pageUrl,
      __RequestVerificationToken: csrfHidden,
      Cookie: `${nxquid}; ${aspSession}; ${csrfCookie}`,
    },
    body: `Fund=${encodeURIComponent(fundCode)}`,
    redirect: "follow",
  });

  const postText = await postRes.text();

  if (!postRes.ok) {
    throw new Error(`統一投信折溢價查詢失敗 HTTP ${postRes.status}`);
  }

  const premiumPercent = parseUnitMarketRatioResponse(postText);
  if (premiumPercent == null) {
    const missing = {
      symbol: code,
      found: false,
      source: "UPAMC_EZMONEY_UNIT_MARKET_RATIO",
      message: "查無統一投信折溢價資料。",
    };
    upamcPremiumCache.set(code, {
      cachedAt: now,
      data: missing,
    });
    return missing;
  }

  const result = {
    symbol: code,
    found: true,
    source: "UPAMC_EZMONEY_UNIT_MARKET_RATIO",
    premiumPercent,
  };

  upamcPremiumCache.set(code, {
    cachedAt: now,
    data: result,
  });

  return result;
}

export async function fetchUpamcEtfHoldings(symbol) {
  const code = String(symbol || "").trim().toUpperCase();
  const fundCode = UPAMC_CODE_MAP[code];
  if (!fundCode) {
    throw new Error(`統一投信無此 ETF：${code}`);
  }

  const xlsx = await downloadPcfXlsx(fundCode);
  const sheetXml = readZipEntry(xlsx, "xl/worksheets/sheet1.xml").toString("utf8");
  const stringsXml = readZipEntry(xlsx, "xl/sharedStrings.xml").toString("utf8");
  const sharedStrings = parseSharedStrings(stringsXml);
  const rows = parseSheet(sheetXml, sharedStrings);

  const all = extractHoldings(rows);
  if (all.length === 0) {
    throw new Error("統一投信 PCF 解析不到任何成分股");
  }

  return {
    symbol: code,
    isEtf: true,
    date: extractDate(rows, sharedStrings),
    holdings: all.slice(0, 10).map((h) => ({
      rank: h.rank,
      name: `${h.code} ${h.name}`,
      ratio: h.ratio,
    })),
    totalHoldings: all.length,
    source: "UPAMC",
  };
}
