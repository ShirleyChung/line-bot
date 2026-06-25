const EMAIL_ADDRESS_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const LEADING_RECIPIENT_SEPARATORS = /^([\s,，、;；:：\-]+|(?:及|和|與|跟|以及|and)\s*)+/iu;

export function extractEmailRecipients(value) {
  const text = String(value || "");
  const seen = new Set();
  const recipients = [];

  for (const match of text.matchAll(EMAIL_ADDRESS_PATTERN)) {
    const email = match[0].trim();
    const key = email.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      recipients.push(email);
    }
  }

  return recipients;
}

export function normalizeEmailRecipients(value) {
  const values = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const recipients = [];

  for (const item of values) {
    for (const email of extractEmailRecipients(item)) {
      const key = email.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        recipients.push(email);
      }
    }
  }

  return recipients.join(", ");
}

export function removeEmailRecipients(value) {
  let text = String(value || "").replace(EMAIL_ADDRESS_PATTERN, " ");

  while (LEADING_RECIPIENT_SEPARATORS.test(text)) {
    text = text.replace(LEADING_RECIPIENT_SEPARATORS, "");
  }

  return text
    .replace(/^[\s,，、;；:：\-]+/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}
