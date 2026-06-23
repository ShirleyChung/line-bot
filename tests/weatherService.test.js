import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "x";
process.env.FINNHUB_API_KEY ||= "x";
process.env.LINE_CHANNEL_SECRET ||= "x";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "x";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com";
process.env.OPENAI_API_KEY ||= "x";

const weatherService = await import("../src/services/weatherService.js");

function taipeiDate(offset = 0) {
  const base = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(base);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

test("weather location extraction ignores forecast time phrases", () => {
  assert.equal(
    weatherService.extractWeatherCityFromText("台北後天天氣"),
    "臺北市",
  );
  assert.equal(
    weatherService.extractWeatherCityFromText("淡水未來一週天氣"),
    "新北市淡水區",
  );
});

test("weekly weather reply contains one concise line per forecast day", () => {
  const reply = weatherService.formatWeatherReply({
    ok: true,
    target: "week",
    locationName: "臺北市",
    forecasts: [
      {
        dayLabel: "06/23（週二）",
        weather: "多雲",
        minTemperatureC: "26",
        maxTemperatureC: "32",
        rainProbability: "20%",
      },
    ],
  });

  assert.equal(
    reply,
    "📍臺北市 未來一週天氣\n06/23（週二）：多雲｜26~32°C｜降雨 20%",
  );
});

test("day-after-tomorrow city forecast uses the weekly CWA dataset", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl;
  const startTime = `${taipeiDate(2)}T06:00:00+08:00`;

  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => ({
        records: {
          location: [{
            locationName: "臺北市",
            weatherElement: [
              { elementName: "Wx", time: [{ startTime, parameter: { parameterName: "晴" } }] },
              { elementName: "PoP", time: [{ startTime, parameter: { parameterName: "10" } }] },
              { elementName: "MinT", time: [{ startTime, parameter: { parameterName: "25" } }] },
              { elementName: "MaxT", time: [{ startTime, parameter: { parameterName: "32" } }] },
              { elementName: "CI", time: [{ startTime, parameter: { parameterName: "舒適" } }] },
            ],
          }],
        },
      }),
    };
  };

  try {
    const data = await weatherService.fetchCwa36hWeather("台北", {
      target: "day_after_tomorrow",
    });

    assert.equal(data.ok, true);
    assert.equal(data.dataset, "F-C0032-003");
    assert.match(requestedUrl, /\/F-C0032-003\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
