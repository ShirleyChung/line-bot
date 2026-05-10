// services/weatherService.js
import { env } from "../config/env.js";
import { db } from "./firestore.js";
const CWA_API_KEY = env.CWA_API_KEY;
const CWA_36H_ENDPOINT =
  'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001';
const CWA_TOWNSHIP_ENDPOINT =
  'https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-089';

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

const TOWNSHIP_SUFFIXES = ['區', '鎮', '鄉', '市'];

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

  const location = normalizeTaiwanWeatherLocation(s);
  return location?.label || null;
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

function getElementValue(item) {
  const value = item?.elementValue;
  if (Array.isArray(value)) {
    const first = value[0];
    return first?.value ?? first?.elementValue ?? first?.parameterName ?? null;
  }
  return value?.value ?? value?.elementValue ?? value?.parameterName ?? value ?? null;
}

function getTownshipTimeValue(weatherElementMap, elementName, idx = 0) {
  const item = weatherElementMap[elementName]?.[idx];
  return getElementValue(item);
}

function getTownshipTime(weatherElementMap, elementNames, idx = 0) {
  for (const elementName of elementNames) {
    const item = weatherElementMap[elementName]?.[idx];
    if (item) return item;
  }
  return null;
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
  const url = new URL(CWA_36H_ENDPOINT);
  url.searchParams.set('Authorization', CWA_API_KEY);
  url.searchParams.set('format', 'JSON');
  url.searchParams.set('locationName', normalizedCity);

  const cacheKey = `cwa36h:${normalizedCity}:${target}`;
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

  return data;
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
  const idx = target === 'later' ? 2 : target === 'tomorrow' ? 1 : 0;
  const url = new URL(CWA_TOWNSHIP_ENDPOINT);
  url.searchParams.set('Authorization', CWA_API_KEY);
  url.searchParams.set('format', 'JSON');
  url.searchParams.set('locationName', location.town);

  const cacheKey = `cwaTownship:${location.city || 'all'}:${location.town}:${target}`;
  const json = await fetchCwaJson(url, cacheKey);
  const groups = json.records?.locations || [];
  const matchedGroup = groups.find((group) => (
    !location.city || group.locationsName === location.city
  )) || groups[0];
  const matchedLocation = matchedGroup?.location?.find((item) => (
    item.locationName === location.town
  ));

  if (!matchedLocation) {
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

  const elementMap = getWeatherElementMap(matchedLocation);
  const time = getTownshipTime(elementMap, ['Wx', 'WeatherDescription', 'T', 'MinT'], idx);
  const minT = getTownshipTimeValue(elementMap, 'MinT', idx) ?? getTownshipTimeValue(elementMap, 'T', idx);
  const maxT = getTownshipTimeValue(elementMap, 'MaxT', idx) ?? getTownshipTimeValue(elementMap, 'T', idx);
  const weather = getTownshipTimeValue(elementMap, 'Wx', idx);
  const description = getTownshipTimeValue(elementMap, 'WeatherDescription', idx);
  const pop = getTownshipTimeValue(elementMap, 'PoP12h', idx) ?? getTownshipTimeValue(elementMap, 'PoP6h', idx);
  const comfort = getTownshipTimeValue(elementMap, 'CI', idx) ?? getTownshipTimeValue(elementMap, 'MinCI', idx);
  const apparentT = getTownshipTimeValue(elementMap, 'AT', idx);
  const relativeHumidity = getTownshipTimeValue(elementMap, 'RH', idx);

  return {
    ok: true,
    source: 'CWA',
    dataset: 'F-D0047-089',
    city: matchedGroup?.locationsName || location.city || '',
    town: matchedLocation.locationName,
    locationName: `${matchedGroup?.locationsName || location.city || ''}${matchedLocation.locationName}`,
    target,
    startTime: time?.startTime || null,
    endTime: time?.endTime || null,
    weather,
    weatherDescription: description,
    rainProbability: normalizeRainValue(pop),
    minTemperatureC: minT,
    maxTemperatureC: maxT,
    apparentTemperatureC: apparentT,
    relativeHumidity: normalizeRainValue(relativeHumidity),
    comfort,
    rawUpdatedAt: json.records?.datasetDescription || null,
  };
}

export function formatWeatherReply(data) {
  if (!data?.ok) {
    return data?.message || '天氣查詢失敗，請稍後再試。';
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

export async function getWeatherForUser({ text, userId, city, target = 'now' }) {
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

  if (finalLocation.type === 'township') {
    return fetchCwaTownshipWeather(finalLocation, { target });
  }

  if (finalLocation.type === 'city') {
    return fetchCwa36hWeather(finalLocation.city, { target });
  }

  return fetchCwaTownshipWeather(finalLocation, { target });
}
