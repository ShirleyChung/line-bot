// src/services/imageService.js

import { lineClient } from "../line/client.js";

export async function fetchImageBuffer(messageId) {
  const stream = await lineClient.getMessageContent(messageId);

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}