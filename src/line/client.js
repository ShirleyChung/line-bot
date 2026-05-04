/**
 * LINE SDK 客戶端統一放這裡
 * 使用 ES module 寫法時，@line/bot-sdk 要用 namespace import
 */

import * as line from "@line/bot-sdk";
import { env } from "../config/env.js";

// LINE middleware 與 Messaging API 共用設定
export const lineConfig = {
  channelSecret: env.LINE_CHANNEL_SECRET,
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
};

// 建立 LINE Messaging API Client
export const lineClient = new line.messagingApi.MessagingApiClient({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
});

// Blob client（下載使用者上傳圖片/影片/音訊內容）
export const lineBlobClient = new line.messagingApi.MessagingApiBlobClient({
  channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
});

// 匯出整個 line namespace，方便其他檔案使用 middleware
export { line };
