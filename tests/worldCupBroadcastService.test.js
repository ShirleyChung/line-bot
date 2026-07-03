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
          type: "REGULAR",
        },
      ],
    },
  ], new Date("2026-07-03T12:30:00Z"));

  const text = service.formatWorldCupSnapshot(snapshot);
  assert.match(text, /世足即時戰況/);
  assert.match(text, /Argentina 2 - 1 Japan｜進行中｜52'/);
  assert.match(text, /進球：49' Argentina Messi/);
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
