const RECOVERY_NEW_BASE_URL = "https://recoveryversion.com.tw";
const LIFE_STUDY_BASE_URL = "https://line.twgbr.org/life-study";
const REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESULTS = 5;
const MAX_VERSE_RESULTS = 8;
const MAX_NOTE_RESULTS = 6;
const MAX_LIFE_STUDY_PAGES = 12;
const BROWSER_TIMEOUT_MS = 15_000;

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

const FALLBACK_RANDOM_VERSES = [
  { bookNo: 43, chapter: 3, verse: 16, text: "神愛世人，甚至將祂的獨生子賜給他們，叫一切信入祂的，不至滅亡，反得永遠的生命。" },
  { bookNo: 19, chapter: 23, verse: 1, text: "耶和華是我的牧者；我必不至缺乏。" },
  { bookNo: 19, chapter: 119, verse: 105, text: "你的話是我腳前的燈，是我路上的光。" },
  { bookNo: 20, chapter: 3, verse: 5, text: "你要全心信靠耶和華，不可倚靠自己的聰明。" },
  { bookNo: 23, chapter: 40, verse: 31, text: "但那等候耶和華的必重新得力；他們必如鷹展翅上騰。" },
  { bookNo: 40, chapter: 11, verse: 28, text: "凡勞苦擔重擔的，可以到我這裡來，我必使你們得安息。" },
  { bookNo: 45, chapter: 8, verse: 28, text: "萬有都互相效力，叫愛神的人得益處，就是按祂旨意被召的人。" },
  { bookNo: 50, chapter: 4, verse: 6, text: "應當一無罣慮，只要凡事藉著禱告、祈求，帶著感謝，將你們所要的告訴神。" },
  { bookNo: 50, chapter: 4, verse: 13, text: "我在那加我能力者的裡面，凡事都能作。" },
  { bookNo: 58, chapter: 11, verse: 1, text: "信就是所望之事的質實，是未見之事的確證。" },
  { bookNo: 60, chapter: 5, verse: 7, text: "你們要將一切的憂慮卸給神，因為祂顧念你們。" },
  { bookNo: 66, chapter: 21, verse: 4, text: "神要從他們眼中擦去一切的眼淚，不再有死亡，也不再有悲哀、哭號、疼痛。" },
];

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

function normalizeDigits(value = "") {
  return String(value).replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10));
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

export function detectBookFromText(text = "") {
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

async function fetchVersesFromApi(bookNo, chapter) {
  const url = `${RECOVERY_NEW_BASE_URL}/api/getVerses?VERSION=1&refs=${Number(bookNo)}.${Number(chapter)}.-1`;
  const rows = JSON.parse(await fetchText(url));
  if (!Array.isArray(rows)) return [];

  return rows
    .map((row) => ({
      verse: Number(row.segment_code),
      text: String(row.content || "").trim(),
      noteRefs: [],
    }))
    .filter((row) => Number.isInteger(row.verse) && row.verse > 0 && row.text)
    .sort((a, b) => a.verse - b.verse);
}

async function fetchVersesFromRenderedSite(bookNo, chapter) {
  let browser;
  try {
    const puppeteer = await import("puppeteer-core");
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome-stable",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 line-bot recovery-bible-service");

    const url = `${RECOVERY_NEW_BASE_URL}/verse/${bookNo}/${chapter}`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: BROWSER_TIMEOUT_MS });
    
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const verses = await page.evaluate((chapterNum) => {
      const results = new Map();
      const pattern = new RegExp(`^(${chapterNum}):(\\d+)\\s*(.+)$`);
      
      const allDivs = document.querySelectorAll("div");
      
      for (const div of allDivs) {
        const text = div.textContent?.trim();
        if (!text) continue;
        
        const match = text.match(pattern);
        if (match) {
          const verseNum = Number(match[2]);
          let verseText = match[3].trim();
          
          verseText = verseText.replace(/[a-z][\u4e00-\u9fff]{2,6}記\d+:\d+[串註][a-z0-9\s×\u4e00-\u9fff，～]+/g, (m) => {
            const afterComma = m.match(/，([\u4e00-\u9fff]{1,10})$/);
            return afterComma ? afterComma[1] : "";
          });
          verseText = verseText.replace(/[a-z][\u4e00-\u9fff]{2,6}記\d+:\d+:?[串註]?[a-z0-9\s]*$/g, "");
          verseText = verseText.replace(/\d+[\u4e00-\u9fff]{2,6}記\d+:\d+:?[串註]?[a-z0-9\s]*$/g, "");
          
          const noteIndex = verseText.search(/\d+[註串]/);
          if (noteIndex > 5) {
            verseText = verseText.substring(0, noteIndex);
          }
          
          verseText = verseText.replace(/[記書]\d+:\d*$/g, "");
          verseText = verseText.replace(/\d+[\u4e00-\u9fff]{1,6}$/g, "");
          verseText = verseText.replace(/[a-z]+$/g, "");
          verseText = verseText.replace(/,+/g, "，");
          verseText = verseText.replace(/\s{2,}/g, " ");
          verseText = verseText.replace(/^[a-z\s]+/, "");
          verseText = verseText.replace(/[a-z\s]+$/, "");
          verseText = verseText.trim();
          
          if (verseNum && verseText && verseText.length > 3) {
            if (!results.has(verseNum) || results.get(verseNum).text.length > verseText.length) {
              results.set(verseNum, {
                verse: verseNum,
                text: verseText,
                noteRefs: [],
              });
            }
          }
        }
      }
      
      return Array.from(results.values()).sort((a, b) => a.verse - b.verse);
    }, chapter);

    return verses;
  } catch (error) {
    throw new Error(`無法從新版網站獲取經文: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }
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
  try {
    const verses = await fetchVersesFromApi(bookNo, chapter);
    if (verses.length) return verses;
  } catch (apiError) {
    console.warn("新版 API 失敗，改用瀏覽器讀取經文:", apiError.message);
  }

  try {
    return await fetchVersesFromRenderedSite(bookNo, chapter);
  } catch (newSiteError) {
    console.warn("新版網站失敗，改用備援經文:", newSiteError.message);
    return [];
  }
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

function buildRandomVerseReply(reference, verseText, sourceUrl, options = {}) {
  const lines = [
    `今日經節 ${reference.displayRef}`,
    `${reference.displayRef} ${verseText}`,
  ];

  if (options.notice) {
    lines.push("", options.notice);
  }

  lines.push("", `來源：${sourceUrl}`);
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

function fromChineseNumber(s) {
  if (!s) return NaN;
  const digits = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  let result = 0;
  let temp = 0;
  for (const c of String(s)) {
    if (c === "十") {
      result += (temp || 1) * 10;
      temp = 0;
    } else if (c === "百") {
      result += (temp || 1) * 100;
      temp = 0;
    } else if (Object.prototype.hasOwnProperty.call(digits, c)) {
      temp = digits[c];
    }
  }
  return result + temp || NaN;
}

function parseOutlineVerseSegment(segmentText, defaultChapter) {
  const text = normalizeDigits(segmentText)
    .replace(/[上下]/g, "")
    .replace(/[：﹕]/g, ":")
    .replace(/[～﹣－—–]/g, "∼")
    .replace(/\s+/g, "")
    .trim();
  if (!text) return null;
  const CN = "[一二三四五六七八九十百零]+";
  const m = text.match(new RegExp(`^(${CN})?(\\d+)(?:[∼~](${CN})?(\\d+))?$`));
  if (!m) return null;
  const startChapter = m[1] ? fromChineseNumber(m[1]) : defaultChapter || NaN;
  const startVerse = Number(m[2]);
  const endChapter = m[3] ? fromChineseNumber(m[3]) : startChapter;
  const endVerse = m[4] ? Number(m[4]) : startVerse;
  if (!Number.isFinite(startChapter) || !Number.isFinite(endChapter)) return null;
  if (!Number.isFinite(startVerse) || !Number.isFinite(endVerse)) return null;
  return { startChapter, startVerse, endChapter, endVerse };
}

function parseOutlineVerseRanges(rangeText, defaultChapter) {
  return String(rangeText || "")
    .split(/[，,、；;]/)
    .map((segment) => parseOutlineVerseSegment(segment, defaultChapter))
    .filter(Boolean);
}

function extractOutlineRangeText(text = "") {
  const value = normalizeDigits(text)
    .replace(/[～﹣－—–]/g, "～")
    .replace(/\s+/g, " ")
    .trim();
  const CN = "一二三四五六七八九十百零";
  const segment = `[${CN}]?\\d+(?:[上下])?(?:\\s*～\\s*[${CN}]?\\d+(?:[上下])?)?`;
  const match = value.match(new RegExp(`(${segment}(?:\\s*[，,、；;]\\s*${segment})*)\\s*$`));
  return match?.[1] || "";
}

async function fetchBookOutlineItems(bookNo) {
  const book = BOOK_BY_NO.get(Number(bookNo));
  if (!book) throw new Error(`找不到書卷編號 ${bookNo}`);

  const url = `${RECOVERY_NEW_BASE_URL}/api/getOutlines?VERSION=1`;
  const rows = JSON.parse(await fetchText(url));
  if (!Array.isArray(rows)) throw new Error("恢復本綱目資料格式錯誤");

  return rows
    .filter((row) => Number(row.chapter_code) === Number(bookNo))
    .map((row) => {
      const title = String(row.outline_content || "").trim();
      const defaultChapter = Number(row.related_chapters) || null;
      const rangeText = extractOutlineRangeText(title);
      const verseRanges = parseOutlineVerseRanges(rangeText, defaultChapter);

      return {
        id: row.id,
        bookNo: Number(bookNo),
        bookName: book.name,
        level: Number(row.level) || 0,
        order: Number(row.volume_order) || 0,
        title,
        verseRange: verseRanges[0] || null,
        verseRanges,
        relatedChapter: defaultChapter,
        relatedVerse: Number(row.related_number) || null,
        sourceUrl: `${RECOVERY_NEW_BASE_URL}/verse/${book.no}/${defaultChapter || 1}`,
      };
    })
    .filter((item) => item.title)
    .sort((a, b) => a.order - b.order);
}

function extractLeafItems(items) {
  return items.filter((item, i) => {
    const next = items[i + 1];
    return !next || next.level <= item.level;
  });
}

export async function getBookOutlineLeafItems(bookNo) {
  const items = await fetchBookOutlineItems(Number(bookNo));
  return extractLeafItems(items);
}

export async function getBookOutlineReminderItems(bookNo) {
  const items = await fetchBookOutlineItems(Number(bookNo));
  const levelTwoItems = items.filter((item) => item.level === 2 && item.verseRange);
  return levelTwoItems.length ? levelTwoItems : extractLeafItems(items);
}

export async function getRandomBookOutlineContent(bookNameOrNo, options = {}) {
  const book =
    typeof bookNameOrNo === "number" || /^\d+$/.test(String(bookNameOrNo || ""))
      ? BOOK_BY_NO.get(Number(bookNameOrNo))
      : detectBookFromText(bookNameOrNo);
  if (!book) throw new Error(`找不到聖經書卷「${bookNameOrNo}」`);

  const items = await getBookOutlineReminderItems(book.no);
  if (!items.length) throw new Error(`找不到 ${book.name} 的讀經綱目`);

  const requestedIndex = Number(options.index);
  const index = Number.isInteger(requestedIndex) && requestedIndex >= 0
    ? requestedIndex % items.length
    : Math.floor(Math.random() * items.length);
  const content = await getOutlineItemContent(items[index]);

  return {
    ...content,
    mode: "bible_outline",
    book,
    index,
    total: items.length,
    replyText: `恢復本綱目讀經 ${book.name}（第 ${index + 1} / ${items.length} 段）\n${content.replyText}`,
  };
}

export async function getOutlineItemContent(item) {
  const { bookNo, title } = item;
  const verseRanges = Array.isArray(item?.verseRanges) && item.verseRanges.length
    ? item.verseRanges
    : item?.verseRange
      ? [item.verseRange]
      : [];
  if (!verseRanges.length) throw new Error("此綱目項目無法解析經節範圍");
  const firstRange = verseRanges[0];
  const book = BOOK_BY_NO.get(Number(bookNo));
  if (!book) throw new Error(`找不到書卷編號 ${bookNo}`);

  const allVerses = [];
  const seenRefs = new Set();
  for (const range of verseRanges) {
    const { startChapter, startVerse, endChapter, endVerse } = range;
    for (let ch = startChapter; ch <= endChapter; ch++) {
      const verses = await fetchChapterPage(book.no, ch, ch === startChapter ? startVerse : 1);
      const chVerses = verses.filter((v) => {
        if (ch === startChapter && v.verse < startVerse) return false;
        if (ch === endChapter && v.verse > endVerse) return false;
        return true;
      });
      for (const verse of chVerses) {
        const refKey = `${ch}:${verse.verse}`;
        if (seenRefs.has(refKey)) continue;
        seenRefs.add(refKey);
        allVerses.push({ ...verse, chapter: ch });
      }
    }
  }

  if (!allVerses.length) {
    throw new Error(`找不到 ${book.name} ${firstRange.startChapter}:${firstRange.startVerse} 的經文`);
  }

  const { startChapter, startVerse } = firstRange;
  const displayRef = verseRanges
    .map((range) => {
      const startRef = `${book.shortName}${range.startChapter}:${range.startVerse}`;
      if (range.startChapter === range.endChapter && range.startVerse === range.endVerse) {
        return startRef;
      }
      if (range.startChapter === range.endChapter) {
        return `${startRef}-${range.endVerse}`;
      }
      return `${startRef}～${book.shortName}${range.endChapter}:${range.endVerse}`;
    })
    .join("，");

  const sourceUrl = `${RECOVERY_NEW_BASE_URL}/verse/${book.no}/${startChapter}`;

  const lines = [`綱目：${title}`, `經文：${displayRef}`, ""];
  for (const v of allVerses) {
    lines.push(`${book.shortName}${v.chapter}:${v.verse} ${v.text}`);
  }
  lines.push("", `來源：${sourceUrl}`);

  return { ok: true, title, displayRef, verses: allVerses, replyText: lines.join("\n") };
}

export async function getRandomRecoveryBibleVerse(options = {}) {
  const maxAttempts = Math.min(Math.max(Math.floor(Number(options.maxAttempts) || 3), 1), 10);
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const randomBook = BOOKS[Math.floor(Math.random() * BOOKS.length)];
    const maxChapter = BIBLE_CHAPTER_COUNTS[randomBook.no] || 1;
    const chapter = Math.floor(Math.random() * maxChapter) + 1;

    try {
      const verses = await fetchChapterPage(randomBook.no, chapter, 1);
      if (!verses || verses.length === 0) continue;

      const verse = verses[Math.floor(Math.random() * verses.length)];
      const displayRef = `${randomBook.shortName}${chapter}:${verse.verse}`;
      const sourceUrl = `${RECOVERY_NEW_BASE_URL}/verse/${randomBook.no}/${chapter}`;

      return {
        ok: true,
        mode: "random",
        reference: {
          book: BOOK_BY_NO.get(randomBook.no) || randomBook,
          chapter,
          verseStart: verse.verse,
          verseEnd: verse.verse,
          displayRef,
        },
        verse,
        sourceUrl,
        replyText: buildRandomVerseReply({ displayRef }, verse.text, sourceUrl),
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    return buildFallbackRandomBibleVerse(lastError);
  }

  return buildFallbackRandomBibleVerse();
}

function buildFallbackRandomBibleVerse(error = null) {
  if (error) {
    console.warn("recovery bible random verse fallback:", error.message);
  }

  const item = FALLBACK_RANDOM_VERSES[Math.floor(Math.random() * FALLBACK_RANDOM_VERSES.length)];
  const book = BOOK_BY_NO.get(item.bookNo);
  const displayRef = `${book.shortName}${item.chapter}:${item.verse}`;
  const sourceUrl = `${RECOVERY_NEW_BASE_URL}/verse/${item.bookNo}/${item.chapter}`;
  const notice = "恢復本網站暫時無法提供隨機經節，先提供本地備援經節。";

  return {
    ok: true,
    mode: "fallback_random",
    fallback: true,
    reference: {
      book,
      chapter: item.chapter,
      verseStart: item.verse,
      verseEnd: item.verse,
      displayRef,
    },
    verse: {
      verse: item.verse,
      text: item.text,
      noteRefs: [],
    },
    sourceUrl,
    replyText: buildRandomVerseReply({ displayRef }, item.text, sourceUrl, { notice }),
  };
}

export async function queryRecoveryBibleVerses(query, options = {}) {
  const normalizedQuery = normalizeQueryText(query);
  if (!normalizedQuery) {
    throw new Error("請提供經節或關鍵字，例如：創 1:1 或 參孫");
  }

  const maxResults = normalizeResultCount(options.maxResults, MAX_VERSE_RESULTS);
  const parsedRef = parseReferenceFromText(normalizedQuery);

  if (parsedRef) {
    const verses = await fetchChapterPage(parsedRef.book.no, parsedRef.chapter, parsedRef.verseStart);
    const filtered = verses
      .filter((item) => item.verse >= parsedRef.verseStart && item.verse <= parsedRef.verseEnd)
      .slice(0, maxResults);

    if (!filtered.length) {
      throw new Error(`找不到 ${parsedRef.displayRef} 的經文內容`);
    }

    const displayRef = `${parsedRef.book.shortName}${parsedRef.chapter}:${parsedRef.verseStart}${parsedRef.verseStart === parsedRef.verseEnd ? "" : `-${parsedRef.verseEnd}`}`;
    const sourceUrl = `${RECOVERY_NEW_BASE_URL}/verse/${parsedRef.book.no}/${parsedRef.chapter}`;
    const lines = [`恢復本經文 ${displayRef}`];
    for (const item of filtered) {
      lines.push(`${parsedRef.book.shortName}${parsedRef.chapter}:${item.verse} ${item.text}`);
    }
    lines.push("", `來源：${sourceUrl}`);

    return {
      ok: true,
      mode: "reference",
      query: normalizedQuery,
      reference: { ...parsedRef, displayRef },
      verses: filtered,
      replyText: lines.join("\n"),
    };
  }

  throw new Error("目前僅支援明確經節查詢（例如：創1:1、羅8:28），關鍵字搜尋暫時無法使用。");
}

export async function queryRecoveryBibleNotes(query, options = {}) {
  throw new Error("註解查詢功能暫時無法使用，恢復本網站已改版。請直接前往 https://recoveryversion.com.tw 查詢。");
}

export async function queryLifeStudyExcerpt({ query = "", keyword = "" } = {}) {
  throw new Error("生命讀經查詢功能暫時無法使用，恢復本網站已改版。請直接前往 https://line.twgbr.org/life-study 查詢。");
}
