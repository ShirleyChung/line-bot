import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

/**
 * 內政部實價登錄房價查詢。
 *
 * 政府並沒有「帶條件即時查詢」的 API，官方開放資料是以「季」為單位、依縣市打包的
 * CSV 壓縮檔（plvr.land.moi.gov.tw 的 DownloadSeason）。因此這裡的做法是：
 *   1. 依查詢時間範圍換算出需要的「季別」（民國年 + 季）。
 *   2. 下載各季 ZIP，只取出目標縣市的成屋買賣檔 `${letter}_lvr_land_a.csv`。
 *   3. 自行解析 CSV，依鄉鎮市區 + 路名（地址子字串）過濾，計算平均單價、
 *      最新成交與一年內最高。
 * 歷史季別資料不會再變動，下載後永久快取；當季資料每月 1/11/21 更新，給短 TTL。
 */

const DOWNLOAD_BASE = "https://plvr.land.moi.gov.tw/DownloadSeason";
const CACHE_DIR = path.join(os.tmpdir(), "line-bot-lvr");
const CURRENT_SEASON_TTL_MS = 6 * 60 * 60 * 1000; // 當季資料 6 小時內沿用快取
const SQM_PER_PING = 3.305785; // 1 坪 = 3.305785 平方公尺

// 國民身分證英文代碼（縣市）→ 實價登錄檔名前綴字母。輸入一律先把「臺」正規化為「台」。
const COUNTY_LETTERS = {
  台北市: "a",
  台中市: "b",
  基隆市: "c",
  台南市: "d",
  高雄市: "e",
  新北市: "f",
  宜蘭縣: "g",
  桃園市: "h",
  嘉義市: "i",
  新竹縣: "j",
  苗栗縣: "k",
  南投縣: "m",
  彰化縣: "n",
  新竹市: "o",
  雲林縣: "p",
  嘉義縣: "q",
  屏東縣: "t",
  花蓮縣: "u",
  台東縣: "v",
  金門縣: "w",
  澎湖縣: "x",
  連江縣: "z",
};

// 進程內解析結果快取，避免同一次查詢多次讀檔/解析同一季。
const seasonRowsCache = new Map();

function normalizeTw(value) {
  return String(value || "")
    .trim()
    .replace(/臺/g, "台")
    // 實價登錄地址的門牌號是全形數字（例如 １６９號），統一轉半形方便比對。
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}

/**
 * 把使用者輸入的路名拆成「路名」與「門牌號」。
 * 例如「紅樹林路169號」→ { roadName: "紅樹林路", houseNumber: 169 }，
 * 「忠孝東路四段176號」→ { roadName: "忠孝東路四段", houseNumber: 176 }，
 * 「紅樹林路」→ { roadName: "紅樹林路", houseNumber: null }。
 */
function parseRoad(road) {
  const norm = normalizeTw(road);
  if (!norm) return { roadName: "", houseNumber: null };
  // 路名至少要以一個非數字字元結尾，後面才是門牌號（可省略「號」）。
  const m = norm.match(/^(.*?\D)(\d+)(?:之\d+)?號?$/);
  if (m) {
    return { roadName: m[1], houseNumber: Number(m[2]) };
  }
  return { roadName: norm, houseNumber: null };
}

/** 判斷地址（已正規化）是否符合路名 + 門牌號。masked 區段（1~30號）以範圍包含判斷。 */
function addressMatches(normAddress, roadName, houseNumber) {
  if (roadName && !normAddress.includes(roadName)) return false;
  if (houseNumber == null) return true;

  const after = roadName
    ? normAddress.slice(normAddress.indexOf(roadName) + roadName.length)
    : normAddress;

  const range = after.match(/(\d+)\s*[~～]\s*(\d+)號/);
  if (range) {
    return houseNumber >= Number(range[1]) && houseNumber <= Number(range[2]);
  }
  // 門牌號需正好出現在「號」前（允許 169之1號 / 169-1號），避免 169 誤配 1169。
  return new RegExp(`(?<![0-9])${houseNumber}(?:[-之][0-9]+)?號`).test(after);
}

function getCountyLetter(city) {
  const key = normalizeTw(city);
  if (COUNTY_LETTERS[key]) return COUNTY_LETTERS[key];
  // 容許未帶「市/縣」或多餘字樣，例如「台北」「台北市信義區」。
  for (const [name, letter] of Object.entries(COUNTY_LETTERS)) {
    const bare = name.replace(/[市縣]$/, "");
    if (key.startsWith(name) || key.startsWith(bare)) return letter;
  }
  return "";
}

/** 取得 Asia/Taipei 當下時間（伺服器多為 UTC，統一 +8 計算日期區間）。 */
function taipeiNow() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

function seasonOf(date) {
  const rocYear = date.getUTCFullYear() - 1911;
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return { rocYear, quarter };
}

function seasonString({ rocYear, quarter }) {
  return `${rocYear}S${quarter}`;
}

/** 從 fromDate 所在季往回列出 count 個季別字串（新到舊）。 */
function listSeasonsBack(fromDate, count) {
  const seasons = [];
  let { rocYear, quarter } = seasonOf(fromDate);
  for (let i = 0; i < count; i++) {
    seasons.push(seasonString({ rocYear, quarter }));
    quarter -= 1;
    if (quarter < 1) {
      quarter = 4;
      rocYear -= 1;
    }
  }
  return seasons;
}

function currentSeasonString() {
  return seasonString(seasonOf(taipeiNow()));
}

/** 民國日期字串（例如 1140203）轉西元 Date。 */
function rocDateToDate(raw) {
  const digits = String(raw || "").trim();
  if (!/^\d{6,7}$/.test(digits)) return null;
  const padded = digits.padStart(7, "0");
  const year = Number(padded.slice(0, 3)) + 1911;
  const month = Number(padded.slice(3, 5));
  const day = Number(padded.slice(5, 7));
  if (!month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

function formatYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ===== 最小化 ZIP 讀取（只用內建 zlib，免外部相依套件）=====

function findEocd(buf) {
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/** 從 ZIP buffer 取出指定檔名的內容（找不到回傳 null）。 */
function extractZipEntry(buf, entryName) {
  const eocd = findEocd(buf);
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    if (name.toLowerCase() === entryName.toLowerCase()) {
      if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const comp = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return comp;
      if (method === 8) return zlib.inflateRawSync(comp);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ===== CSV 解析（處理引號內逗號/換行）=====

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * 下載並取出某季、某縣市的成屋買賣 CSV 文字（含磁碟快取）。下載失敗或當季尚未發布
 * 時回傳空字串，由上層忽略該季。
 */
async function fetchSeasonCountyCsv(season, letter) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${season}_${letter}_a.csv`);
  const isCurrent = season === currentSeasonString();

  if (fs.existsSync(cacheFile)) {
    const fresh = !isCurrent || Date.now() - fs.statSync(cacheFile).mtimeMs < CURRENT_SEASON_TTL_MS;
    if (fresh) return fs.readFileSync(cacheFile, "utf8");
  }

  const url = `${DOWNLOAD_BASE}?season=${season}&type=zip&fileName=lvr_landcsv.zip`;
  let buf;
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    buf = Buffer.from(await res.arrayBuffer());
  } catch {
    return "";
  }

  const entry = extractZipEntry(buf, `${letter}_lvr_land_a.csv`);
  if (!entry) return "";
  const csv = entry.toString("utf8");
  try {
    fs.writeFileSync(cacheFile, csv);
  } catch {
    /* 快取寫入失敗不影響本次查詢 */
  }
  return csv;
}

/** 解析某季某縣市的所有成交列（建物相關、單價有效），結果於進程內快取。 */
async function getSeasonRows(season, letter) {
  const cacheKey = `${season}_${letter}`;
  if (seasonRowsCache.has(cacheKey)) return seasonRowsCache.get(cacheKey);

  const csv = await fetchSeasonCountyCsv(season, letter);
  const result = [];
  if (csv) {
    const table = parseCsv(csv);
    // 第 1 列是中文表頭，第 2 列是英文表頭，資料從第 3 列開始。
    const header = (table[0] || []).map((h) => normalizeTw(h).replace(/^﻿/, ""));
    const idx = (name) => header.indexOf(name);
    const iDistrict = idx("鄉鎮市區");
    const iAddress = idx("土地位置建物門牌");
    const iTarget = idx("交易標的");
    const iDate = idx("交易年月日");
    const iUnit = idx("單價元平方公尺");
    const iTotal = idx("總價元");
    const iType = idx("建物型態");

    for (let r = 2; r < table.length; r++) {
      const cols = table[r];
      if (!cols || cols.length <= iUnit) continue;
      const target = cols[iTarget] || "";
      // 只取含建物的成交（房地、建物），排除純土地與車位。
      if (!target.includes("建物")) continue;
      const unit = Number(cols[iUnit]);
      if (!Number.isFinite(unit) || unit <= 0) continue;
      const date = rocDateToDate(cols[iDate]);
      if (!date) continue;

      result.push({
        district: normalizeTw(cols[iDistrict]),
        address: cols[iAddress] || "",
        target,
        buildingType: cols[iType] || "",
        date,
        unitPerSqm: unit,
        unitPerPing: unit * SQM_PER_PING,
        totalPrice: Number(cols[iTotal]) || 0,
      });
    }
  }

  seasonRowsCache.set(cacheKey, result);
  return result;
}

function pickMatching(rows, district, road) {
  const wantDistrict = normalizeTw(district);
  const { roadName, houseNumber } = parseRoad(road);
  return rows.filter((row) => {
    if (wantDistrict && row.district !== wantDistrict) return false;
    if (!roadName) return true;
    return addressMatches(normalizeTw(row.address), roadName, houseNumber);
  });
}

/**
 * 查詢房價。
 *
 * @param {object} params
 * @param {string} params.city - 縣市，例如 台北市、新北市。
 * @param {string} params.district - 鄉鎮市區，例如 大安區、淡水區。
 * @param {string} [params.road] - 路/街名（地址子字串），可留空表示整個行政區。
 * @param {number} [params.rangeMonths] - 平均房價的時間範圍（往前幾個月），預設 12。
 */
export async function queryHousePrice({ city, district, road = "", rangeMonths = 12 }) {
  const letter = getCountyLetter(city);
  if (!letter) {
    return { ok: false, message: `無法辨識縣市「${city}」，請提供台灣縣市名稱（例如台北市、新北市）。` };
  }
  if (!normalizeTw(district)) {
    return { ok: false, message: "請提供鄉鎮市區（例如大安區、淡水區）。" };
  }

  const months = Number(rangeMonths) > 0 ? Number(rangeMonths) : 12;
  const now = taipeiNow();
  // 至少涵蓋 12 個月（供「一年內最高」使用），範圍更長時再延伸；多抓 1 季緩衝發布落差。
  const seasonCount = Math.min(Math.max(Math.ceil(months / 3) + 1, 5), 9);
  let seasons = listSeasonsBack(now, seasonCount);

  const collect = async (seasonList) => {
    const batches = await Promise.all(seasonList.map((s) => getSeasonRows(s, letter)));
    return pickMatching(batches.flat(), district, road);
  };

  let matched = await collect(seasons);

  // 完全查無資料時，往更舊的季別延伸（最多再 4 季，約共 3 年），以便回退到最近一筆。
  if (!matched.length) {
    const extra = listSeasonsBack(now, seasonCount + 4).slice(seasonCount);
    if (extra.length) matched = matched.concat(await collect(extra));
  }

  if (!matched.length) {
    const where = `${normalizeTw(city)}${normalizeTw(district)}${normalizeTw(road)}`;
    return { ok: false, message: `查無「${where}」近三年的實價登錄成交資料。` };
  }

  matched.sort((a, b) => b.date - a.date);
  const latest = matched[0];

  const rangeStart = new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
  const oneYearStart = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  const inRange = matched.filter((row) => row.date >= rangeStart);
  const inYear = matched.filter((row) => row.date >= oneYearStart);

  const avgSet = inRange.length ? inRange : null; // 範圍內無資料 → 走回退
  const avgPing = avgSet
    ? avgSet.reduce((sum, row) => sum + row.unitPerPing, 0) / avgSet.length
    : null;

  const highSet = inYear.length ? inYear : matched;
  const yearHigh = highSet.reduce((best, row) => (row.unitPerPing > best.unitPerPing ? row : best));

  return {
    ok: true,
    city: normalizeTw(city),
    district: normalizeTw(district),
    road: normalizeTw(road),
    months,
    rangeCount: inRange.length,
    totalCount: matched.length,
    avgPerPing: avgPing,
    latest,
    yearHigh,
    yearHighIsFallback: inYear.length === 0,
    fellBack: inRange.length === 0,
  };
}

function fmtInt(n) {
  return Math.round(n).toLocaleString("en-US");
}

function fmtPing(perPing) {
  return `${(perPing / 10000).toFixed(1)} 萬/坪`;
}

function fmtTotalWan(total) {
  if (!total) return "";
  return `總價 ${fmtInt(total / 10000)} 萬`;
}

function describeMonths(months) {
  if (months < 1) return `近${Math.round(months * 30)}天`;
  if (Number.isInteger(months)) return `近${months}個月`;
  return `近${months}個月`;
}

function dealLine(row) {
  const parts = [
    `${formatYmd(row.date)}`,
    row.address || row.district,
    fmtPing(row.unitPerPing),
  ];
  const total = fmtTotalWan(row.totalPrice);
  if (total) parts.push(total);
  return parts.join("｜");
}

/** 把查詢結果整理成可直接回覆使用者的 LINE 文字。 */
export function formatHousePriceReply(result) {
  if (!result.ok) return result.message;

  const where = `${result.city}${result.district}${result.road}`;
  const lines = [`${where} 實價登錄房價`];

  if (result.fellBack) {
    lines.push(`${describeMonths(result.months)}查無成交，以下為最近成交與一年內最高。`);
  } else {
    lines.push(`平均區間：${describeMonths(result.months)}（${result.rangeCount} 筆成交）`);
    lines.push("");
    lines.push(`平均單價：${fmtPing(result.avgPerPing)}`);
  }

  lines.push("");
  lines.push(`最新成交：${dealLine(result.latest)}`);

  const highLabel = result.yearHighIsFallback ? "歷來最高（一年內無成交）" : "一年內最高";
  lines.push(`${highLabel}：${dealLine(result.yearHigh)}`);

  lines.push("");
  lines.push("資料來源：內政部不動產成交案件實價登錄（地址去識別化，為區段門牌）。");

  return lines.join("\n");
}
