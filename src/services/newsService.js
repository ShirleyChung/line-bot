export async function fetchNews({
  query,
  lang = "zh",
  country = "tw",
  max = 5,
} = {}) {
  if (!query || !query.trim()) {
    throw new Error("fetchNews: query is required");
  }

  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    throw new Error("GNEWS_API_KEY is not configured");
  }

  const url = new URL("https://gnews.io/api/v4/search");
  url.searchParams.set("q", query.trim());
  url.searchParams.set("lang", lang);
  //url.searchParams.set("country", country);
  url.searchParams.set("max", String(max));
  url.searchParams.set("sortby", "publishedAt");
  url.searchParams.set("apikey", apiKey);

  const resp = await fetch(url);

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GNews API error: ${resp.status} ${text}`);
  }

  const data = await resp.json();

  const articles = Array.isArray(data.articles) ? data.articles : [];

  return articles.map((a) => ({
    title: a.title || "",
    description: a.description || "",
    url: a.url || "",
    source: a.source?.name || "",
    publishedAt: a.publishedAt || "",
  }));
}