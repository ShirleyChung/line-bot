// services/weatherService.js
import { env } from "../config/env.js";
const CWA_API_KEY = env.CWA_API_KEY;
const CWA_36H_ENDPOINT =
  'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';

const weatherCache = new Map();
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;

// 測試用：Cloud Run 重啟會消失。
// 正式版可改 Firestore / Cloud SQL / Google Sheet。
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

export function isSupportedTaiwanCity(city) {
  const normalized = normalizeTaiwanCity(city);
  return Object.values(CITY_ALIASES).includes(normalized);
}

export function extractWeatherCityFromText(text) {
  let s = String(text || '').trim();

  s = s
    .replace(/^@\S+\s*/, '')
    .replace(/請問/g, '')
    .replace(/幫我/g, '')
    .replace(/查一下/g, '')
    .replace(/查/g, '')
    .replace(/今天/g, '')
    .replace(/明天/g, '')
    .replace(/現在/g, '')
    .replace(/目前/g, '')
    .replace(/的/g, '')
    .replace(/天氣/g, '')
    .replace(/氣溫/g, '')
    .replace(/溫度/g, '')
    .replace(/會不會下雨/g, '')
    .replace(/會下雨嗎/g, '')
    .replace(/下雨嗎/g, '')
    .replace(/[？?！!。,.，]/g, '')
    .trim();

  if (!s) return null;

  const city = normalizeTaiwanCity(s);
  return city || null;
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
  ];

  for (const pattern of patterns) {
    const match = s.match(pattern);
    if (match) {
      return normalizeTaiwanCity(match[1]);
    }
  }

  return null;
}

export function setDefaultWeatherCity(userId, city) {
  if (!userId) {
    return {
      ok: false,
      message: '無法設定預設天氣地點，因為缺少 userId。',
    };
  }

  const normalized = normalizeTaiwanCity(city);

  if (!isSupportedTaiwanCity(normalized)) {
    return {
      ok: false,
      message: `目前不支援「${city}」。請輸入台灣縣市，例如：台北、新北、桃園、台中、高雄。`,
    };
  }

  userDefaultCityMap.set(userId, normalized);

  return {
    ok: true,
    city: normalized,
    message: `好的，以後你沒指定地點時，我會查「${normalized}」的天氣。`,
  };
}

export function getDefaultWeatherCity(userId) {
  if (!userId) return null;
  return userDefaultCityMap.get(userId) || null;
}

function getWeatherElementMap(location) {
  const map = {};

  for (const element of location.weatherElement || []) {
    map[element.elementName] = element.time || [];
  }

  return map;
}

function pickTimeIndex(weatherElementMap, options = {}) {
  const target = options.target || 'now';

  // CWA 36 小時通常有 3 個區段：
  // 0: 最近 12 小時
  // 1: 下一個 12 小時
  // 2: 再下一個 12 小時
  if (target === 'tomorrow') return 1;
  if (target === 'later') return 2;

  return 0;
}

function getParamName(item) {
  return item?.parameter?.parameterName ?? null;
}

function normalizeRainValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  return s.endsWith('%') ? s : `${s}%`;
}

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
  const cacheKey = `cwa36h:${normalizedCity}:${target}`;
  const now = Date.now();

  const cached = weatherCache.get(cacheKey);
  if (cached && now - cached.cachedAt < WEATHER_CACHE_TTL_MS) {
    return cached.data;
  }

  const url = new URL(CWA_36H_ENDPOINT);
  url.searchParams.set('Authorization', CWA_API_KEY);
  url.searchParams.set('format', 'JSON');
  url.searchParams.set('locationName', normalizedCity);

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`CWA API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
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
  const idx = pickTimeIndex(elementMap, { target });

  const wx = elementMap.Wx?.[idx];
  const pop = elementMap.PoP?.[idx];
  const minT = elementMap.MinT?.[idx];
  const maxT = elementMap.MaxT?.[idx];
  const ci = elementMap.CI?.[idx];

  const data = {
    ok: true,
    source: 'CWA',
    dataset: 'F-C0032-001',
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

  weatherCache.set(cacheKey, {
    cachedAt: now,
    data,
  });

  return data;
}

export function formatWeatherReply(data) {
  if (!data?.ok) {
    return data?.message || '天氣查詢失敗，請稍後再試。';
  }

  const lines = [
    `📍${data.city} 天氣`,
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

  if (data.comfort) {
    lines.push(`舒適度：${data.comfort}`);
  }

  return lines.join('\n');
}

export async function getWeatherForUser({ text, userId, city, target = 'now' }) {
  let finalCity = city ? normalizeTaiwanCity(city) : null;

  if (!finalCity && text) {
    finalCity = extractWeatherCityFromText(text);
  }

  if (!finalCity && userId) {
    finalCity = getDefaultWeatherCity(userId);
  }

  if (!finalCity) {
    return {
      ok: false,
      reason: 'need_city',
      message: [
        '你想查哪裡的天氣呢？',
        '例如：台北天氣、高雄會下雨嗎',
        '',
        '也可以先設定預設地點：',
        '設定天氣地點 新北',
      ].join('\n'),
    };
  }

  return fetchCwa36hWeather(finalCity, { target });
}