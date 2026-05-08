import { env } from "../config/env.js";

const PLATFORM_CONFIG = {
  facebook: {
    tokenName: "FACEBOOK_PAGE_ACCESS_TOKEN",
    sourcePrefix: "facebook",
  },
  instagram: {
    tokenName: "INSTAGRAM_ACCESS_TOKEN",
    sourcePrefix: "instagram",
  },
};

export function verifyMetaWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && token === env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

export function normalizeMetaWebhook(body, platform) {
  const config = PLATFORM_CONFIG[platform];
  if (!config) return [];

  const events = [];

  for (const entry of body?.entry || []) {
    for (const messaging of entry.messaging || []) {
      const senderId = messaging.sender?.id;
      const recipientId = messaging.recipient?.id;
      const text = messaging.message?.text;
      const messageId = messaging.message?.mid || `${entry.id || "entry"}:${messaging.timestamp || Date.now()}`;

      if (!senderId) continue;

      events.push({
        platform,
        type: "message",
        replyToken: `${platform}:${senderId}:${messageId}`,
        source: {
          platform,
          type: "user",
          userId: `${config.sourcePrefix}:${senderId}`,
          rawUserId: senderId,
          recipientId,
        },
        message: {
          id: messageId,
          type: typeof text === "string" ? "text" : "unknown",
          text: typeof text === "string" ? text : "",
        },
        rawEvent: messaging,
        replyText: (replyText) => sendMetaText(platform, senderId, replyText),
      });
    }
  }

  return events;
}

async function sendMetaText(platform, recipientId, text) {
  const config = PLATFORM_CONFIG[platform];
  const accessToken = env[config.tokenName];

  if (!accessToken) {
    throw new Error(`缺少 ${config.tokenName}，無法回覆 ${platform} 訊息`);
  }

  const response = await fetch(
    `https://graph.facebook.com/me/messages?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${platform} send message failed: ${response.status} ${body}`);
  }

  return response.json();
}
