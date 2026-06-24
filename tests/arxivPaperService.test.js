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
  parseNatureCommunicationsFeed,
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
