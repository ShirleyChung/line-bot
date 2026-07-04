import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "x";
process.env.FINNHUB_API_KEY ||= "x";
process.env.LINE_CHANNEL_SECRET ||= "x";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "x";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com";
process.env.OPENAI_API_KEY ||= "x";
process.env.FOOTBALL_BROADCAST_USE_LLM = "false";

const service = await import("../src/services/worldCupBroadcastService.js");
const { env } = await import("../src/config/env.js");

test("world cup broadcast commands are recognized", () => {
  assert.equal(service.isWorldCupBroadcastStartCommand("我要看目前世足戰況"), true);
  assert.equal(service.isWorldCupBroadcastStartCommand("現在 world cup 比分"), true);
  assert.equal(service.isWorldCupBroadcastStopCommand("停止轉播"), true);
  assert.equal(service.isWorldCupBroadcastStopCommand("取消世足直播"), true);
});

test("live matches are selected before scheduled matches", () => {
  const selected = service.selectRelevantMatches([
    { id: 1, status: "TIMED", utcDate: "2026-07-03T20:00:00Z" },
    { id: 2, status: "IN_PLAY", utcDate: "2026-07-03T18:00:00Z" },
  ]);

  assert.deepEqual(selected.map((match) => match.id), [2]);
});

test("snapshot formatter keeps score, minute and goal events", () => {
  const snapshot = service.buildWorldCupSnapshot([
    {
      id: 10,
      utcDate: "2026-07-03T12:00:00Z",
      status: "IN_PLAY",
      minute: 52,
      homeTeam: { shortName: "Argentina" },
      awayTeam: { shortName: "Japan" },
      score: { fullTime: { home: 2, away: 1 } },
      goals: [
        {
          minute: 49,
          team: { name: "Argentina" },
          scorer: { name: "Messi" },
          assist: { name: "Di Maria" },
          type: "REGULAR",
        },
      ],
      stats: {
        shotsTotal: { home: "12", away: "8" },
        shotsOnGoal: { home: "5", away: "3" },
        fouls: { home: "10", away: "14" },
        possession: { home: "56%", away: "44%" },
      },
    },
  ], new Date("2026-07-03T12:30:00Z"));

  const text = service.formatWorldCupSnapshot(snapshot);
  assert.match(text, /世足即時戰況/);
  assert.match(text, /Argentina 2 - 1 Japan｜進行中｜52'/);
  assert.match(text, /進球：49' Argentina Messi（助攻：Di Maria）/);
  assert.match(text, /數據：射門 12-8｜射正 5-3｜犯規 10-14｜控球 56%-44%/);
});

test("telegram broadcast push respects digest and poll interval", () => {
  const now = new Date("2026-07-03T12:00:00Z");

  assert.equal(service.shouldPushWorldCupBroadcast({}, "a", now), true);
  assert.equal(service.shouldPushWorldCupBroadcast({ lastDigest: "a" }, "a", now), false);
  assert.equal(
    service.shouldPushWorldCupBroadcast({
      lastDigest: "a",
      lastPushedAt: new Date("2026-07-03T11:59:00Z"),
    }, "b", now),
    false,
  );
  assert.equal(
    service.shouldPushWorldCupBroadcast({
      lastDigest: "a",
      lastPushedAt: new Date("2026-07-03T11:57:00Z"),
    }, "b", now),
    true,
  );
});

test("api-football empty live response falls back to football-data", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiFootballKey = env.API_FOOTBALL_KEY;
  const originalFootballDataKey = env.FOOTBALL_DATA_API_KEY;
  const requestedUrls = [];

  env.API_FOOTBALL_KEY = "api-football-test-key";
  env.FOOTBALL_DATA_API_KEY = "football-data-test-key";

  globalThis.fetch = async (url) => {
    const textUrl = String(url);
    requestedUrls.push(textUrl);
    if (textUrl.includes("live=all")) {
      return {
        ok: true,
        json: async () => ({ response: [] }),
      };
    }
    if (textUrl.includes("football-data.org")) {
      return {
        ok: true,
        json: async () => ({
          matches: [
            {
              id: 99,
              utcDate: "2026-07-04T01:30:00Z",
              status: "IN_PLAY",
              minute: 45,
              homeTeam: { shortName: "Colombia" },
              awayTeam: { shortName: "Ghana" },
              score: { fullTime: { home: 1, away: 0 } },
            },
          ],
        }),
      };
    }
    throw new Error(`unexpected url ${textUrl}`);
  };

  try {
    const matches = await service.fetchWorldCupMatches(new Date("2026-07-04T02:00:00Z"));

    assert.equal(matches.length, 1);
    assert.equal(matches[0].homeTeam.shortName, "Colombia");
    assert.equal(matches[0].awayTeam.shortName, "Ghana");
    assert.equal(requestedUrls.some((url) => url.includes("live=all")), true);
    assert.equal(requestedUrls.some((url) => url.includes("football-data.org")), true);
  } finally {
    globalThis.fetch = originalFetch;
    env.API_FOOTBALL_KEY = originalApiFootballKey;
    env.FOOTBALL_DATA_API_KEY = originalFootballDataKey;
  }
});
