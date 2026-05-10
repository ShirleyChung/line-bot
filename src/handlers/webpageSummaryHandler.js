import { replyText } from "../platform/reply.js";
import {
  containsHttpUrl,
  summarizeUrlsFromText,
} from "../services/webpageSummaryService.js";

export function shouldHandleWebpageSummary(text = "") {
  return containsHttpUrl(text);
}

export async function handleWebpageSummary(event, userText) {
  const message = await summarizeUrlsFromText(userText);
  if (!message) return false;

  await replyText(event, message);
  return true;
}
