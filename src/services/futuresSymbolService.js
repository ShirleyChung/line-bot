// services/futuresSymbolService.js
//
// 把使用者輸入（自然語言 / TAIFEX 代碼 / Bloomberg 風格代碼）解析成 Yahoo 期貨頁網址用的 symbol。
// Yahoo 的編碼規則：W + 產品代碼(2~3字) + 契約後綴
//   後綴 "&" = 近月、"@" = 次月、"00" = 現貨
//   或 <月份字母><年末位> 指定月份，例如 M6 = 2026 年 6 月
// 月份字母對照 (沿用期貨業界共通)：F=1 G=2 H=3 J=4 K=5 M=6 N=7 Q=8 U=9 V=10 X=11 Z=12

const MONTH_LETTERS = {
  1: "F", 2: "G", 3: "H", 4: "J", 5: "K", 6: "M",
  7: "N", 8: "Q", 9: "U", 10: "V", 11: "X", 12: "Z",
};

const VALID_MONTH_LETTERS = new Set(Object.values(MONTH_LETTERS));

// 中文 / TAIFEX 代碼 / 別名 → Yahoo 產品代碼
const PRODUCT_ALIASES = [
  { yahoo: "WTX", taifex: "TXF", names: ["TX", "TXF", "台指期", "大台", "大台指", "臺指期"] },
  { yahoo: "WMT", taifex: "MXF", names: ["MXF", "MTX", "小台", "小型台指", "小台指"] },
  { yahoo: "WTM", taifex: "TMF", names: ["TMF", "微台", "微台指", "微型台指"] },
  { yahoo: "WTE", taifex: "TE",  names: ["TE", "電子期", "電子期貨"] },
  { yahoo: "WTF", taifex: "TF",  names: ["TF", "金融期", "金融期貨"] },
  { yahoo: "WXI", taifex: "XIF", names: ["XIF", "非金電", "非金電期"] },
  { yahoo: "WGT", taifex: "GTF", names: ["GTF", "櫃買期", "櫃買期貨"] },
];

const YAHOO_PRODUCT_CODES = new Set(PRODUCT_ALIASES.map((p) => p.yahoo));

function findProduct(token) {
  const t = String(token).trim().toUpperCase();
  if (!t) return null;
  for (const p of PRODUCT_ALIASES) {
    if (p.yahoo === t || p.taifex === t) return p;
    for (const name of p.names) {
      if (name.toUpperCase() === t) return p;
    }
  }
  return null;
}

function findProductByPrefix(text) {
  // 找出輸入字串裡最先出現的商品名稱，例如 "查台指期近月" → 命中「台指期」
  const upper = String(text).toUpperCase();
  let best = null;
  let bestIdx = Infinity;
  for (const p of PRODUCT_ALIASES) {
    const candidates = [p.yahoo, p.taifex, ...p.names];
    for (const c of candidates) {
      const idx = upper.indexOf(c.toUpperCase());
      if (idx >= 0 && idx < bestIdx) {
        best = { product: p, hit: c, idx };
        bestIdx = idx;
      }
    }
  }
  return best;
}

function todayTaipei() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === "year").value),
    month: Number(parts.find((p) => p.type === "month").value),
  };
}

function yearMonthToSuffix(yyyy, mm) {
  const month = Number(mm);
  const year = Number(yyyy);
  const letter = MONTH_LETTERS[month];
  if (!letter || !Number.isFinite(year)) return null;
  return `${letter}${year % 10}`;
}

function normalizeContract(raw) {
  // 把各種寫法轉成 Yahoo 後綴
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  const upper = text.toUpperCase();

  if (["近月", "近一", "1", "NEAR", "FRONT"].includes(upper)) return "&";
  if (["次月", "近二", "2", "NEXT"].includes(upper)) return "@";
  if (["現貨", "SPOT", "CASH", "00"].includes(upper)) return "00";

  // 月份字母 + 年末碼，例如 M6
  const letterMatch = upper.match(/^([FGHJKMNQUVXZ])(\d)$/);
  if (letterMatch) return `${letterMatch[1]}${letterMatch[2]}`;

  // YYYYMM
  const ymMatch = upper.match(/^(\d{4})(\d{2})$/);
  if (ymMatch) {
    const suffix = yearMonthToSuffix(ymMatch[1], ymMatch[2]);
    if (suffix) return suffix;
  }

  // YYYY/MM 或 YYYY-MM
  const ymSplit = upper.match(/^(\d{4})[\/\-](\d{1,2})$/);
  if (ymSplit) {
    const suffix = yearMonthToSuffix(ymSplit[1], ymSplit[2]);
    if (suffix) return suffix;
  }

  // YYMM 例如 2606
  const yymmMatch = upper.match(/^(\d{2})(\d{2})$/);
  if (yymmMatch) {
    const fullYear = 2000 + Number(yymmMatch[1]);
    const suffix = yearMonthToSuffix(fullYear, yymmMatch[2]);
    if (suffix) return suffix;
  }

  // 只有月份數字（如 "6" 或 "06"）— 視為今年該月
  const monthOnly = upper.match(/^(\d{1,2})月?$/);
  if (monthOnly) {
    const { year } = todayTaipei();
    const suffix = yearMonthToSuffix(year, monthOnly[1]);
    if (suffix) return suffix;
  }

  return null;
}

function tryDirectYahooSymbol(text) {
  // 已經是 Yahoo 格式：WTXM6 / WTX& / WTX@ / WTX00
  const t = String(text).trim().toUpperCase();
  if (!t) return null;

  const m = t.match(/^(W[A-Z]{2,3})([&@]|00|[FGHJKMNQUVXZ]\d)$/);
  if (m && YAHOO_PRODUCT_CODES.has(m[1])) {
    // Yahoo URL 的 & / @ 不能 encode，但組合 symbol 保持原樣即可
    return m[1] + m[2];
  }
  return null;
}

function tryBloombergStyle(text) {
  // TAIFEX 商品 + 月份字母 + 年末碼，例如 TXFF6 / MXFM6
  const t = String(text).trim().toUpperCase();
  const m = t.match(/^([A-Z]{2,4})([FGHJKMNQUVXZ])(\d)$/);
  if (!m) return null;
  const product = findProduct(m[1]);
  if (!product) return null;
  return `${product.yahoo}${m[2]}${m[3]}`;
}

function tryTaifexYearMonth(text) {
  // TAIFEX 商品 + YYYYMM，例如 TXF202606
  const t = String(text).trim().toUpperCase();
  const m = t.match(/^([A-Z]{2,4})(\d{4})(\d{2})$/);
  if (!m) return null;
  const product = findProduct(m[1]);
  if (!product) return null;
  const suffix = yearMonthToSuffix(m[2], m[3]);
  if (!suffix) return null;
  return `${product.yahoo}${suffix}`;
}

/**
 * 把 commodity / contract 兩個參數轉成 Yahoo 期貨 symbol。
 * 解析優先順序：
 *  1. commodity 已是 Yahoo 格式 → 直接使用
 *  2. commodity 是 Bloomberg 風格 (TXFF6) → 轉碼
 *  3. commodity 是 TAIFEX YYYYMM (TXF202606) → 轉碼
 *  4. commodity 命中商品別名 + contract 後綴 → 拼接
 *  5. commodity 字串裡能抓出商品別名 + contract 後綴 → 拼接
 *  6. 走到這裡都失敗 → 預設近月
 */
export function resolveFuturesSymbol(commodity, contract) {
  const commodityText = String(commodity || "").trim();
  if (!commodityText) {
    return { ok: false, message: "缺少商品資訊（例如台指期、小台、TXF）" };
  }

  const direct = tryDirectYahooSymbol(commodityText);
  if (direct) return { ok: true, symbol: direct, contractSource: "direct" };

  const bloomberg = tryBloombergStyle(commodityText);
  if (bloomberg) return { ok: true, symbol: bloomberg, contractSource: "bloomberg" };

  const taifexYm = tryTaifexYearMonth(commodityText);
  if (taifexYm) return { ok: true, symbol: taifexYm, contractSource: "taifex" };

  const directProduct = findProduct(commodityText);
  const productHit = directProduct
    ? { product: directProduct, hit: commodityText }
    : findProductByPrefix(commodityText);

  if (!productHit) {
    return {
      ok: false,
      message: `不認識的期貨商品「${commodityText}」。目前支援：台指期、小台、微台、電子期、金融期、非金電、櫃買期`,
    };
  }

  // 解析 contract：先用顯式參數，再從 commodityText 剩餘部分掏一次
  let suffix = normalizeContract(contract);

  if (!suffix) {
    // commodity 字串可能像「台指期 2606」、「小台 6月」、「TXF 近月」
    const leftover = commodityText
      .replace(productHit.hit, " ")
      .trim();
    if (leftover) suffix = normalizeContract(leftover);
  }

  if (!suffix) suffix = "&"; // 預設近月

  return {
    ok: true,
    symbol: `${productHit.product.yahoo}${suffix}`,
    contractSource: "composed",
  };
}

export const __TEST__ = {
  MONTH_LETTERS,
  PRODUCT_ALIASES,
  normalizeContract,
  tryBloombergStyle,
  tryTaifexYearMonth,
  tryDirectYahooSymbol,
};
