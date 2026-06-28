const BLOCKED_NEWS_DOMAINS = new Set([
  "flipso.com",
]);

function hostnameFromUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  try {
    return new URL(text).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    try {
      return new URL(`https://${text}`).hostname.toLowerCase().replace(/\.$/, "");
    } catch {
      return "";
    }
  }
}

export function isBlockedNewsUrl(value) {
  const hostname = hostnameFromUrl(value);
  if (!hostname) return false;

  for (const domain of BLOCKED_NEWS_DOMAINS) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) {
      return true;
    }
  }

  return false;
}

export function isAllowedNewsArticle(article) {
  return !isBlockedNewsUrl(article?.url);
}
