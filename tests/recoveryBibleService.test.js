import test from "node:test";
import assert from "node:assert/strict";

import {
  extractOutlineRangeText,
  parseOutlineVerseRanges,
} from "../src/services/recoveryBibleService.js";

test("outline range extraction keeps multi-character Chinese chapter numbers", () => {
  const rangeText = extractOutlineRangeText("三　生命應付人各種情況的需要　二23～十一57");

  assert.equal(rangeText, "二23～十一57");
  assert.deepEqual(parseOutlineVerseRanges(rangeText, 2, 43), [
    { startChapter: 2, startVerse: 23, endChapter: 11, endVerse: 57 },
  ]);
});

test("outline range parser supports compact Chinese chapter digits", () => {
  assert.deepEqual(parseOutlineVerseRanges("二一9～27", 21, 66), [
    { startChapter: 21, startVerse: 9, endChapter: 21, endVerse: 27 },
  ]);
});

test("outline range parser uses related chapter when range omits chapter", () => {
  assert.deepEqual(parseOutlineVerseRanges("1～13", 1, 43), [
    { startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 13 },
  ]);
});
