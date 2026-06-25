import { extractEmailRecipients, removeEmailRecipients } from "./emailRecipients.js";

const EMAIL_COMMAND_PATTERNS = [
  /^寄信給\s*/u,
  /^寄給\s*/u,
  /^發信到\s*/u,
  /^寄到\s*/u,
];

function stripLeadingEmailCommand(text) {
  const value = String(text || "").trim();

  for (const pattern of EMAIL_COMMAND_PATTERNS) {
    if (pattern.test(value)) {
      return value.replace(pattern, "");
    }
  }

  return "";
}

/**
 * 解析「寄給 xxx@example.com 今天天氣」這類 email 指令。
 *
 * @param {string} text
 * @returns {{to:string, recipients:string[], requestText:string, rewrittenPrompt:string}|null}
 */
export function parseEmailCommand(text) {
  const remainder = stripLeadingEmailCommand(text);
  if (!remainder) return null;

  const recipients = extractEmailRecipients(remainder);
  if (recipients.length === 0) return null;

  const to = recipients.join(", ");
  const requestText = removeEmailRecipients(remainder);

  return {
    to,
    recipients,
    requestText,
    rewrittenPrompt: requestText
      ? `請先處理這個請求，然後把完整結果寄到 ${to}：${requestText}`
      : `請寄信到 ${to}`,
  };
}
