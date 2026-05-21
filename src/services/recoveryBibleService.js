const RECOVERY_BASE_URL = "https://recoveryversion.com.tw/Style0A/026";
const LIFE_STUDY_BASE_URL = "https://line.twgbr.org/life-study";
const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_RESULTS = 5;
const MAX_VERSE_RESULTS = 8;
const MAX_NOTE_RESULTS = 6;
const MAX_LIFE_STUDY_PAGES = 12;

const BIBLE_CHAPTER_COUNTS = [
  0,
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150,
  31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7, 3, 3, 3, 2, 14, 4, 28, 16,
  24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1,
  1, 22,
];

const BOOKS = [
  { no: 1, name: "創世記", shortName: "創", aliases: ["創", "创", "創世記", "创世记"] },
  { no: 2, name: "出埃及記", shortName: "出", aliases: ["出", "出埃及記", "出埃及记"] },
  { no: 3, name: "利未記", shortName: "利", aliases: ["利", "利未記", "利未记"] },
  { no: 4, name: "民數記", shortName: "民", aliases: ["民", "民數記", "民数记"] },
  { no: 5, name: "申命記", shortName: "申", aliases: ["申", "申命記", "申命记"] },
  { no: 6, name: "約書亞記", shortName: "書", aliases: ["書", "约书亚记", "約書亞記", "書亞"] },
  { no: 7, name: "士師記", shortName: "士", aliases: ["士", "士師記", "士师记"] },
  { no: 8, name: "路得記", shortName: "得", aliases: ["得", "路得記", "路得记"] },
  { no: 9, name: "撒母耳記上", shortName: "撒上", aliases: ["撒上", "撒母耳記上", "撒母耳记上"] },
  { no: 10, name: "撒母耳記下", shortName: "撒下", aliases: ["撒下", "撒母耳記下", "撒母耳记下"] },
  { no: 11, name: "列王紀上", shortName: "王上", aliases: ["王上", "列王紀上", "列王纪上"] },
  { no: 12, name: "列王紀下", shortName: "王下", aliases: ["王下", "列王紀下", "列王纪下"] },
  { no: 13, name: "歷代志上", shortName: "代上", aliases: ["代上", "歷代志上", "历代志上"] },
  { no: 14, name: "歷代志下", shortName: "代下", aliases: ["代下", "歷代志下", "历代志下"] },
  { no: 15, name: "以斯拉記", shortName: "拉", aliases: ["拉", "以斯拉記", "以斯拉记"] },
  { no: 16, name: "尼希米記", shortName: "尼", aliases: ["尼", "尼希米記", "尼希米记"] },
  { no: 17, name: "以斯帖記", shortName: "斯", aliases: ["斯", "以斯帖記", "以斯帖记"] },
  { no: 18, name: "約伯記", shortName: "伯", aliases: ["伯", "約伯記", "约伯记"] },
  { no: 19, name: "詩篇", shortName: "詩", aliases: ["詩", "詩篇", "诗篇", "詩篇篇"] },
  { no: 20, name: "箴言", shortName: "箴", aliases: ["箴", "箴言"] },
  { no: 21, name: "傳道書", shortName: "傳", aliases: ["傳", "傳道書", "传道书"] },
  { no: 22, name: "雅歌", shortName: "歌", aliases: ["歌", "雅歌"] },
  { no: 23, name: "以賽亞書", shortName: "賽", aliases: ["賽", "赛", "以賽亞書", "以赛亚书"] },
  { no: 24, name: "耶利米書", shortName: "耶", aliases: ["耶", "耶利米書", "耶利米书"] },
  { no: 25, name: "耶利米哀歌", shortName: "哀", aliases: ["哀", "耶利米哀歌", "耶利米哀歌"] },
  { no: 26, name: "以西結書", shortName: "結", aliases: ["結", "结", "以西結書", "以西结书"] },
  { no: 27, name: "但以理書", shortName: "但", aliases: ["但", "但以理書", "但以理书"] },
  { no: 28, name: "何西阿書", shortName: "何", aliases: ["何", "何西阿書", "何西阿书"] },
  { no: 29, name: "約珥書", shortName: "珥", aliases: ["珥", "約珥書", "约珥书"] },
  { no: 30, name: "阿摩司書", shortName: "摩", aliases: ["摩", "阿摩司書", "阿摩司书"] },
  { no: 31, name: "俄巴底亞書", shortName: "俄", aliases: ["俄", "俄巴底亞書", "俄巴底亚书"] },
  { no: 32, name: "約拿書", shortName: "拿", aliases: ["拿", "約拿書", "约拿书"] },
  { no: 33, name: "彌迦書", shortName: "彌", aliases: ["彌", "弥", "彌迦書", "弥迦书"] },
  { no: 34, name: "那鴻書", shortName: "鴻", aliases: ["鴻", "鸿", "那鴻書", "那鸿书"] },
  { no: 35, name: "哈巴谷書", shortName: "哈", aliases: ["哈", "哈巴谷書", "哈巴谷书"] },
  { no: 36, name: "西番雅書", shortName: "番", aliases: ["番", "西番雅書", "西番雅书"] },
  { no: 37, name: "哈該書", shortName: "該", aliases: ["該", "该", "哈該書", "哈该书"] },
  { no: 38, name: "撒迦利亞書", shortName: "亞", aliases: ["亞", "亚", "撒迦利亞書", "撒迦利亚书"] },
  { no: 39, name: "瑪拉基書", shortName: "瑪", aliases: ["瑪", "玛", "瑪拉基書", "玛拉基书"] },
  { no: 40, name: "馬太福音", shortName: "太", aliases: ["太", "馬太福音", "马太福音"] },
  { no: 41, name: "馬可福音", shortName: "可", aliases: ["可", "馬可福音", "马可福音"] },
  { no: 42, name: "路加福音", shortName: "路", aliases: ["路", "路加福音"] },
  { no: 43, name: "約翰福音", shortName: "約", aliases: ["約", "约", "約翰福音", "约翰福音", "約福"] },
  { no: 44, name: "使徒行傳", shortName: "徒", aliases: ["徒", "使徒行傳", "使徒行传", "行傳", "行传"] },
  { no: 45, name: "羅馬書", shortName: "羅", aliases: ["羅", "罗", "羅馬書", "罗马书"] },
  { no: 46, name: "哥林多前書", shortName: "林前", aliases: ["林前", "哥林多前書", "哥林多前书"] },
  { no: 47, name: "哥林多後書", shortName: "林後", aliases: ["林後", "林后", "哥林多後書", "哥林多后书"] },
  { no: 48, name: "加拉太書", shortName: "加", aliases: ["加", "加拉太書", "加拉太书"] },
  { no: 49, name: "以弗所書", shortName: "弗", aliases: ["弗", "以弗所書", "以弗所书"] },
  { no: 50, name: "腓立比書", shortName: "腓", aliases: ["腓", "腓立比書", "腓立比书"] },
  { no: 51, name: "歌羅西書", shortName: "西", aliases: ["西", "歌羅西書", "歌罗西书"] },
  { no: 52, name: "帖撒羅尼迦前書", shortName: "帖前", aliases: ["帖前", "帖撒羅尼迦前書", "帖撒罗尼迦前书"] },
  { no: 53, name: "帖撒羅尼迦後書", shortName: "帖後", aliases: ["帖後", "帖后", "帖撒羅尼迦後書", "帖撒罗尼迦后书"] },
  { no: 54, name: "提摩太前書", shortName: "提前", aliases: ["提前", "提摩太前書", "提摩太前书"] },
  { no: 55, name: "提摩太後書", shortName: "提後", aliases: ["提後", "提后", "提摩太後書", "提摩太后书"] },
  { no: 56, name: "提多書", shortName: "多", aliases: ["多", "提多書", "提多书"] },
  { no: 57, name: "腓利門書", shortName: "門", aliases: ["門", "门", "腓利門書", "腓利门书"] },
  { no: 58, name: "希伯來書", shortName: "來", aliases: ["來", "来", "希伯來書", "希伯来书"] },
  { no: 59, name: "雅各書", shortName: "雅", aliases: ["雅", "雅各書", "雅各书"] },
  { no: 60, name: "彼得前書", shortName: "彼前", aliases: ["彼前", "彼得前書", "彼得前书"] },
  { no: 61, name: "彼得後書", shortName: "彼後", aliases: ["彼後", "彼后", "彼得後書", "彼得后书"] },
  { no: 62, name: "約翰一書", shortName: "約壹", aliases: ["約壹", "约壹", "約一", "约一", "約翰一書", "约翰一书"] },
  { no: 63, name: "約翰二書", shortName: "約貳", aliases: ["約貳", "约贰", "約二", "约二", "約翰二書", "约翰二书"] },
  { no: 64, name: "約翰三書", shortName: "約參", aliases: ["約參", "約叁", "约叁", "約三", "约三", "約翰三書", "约翰三书"] },
  { no: 65, name: "猶大書", shortName: "猶", aliases: ["猶", "犹", "猶大書", "犹大书"] },
  { no: 66, name: "啟示錄", shortName: "啟", aliases: ["啟", "启", "啟示錄", "启示录"] },
];

const BOOK_BY_NO = new Map(BOOKS.map((book) => [book.no, book]));
const BOOK_ALIAS_MAP = new Map();
for (const book of BOOKS) {
  for (const alias of [book.name, book.shortName, ...(book.aliases || [])]) {
    BOOK_ALIAS_MAP.set(normalizeBookAlias(alias), book);
  }
}

function normalizeBookAlias(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[　\s]/g, "")
    .replace(/[．.]/g, "")
    .trim();
}

function normalizeQueryText(value = "") {
  return String(value)
    .replace(/[：﹕]/g, ":")
    .replace(/[～﹣－—–]/g, "-")
    .replace(/[（）]/g, " ")
    .replace(/[，。；？！]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(text = "") {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body) => {
    if (body[0] === "#") {
      const radix = body[1]?.toLowerCase() === "x" ? 16 : 10;
      const value = parseInt(radix === 16 ? body.slice(2) : body.slice(1), radix);
      return Number.isFinite(value) ? String.fromCodePoint(value) : entity;
    }

    return named[body.toLowerCase()] || entity;
  });
}

function htmlToText(fragment = "") {
  return decodeHtmlEntities(
    fragment
      .replace(/<input[\s\S]*?>/gi, " ")
      .replace(/<!-[\s\S]*?->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<sup[\s\S]*?<\/sup>/gi, "")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function compactText(text = "", maxLength = 200) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function toChineseChapterNumber(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0 || num > 200) return "";
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  if (num < 10) return digits[num];
  if (num === 10) return "十";
  if (num < 20) return `十${digits[num % 10]}`;
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return `${digits[tens]}十${ones ? digits[ones] : ""}`;
  }
  const hundreds = Math.floor(num / 100);
  const rem = num % 100;
  if (rem === 0) return `${digits[hundreds]}百`;
  if (rem < 10) return `${digits[hundreds]}百零${digits[rem]}`;
  return `${digits[hundreds]}百${toChineseChapterNumber(rem)}`;
}

function splitKeywordTokens(text = "") {
  return String(text || "")
    .split(/[\s,，。；;？！!?\-_/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function extractSearchKeyword(query = "") {
  const value = normalizeQueryText(query)
    .replace(/^(請問|幫我|幫忙|請|可否|可以|想問|我想知道)\s*/g, "")
    .replace(/(聖經|恢復本|恢复本|哪裡有提到|哪里有提到|有提到|提到|經文|查詢|查一下|查一下聖經|生命讀經|註解|注解)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return value || normalizeQueryText(query);
}

function extractChapterHint(text = "") {
  const normalized = normalizeQueryText(text);
  const chapterMatch = normalized.match(/(\d{1,3})\s*章/);
  if (chapterMatch) return Number(chapterMatch[1]);
  return null;
}

function findBookByToken(token = "") {
  const normalized = normalizeBookAlias(token);
  if (!normalized) return null;

  if (BOOK_ALIAS_MAP.has(normalized)) {
    return BOOK_ALIAS_MAP.get(normalized);
  }

  const sortedAliases = [...BOOK_ALIAS_MAP.keys()].sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    if (normalized.startsWith(alias)) {
      return BOOK_ALIAS_MAP.get(alias);
    }
  }

  return null;
}

function detectBookFromText(text = "") {
  const normalized = normalizeBookAlias(text);
  if (!normalized) return null;

  const sortedAliases = [...BOOK_ALIAS_MAP.keys()].sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    if (normalized.includes(alias)) {
      return BOOK_ALIAS_MAP.get(alias);
    }
  }

  return null;
}

function parseReferenceFromText(text = "") {
  const normalized = normalizeQueryText(text);
  const patterns = [
    /([A-Za-z0-9\u4e00-\u9fff]{1,12})\s*(\d{1,3})\s*:\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?/,
    /([A-Za-z0-9\u4e00-\u9fff]{1,12})\s*(\d{1,3})\s*章\s*(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?\s*[節节]?/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const book = findBookByToken(match[1]);
    if (!book) continue;

    const chapter = Number(match[2]);
    const verseStart = Number(match[3]);
    const verseEnd = Number(match[4] || match[3]);
    if (!Number.isInteger(chapter) || !Number.isInteger(verseStart) || !Number.isInteger(verseEnd)) {
      continue;
    }
    if (chapter <= 0 || verseStart <= 0 || verseEnd <= 0) continue;

    const maxChapter = BIBLE_CHAPTER_COUNTS[book.no] || 0;
    if (maxChapter && chapter > maxChapter) {
      throw new Error(`${book.name} 沒有第 ${chapter} 章`);
    }

    const start = Math.min(verseStart, verseEnd);
    const end = Math.max(verseStart, verseEnd);
    const displayRef = `${book.shortName}${chapter}:${start}${start === end ? "" : `-${end}`}`;

    return {
      book,
      chapter,
      verseStart: start,
      verseEnd: end,
      displayRef,
    };
  }

  return null;
}

function buildRecoveryUrl(path, params = {}) {
  const url = new URL(`${RECOVERY_BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 line-bot recovery-bible-service",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("連線逾時");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeVerseText(prev = "", next = "") {
  if (!prev) return next;
  if (!next) return prev;
  if (prev.includes(next)) return prev;
  if (next.includes(prev)) return next;
  return `${prev}${next}`;
}

function parseChapterVerses(html, chapter) {
  const verseRegex = /<TR><TD WIDTH=50[^>]*>([\s\S]*?)<\/TD><TD[^>]*>([\s\S]*?)<\/TD><\/TR>/gi;
  const verseMap = new Map();
  let match;

  while ((match = verseRegex.exec(html)) !== null) {
    const rowRef = htmlToText(match[1] || "");
    const rowRefMatch = rowRef.match(/(\d+)\s*:\s*(\d+)/);
    if (!rowRefMatch) continue;

    const rowChapter = Number(rowRefMatch[1]);
    const verseNo = Number(rowRefMatch[2]);
    if (!Number.isInteger(rowChapter) || !Number.isInteger(verseNo)) continue;
    if (rowChapter !== Number(chapter)) continue;

    const verseHtml = match[2] || "";
    const noteRefs = [];
    const noteRegex = /FunShow011\.php\?B=([^'"]+)/gi;
    let noteMatch;
    while ((noteMatch = noteRegex.exec(verseHtml)) !== null) {
      const noteId = String(noteMatch[1] || "").trim();
      if (noteId) {
        noteRefs.push({
          id: noteId,
          url: buildRecoveryUrl("FunShow011.php", { B: noteId }),
        });
      }
    }

    const cleaned = htmlToText(verseHtml);
    if (!cleaned) continue;

    const existing = verseMap.get(verseNo);
    if (!existing) {
      verseMap.set(verseNo, {
        verse: verseNo,
        text: cleaned,
        noteRefs,
      });
      continue;
    }

    existing.text = mergeVerseText(existing.text, cleaned);
    const merged = new Map(existing.noteRefs.map((item) => [item.id, item]));
    for (const item of noteRefs) {
      if (!merged.has(item.id)) merged.set(item.id, item);
    }
    existing.noteRefs = [...merged.values()];
    verseMap.set(verseNo, existing);
  }

  return [...verseMap.values()].sort((a, b) => a.verse - b.verse);
}

function parseSearchRows(html) {
  const rows = [];
  const rowRegex =
    /<tr><td[^>]*><a[^>]*href\s*=\s*"read_01\.php\?KB=([^"]+)"[^>]*>([^<]+)<\/a><\/td>\s*<td[^>]*>([\s\S]*?)<\/td><\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const kb = String(match[1] || "").trim();
    const source = htmlToText(match[2] || "");
    const content = htmlToText(match[3] || "");
    if (!source || !content) continue;

    rows.push({
      kb,
      source,
      text: content,
      url: buildRecoveryUrl("read_01.php", { KB: kb }),
    });
  }

  return rows;
}

function parseNotePopup(html) {
  const title = htmlToText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
  const body =
    htmlToText(html.match(/<tr><td colspan=2><p[^>]*>([\s\S]*?)<\/p><\/td><\/tr>/i)?.[1] || "") ||
    htmlToText(html.match(/<tr><td colspan=2>([\s\S]*?)<\/td><\/tr>/i)?.[1] || "");

  return {
    title: title || "恢復本註解",
    text: body,
  };
}

function normalizeResultCount(value, maxLimit = MAX_VERSE_RESULTS) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_MAX_RESULTS;
  return Math.min(Math.max(Math.floor(n), 1), maxLimit);
}

async function fetchChapterPage(bookNo, chapter, verseAnchor = 1) {
  const url = buildRecoveryUrl("read_01.php", {
    KB: `${bookNo}_${chapter}_${Math.max(1, Number(verseAnchor) || 1)}`,
  });
  return fetchText(url);
}

async function fetchKeywordSearch(mode, keyword) {
  const body = new URLSearchParams({
    R1: mode,
    KB: keyword,
  });
  const url = buildRecoveryUrl("search.php");
  return fetchText(url, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
  });
}

function buildVerseReplyText(reference, verses) {
  const lines = [`恢復本經文 ${reference.displayRef}`];
  for (const item of verses) {
    lines.push(`${reference.book.shortName}${reference.chapter}:${item.verse} ${item.text}`);
  }
  lines.push(
    "",
    `來源：${buildRecoveryUrl("read_01.php", {
      KB: `${reference.book.no}_${reference.chapter}_${reference.verseStart}`,
    })}`
  );
  return lines.join("\n");
}

function buildKeywordVerseReply(keyword, rows) {
  const lines = [`恢復本經文搜尋「${keyword}」前 ${rows.length} 筆：`];
  for (const [index, row] of rows.entries()) {
    lines.push(`${index + 1}. ${row.source} ${compactText(row.text, 120)}`);
  }
  if (rows[0]?.url) {
    lines.push("", `來源：${rows[0].url}`);
  }
  return lines.join("\n");
}

function buildNoteReplyByReference(reference, notes) {
  const lines = [`恢復本註解 ${reference.displayRef}`];
  for (const [index, note] of notes.entries()) {
    lines.push(`${index + 1}. ${note.title}`);
    lines.push(compactText(note.text, 220));
  }
  if (notes[0]?.url) {
    lines.push("", `來源：${notes[0].url}`);
  }
  return lines.join("\n");
}

function buildNoteReplyByKeyword(keyword, rows) {
  const lines = [`恢復本註解搜尋「${keyword}」前 ${rows.length} 筆：`];
  for (const [index, row] of rows.entries()) {
    lines.push(`${index + 1}. ${row.source} ${compactText(row.text, 170)}`);
  }
  if (rows[0]?.url) {
    lines.push("", `來源：${rows[0].url}`);
  }
  return lines.join("\n");
}

function extractLifeStudyPagePaths(html, bookNo) {
  const result = new Set([`${bookNo}.html`]);
  const hrefRegex = /href="([^"]+)"/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = String(match[1] || "").trim();
    if (!href || href.startsWith("http") || href.startsWith("#")) continue;
    const cleanHref = href.split("#")[0].split("?")[0];
    if (new RegExp(`^${bookNo}(?:_\\d+)?\\.html$`).test(cleanHref)) {
      result.add(cleanHref);
    }
  }

  return [...result].sort((a, b) => {
    const aNum = Number(a.match(new RegExp(`^${bookNo}_(\\d+)\\.html$`))?.[1] || 1);
    const bNum = Number(b.match(new RegExp(`^${bookNo}_(\\d+)\\.html$`))?.[1] || 1);
    return aNum - bNum;
  });
}

function extractLifeStudyParagraphs(html) {
  const title = htmlToText(html.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || "");
  const paragraphs = [];
  const paragraphRegex = /<p class="calibre2">([\s\S]*?)<\/p>/gi;
  let match;

  while ((match = paragraphRegex.exec(html)) !== null) {
    const text = htmlToText(match[1] || "");
    if (!text || text.length < 12) continue;
    paragraphs.push(text);
  }

  return {
    title: title || "生命讀經",
    paragraphs,
  };
}

function scoreLifeStudyParagraph({ paragraph, title, chapter, chapterCn, keywordTokens, book }) {
  let score = 0;
  const text = String(paragraph || "");
  const heading = String(title || "");

  if (chapter) {
    if (new RegExp(`${chapter}\\s*章`).test(text)) score += 80;
    if (chapterCn && new RegExp(`第?${chapterCn}\\s*章`).test(text)) score += 80;
    if (new RegExp(`${chapter}\\s*[:：]`).test(text)) score += 30;
  }

  if (book?.name && text.includes(book.name)) score += 8;
  if (book?.shortName && text.includes(book.shortName)) score += 6;

  for (const token of keywordTokens) {
    if (text.includes(token)) score += 15;
    if (heading.includes(token)) score += 20;
  }

  return score;
}

function buildLifeStudyExcerpt(text, focusTokens = [], maxLength = 220) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  if (value.length <= maxLength) return value;

  let focusIndex = -1;
  for (const token of focusTokens) {
    const idx = value.indexOf(token);
    if (idx >= 0 && (focusIndex < 0 || idx < focusIndex)) {
      focusIndex = idx;
    }
  }

  if (focusIndex < 0) {
    return `${value.slice(0, maxLength - 1).trim()}…`;
  }

  const half = Math.floor(maxLength / 2);
  const start = Math.max(0, focusIndex - half);
  const end = Math.min(value.length, start + maxLength);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < value.length ? "…" : "";
  return `${prefix}${value.slice(start, end).trim()}${suffix}`;
}

function uniqueValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export async function queryRecoveryBibleVerses(query, options = {}) {
  const normalizedQuery = normalizeQueryText(query);
  if (!normalizedQuery) {
    throw new Error("請提供經節或關鍵字，例如：創 1:1 或 參孫");
  }

  const maxResults = normalizeResultCount(options.maxResults, MAX_VERSE_RESULTS);
  const parsedRef = parseReferenceFromText(normalizedQuery);

  if (parsedRef) {
    const chapterHtml = await fetchChapterPage(parsedRef.book.no, parsedRef.chapter, parsedRef.verseStart);
    const verses = parseChapterVerses(chapterHtml, parsedRef.chapter)
      .filter((item) => item.verse >= parsedRef.verseStart && item.verse <= parsedRef.verseEnd)
      .slice(0, maxResults);

    if (!verses.length) {
      throw new Error(`找不到 ${parsedRef.displayRef} 的經文內容`);
    }

    return {
      ok: true,
      mode: "reference",
      query: normalizedQuery,
      reference: parsedRef,
      verses,
      replyText: buildVerseReplyText(parsedRef, verses),
    };
  }

  const keyword = extractSearchKeyword(normalizedQuery);
  const searchHtml = await fetchKeywordSearch("v1", keyword);
  const rows = parseSearchRows(searchHtml).slice(0, maxResults);
  if (!rows.length) {
    throw new Error(`找不到「${keyword}」的恢復本經文`);
  }

  return {
    ok: true,
    mode: "keyword",
    query: normalizedQuery,
    keyword,
    rows,
    replyText: buildKeywordVerseReply(keyword, rows),
  };
}

export async function queryRecoveryBibleNotes(query, options = {}) {
  const normalizedQuery = normalizeQueryText(query);
  if (!normalizedQuery) {
    throw new Error("請提供要查詢的經節或關鍵字");
  }

  const maxResults = normalizeResultCount(options.maxResults, MAX_NOTE_RESULTS);
  const parsedRef = parseReferenceFromText(normalizedQuery);

  if (parsedRef) {
    const chapterHtml = await fetchChapterPage(parsedRef.book.no, parsedRef.chapter, parsedRef.verseStart);
    const verses = parseChapterVerses(chapterHtml, parsedRef.chapter).filter(
      (item) => item.verse >= parsedRef.verseStart && item.verse <= parsedRef.verseEnd
    );

    const noteRefs = uniqueValues(
      verses.flatMap((item) => (item.noteRefs || []).map((ref) => ref.id))
    ).slice(0, maxResults);

    if (!noteRefs.length) {
      throw new Error(`找不到 ${parsedRef.displayRef} 的註解`);
    }

    const notes = [];
    for (const noteId of noteRefs) {
      const url = buildRecoveryUrl("FunShow011.php", { B: noteId });
      const html = await fetchText(url);
      const parsed = parseNotePopup(html);
      if (!parsed.text) continue;
      notes.push({
        id: noteId,
        title: parsed.title,
        text: parsed.text,
        url,
      });
    }

    if (!notes.length) {
      throw new Error(`找不到 ${parsedRef.displayRef} 的註解內容`);
    }

    return {
      ok: true,
      mode: "reference",
      query: normalizedQuery,
      reference: parsedRef,
      notes,
      replyText: buildNoteReplyByReference(parsedRef, notes),
    };
  }

  const keyword = extractSearchKeyword(normalizedQuery);
  const searchHtml = await fetchKeywordSearch("v2", keyword);
  const rows = parseSearchRows(searchHtml).slice(0, maxResults);
  if (!rows.length) {
    throw new Error(`找不到「${keyword}」的恢復本註解`);
  }

  return {
    ok: true,
    mode: "keyword",
    query: normalizedQuery,
    keyword,
    rows,
    replyText: buildNoteReplyByKeyword(keyword, rows),
  };
}

export async function queryLifeStudyExcerpt({ query = "", keyword = "" } = {}) {
  const mergedQuery = normalizeQueryText(`${query || ""} ${keyword || ""}`.trim());
  if (!mergedQuery) {
    throw new Error("請提供經節或關鍵字，以便查詢生命讀經");
  }

  const reference = parseReferenceFromText(mergedQuery);
  const book = reference?.book || detectBookFromText(mergedQuery);
  if (!book) {
    throw new Error("生命讀經查詢需要書卷資訊，例如：士 15:18 生命讀經");
  }

  const chapter = reference?.chapter || extractChapterHint(mergedQuery) || null;
  const chapterCn = chapter ? toChineseChapterNumber(chapter) : "";
  const keywordTokens = splitKeywordTokens(extractSearchKeyword(mergedQuery));

  const firstPagePath = `${book.no}.html`;
  const firstPageUrl = `${LIFE_STUDY_BASE_URL}/${firstPagePath}`;
  const firstHtml = await fetchText(firstPageUrl);
  const allPaths = extractLifeStudyPagePaths(firstHtml, book.no).slice(0, MAX_LIFE_STUDY_PAGES);
  if (!allPaths.length) {
    throw new Error("生命讀經頁面目前無法取得");
  }

  const totalBookChapters = BIBLE_CHAPTER_COUNTS[book.no] || 1;
  const estimatedIndex =
    chapter && allPaths.length > 1
      ? Math.round(((chapter - 1) / Math.max(totalBookChapters - 1, 1)) * (allPaths.length - 1))
      : 0;
  const candidateIndexes = uniqueValues([
    estimatedIndex,
    estimatedIndex - 1,
    estimatedIndex + 1,
    0,
  ]).filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < allPaths.length);

  const pageCache = new Map();
  pageCache.set(firstPagePath, firstHtml);

  async function getPageHtml(path) {
    if (pageCache.has(path)) return pageCache.get(path);
    const html = await fetchText(`${LIFE_STUDY_BASE_URL}/${path}`);
    pageCache.set(path, html);
    return html;
  }

  let best = null;

  async function evaluatePaths(paths) {
    for (const path of paths) {
      const html = await getPageHtml(path);
      const { title, paragraphs } = extractLifeStudyParagraphs(html);
      for (const paragraph of paragraphs) {
        const score = scoreLifeStudyParagraph({
          paragraph,
          title,
          chapter,
          chapterCn,
          keywordTokens,
          book,
        });
        if (!best || score > best.score) {
          best = {
            score,
            path,
            title,
            paragraph,
          };
        }
      }
    }
  }

  await evaluatePaths(candidateIndexes.map((idx) => allPaths[idx]));

  if ((!best || best.score <= 0) && allPaths.length > candidateIndexes.length) {
    const remainingPaths = allPaths.filter((path) => !candidateIndexes.map((idx) => allPaths[idx]).includes(path));
    await evaluatePaths(remainingPaths.slice(0, MAX_LIFE_STUDY_PAGES));
  }

  if (!best || !best.paragraph) {
    throw new Error("找不到對應的生命讀經段落");
  }

  const focusTokens = [];
  if (chapter) {
    focusTokens.push(`${chapter}章`);
    if (chapterCn) focusTokens.push(`${chapterCn}章`);
  }
  focusTokens.push(...keywordTokens);

  const sourceUrl = `${LIFE_STUDY_BASE_URL}/${best.path}`;
  const excerpt = buildLifeStudyExcerpt(best.paragraph, focusTokens, 240);
  const chapterLabel = chapter ? ` ${chapter}章` : "";
  const title = best.title || "生命讀經";

  return {
    ok: true,
    query: mergedQuery,
    bookNo: book.no,
    bookName: book.name,
    chapter,
    title,
    excerpt,
    sourceUrl,
    replyText: [
      `生命讀經擷取（${book.name}${chapterLabel}）`,
      `${title}`,
      excerpt,
      "",
      `來源：${sourceUrl}`,
    ].join("\n"),
  };
}
