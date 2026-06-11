const EMAIL_ADDRESS_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

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
 * @returns {{to:string, requestText:string, rewrittenPrompt:string}|null}
 */
export function parseEmailCommand(text) {
  const remainder = stripLeadingEmailCommand(text);
  if (!remainder) return null;

  const match = remainder.match(EMAIL_ADDRESS_PATTERN);
  if (!match) return null;

  const to = match[0].trim();
  const requestText = remainder
    .slice(match.index + match[0].length)
    .replace(/^[\s,，:：\-]+/u, "")
    .trim();

  return {
    to,
    requestText,
    rewrittenPrompt: requestText
      ? `請先處理這個請求，然後把完整結果寄到 ${to}：${requestText}`
      : `請寄信到 ${to}`,
  };
}
