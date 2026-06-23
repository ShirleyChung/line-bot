// services/weatherService.js
import { env } from "../config/env.js";
import { db } from "./firestore.js";
const CWA_API_KEY = env.CWA_API_KEY;
const CWA_36H_ENDPOINT =
  'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
const CWA_DATASTORE_BASE =
  'https://opendata.cwa.gov.tw/api/v1/rest/datastore';
const CWA_TOWNSHIP_DATASET_BY_CITY = {
  宜蘭縣: 'F-D0047-003',
  桃園市: 'F-D0047-007',
  新竹縣: 'F-D0047-011',
  苗栗縣: 'F-D0047-015',
  彰化縣: 'F-D0047-019',
  南投縣: 'F-D0047-023',
  雲林縣: 'F-D0047-027',
  嘉義縣: 'F-D0047-031',
  屏東縣: 'F-D0047-035',
  臺東縣: 'F-D0047-039',
  花蓮縣: 'F-D0047-043',
  澎湖縣: 'F-D0047-047',
  基隆市: 'F-D0047-051',
  新竹市: 'F-D0047-055',
  嘉義市: 'F-D0047-059',
  臺北市: 'F-D0047-063',
  高雄市: 'F-D0047-067',
  新北市: 'F-D0047-071',
  臺中市: 'F-D0047-075',
  臺南市: 'F-D0047-079',
  連江縣: 'F-D0047-083',
  金門縣: 'F-D0047-087',
};

// CWA 的 F-C0032-003 / F-C0032-005 已不在現行 API 清單中，請求會回傳 404。
// 縣市層級的後天起預報改用仍受支援的 F-D0047 一週鄉鎮預報。為避免將
// 單一行政區誤標示為整個縣市，回覆會保留實際採用的代表行政區名稱。
const CWA_REPRESENTATIVE_TOWN_BY_CITY = {
  宜蘭縣: '宜蘭市',
  桃園市: '桃園區',
  新竹縣: '竹北市',
  苗栗縣: '苗栗市',
  彰化縣: '彰化市',
  南投縣: '南投市',
  雲林縣: '斗六市',
  嘉義縣: '太保市',
  屏東縣: '屏東市',
  臺東縣: '臺東市',
  花蓮縣: '花蓮市',
  澎湖縣: '馬公市',
  基隆市: '仁愛區',
  新竹市: '東區',
  嘉義市: '東區',
  臺北市: '中正區',
  高雄市: '苓雅區',
  新北市: '板橋區',
  臺中市: '西屯區',
  臺南市: '中西區',
  連江縣: '南竿鄉',
  金門縣: '金城鎮',
};

const weatherCache = new Map();
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;

const userDefaultCityMap = new Map();

const CITY_ALIASES = {
  台北: '臺北市',
  臺北: '臺北市',
  台北市: '臺北市',
  臺北市: '臺北市',

  新北: '新北市',
  新北市: '新北市',

  桃園: '桃園市',
  桃園市: '桃園市',

  新竹: '新竹市',
  新竹市: '新竹市',
  新竹縣: '新竹縣',

  苗栗: '苗栗縣',
  苗栗縣: '苗栗縣',

  台中: '臺中市',
  臺中: '臺中市',
  台中市: '臺中市',
  臺中市: '臺中市',

  彰化: '彰化縣',
  彰化縣: '彰化縣',

  南投: '南投縣',
  南投縣: '南投縣',

  雲林: '雲林縣',
  雲林縣: '雲林縣',

  嘉義: '嘉義市',
  嘉義市: '嘉義市',
  嘉義縣: '嘉義縣',

  台南: '臺南市',
  臺南: '臺南市',
  台南市: '臺南市',
  臺南市: '臺南市',

  高雄: '高雄市',
  高雄市: '高雄市',

  屏東: '屏東縣',
  屏東縣: '屏東縣',

  基隆: '基隆市',
  基隆市: '基隆市',

  宜蘭: '宜蘭縣',
  宜蘭縣: '宜蘭縣',

  花蓮: '花蓮縣',
  花蓮縣: '花蓮縣',

  台東: '臺東縣',
  臺東: '臺東縣',
  台東縣: '臺東縣',
  臺東縣: '臺東縣',

  澎湖: '澎湖縣',
  澎湖縣: '澎湖縣',

  金門: '金門縣',
  金門縣: '金門縣',

  馬祖: '連江縣',
  連江: '連江縣',
  連江縣: '連江縣',
};

const TOWNSHIP_ALIASES = {
  淡水: { city: '新北市', town: '淡水區' },
  淡水區: { city: '新北市', town: '淡水區' },
  板橋: { city: '新北市', town: '板橋區' },
  板橋區: { city: '新北市', town: '板橋區' },
  羅東: { city: '宜蘭縣', town: '羅東鎮' },
  羅東鎮: { city: '宜蘭縣', town: '羅東鎮' },
  埔里: { city: '南投縣', town: '埔里鎮' },
  埔里鎮: { city: '南投縣', town: '埔里鎮' },
  北投: { city: '臺北市', town: '北投區' },
  士林: { city: '臺北市', town: '士林區' },
  信義: { city: '臺北市', town: '信義區' },
  內湖: { city: '臺北市', town: '內湖區' },
  南港: { city: '臺北市', town: '南港區' },
  文山: { city: '臺北市', town: '文山區' },
  三重: { city: '新北市', town: '三重區' },
  新莊: { city: '新北市', town: '新莊區' },
  中和: { city: '新北市', town: '中和區' },
  永和: { city: '新北市', town: '永和區' },
  新店: { city: '新北市', town: '新店區' },
  汐止: { city: '新北市', town: '汐止區' },
  土城: { city: '新北市', town: '土城區' },
  樹林: { city: '新北市', town: '樹林區' },
  三峽: { city: '新北市', town: '三峽區' },
  林口: { city: '新北市', town: '林口區' },
  蘆洲: { city: '新北市', town: '蘆洲區' },
  宜蘭市: { city: '宜蘭縣', town: '宜蘭市' },
  礁溪: { city: '宜蘭縣', town: '礁溪鄉' },
  頭城: { city: '宜蘭縣', town: '頭城鎮' },
  蘇澳: { city: '宜蘭縣', town: '蘇澳鎮' },
  冬山: { city: '宜蘭縣', town: '冬山鄉' },
  五結: { city: '宜蘭縣', town: '五結鄉' },
  草屯: { city: '南投縣', town: '草屯鎮' },
  竹山: { city: '南投縣', town: '竹山鎮' },
  鹿谷: { city: '南投縣', town: '鹿谷鄉' },
  魚池: { city: '南投縣', town: '魚池鄉' },
  清境: { city: '南投縣', town: '仁愛鄉' },
  仁愛: { city: '南投縣', town: '仁愛鄉' },
  日月潭: { city: '南投縣', town: '魚池鄉' },
};

const TOWNSHIP_SUFFIXES = ['市', '區', '鎮', '鄉'];
const SUPPORTED_CITY_NAMES = [...new Set(Object.values(CITY_ALIASES))]
  .sort((a, b) => b.length - a.length);
const TOWNSHIP_ELEMENT_ALIASES = {
  平均溫度: 'T',
  溫度: 'T',
  最高溫度: 'MaxT',
  最低溫度: 'MinT',
  平均相對濕度: 'RH',
  平均相對溼度: 'RH',
  最高體感溫度: 'MaxAT',
  最低體感溫度: 'MinAT',
  最大舒適度指數: 'MaxCI',
  最小舒適度指數: 'MinCI',
  '12小時降雨機率': 'PoP12h',
  '6小時降雨機率': 'PoP6h',
  天氣現象: 'Wx',
  天氣預報綜合描述: 'WeatherDescription',
};

function getDefaultWeatherRef(userId) {
  return db.collection('users').doc(userId);
}

function cleanWeatherLocationText(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/天氣/g, '')
    .replace(/氣溫/g, '')
    .replace(/溫度/g, '')
    .replace(/[？?！!。,.，]/g, '');
}

/**
 * 將使用者輸入的縣市名稱正規化成 CWA API 使用的正式名稱。
 * 例如「台北」「臺北」都會變成「臺北市」。
 */
export function normalizeTaiwanCity(input) {
  const s = String(input || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/台/g, '臺');

  if (!s) return '';

  if (CITY_ALIASES[s]) return CITY_ALIASES[s];

  // 再試一次原字串，避免「台」轉「臺」後漏掉
  const original = String(input || '').trim().replace(/\s+/g, '');
  if (CITY_ALIASES[original]) return CITY_ALIASES[original];

  return s;
}

export function normalizeTaiwanWeatherLocation(input) {
  const raw = cleanWeatherLocationText(input);
  const s = raw.replace(/台/g, '臺');

  if (!s) return null;

  if (TOWNSHIP_ALIASES[s]) {
    return {
      ...TOWNSHIP_ALIASES[s],
      label: `${TOWNSHIP_ALIASES[s].city}${TOWNSHIP_ALIASES[s].town}`,
      type: 'township',
    };
  }

  const fullLocationCity = SUPPORTED_CITY_NAMES.find((cityName) => (
    s.startsWith(cityName) && s.length > cityName.length
  ));
  if (fullLocationCity) {
    const town = s.slice(fullLocationCity.length);
    if (town) {
      return {
        city: fullLocationCity,
        town,
        label: `${fullLocationCity}${town}`,
        type: 'township',
      };
    }
  }

  const city = normalizeTaiwanCity(s);
  if (isSupportedTaiwanCity(city)) {
    return {
      city,
      town: '',
      label: city,
      type: 'city',
    };
  }

  if (TOWNSHIP_SUFFIXES.some((suffix) => s.endsWith(suffix))) {
    return {
      city: '',
      town: s,
      label: s,
      type: 'township',
    };
  }

  const original = String(input || '').trim().replace(/\s+/g, '');
  if (TOWNSHIP_ALIASES[original]) {
    return {
      ...TOWNSHIP_ALIASES[original],
      label: `${TOWNSHIP_ALIASES[original].city}${TOWNSHIP_ALIASES[original].town}`,
      type: 'township',
    };
  }

  return {
    city: '',
    town: s,
    label: s,
    type: 'unknown',
  };
}

export function isSupportedTaiwanCity(city) {
  const normalized = normalizeTaiwanCity(city);
  return Object.values(CITY_ALIASES).includes(normalized);
}

export function extractWeatherCityFromText(text) {
  let s = String(text || '').trim();

  // 這裡處理常見口語查詢，讓「幫我查一下台北會不會下雨」能留下城市名稱。
  s = s
    .replace(/^@\S+\s*/, '')
    .replace(/請問/g, '')
    .replace(/幫我/g, '')
    .replace(/查一下/g, '')
    .replace(/查/g, '')
    .replace(/今天/g, '')
    .replace(/明天/g, '')
    .replace(/大後天/g, '')
    .replace(/後天/g, '')
    .replace(/\d{4}[\/-]\d{1,2}[\/-]\d{1,2}/g, '')
    .replace(/\d{1,2}[\/-]\d{1,2}(?:日)?/g, '')
    .replace(/\d{1,2}月\d{1,2}日?/g, '')
    .replace(/未來一週/g, '')
    .replace(/未來一周/g, '')
    .replace(/這週/g, '')
    .replace(/一週/g, '')
    .replace(/一周/g, '')
    .replace(/現在/g, '')
    .replace(/目前/g, '')
    .replace(/的/g, '')
    .replace(/天氣/g, '')
    .replace(/氣溫/g, '')
    .replace(/溫度/g, '')
    .replace(/會不會下雨/g, '')
    .replace(/會下雨嗎/g, '')
    .replace(/下雨嗎/g, '')
    .replace(/怎麼樣/g, '')
    .replace(/怎樣/g, '')
    .replace(/如何/g, '')
    .replace(/呢/g, '')
    .replace(/嗎/g, '')
    .replace(/[？?！!。,.，]/g, '')
    .trim();

  if (!s) return null;

  // 只有確實解析成台灣縣市 / 鄉鎮市區時才回傳，
  // 避免「如何」「怎麼樣」之類殘留字被當成地名，蓋掉預設地點的 fallback。
  const location = normalizeTaiwanWeatherLocation(s);
  if (location?.type === 'city' || location?.type === 'township') {
    return location.label;
  }
  return null;
}

export function isWeatherIntent(text) {
  const s = String(text || '');
  return (
    s.includes('天氣') ||
    s.includes('氣溫') ||
    s.includes('溫度') ||
    s.includes('下雨') ||
    s.includes('降雨')
  );
}

export function parseSetDefaultWeatherCity(text) {
  const s = String(text || '').trim();

  const patterns = [
    /^設定天氣地點\s*(.+)$/,
    /^設定預設天氣\s*(.+)$/,
    /^天氣地點設定\s*(.+)$/,
    /^我的天氣地點是\s*(.+)$/,
    /^預設天氣地點\s*(.+)$/,
    /^以後(?:都)?(?:幫我)?查\s*(.+)$/,
    /^以後(?:都)?(?:幫我)?查\s*(.+?)天氣$/,
    /^以後(?:都)?用\s*(.+?)\s*查天氣$/,
    /^預設查\s*(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = s.match(pattern);
    if (match) {
      return normalizeTaiwanWeatherLocation(cleanWeatherLocationText(match[1]))?.label || null;
    }
  }

  return null;
}

export async function setDefaultWeatherCity(userId, city) {
  if (!userId) {
    return {
      ok: false,
      message: '無法設定預設天氣地點，因為缺少 userId。',
    };
  }

  const location = normalizeTaiwanWeatherLocation(city);

  if (!location || location.type === 'unknown') {
    return {
      ok: false,
      message: `目前不支援「${city}」。請輸入台灣縣市或鄉鎮市區，例如：淡水、板橋、羅東、埔里。`,
    };
  }

  userDefaultCityMap.set(userId, location);
  await getDefaultWeatherRef(userId).set(
    {
      defaultWeatherLocation: location,
      defaultWeatherCity: location.label,
      updatedAt: new Date(),
    },
    { merge: true }
  );

  return {
    ok: true,
    city: location.city,
    town: location.town,
    location,
    message: `好的，以後你沒指定地點時，我會查「${location.label}」的天氣。`,
  };
}

export async function getDefaultWeatherCity(userId) {
  if (!userId) return null;
  if (userDefaultCityMap.has(userId)) {
    return userDefaultCityMap.get(userId);
  }

  const snap = await getDefaultWeatherRef(userId).get();
  const data = snap.exists ? snap.data() : null;
  const saved = data?.defaultWeatherLocation || data?.defaultWeatherCity;
  const location = typeof saved === 'object'
    ? saved
    : normalizeTaiwanWeatherLocation(saved);

  if (location) {
    userDefaultCityMap.set(userId, location);
  }

  return location || null;
}

function getWeatherElementMap(location) {
  const map = {};

  for (const element of location.weatherElement || location.WeatherElement || []) {
    const elementName = element.elementName || element.ElementName;
    const canonicalName = TOWNSHIP_ELEMENT_ALIASES[elementName] || elementName;
    map[canonicalName] = element.time || element.Time || [];
  }

  return map;
}

function targetDayOffset(target = 'now') {
  if (target === 'tomorrow') return 1;
  // 保留 later 的相容性，並將它明確定義為後天。
  if (target === 'day_after_tomorrow' || target === 'later') return 2;
  return 0;
}

function taipeiDate(offset = 0) {
  const base = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(base);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Parse an explicit calendar date in a weather query and return its offset
 * from the supplied Taipei date. Dates without a year refer to the next
 * occurrence, so a past 1/1 query in December means next year's 1/1.
 */
export function parseWeatherDateOffset(text, now = new Date()) {
  const value = String(text || '');
  const match = value.match(/(?:(\d{4})(?:\/|-)(\d{1,2})(?:\/|-)(\d{1,2})|(\d{1,2})(?:\/|-|月)(\d{1,2})(?:日)?)/);
  if (!match) return null;

  const [, inputYear, yearMonthText, yearDayText, monthDayText, monthDayDayText] = match;
  const monthText = yearMonthText || monthDayText;
  const dayText = yearDayText || monthDayDayText;
  const today = taipeiDateFromDate(now);
  const month = Number(monthText);
  const day = Number(dayText);
  let year = inputYear ? Number(inputYear) : Number(today.slice(0, 4));

  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  let requested = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (!isValidTaipeiCalendarDate(requested)) return null;

  if (!inputYear && requested < today) {
    year += 1;
    requested = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const offset = Math.round((Date.parse(`${requested}T00:00:00+08:00`) - Date.parse(`${today}T00:00:00+08:00`)) / 86_400_000);
  return { date: requested, dayOffset: offset };
}

function taipeiDateFromDate(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidTaipeiCalendarDate(dateString) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dateString;
}

function getTimeStartDate(item) {
  const time = item?.startTime || item?.StartTime || item?.dataTime || item?.DataTime || '';
  return String(time).slice(0, 10);
}

function pickTimeIndex(weatherElementMap, options = {}) {
  const target = options.target || 'now';
  const times = Object.values(weatherElementMap).find((items) => Array.isArray(items) && items.length) || [];
  if (target === 'now') return 0;

  const expectedDate = taipeiDate(options.dayOffset ?? targetDayOffset(target));
  const matchedIndex = times.findIndex((item) => getTimeStartDate(item) === expectedDate);
  return matchedIndex;
}

function getWeekdayLabel(dateString) {
  const weekday = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', weekday: 'short',
  }).format(new Date(`${dateString}T12:00:00+08:00`));
  return `${dateString.slice(5).replace('-', '/')}（${weekday}）`;
}

function getParamName(item) {
  return item?.parameter?.parameterName ?? null;
}

function normalizeRainValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  return s.endsWith('%') ? s : `${s}%`;
}

function getElementValue(item, preferredKeys = []) {
  const value = item?.elementValue || item?.ElementValue;
  if (Array.isArray(value)) {
    const first = value[0];
    for (const key of preferredKeys) {
      if (first?.[key] !== undefined && first?.[key] !== null) return first[key];
    }
    return first?.value
      ?? first?.elementValue
      ?? first?.parameterName
      ?? first?.Value
      ?? first?.ElementValue
      ?? first?.ParameterName
      ?? Object.values(first || {})[0]
      ?? null;
  }
  return value?.value
    ?? value?.elementValue
    ?? value?.parameterName
    ?? value?.Value
    ?? value?.ElementValue
    ?? value?.ParameterName
    ?? value
    ?? null;
}

function getTownshipTimeValue(weatherElementMap, elementName, idx = 0, preferredKeys = []) {
  const item = weatherElementMap[elementName]?.[idx];
  return getElementValue(item, preferredKeys);
}

function getTownshipTime(weatherElementMap, elementNames, idx = 0) {
  for (const elementName of elementNames) {
    const item = weatherElementMap[elementName]?.[idx];
    if (item) return item;
  }
  return null;
}

function getLocationsGroups(json) {
  return json.records?.locations || json.records?.Locations || [];
}

function getLocationsName(group) {
  return group?.locationsName || group?.LocationsName || '';
}

function getTownshipName(location) {
  return location?.locationName || location?.LocationName || '';
}

function getGroupLocations(group) {
  return group?.location || group?.Location || [];
}

function findLocationInGroup(group, town) {
  return getGroupLocations(group).find((item) => getTownshipName(item) === town) || null;
}

function getTownNameCandidates(town) {
  if (TOWNSHIP_SUFFIXES.some((suffix) => town.endsWith(suffix))) {
    return [town];
  }

  return [
    ...TOWNSHIP_SUFFIXES.map((suffix) => `${town}${suffix}`),
    town,
  ];
}

function buildTownshipWeatherData({ json, dataset, group, location, target, idx }) {
  const elementMap = getWeatherElementMap(location);
  const time = getTownshipTime(elementMap, ['Wx', 'WeatherDescription', 'T', 'MinT'], idx);
  const minT = getTownshipTimeValue(elementMap, 'MinT', idx, ['MinTemperature']) ?? getTownshipTimeValue(elementMap, 'T', idx, ['Temperature']);
  const maxT = getTownshipTimeValue(elementMap, 'MaxT', idx, ['MaxTemperature']) ?? getTownshipTimeValue(elementMap, 'T', idx, ['Temperature']);
  const weather = getTownshipTimeValue(elementMap, 'Wx', idx, ['Weather']);
  const description = getTownshipTimeValue(elementMap, 'WeatherDescription', idx, ['WeatherDescription']);
  const pop = getTownshipTimeValue(elementMap, 'PoP12h', idx, ['ProbabilityOfPrecipitation']) ?? getTownshipTimeValue(elementMap, 'PoP6h', idx, ['ProbabilityOfPrecipitation']);
  const comfort = getTownshipTimeValue(elementMap, 'CI', idx, ['ComfortIndexDescription'])
    ?? getTownshipTimeValue(elementMap, 'MinCI', idx, ['MinComfortIndexDescription'])
    ?? getTownshipTimeValue(elementMap, 'MaxCI', idx, ['MaxComfortIndexDescription']);
  const apparentT = getTownshipTimeValue(elementMap, 'AT', idx, ['ApparentTemperature'])
    ?? getTownshipTimeValue(elementMap, 'MaxAT', idx, ['MaxApparentTemperature'])
    ?? getTownshipTimeValue(elementMap, 'MinAT', idx, ['MinApparentTemperature']);
  const relativeHumidity = getTownshipTimeValue(elementMap, 'RH', idx, ['RelativeHumidity']);
  const city = getLocationsName(group);
  const town = getTownshipName(location);

  return {
    ok: true,
    source: 'CWA',
    dataset,
    city,
    town,
    locationName: `${city}${town}`,
    target,
    startTime: time?.startTime || time?.StartTime || time?.DataTime || null,
    endTime: time?.endTime || time?.EndTime || null,
    weather,
    weatherDescription: description,
    rainProbability: normalizeRainValue(pop),
    minTemperatureC: minT,
    maxTemperatureC: maxT,
    apparentTemperatureC: apparentT,
    relativeHumidity: normalizeRainValue(relativeHumidity),
    comfort,
    rawUpdatedAt: json.records?.datasetDescription || json.records?.DatasetDescription || null,
  };
}

async function fetchCwaJson(url, cacheKey) {
  const now = Date.now();
  const cached = weatherCache.get(cacheKey);
  if (cached && now - cached.cachedAt < WEATHER_CACHE_TTL_MS) {
    return cached.data;
  }

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`CWA API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  weatherCache.set(cacheKey, {
    cachedAt: now,
    data: json,
  });

  return json;
}

/**
 * 查詢中央氣象署 36 小時天氣預報。
 * 回傳資料會被整理成穩定欄位，讓 handler / reminder 不需要理解 CWA 原始資料結構。
 */
export async function fetchCwa36hWeather(city, options = {}) {
  if (!CWA_API_KEY) {
    throw new Error('Missing CWA_API_KEY environment variable.');
  }

  const normalizedCity = normalizeTaiwanCity(city);

  if (!normalizedCity) {
    return {
      ok: false,
      reason: 'missing_city',
      message: '請提供要查詢的縣市，例如：台北天氣、高雄天氣。',
    };
  }

  if (!isSupportedTaiwanCity(normalizedCity)) {
    return {
      ok: false,
      reason: 'unsupported_city',
      city: normalizedCity,
      message: `目前查不到「${city}」的天氣。請輸入台灣縣市，例如：台北、新北、桃園、台中、高雄。`,
    };
  }

  const target = options.target || 'now';
  const dayOffset = options.dayOffset ?? targetDayOffset(target);
  if (target === 'week' || dayOffset >= 2) {
    const town = CWA_REPRESENTATIVE_TOWN_BY_CITY[normalizedCity];
    if (!town) {
      return {
        ok: false,
        reason: 'unsupported_city',
        city: normalizedCity,
        message: `目前查不到「${normalizedCity}」後天起的天氣資料。`,
      };
    }

    return fetchCwaTownshipWeather({
      type: 'township',
      city: normalizedCity,
      town,
      label: `${normalizedCity}${town}`,
    }, options);
  }

  const dataset = 'F-C0032-001';
  const url = new URL(CWA_36H_ENDPOINT);
  url.searchParams.set('Authorization', CWA_API_KEY);
  url.searchParams.set('format', 'JSON');
  url.searchParams.set('locationName', normalizedCity);

  const cacheKey = `cwa:${dataset}:${normalizedCity}`;
  const json = await fetchCwaJson(url, cacheKey);
  const location = json.records?.location?.[0];

  if (!location) {
    return {
      ok: false,
      reason: 'not_found',
      city: normalizedCity,
      message: `查不到「${normalizedCity}」的天氣資料。`,
    };
  }

  const elementMap = getWeatherElementMap(location);
  const idx = pickTimeIndex(elementMap, { target, dayOffset });
  if (idx < 0) {
    return {
      ok: false,
      reason: 'target_out_of_range',
      city: normalizedCity,
      message: `「${normalizedCity}」目前沒有 ${target === 'day_after_tomorrow' || target === 'later' ? '後天' : '指定日期'} 的預報資料。`,
    };
  }

  const wx = elementMap.Wx?.[idx];
  const pop = elementMap.PoP?.[idx];
  const minT = elementMap.MinT?.[idx];
  const maxT = elementMap.MaxT?.[idx];
  const ci = elementMap.CI?.[idx];

  const data = {
    ok: true,
    source: 'CWA',
    dataset,
    city: location.locationName,
    target,
    startTime: wx?.startTime || pop?.startTime || minT?.startTime || null,
    endTime: wx?.endTime || pop?.endTime || minT?.endTime || null,
    weather: getParamName(wx),
    rainProbability: normalizeRainValue(getParamName(pop)),
    minTemperatureC: getParamName(minT),
    maxTemperatureC: getParamName(maxT),
    comfort: getParamName(ci),
    rawUpdatedAt: json.records?.datasetDescription || null,
  };

  return data;
}

async function fetchWeeklyWeather(fetchOneDay) {
  const forecasts = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const target = offset === 0 ? 'now' : offset === 1 ? 'tomorrow' : 'day_after_tomorrow';
    const data = await fetchOneDay(target, offset);
    if (!data.ok) {
      if (offset < 3) return data;
      continue;
    }
    const date = String(data.startTime || taipeiDate(offset)).slice(0, 10);
    // 同一天可能有日、夜兩筆預報；週報保留第一筆，避免重複日期。
    if (!forecasts.some((item) => item.date === date)) {
      forecasts.push({ ...data, date, dayLabel: getWeekdayLabel(date) });
    }
  }

  if (!forecasts.length) {
    return { ok: false, message: '目前沒有可用的一週天氣預報資料。' };
  }

  return {
    ok: true,
    source: 'CWA',
    city: forecasts[0].city,
    locationName: forecasts[0].locationName,
    target: 'week',
    forecasts,
  };
}

export async function fetchCwaTownshipWeather(locationInput, options = {}) {
  if (!CWA_API_KEY) {
    throw new Error('Missing CWA_API_KEY environment variable.');
  }

  const location = typeof locationInput === 'object'
    ? locationInput
    : normalizeTaiwanWeatherLocation(locationInput);

  if (!location || !location.town) {
    return fetchCwa36hWeather(location?.city || locationInput, options);
  }

  const target = options.target || 'now';
  const dayOffset = options.dayOffset ?? targetDayOffset(target);

  const datasetEntries = location.city
    ? [[location.city, CWA_TOWNSHIP_DATASET_BY_CITY[location.city]]].filter(([, dataset]) => dataset)
    : Object.entries(CWA_TOWNSHIP_DATASET_BY_CITY);
  const townCandidates = getTownNameCandidates(location.town);
  const matches = [];

  for (const [city, dataset] of datasetEntries) {
    const url = new URL(`${CWA_DATASTORE_BASE}/${dataset}`);
    url.searchParams.set('Authorization', CWA_API_KEY);
    url.searchParams.set('format', 'JSON');
    // 縣市資料集內仍含多個鄉鎮；預先交由 CWA 篩選以減少回應大小。
    // 第一個候選值為含行政區後綴的正式名稱，符合資料集 LocationName。
    url.searchParams.set('locationName', townCandidates[0]);

    const cacheKey = `cwaTownship:${dataset}:${city}:${townCandidates[0]}`;
    const json = await fetchCwaJson(url, cacheKey);
    const groups = getLocationsGroups(json);
    const matchedGroup = groups.find((group) => getLocationsName(group) === city) || groups[0];

    for (const town of townCandidates) {
      const matchedLocation = findLocationInGroup(matchedGroup, town);

      if (matchedGroup && matchedLocation) {
        matches.push({ json, dataset, group: matchedGroup, location: matchedLocation });
      }
    }
  }

  if (matches.length > 1) {
    const candidates = matches.map((match) => (
      `${getLocationsName(match.group)}${getTownshipName(match.location)}`
    ));
    return {
      ok: false,
      reason: 'ambiguous_township',
      city: location.label,
      message: `「${location.label}」有多個符合地點：${candidates.join('、')}。請輸入完整縣市與鄉鎮市區，例如：臺北市中正區。`,
    };
  }

  if (matches.length === 0) {
    if (location.city) {
      return fetchCwa36hWeather(location.city, options);
    }

    return {
      ok: false,
      reason: 'not_found',
      city: location.label,
      message: `查不到「${location.label}」的天氣資料。請輸入縣市或較完整的鄉鎮市區名稱。`,
    };
  }

  const elementMap = getWeatherElementMap(matches[0].location);
  const idx = pickTimeIndex(elementMap, { target, dayOffset });
  if (idx < 0) {
    return {
      ok: false,
      reason: 'target_out_of_range',
      city: location.label,
      message: `「${location.label}」目前沒有指定日期的預報資料。`,
    };
  }

  return buildTownshipWeatherData({
    ...matches[0],
    target,
    idx,
  });
}

export function formatWeatherReply(data) {
  if (!data?.ok) {
    return data?.message || '天氣查詢失敗，請稍後再試。';
  }

  if (data.target === 'week' && Array.isArray(data.forecasts)) {
    const lines = [`📍${data.locationName || data.city} 未來一週天氣`];
    for (const forecast of data.forecasts) {
      const details = [forecast.weather];
      if (forecast.minTemperatureC && forecast.maxTemperatureC) {
        details.push(`${forecast.minTemperatureC}~${forecast.maxTemperatureC}°C`);
      }
      if (forecast.rainProbability) details.push(`降雨 ${forecast.rainProbability}`);
      lines.push(`${forecast.dayLabel}：${details.filter(Boolean).join('｜') || '暫無資料'}`);
    }
    return lines.join('\n');
  }

  const lines = [
    `📍${data.locationName || data.city} 天氣`,
  ];

  if (data.startTime && data.endTime) {
    lines.push(`時間：${data.startTime} ~ ${data.endTime}`);
  }

  if (data.weather) {
    lines.push(`天氣：${data.weather}`);
  }

  if (data.minTemperatureC && data.maxTemperatureC) {
    lines.push(`溫度：${data.minTemperatureC}°C ~ ${data.maxTemperatureC}°C`);
  }

  if (data.rainProbability) {
    lines.push(`降雨機率：${data.rainProbability}`);
  }

  if (data.apparentTemperatureC) {
    lines.push(`體感：${data.apparentTemperatureC}°C`);
  }

  if (data.relativeHumidity) {
    lines.push(`濕度：${data.relativeHumidity}`);
  }

  if (data.comfort) {
    lines.push(`舒適度：${data.comfort}`);
  }

  if (data.weatherDescription && data.weatherDescription !== data.weather) {
    lines.push(`描述：${data.weatherDescription}`);
  }

  return lines.join('\n');
}

export async function getWeatherForUser({ text, userId, city, target = 'now', dayOffset }) {
  let finalLocation = city ? normalizeTaiwanWeatherLocation(city) : null;

  // 城市來源優先序：明確參數 > 從文字解析 > 使用者預設地點。
  if (!finalLocation && text) {
    const extracted = extractWeatherCityFromText(text);
    finalLocation = extracted ? normalizeTaiwanWeatherLocation(extracted) : null;
  }

  if (!finalLocation && userId) {
    finalLocation = await getDefaultWeatherCity(userId);
  }

  if (!finalLocation) {
    return {
      ok: false,
      reason: 'need_city',
      message: [
        '你想查哪裡的天氣呢？',
        '例如：淡水天氣、板橋會下雨嗎、羅東明天天氣',
        '',
        '也可以先設定預設地點：',
        '設定天氣地點 淡水',
      ].join('\n'),
    };
  }

  const fetchForecast = (forecastTarget, offset) => {
    const options = { target: forecastTarget, dayOffset: offset };
    if (finalLocation.type === 'city') {
      return fetchCwa36hWeather(finalLocation.city, options);
    }
    return fetchCwaTownshipWeather(finalLocation, options);
  };

  if (target === 'week') {
    return fetchWeeklyWeather(fetchForecast);
  }

  return fetchForecast(target, dayOffset);
}
