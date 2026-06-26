import test from "node:test";
import assert from "node:assert/strict";

process.env.CWA_API_KEY ||= "x";
process.env.FINNHUB_API_KEY ||= "x";
process.env.LINE_CHANNEL_SECRET ||= "x";
process.env.LINE_CHANNEL_ACCESS_TOKEN ||= "x";
process.env.PUBLISHED_SHEET_CSV_URL ||= "https://example.com";
process.env.OPENAI_API_KEY ||= "x";

const {
  extractNatureCommunicationsAbstract,
  parseDoajArticle,
  parseNatureCommunicationsFeed,
  parseNatureCommunicationsFeedItems,
  selectFreshPaper,
} = await import("../src/services/arxivPaperService.js");

test("Nature Communications RSS parser selects the feed's first item", () => {
  const paper = parseNatureCommunicationsFeed(`
    <rdf:RDF>
      <item><title><![CDATA[First paper]]></title><link>https://www.nature.com/articles/first</link></item>
      <item><title><![CDATA[Second paper]]></title><link>https://www.nature.com/articles/second</link></item>
    </rdf:RDF>
  `);

  assert.deepEqual(paper, {
    title: "First paper",
    url: "https://www.nature.com/articles/first",
    pdfUrl: "https://www.nature.com/articles/first.pdf",
    source: "Nature Communications",
    fixedFirst: true,
  });
});

test("Nature Communications abstract comes from article metadata", () => {
  const abstract = extractNatureCommunicationsAbstract(`
    <meta name="description" content="Page teaser that must lose to the abstract">
    <meta name="citation_abstract" content="The &lt;em&gt;actual&lt;/em&gt; abstract.">
  `);

  assert.equal(abstract, "The actual abstract.");
});

test("Nature Communications RSS parser can return multiple candidates", () => {
  const papers = parseNatureCommunicationsFeedItems(`
    <rdf:RDF>
      <item><title><![CDATA[First paper]]></title><link>https://www.nature.com/articles/first</link></item>
      <item><title><![CDATA[Second paper]]></title><link>https://www.nature.com/articles/second</link></item>
    </rdf:RDF>
  `);

  assert.equal(papers.length, 2);
  assert.equal(papers[1].title, "Second paper");
});

test("source history skips the two most recently used titles", () => {
  const history = new Map([[
    "arxiv-ai",
    [
      { title: "Latest paper", normalizedTitle: "latest paper", url: "https://arxiv.org/abs/1" },
      { title: "Second paper", normalizedTitle: "second paper", url: "https://arxiv.org/abs/2" },
    ],
  ]]);
  const selected = selectFreshPaper([
    { title: "Latest paper", url: "https://arxiv.org/abs/1" },
    { title: "Second paper", url: "https://arxiv.org/abs/2" },
    { title: "Third paper", url: "https://arxiv.org/abs/3" },
  ], "arXiv AI", history);

  assert.equal(selected.title, "Third paper");
});

test("DOAJ parser extracts archaeology article metadata", () => {
  const paper = parseDoajArticle({
    results: [{
      bibjson: {
        title: "Study of the red lacquer",
        abstract: "Archaeology abstract.",
        identifier: [{ type: "doi", id: "10.14568/cp9_7" }],
        link: [{ type: "fulltext", content_type: "pdf", url: "https://doi.org/10.14568/cp9_7" }],
      },
    }],
  });

  assert.deepEqual(paper, {
    title: "Study of the red lacquer",
    abstract: "Archaeology abstract.",
    url: "https://doi.org/10.14568/cp9_7",
    pdfUrl: "https://doi.org/10.14568/cp9_7",
    source: "DOAJ archaeology",
  });
});
