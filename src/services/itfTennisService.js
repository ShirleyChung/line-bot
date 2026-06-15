import { searchWeb } from "./webSearchService.js";

const ITF_TOURS = {
  juniors: {
    key: "juniors",
    label: "ITF World Tennis Tour Juniors",
    calendarPath: "/en/tournament-calendar/world-tennis-tour-juniors-calendar/",
    levels: ["J500", "J300", "J200", "J100", "J60", "J30"],
  },
};

const ITF_BASE_URL = "https://www.itftennis.com";
const REQUEST_TIMEOUT_MS = 15000;
const REGION_KEYWORDS = {
  asia: ["Asia", "Japan", "China", "Chinese Taipei", "Taiwan", "Hong Kong", "Korea", "India", "Thailand", "Malaysia", "Indonesia", "Philippines", "Singapore", "Vietnam", "Kazakhstan", "Uzbekistan"],
  europe: ["Europe", "United Kingdom", "Great Britain", "France", "Germany", "Italy", "Spain", "Netherlands", "Belgium", "Sweden", "Norway", "Denmark", "Finland", "Poland", "Czech Republic", "Austria", "Switzerland", "Portugal", "Greece", "Romania", "Serbia", "Croatia", "Slovakia", "Slovenia", "Hungary", "Bulgaria", "Ukraine", "Ireland"],
  north_america: ["North America", "United States", "USA", "Canada", "Mexico", "Dominican Republic", "Puerto Rico", "Guatemala", "Costa Rica", "Panama"],
  south_america: ["South America", "Brazil", "Argentina", "Chile", "Colombia", "Peru", "Uruguay", "Paraguay", "Ecuador", "Bolivia", "Venezuela"],
  oceania: ["Oceania", "Australia", "New Zealand", "Fiji", "Papua New Guinea"],
  africa: ["Africa", "South Africa", "Egypt", "Morocco", "Tunisia", "Kenya", "Zimbabwe", "Botswana", "Namibia", "Nigeria", "Algeria"],
  middle_east: ["Middle East", "United Arab Emirates", "UAE", "Qatar", "Saudi Arabia", "Israel", "Jordan", "Lebanon", "Kuwait", "Bahrain"],
};

function getTaipeiTodayDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeTour(tour) {
  const value = String(tour || "juniors").trim().toLowerCase();
  return ITF_TOURS[value] || ITF_TOURS.juniors;
}

function normalizeLevel(level, tourConfig) {
  const value = String(level || "").trim().toUpperCase();
  if (!value) return "";
  if (!tourConfig.levels.includes(value)) {
    throw new Error(`不支援的 ITF 賽事等級：${level}`);
  }
  return value;
}

function normalizeDateInput(date) {
  const value = String(date || "").trim();
  if (!value) return getTaipeiTodayDate();

  const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];

  const monthMatch = value.match(/^(\d{4}-\d{2})$/);
  if (monthMatch) return `${monthMatch[1]}-01`;

  throw new Error(`日期格式錯誤：${date}，請使用 YYYY-MM-DD 或 YYYY-MM`);
}

function compareDateText(a, b) {
  return String(a).localeCompare(String(b));
}

function normalizeDateRange(startDate, endDate) {
  const normalizedStartDate = normalizeDateInput(startDate);
  const normalizedEndDate = endDate ? normalizeDateInput(endDate) : "";

  if (normalizedEndDate && compareDateText(normalizedStartDate, normalizedEndDate) > 0) {
    throw new Error(`結束日期不可早於開始日期：${normalizedStartDate} > ${normalizedEndDate}`);
  }

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
  };
}

function normalizeMonthInput(value, fallbackDate = "") {
  const text = String(value || "").trim();
  if (!text) return String(fallbackDate || getTaipeiTodayDate()).slice(0, 7);

  const monthMatch = text.match(/^(\d{4}-\d{2})$/);
  if (monthMatch) return monthMatch[1];

  const dateMatch = text.match(/^(\d{4}-\d{2})-\d{2}$/);
  if (dateMatch) return dateMatch[1];

  throw new Error(`月份格式錯誤：${value}，請使用 YYYY-MM 或 YYYY-MM-DD`);
}

function compareMonthText(a, b) {
  return String(a).localeCompare(String(b));
}

function buildMonthRange(startMonth, endMonth) {
  const normalizedStartMonth = normalizeMonthInput(startMonth);
  const normalizedEndMonth = endMonth ? normalizeMonthInput(endMonth) : normalizedStartMonth;

  if (compareMonthText(normalizedStartMonth, normalizedEndMonth) > 0) {
    throw new Error(`結束月份不可早於開始月份：${normalizedStartMonth} > ${normalizedEndMonth}`);
  }

  const months = [];
  let [year, month] = normalizedStartMonth.split("-").map(Number);
  const [endYear, endMonthNumber] = normalizedEndMonth.split("-").map(Number);

  while (year < endYear || (year === endYear && month <= endMonthNumber)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return {
    startMonth: normalizedStartMonth,
    endMonth: normalizedEndMonth,
    months,
  };
}

function normalizeRegion(region) {
  const value = String(region || "Asia").trim();
  if (!value) return { key: "", label: "", keywords: [] };

  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  if (REGION_KEYWORDS[normalized]) {
    return {
      key: normalized,
      label: value,
      keywords: REGION_KEYWORDS[normalized],
    };
  }

  return {
    key: normalized,
    label: value,
    keywords: [value],
  };
}

function compactText(value, max = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(value, max = 500) {
  return compactText(decodeHtml(String(value || "").replace(/<[^>]+>/g, " ")), max);
}

function cleanupTitle(value) {
  return compactText(stripHtml(value).replace(/\s*\|\s*ITF.*$/i, ""), 140);
}

function titleFromTournamentUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const tournamentIndex = parts.indexOf("tournament");
    const slug = tournamentIndex >= 0 ? parts[tournamentIndex + 1] : "";
    if (!slug) return "";

    return slug
      .split("-")
      .filter(Boolean)
      .map((part) => (part.length <= 4 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
      .join(" ");
  } catch {
    return "";
  }
}

function locationFromTournamentUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const tournamentIndex = parts.indexOf("tournament");
    const slug = tournamentIndex >= 0 ? parts[tournamentIndex + 1] : "";
    const countryCode = tournamentIndex >= 0 ? parts[tournamentIndex + 2] : "";
    const place = slug
      .split("-")
      .filter((part) => !/^j\d{2,3}$/i.test(part) && !/^\d{4}$/.test(part))
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(" ");

    return [place, countryCode ? countryCode.toUpperCase() : ""].filter(Boolean).join(", ");
  } catch {
    return "";
  }
}

function levelFromTournamentUrl(url) {
  const match = String(url || "").match(/\/(j\d{2,3})[-/]/i) || String(url || "").match(/\b(J\d{2,3})\b/i);
  return match?.[1]?.toUpperCase() || "";
}

function findLabeledValue(text, labels) {
  const normalized = compactText(text, 3000);
  for (const label of labels) {
    const regex = new RegExp(`${label}\\s*:?\\s*([^|\\n]{2,120})`, "i");
    const match = normalized.match(regex);
    if (match?.[1]) return compactText(match[1], 120);
  }

  return "";
}

function extractDateRange(text) {
  const normalized = compactText(text, 3000);
  const isoRange = normalized.match(/\b(\d{4}-\d{2}-\d{2})(?:\s*(?:to|-|–|~)\s*(\d{4}-\d{2}-\d{2}))?\b/);
  if (isoRange) return isoRange[2] ? `${isoRange[1]} ~ ${isoRange[2]}` : isoRange[1];

  const dayMonthRange = normalized.match(/\b(\d{1,2}\s+[A-Z][a-z]{2,8})(?:\s*(?:to|-|–|~)\s*(\d{1,2}\s+[A-Z][a-z]{2,8}))?\s+(\d{4})\b/);
  if (dayMonthRange) {
    return dayMonthRange[2]
      ? `${dayMonthRange[1]} ~ ${dayMonthRange[2]} ${dayMonthRange[3]}`
      : `${dayMonthRange[1]} ${dayMonthRange[3]}`;
  }

  return findLabeledValue(normalized, ["Dates?", "Tournament dates?", "Main draw", "Date"]);
}

function extractWithdrawDeadline(text) {
  const value = findLabeledValue(text, [
    "Withdrawal deadline",
    "Withdraw deadline",
    "Withdrawal date",
    "Withdrawal",
    "Withdraw",
  ]);
  return extractDateRange(value) || value;
}

function extractLocation(text, url) {
  return (
    findLabeledValue(text, ["Location", "Venue", "City", "Country", "Host nation", "Host Nation"]) ||
    locationFromTournamentUrl(url)
  );
}

function enrichTournament(item) {
  const title = cleanupTitle(item.title) || titleFromTournamentUrl(item.url) || "ITF tournament";
  const searchableText = [title, item.description, item.context].filter(Boolean).join(" | ");

  return {
    title,
    url: item.url,
    date: item.date || extractDateRange(searchableText),
    location: item.location || extractLocation(searchableText, item.url),
    level: item.level || levelFromTournamentUrl(item.url) || findLabeledValue(searchableText, ["Level", "Category"]),
    surface: item.surface || findLabeledValue(searchableText, ["Surface"]),
    hostNation: item.hostNation || findLabeledValue(searchableText, ["Host nation", "Host Nation"]),
    withdrawDeadline: item.withdrawDeadline || extractWithdrawDeadline(searchableText),
    description: compactText(item.description, 220),
    source: item.source || "",
  };
}

function buildOfficialCalendarUrl({ tourConfig, month, country, region, level }) {
  const url = new URL(tourConfig.calendarPath, ITF_BASE_URL);
  url.searchParams.set("categories", "All");
  url.searchParams.set("startdate", month);

  if (country) url.searchParams.set("nation", country.trim());
  if (region?.label) url.searchParams.set("region", region.label);
  if (level) url.searchParams.set("category", level);

  return url.toString();
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const html = await resp.text();
    if (/<script[^>]+_Incapsula_Resource/i.test(html) || /NOINDEX, NOFOLLOW/i.test(html) && /Incapsula/i.test(html)) {
      throw new Error("ITF anti-bot blocked");
    }

    return html;
  } finally {
    clearTimeout(timer);
  }
}

function extractTournamentLinksFromHtml(html, { fallbackTitle = "" } = {}) {
  const links = [];
  const seen = new Set();
  const hrefRegex = /<a\b[^>]*href="([^"]*\/en\/tournament\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(hrefRegex)) {
    const rawHref = match[1];
    const anchorHtml = match[2] || "";
    let url;

    try {
      url = new URL(rawHref, ITF_BASE_URL).toString();
    } catch {
      continue;
    }

    if (seen.has(url)) continue;
    seen.add(url);

    const contextStart = Math.max(0, match.index - 1500);
    const contextEnd = Math.min(html.length, match.index + match[0].length + 1500);
    const context = stripHtml(html.slice(contextStart, contextEnd), 1200);
    const anchorText = cleanupTitle(anchorHtml);
    links.push(enrichTournament({
      title: anchorText || fallbackTitle || "ITF tournament",
      url,
      description: "",
      context,
      source: "official_calendar_html",
    }));
  }

  return links;
}

function buildSearchQueries({ tourConfig, monthKey, level, country, region }) {
  const [year] = monthKey.split("-");
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "Asia/Taipei",
  }).format(new Date(`${monthKey}-01T00:00:00+08:00`));
  const countryHint = country ? ` ${country.trim()}` : "";
  const regionHint = region?.keywords?.[0] ? ` ${region.keywords[0]}` : "";
  const levelHint = level ? ` ${level}` : "";

  return [
    `site:itftennis.com/en/tournament/ "${tourConfig.label}" "${monthLabel} ${year}"${levelHint}${countryHint}${regionHint}`,
    `site:itftennis.com/en/tournament/ ITF juniors "${monthLabel}" "${year}"${levelHint}${countryHint}${regionHint}`,
    `site:itftennis.com/en/tournament/ "ITF" "${monthLabel}" "${year}"${levelHint}${countryHint}${regionHint}`,
  ];
}

function dedupeTournaments(tournaments, max) {
  const seen = new Set();
  const output = [];

  for (const item of tournaments) {
    const url = String(item?.url || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push(enrichTournament({ ...item, url }));
    if (output.length >= max) break;
  }

  return output;
}

async function searchOfficialTournamentPages({ tourConfig, monthKey, level, country, region, max }) {
  const queries = buildSearchQueries({ tourConfig, monthKey, level, country, region });
  const collected = [];

  for (const query of queries) {
    try {
      const result = await searchWeb({
        query,
        count: Math.min(Math.max(max, 5), 10),
        country: "us",
        lang: "en",
        freshness: "pm",
      });

      for (const row of result.results || []) {
        const url = String(row.url || "").trim();
        if (!/^https:\/\/www\.itftennis\.com\/en\/tournament\//i.test(url)) continue;

        collected.push({
          title: row.title,
          url,
          description: row.description || `${row.source || "ITF"} ${row.age || ""}`.trim(),
          source: "official_search",
        });
      }
    } catch {
      // 搜尋 provider 不可用時，保留後續 fallback。
    }

    if (dedupeTournaments(collected, max).length >= max) {
      break;
    }
  }

  return dedupeTournaments(collected, max);
}

function formatTournamentList({
  tourConfig,
  calendarUrls,
  tournaments,
  source,
  startMonth,
  endMonth,
  level,
  country,
  region,
}) {
  const filters = [
    startMonth === endMonth ? `月份：${startMonth}` : `月份區間：${startMonth} ~ ${endMonth}`,
    level ? `等級：${level}` : "",
    region?.label ? `地區：${region.label}` : "",
    country ? `國家/地區：${country}` : "",
  ].filter(Boolean);

  const lines = [
    `${tourConfig.label} 賽事列表`,
    filters.join("｜"),
    `官方日曆：${calendarUrls[0] || ""}`,
    calendarUrls.length > 1 ? `查詢月份數：${calendarUrls.length}` : "",
    `資料來源：${source}`,
    "",
  ].filter(Boolean);

  if (!tournaments.length) {
    lines.push("目前沒有抓到可列出的官方賽事頁面。可先打開上面的 ITF 官方日曆連結查看最新列表。");
    return lines.join("\n");
  }

  tournaments.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`);
    lines.push(`日期：${item.date || "未提供"}`);
    lines.push(`地點：${item.location || item.hostNation || "未提供"}`);
    lines.push(`等級：${item.level || "未提供"}`);
    lines.push(`場地：${item.surface || "未提供"}`);
    lines.push(`連結：${item.url}`);
    if (index !== tournaments.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n");
}

function extractBetweenLabels(text, startLabel, nextLabels = []) {
  const escapedStart = String(startLabel || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedNext = nextLabels.map((label) => String(label || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`${escapedStart}\\s*:?\\s*([\\s\\S]*?)(?=${escapedNext.length ? escapedNext.join("|") : "$"})`, "i");
  const match = String(text || "").match(regex);
  return compactText(match?.[1] || "", 200);
}

function extractTournamentDetailFromHtml(html, url) {
  const text = stripHtml(String(html || "").replace(/<br\s*\/?>/gi, "\n"), 12000);
  const titleMatch = text.match(/(?:Back to ITF World Tennis Tour Juniors Calendar\s+)?(J\d{2,3}\s+[A-Za-z0-9'().,\- ]{2,120})/i);
  const sectionStart = text.indexOf("Tournament Information");
  const venueStart = text.indexOf("Tournament Venue");
  const sectionText = sectionStart >= 0 ? text.slice(sectionStart, venueStart >= 0 ? venueStart : undefined) : text;
  const venueText = venueStart >= 0 ? text.slice(venueStart) : text;

  return {
    title: cleanupTitle(titleMatch?.[1] || titleFromTournamentUrl(url) || "ITF tournament"),
    url,
    level: levelFromTournamentUrl(url),
    dates: extractDateRange(text) || findLabeledValue(text, ["Dates", "Date"]),
    hostNation: findLabeledValue(text, ["Host nation", "Host Nation"]),
    surface: findLabeledValue(text, ["Surface"]),
    hospitality: findLabeledValue(text, ["Hospitality"]),
    entryDeadline: extractBetweenLabels(sectionText, "Entry deadline", ["Withdrawal deadline", "Single Main Draw Sign-in date/time", "Singles Qualifying sign-in date/time"]),
    withdrawalDeadline: extractBetweenLabels(sectionText, "Withdrawal deadline", ["Single Main Draw Sign-in date/time", "Singles Qualifying sign-in date/time", "First day of Singles Qualifying"]),
    signIn: extractBetweenLabels(sectionText, "Singles Qualifying sign-in date/time", ["First day of Singles Qualifying", "First day of Singles Main Draw"]),
    firstMainDraw: extractBetweenLabels(sectionText, "First day of Singles Main Draw", ["Tournament Director name", "Tournament Director email"]),
    venueName: extractBetweenLabels(venueText, "Venue Name", ["Venue Address"]),
    venueAddress: extractBetweenLabels(venueText, "Venue Address", ["National Associations", "Commercial Partners"]),
  };
}

function formatTournamentDetailsTable(details) {
  const lines = [
    "| 賽事 | 日期 | 等級 | 主辦國 | 場地 | Entry deadline | Withdrawal deadline | 場館 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const item of details) {
    const venue = [item.venueName, item.venueAddress].filter(Boolean).join(" / ");
    lines.push(
      `| ${compactText(item.title || "未提供", 80).replace(/\|/g, "/")} | ${compactText(item.dates || "未提供", 60).replace(/\|/g, "/")} | ${compactText(item.level || "未提供", 20).replace(/\|/g, "/")} | ${compactText(item.hostNation || "未提供", 30).replace(/\|/g, "/")} | ${compactText(item.surface || "未提供", 30).replace(/\|/g, "/")} | ${compactText(item.entryDeadline || "未提供", 60).replace(/\|/g, "/")} | ${compactText(item.withdrawalDeadline || "未提供", 60).replace(/\|/g, "/")} | ${compactText(venue || "未提供", 120).replace(/\|/g, "/")} |`,
    );
  }

  return lines.join("\n");
}

export async function fetchItfTournaments({
  tour = "juniors",
  startDate = "",
  endDate = "",
  region = "Asia",
  country = "",
  level = "",
  max = 5,
} = {}) {
  const tourConfig = normalizeTour(tour);
  const normalizedDateRange = normalizeDateRange(startDate, endDate);
  const normalizedStartDate = normalizedDateRange.startDate;
  const normalizedEndDate = normalizedDateRange.endDate;
  const normalizedMonthRange = buildMonthRange(normalizedStartDate, normalizedEndDate || normalizedStartDate);
  const normalizedRegion = normalizeRegion(region);
  const normalizedLevel = normalizeLevel(level, tourConfig);
  const normalizedCountry = String(country || "").trim();
  const normalizedMax = Math.min(Math.max(Number(max) || 5, 1), 10);

  const calendarUrls = normalizedMonthRange.months.map((month) => buildOfficialCalendarUrl({
    tourConfig,
    month,
    country: normalizedCountry,
    region: normalizedRegion,
    level: normalizedLevel,
  }));

  const collected = [];
  let source = "ITF official calendar";

  for (const [index, calendarUrl] of calendarUrls.entries()) {
    try {
      const html = await fetchText(calendarUrl);
      collected.push(
        ...extractTournamentLinksFromHtml(html, {
          fallbackTitle: `${tourConfig.label} ${normalizedMonthRange.months[index]}`,
        }),
      );
    } catch {
      source = "ITF official search fallback";
    }

    if (dedupeTournaments(collected, normalizedMax).length >= normalizedMax) {
      break;
    }
  }

  let tournaments = dedupeTournaments(collected, normalizedMax);

  if (!tournaments.length) {
    for (const monthKey of normalizedMonthRange.months) {
      const searched = await searchOfficialTournamentPages({
        tourConfig,
        monthKey,
        level: normalizedLevel,
        country: normalizedCountry,
        region: normalizedRegion,
        max: normalizedMax,
      });

      collected.push(...searched);
      tournaments = dedupeTournaments(collected, normalizedMax);

      if (tournaments.length) {
        source = "ITF official site search";
      }

      if (tournaments.length >= normalizedMax) {
        break;
      }
    }
  }

  return {
    ok: true,
    tour: tourConfig.key,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    startMonth: normalizedMonthRange.startMonth,
    endMonth: normalizedMonthRange.endMonth,
    searchedMonths: normalizedMonthRange.months,
    region: normalizedRegion.label,
    country: normalizedCountry,
    level: normalizedLevel,
    max: normalizedMax,
    calendarUrl: calendarUrls[0] || "",
    calendarUrls,
    source,
    tournaments,
    text: formatTournamentList({
      tourConfig,
      calendarUrls,
      tournaments,
      source,
      startMonth: normalizedMonthRange.startMonth,
      endMonth: normalizedMonthRange.endMonth,
      level: normalizedLevel,
      country: normalizedCountry,
      region: normalizedRegion,
    }),
  };
}

export async function fetchItfTournamentDetails({
  tournamentUrls = [],
  max = 5,
} = {}) {
  const urls = Array.from(new Set(
    (Array.isArray(tournamentUrls) ? tournamentUrls : [])
      .map((value) => String(value || "").trim())
      .filter((value) => /^https:\/\/www\.itftennis\.com\/en\/tournament\//i.test(value)),
  )).slice(0, Math.min(Math.max(Number(max) || 5, 1), 10));

  const details = [];

  for (const url of urls) {
    try {
      const html = await fetchText(url);
      details.push(extractTournamentDetailFromHtml(html, url));
    } catch (error) {
      details.push({
        title: titleFromTournamentUrl(url) || "ITF tournament",
        url,
        level: levelFromTournamentUrl(url),
        dates: "",
        hostNation: "",
        surface: "",
        entryDeadline: "",
        withdrawalDeadline: "",
        venueName: "",
        venueAddress: error instanceof Error ? error.message : "fetch_failed",
      });
    }
  }

  return {
    ok: true,
    tournamentUrls: urls,
    count: details.length,
    details,
    text: details.length
      ? formatTournamentDetailsTable(details)
      : "沒有可查詢的 ITF 賽事連結。請先從賽事列表挑選官方 tournament URL。",
  };
}
