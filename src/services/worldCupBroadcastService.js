import OpenAI from "openai";
import { db } from "./firestore.js";
import { env } from "../config/env.js";

const SUBSCRIPTIONS_COLLECTION = "worldcup_broadcasts";
const LIVE_STATUSES = new Set(["LIVE", "IN_PLAY", "PAUSED"]);
const RECENT_STATUSES = new Set(["FINISHED", "IN_PLAY", "PAUSED", "LIVE"]);

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

function getTaipeiDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toTaipeiTime(isoText) {
  if (!isoText) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoText));
}

function normalizeScore(score = {}) {
  const fullTime = score.fullTime || {};
  const regular = score.regularTime || {};
  return {
    home: fullTime.home ?? fullTime.homeTeam ?? regular.home ?? regular.homeTeam ?? 0,
    away: fullTime.away ?? fullTime.awayTeam ?? regular.away ?? regular.awayTeam ?? 0,
  };
}

function teamName(team = {}) {
  return team.shortName || team.name || team.tla || "未知球隊";
}

function statusLabel(status) {
  const labels = {
    TIMED: "尚未開賽",
    SCHEDULED: "尚未開賽",
    LIVE: "進行中",
    IN_PLAY: "進行中",
    PAUSED: "中場休息",
    FINISHED: "已完賽",
    POSTPONED: "延期",
    SUSPENDED: "中斷",
    CANCELLED: "取消",
  };
  return labels[status] || status || "未知狀態";
}

function eventLine(event) {
  if (!event) return "";
  const minute = event.minute ? `${event.minute}'` : "";
  const team = event.team?.name ? ` ${event.team.name}` : "";
  const scorer = event.scorer?.name ? ` ${event.scorer.name}` : "";
  const type = event.type && event.type !== "REGULAR" ? ` (${event.type})` : "";
  return `${minute}${team}${scorer}${type}`.trim();
}

export function isWorldCupBroadcastStartCommand(text = "") {
  const normalized = String(text).trim().toLowerCase();
  return /(我要看|看|查|目前|現在|即時|開始|啟動).*(世足|世界盃|世界杯|world cup).*(戰況|比分|轉播|直播|賽況)/i.test(normalized)
    || /(世足|世界盃|世界杯|world cup).*(目前|現在|即時).*(戰況|比分|轉播|直播|賽況)/i.test(normalized);
}

export function isWorldCupBroadcastStopCommand(text = "") {
  const normalized = String(text).trim().toLowerCase();
  return /(停止|取消|關閉|不要).*(世足|世界盃|世界杯|world cup)?.*(轉播|直播|播報)/i.test(normalized)
    || /(停止|取消|關閉|不要).*(轉播|直播|播報).*(世足|世界盃|世界杯|world cup)?/i.test(normalized);
}

export function getBroadcastPlatform(source = {}) {
  return source.platform || "line";
}

export function getTelegramChatId(source = {}) {
  if (source.platform !== "telegram") return "";
  return source.rawChatId || source.chatId || String(source.userId || "").replace(/^telegram:/, "");
}

function docRef(sessionKey) {
  return db.collection(SUBSCRIPTIONS_COLLECTION).doc(sessionKey);
}

export async function enableWorldCupBroadcast(sessionKey, source = {}) {
  if (!sessionKey) throw new Error("啟動世足轉播需要 sessionKey");
  const platform = getBroadcastPlatform(source);
  const mode = platform === "telegram" ? "push" : "pull";

  await docRef(sessionKey).set(
    {
      sessionKey,
      platform,
      mode,
      active: true,
      telegramChatId: getTelegramChatId(source),
      source,
      updatedAt: new Date(),
      createdAt: new Date(),
    },
    { merge: true }
  );

  return { platform, mode };
}

export async function disableWorldCupBroadcast(sessionKey) {
  if (!sessionKey) throw new Error("停止世足轉播需要 sessionKey");
  const snapshot = await docRef(sessionKey).get();
  if (!snapshot.exists || snapshot.data()?.active === false) {
    return { stopped: false };
  }

  await docRef(sessionKey).set(
    {
      active: false,
      updatedAt: new Date(),
      stoppedAt: new Date(),
    },
    { merge: true }
  );
  return { stopped: true };
}

export async function listActiveTelegramBroadcasts() {
  const snapshot = await db
    .collection(SUBSCRIPTIONS_COLLECTION)
    .where("active", "==", true)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((item) => item.platform === "telegram" && item.mode === "push" && item.telegramChatId);
}

export async function markBroadcastPushed(id, digest) {
  await db.collection(SUBSCRIPTIONS_COLLECTION).doc(id).set(
    {
      lastDigest: digest,
      lastPushedAt: new Date(),
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function shouldPushWorldCupBroadcast(subscription = {}, digest, now = new Date()) {
  if (!digest || subscription.lastDigest === digest) return false;
  const lastPushedAt = toDate(subscription.lastPushedAt);
  if (!lastPushedAt) return true;

  const intervalMs = Math.max(1, env.FOOTBALL_BROADCAST_POLL_MINUTES) * 60 * 1000;
  return now.getTime() - lastPushedAt.getTime() >= intervalMs;
}

export async function fetchWorldCupMatches(now = new Date()) {
  if (!env.FOOTBALL_DATA_API_KEY) {
    throw new Error("尚未設定 FOOTBALL_DATA_API_KEY，無法取得世足即時戰況。請先申請 football-data.org API token 並設定環境變數。");
  }

  const url = new URL(`${env.FOOTBALL_DATA_BASE_URL.replace(/\/+$/, "")}/competitions/${encodeURIComponent(env.FOOTBALL_WORLD_CUP_COMPETITION_CODE)}/matches`);
  const dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dateTo = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  url.searchParams.set("dateFrom", getTaipeiDate(dateFrom));
  url.searchParams.set("dateTo", getTaipeiDate(dateTo));

  const response = await fetch(url, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_API_KEY,
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`取得世足戰況失敗：football-data.org 回應 ${response.status} ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return Array.isArray(data.matches) ? data.matches : [];
}

export function selectRelevantMatches(matches = []) {
  const live = matches.filter((match) => LIVE_STATUSES.has(match.status));
  if (live.length) return live;

  const recent = matches
    .filter((match) => RECENT_STATUSES.has(match.status))
    .sort((a, b) => String(b.utcDate || "").localeCompare(String(a.utcDate || "")));
  if (recent.length) return recent.slice(0, 4);

  return matches
    .filter((match) => match.status === "TIMED" || match.status === "SCHEDULED")
    .sort((a, b) => String(a.utcDate || "").localeCompare(String(b.utcDate || "")))
    .slice(0, 4);
}

export function buildWorldCupSnapshot(matches = [], now = new Date()) {
  const relevant = selectRelevantMatches(matches);
  return {
    generatedAt: now.toISOString(),
    competition: env.FOOTBALL_WORLD_CUP_COMPETITION_CODE,
    hasLive: relevant.some((match) => LIVE_STATUSES.has(match.status)),
    matches: relevant.map((match) => {
      const score = normalizeScore(match.score);
      return {
        id: String(match.id || ""),
        utcDate: match.utcDate || "",
        status: match.status || "",
        statusLabel: statusLabel(match.status),
        minute: match.minute ?? null,
        injuryTime: match.injuryTime ?? null,
        stage: match.stage || "",
        group: match.group || "",
        homeTeam: teamName(match.homeTeam),
        awayTeam: teamName(match.awayTeam),
        homeScore: score.home,
        awayScore: score.away,
        goals: (match.goals || []).map(eventLine).filter(Boolean).slice(-6),
        bookings: (match.bookings || []).map(eventLine).filter(Boolean).slice(-4),
        substitutions: (match.substitutions || []).map(eventLine).filter(Boolean).slice(-4),
      };
    }),
  };
}

export function snapshotDigest(snapshot = {}) {
  return JSON.stringify((snapshot.matches || []).map((match) => ({
    id: match.id,
    status: match.status,
    minute: match.minute,
    injuryTime: match.injuryTime,
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    goals: match.goals,
    bookings: match.bookings,
    substitutions: match.substitutions,
  })));
}

export function formatWorldCupSnapshot(snapshot = {}) {
  const matches = snapshot.matches || [];
  if (!matches.length) {
    return "目前沒有查到今天前後的世足賽程或戰況。";
  }

  const title = snapshot.hasLive ? "世足即時戰況" : "世足目前戰況";
  const lines = [`${title}（${toTaipeiTime(snapshot.generatedAt)} 更新）`];

  for (const match of matches) {
    const minute = match.minute ? `｜${match.minute}'${match.injuryTime ? `+${match.injuryTime}` : ""}` : "";
    lines.push(`${match.homeTeam} ${match.homeScore} - ${match.awayScore} ${match.awayTeam}｜${match.statusLabel}${minute}`);
    if (match.goals.length) {
      lines.push(`進球：${match.goals.join("；")}`);
    }
    if (match.bookings.length) {
      lines.push(`牌證：${match.bookings.join("；")}`);
    }
  }

  return lines.join("\n");
}

async function summarizeWithLlm(snapshot) {
  if (!env.OPENAI_API_KEY || env.FOOTBALL_BROADCAST_USE_LLM === "false") {
    return "";
  }

  const response = await client.responses.create({
    model: env.OPENAI_MODEL,
    max_output_tokens: 700,
    instructions: "你是即時足球文字主播。請把提供的 JSON 戰況改寫成繁體中文播報，保留比分、分鐘、進球、牌證與狀態；不要新增資料，不要猜測。語氣精準、短句、有臨場感，最多 8 行。",
    input: JSON.stringify(snapshot),
  });

  return response.output_text?.trim() || "";
}

export async function buildWorldCupBroadcastText(options = {}) {
  const now = options.now || new Date();
  const matches = options.matches || await fetchWorldCupMatches(now);
  const snapshot = buildWorldCupSnapshot(matches, now);

  try {
    const llmText = await summarizeWithLlm(snapshot);
    if (llmText) {
      return {
        text: llmText,
        snapshot,
        digest: snapshotDigest(snapshot),
      };
    }
  } catch (error) {
    console.error("[worldCupBroadcast] LLM summarize failed:", error);
  }

  return {
    text: formatWorldCupSnapshot(snapshot),
    snapshot,
    digest: snapshotDigest(snapshot),
  };
}
