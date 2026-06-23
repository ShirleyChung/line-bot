import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "x";
process.env.FINNHUB_API_KEY ||= "x";
process.env.LINE_CHANNEL_SECRET ||= "x";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "x";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com";
process.env.OPENAI_API_KEY ||= "x";

const weatherService = await import("../src/services/weatherService.js");

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
