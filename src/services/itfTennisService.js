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

  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  throw new Error(`日期格式錯誤：${date}，請使用 YYYY-MM-DD`);
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

function normalizeRegion(region) {
  const value = String(region || "").trim();
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

function cleanupTitle(value) {
  return compactText(String(value || "").replace(/\s*\|\s*ITF.*$/i, ""), 140);
}

function buildOfficialCalendarUrl({ tourConfig, startDate, endDate, country, region, level }) {
  const url = new URL(tourConfig.calendarPath, ITF_BASE_URL);
  url.searchParams.set("startdate", startDate);
  if (endDate) url.searchParams.set("enddate", endDate);

  // 這些 query params 來自現行 calendar URL 的可見行為與既有站內慣例；
  // 就算官方前端未使用，也不影響 fallback 搜尋。
  if (country) url.searchParams.set("country", country.trim());
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

    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractTournamentLinksFromHtml(html, { fallbackTitle = "" } = {}) {
  const links = [];
  const seen = new Set();
  const hrefRegex = /<a\b[^>]*href="([^"]+\/en\/tournament\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;

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

    const anchorText = cleanupTitle(anchorHtml.replace(/<[^>]+>/g, " "));
    links.push({
      title: anchorText || fallbackTitle || "ITF tournament",
      url,
      description: "",
      source: "official_calendar_html",
    });
  }

  return links;
}

function buildSearchQueries({ tourConfig, startDate, endDate, level, country, region }) {
  const [year, month] = startDate.split("-");
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "Asia/Taipei",
  }).format(new Date(`${startDate}T00:00:00+08:00`));
  const endMonthLabel = endDate
    ? new Intl.DateTimeFormat("en-US", {
      month: "long",
      timeZone: "Asia/Taipei",
    }).format(new Date(`${endDate}T00:00:00+08:00`))
    : "";
  const countryHint = country ? ` ${country.trim()}` : "";
  const regionHint = region?.keywords?.[0] ? ` ${region.keywords[0]}` : "";
  const levelHint = level ? ` ${level}` : "";
  const rangeHint = endDate ? ` "${monthLabel} ${year}" "${endMonthLabel} ${endDate.slice(0, 4)}"` : ` "${monthLabel} ${year}"`;

  return [
    `site:itftennis.com/en/tournament/ "${tourConfig.label}"${rangeHint}${levelHint}${countryHint}${regionHint}`,
    `site:itftennis.com/en/tournament/ ITF juniors ${year}${levelHint}${countryHint}${regionHint}`,
    `site:itftennis.com/en/tournament/ "ITF" "${year}"${levelHint}${countryHint}${regionHint}`,
  ];
}

function dedupeTournaments(tournaments, max) {
  const seen = new Set();
  const output = [];

  for (const item of tournaments) {
    const url = String(item?.url || "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    output.push({
      title: cleanupTitle(item.title) || "ITF tournament",
      url,
      description: compactText(item.description, 220),
      source: item.source || "",
    });
    if (output.length >= max) break;
  }

  return output;
}

async function searchOfficialTournamentPages({ tourConfig, startDate, endDate, level, country, region, max }) {
  const queries = buildSearchQueries({ tourConfig, startDate, endDate, level, country, region });
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
  calendarUrl,
  tournaments,
  source,
  startDate,
  endDate,
  level,
  country,
  region,
}) {
  const filters = [
    endDate ? `日期區間：${startDate} ~ ${endDate}` : `日期起點：${startDate}`,
    level ? `等級：${level}` : "",
    region?.label ? `地區：${region.label}` : "",
    country ? `國家/地區：${country}` : "",
  ].filter(Boolean);

  const lines = [
    `${tourConfig.label} 賽事列表`,
    filters.join("｜"),
    `官方日曆：${calendarUrl}`,
    `資料來源：${source}`,
    "",
  ];

  if (!tournaments.length) {
    lines.push("目前沒有抓到可列出的官方賽事頁面。可先打開上面的 ITF 官方日曆連結查看最新列表。");
    return lines.join("\n");
  }

  tournaments.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.title}`);
    if (item.description) {
      lines.push(`摘要：${item.description}`);
    }
    lines.push(`連結：${item.url}`);
    if (index !== tournaments.length - 1) {
      lines.push("");
    }
  });

  return lines.join("\n");
}

export async function fetchItfTournaments({
  tour = "juniors",
  startDate = "",
  endDate = "",
  region = "",
  country = "",
  level = "",
  max = 5,
} = {}) {
  const tourConfig = normalizeTour(tour);
  const normalizedDateRange = normalizeDateRange(startDate, endDate);
  const normalizedStartDate = normalizedDateRange.startDate;
  const normalizedEndDate = normalizedDateRange.endDate;
  const normalizedRegion = normalizeRegion(region);
  const normalizedLevel = normalizeLevel(level, tourConfig);
  const normalizedCountry = String(country || "").trim();
  const normalizedMax = Math.min(Math.max(Number(max) || 5, 1), 10);

  const calendarUrl = buildOfficialCalendarUrl({
    tourConfig,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    country: normalizedCountry,
    region: normalizedRegion,
    level: normalizedLevel,
  });

  const collected = [];
  let source = "ITF official calendar";

  try {
    const html = await fetchText(calendarUrl);
    collected.push(
      ...extractTournamentLinksFromHtml(html, {
        fallbackTitle: tourConfig.label,
      }),
    );
  } catch {
    source = "ITF official search fallback";
  }

  let tournaments = dedupeTournaments(collected, normalizedMax);

  if (!tournaments.length) {
    const searched = await searchOfficialTournamentPages({
      tourConfig,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      level: normalizedLevel,
      country: normalizedCountry,
      region: normalizedRegion,
      max: normalizedMax,
    });

    if (searched.length) {
      source = "ITF official site search";
      tournaments = searched;
    }
  }

  return {
    ok: true,
    tour: tourConfig.key,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    region: normalizedRegion.label,
    country: normalizedCountry,
    level: normalizedLevel,
    max: normalizedMax,
    calendarUrl,
    source,
    tournaments,
    text: formatTournamentList({
      tourConfig,
      calendarUrl,
      tournaments,
      source,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      level: normalizedLevel,
      country: normalizedCountry,
      region: normalizedRegion,
    }),
  };
}
