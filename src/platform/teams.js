import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";
import {
  getTeamsConversationRef,
  setTeamsConversationRef,
} from "../services/sessionStateService.js";

/**
 * Microsoft Teams 走 Bot Framework / Azure Bot Service。
 * 與 Telegram / Meta 不同，回覆必須帶上原本 activity 的 serviceUrl 與 conversation.id，
 * 並透過 OAuth client_credentials 取得 bearer token 後才能呼叫 reply API。
 *
 * 為了讓提醒這類「主動推送」也能正常運作，第一次收到使用者訊息時會把
 * conversation reference 寫進 session_state（teamsConversationRef），
 * cron 推送提醒時再讀回來。
 */

const BOTFRAMEWORK_OPENID_URL =
  "https://login.botframework.com/v1/.well-known/openidconfiguration";
const BOTFRAMEWORK_ISSUER = "https://api.botframework.com";
const TOKEN_URL =
  `https://login.microsoftonline.com/${env.TEAMS_TENANT_ID}/oauth2/v2.0/token`;
const TOKEN_SCOPE = "https://api.botframework.com/.default";

let jwksPromise = null;

/**
 * 取得 Bot Framework 公開金鑰（JWKS），用來驗證 inbound JWT。
 * 結果會快取在 module scope，避免每次 webhook 都重抓。
 * @returns {Promise<Function>} jose 的 JWKS 解析器
 */
async function getJwks() {
  if (jwksPromise) return jwksPromise;

  jwksPromise = (async () => {
    const res = await fetch(BOTFRAMEWORK_OPENID_URL);
    if (!res.ok) {
      jwksPromise = null;
      throw new Error(
        `Failed to fetch Teams OpenID config: ${res.status}`
      );
    }
    const config = await res.json();
    if (!config.jwks_uri) {
      jwksPromise = null;
      throw new Error("Teams OpenID config missing jwks_uri");
    }
    return createRemoteJWKSet(new URL(config.jwks_uri));
  })();

  return jwksPromise;
}

/**
 * 驗證 Teams webhook 的 Authorization JWT。
 * 若未設定 TEAMS_APP_ID 視為本地開發 / 尚未綁定 Azure 註冊，直接放行。
 * @param {object} req - Express request 物件
 * @returns {Promise<boolean>} 驗證是否通過
 */
export async function verifyTeamsRequest(req) {
  if (!env.TEAMS_APP_ID) return true;

  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;

  try {
    const jwks = await getJwks();
    await jwtVerify(match[1], jwks, {
      audience: env.TEAMS_APP_ID,
      issuer: BOTFRAMEWORK_ISSUER,
    });
    return true;
  } catch (error) {
    console.error("Teams JWT verification failed:", error.message);
    return false;
  }
}

/**
 * 將 Teams activity 中的 <at>BotName</at> mention 標籤去掉，
 * 讓後續的內建命令判斷不會被 mention 文字干擾。
 * @param {string} text - 原始訊息文字
 * @returns {string} 去除 mention 後的文字
 */
function stripTeamsMentions(text) {
  if (typeof text !== "string") return "";
  return text.replace(/<at\b[^>]*>.*?<\/at>/gi, "").trim();
}

/**
 * 將 Teams Bot Framework 的 activity 轉成內部共用 message event。
 * 只處理 type === "message" 且有 text 的 activity；其他例如 conversationUpdate 直接忽略。
 * @param {object} body - Bot Framework activity 物件
 * @returns {Array} 標準化的 event 陣列
 */
export function normalizeTeamsActivity(body) {
  if (!body || body.type !== "message") return [];

  const conversationId = body.conversation?.id;
  if (!conversationId) return [];

  const fromId = body.from?.id || "";
  const text = stripTeamsMentions(body.text);

  const conversationRef = {
    serviceUrl: body.serviceUrl,
    conversationId,
    conversationType: body.conversation?.conversationType || "personal",
    tenantId:
      body.conversation?.tenantId || body.channelData?.tenant?.id || "",
    recipient: { id: fromId, name: body.from?.name || "" },
    bot: {
      id: body.recipient?.id || "",
      name: body.recipient?.name || "",
    },
    locale: body.locale || "",
  };

  const sessionUserId = `teams:${conversationId}`;
  const ownerKey = `teams:user:${sessionUserId}`;

  return [
    {
      platform: "teams",
      type: "message",
      replyToken: `teams:${conversationId}:${body.id || Date.now()}`,
      source: {
        platform: "teams",
        type: "user",
        userId: sessionUserId,
        rawUserId: fromId,
        conversationId,
        conversationType: conversationRef.conversationType,
      },
      message: {
        id: body.id ? String(body.id) : String(Date.now()),
        type: typeof body.text === "string" ? "text" : "unknown",
        text,
      },
      rawEvent: body,
      replyText: async (replyText) => {
        // 第一次成功回覆前才保存 conversation ref，
        // 確保 serviceUrl 是最新有效的（Microsoft 會輪換）。
        await setTeamsConversationRef(ownerKey, conversationRef);
        return sendTeamsReply(conversationRef, replyText, body.id);
      },
    },
  ];
}

let cachedToken = null;

/**
 * 透過 OAuth client_credentials 取得 Bot Framework access token，
 * 快取在 module scope 並在到期前 60 秒主動換新。
 * @returns {Promise<string>} bearer token
 */
export async function getTeamsAccessToken() {
  if (!env.TEAMS_APP_ID || !env.TEAMS_APP_PASSWORD) {
    throw new Error(
      "缺少 TEAMS_APP_ID 或 TEAMS_APP_PASSWORD，無法呼叫 Teams Bot API"
    );
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.TEAMS_APP_ID,
    client_secret: env.TEAMS_APP_PASSWORD,
    scope: TOKEN_SCOPE,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `取得 Teams access token 失敗：${response.status} ${errText}`
    );
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 1800) * 1000,
  };
  return cachedToken.token;
}

/**
 * 將文字訊息送回 Teams 對應的 conversation。
 * @param {object} conversationRef - 保存下來的 conversation reference
 * @param {string} text - 訊息內容
 * @param {string} [replyToId] - 原 activity id；有給的話會在 Teams 上呈現為 reply
 * @returns {Promise<object>} Bot Framework API 回應
 */
export async function sendTeamsReply(conversationRef, text, replyToId = "") {
  if (!conversationRef?.serviceUrl || !conversationRef?.conversationId) {
    throw new Error("缺少 Teams conversationRef，無法回覆");
  }

  const accessToken = await getTeamsAccessToken();
  const base = conversationRef.serviceUrl.replace(/\/$/, "");
  const url = `${base}/v3/conversations/${encodeURIComponent(
    conversationRef.conversationId
  )}/activities`;

  const payload = {
    type: "message",
    from: conversationRef.bot,
    recipient: conversationRef.recipient,
    conversation: { id: conversationRef.conversationId },
    text,
    textFormat: "plain",
    ...(replyToId ? { replyToId } : {}),
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Teams reply failed: ${response.status} ${errText}`);
  }

  return response.json().catch(() => ({}));
}

/**
 * 提醒推送用：根據 owner（= sessionKey）查出 conversation ref 後送出文字。
 * @param {string} ownerKey - 例如 teams:user:teams:<conversationId>
 * @param {string} text - 訊息內容
 * @returns {Promise<string>} 對應的 conversationId（給 log 用）
 */
export async function pushTeamsReminder(ownerKey, text) {
  const conversationRef = await getTeamsConversationRef(ownerKey);
  if (!conversationRef) {
    throw new Error(
      `找不到 Teams conversation reference：${ownerKey}（使用者必須先與 bot 互動一次）`
    );
  }
  await sendTeamsReply(conversationRef, text);
  return conversationRef.conversationId;
}
