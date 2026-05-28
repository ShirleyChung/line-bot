// services/etfHoldingsService.js
// 透過 Yahoo 股市抓 ETF（含主動式 ETF）的前十大成分股。
// 對非 ETF 的個股，Yahoo 會把 /holding 重新導向回行情頁，藉此判別是否為 ETF。

const YAHOO_TW_HOLDING_URL = "https://tw.stock.yahoo.com/quote/";

const HOLDING_HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

function parseHoldings(html) {
  // 真正的前十大持股是被伺服器端渲染成 HTML 的清單，不在頁面內嵌的 JSON。
  // 結構大致長這樣：
  //   ...>前十大持股</h2>...<time datatime="2026/04/01">...
  //   <li>...<div>1.</div>台積電</div>...<div ...>8.97%</div></li>
  //   ...
  //   </ul>
  const blockMatch = html.match(/前十大持股<\/h2>([\s\S]+?)<\/ul>/);
  if (!blockMatch) return { date: null, holdings: [] };

  const block = blockMatch[1];

  let date = null;
  const dateMatch = block.match(/datatime="([^"]+)"/);
  if (dateMatch) date = dateMatch[1];

  const rowRegex = /<div[^>]*>(\d+)\.<\/div>([^<]+)<\/div><div[^>]*>([^<]+)<\/div>/g;
  const holdings = [];
  let m;
  while ((m = rowRegex.exec(block)) !== null) {
    const rank = Number(m[1]);
    const name = (m[2] || "").trim();
    const ratio = (m[3] || "").trim();
    if (!Number.isFinite(rank) || !name) continue;
    holdings.push({ rank, name, ratio });
  }

  holdings.sort((a, b) => a.rank - b.rank);
  return { date, holdings };
}

export async function fetchYahooEtfHoldings(symbol) {
  const code = String(symbol || "").trim().toUpperCase();
  if (!code) {
    throw new Error("缺少股票代碼");
  }

  const url = `${YAHOO_TW_HOLDING_URL}${encodeURIComponent(code)}.TW/holding`;
  console.log("[fetchYahooEtfHoldings] url =", url);

  const res = await fetch(url, {
    headers: HOLDING_HEADERS,
    redirect: "manual",
  });

  console.log("[fetchYahooEtfHoldings] status =", res.status);

  // 非 ETF：/holding 會被導回 quote 主頁
  if (res.status >= 300 && res.status < 400) {
    return { symbol: code, isEtf: false };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Yahoo 持股查詢失敗 HTTP ${res.status}：${text.slice(0, 200)}`);
  }

  const html = await res.text();
  const { date, holdings } = parseHoldings(html);

  if (holdings.length === 0) {
    throw new Error("無法從 Yahoo 持股頁解析出成分股資料");
  }

  return {
    symbol: code,
    isEtf: true,
    date,
    holdings,
    source: "YAHOO_TW",
  };
}

export function buildEtfHoldingsMessage(result) {
  if (!result || !result.isEtf) {
    return "不是ETF";
  }
  const header = `${result.symbol} 前十大持股${result.date ? `（${result.date}）` : ""}`;
  const lines = [header];
  for (const h of result.holdings) {
    lines.push(`${h.rank}. ${h.name} ${h.ratio}`);
  }
  return lines.join("\n");
}
