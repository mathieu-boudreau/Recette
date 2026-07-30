"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const BUCKETS_PER_TRIP = 3;
const TONNES_PER_TRIP = 37;
const ROWS = 60;
const ALL_ORES = ["A1", "A2", "A3", "A4 pad ore", "A4 dump", "Bldr Cassé A", "AHR", "Ore/Neige", "B1", "B2", "B3", "BHR", "C1", "C2", "Bldr Cassé B", "D1", "D2", "D3", "D4"];

function sourceOf(name) {
  const marker = "function " + name + "(";
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, "Missing " + name + " in index.html");
  let depth = 0;
  let opened = false;
  for (let index = start; index < html.length; index++) {
    if (html[index] === "{") {
      depth++;
      opened = true;
    } else if (html[index] === "}" && opened && --depth === 0) {
      return html.slice(start, index + 1);
    }
  }
  throw new Error("Could not read " + name);
}

const recipeFunctions = Function("BUCKETS_PER_TRIP", "TONNES_PER_TRIP", "ORES", "ALL_ORES", [
  "normalizeRecipeCode",
  "normalizeRecipeBuckets",
  "recipeBucketValues",
  "plannedBucketCountForRecipeRow",
  "normalizeRecipeImportRow",
  "recipeCodesForRow",
  "plannedBucketCountForRow",
  "rowBucketTotalFromRow",
  "rowCompleteForNext",
  "recipeDraftSummary",
  "importedRecipeProgress"
].map(sourceOf).join("\n") + "\nreturn { normalizeRecipeCode, normalizeRecipeBuckets, recipeBucketValues, plannedBucketCountForRecipeRow, normalizeRecipeImportRow, recipeCodesForRow, plannedBucketCountForRow, rowBucketTotalFromRow, rowCompleteForNext, recipeDraftSummary, importedRecipeProgress };")(BUCKETS_PER_TRIP, TONNES_PER_TRIP, ALL_ORES, ALL_ORES);

const {
  normalizeRecipeCode,
  normalizeRecipeBuckets,
  recipeBucketValues,
  plannedBucketCountForRecipeRow,
  normalizeRecipeImportRow,
  recipeCodesForRow,
  plannedBucketCountForRow,
  rowBucketTotalFromRow,
  rowCompleteForNext,
  recipeDraftSummary,
  importedRecipeProgress
} = recipeFunctions;

const fixture = [
  ["A1", "C1", "Ore/Neige"], ["A1", "AHR", "C1"], ["A1", "B1", "BHR"],
  ["A1", "C1", "C1"], ["A1", "C1", "C1"], ["A1", "C1", "Ore/Neige"],
  ["AHR", "C1", "C1"], ["A1", "C1", "C1"], ["A1", "B1", "BHR"],
  ["A1", "C1", "Ore/Neige"], ["BHR", "C1", "C1"], ["A1", "C1", "C1"],
  ["A1", "C1", "C1"], ["A1", "C1", "C1"], ["A1", "B1", "BHR"],
  ["BHR", "C1", "C1"], ["A1", "A1", "BHR"], ["C1", null, null],
  ["A1", "C1", "Ore/Neige"], ["AHR", "C1", "C1"], ["A1", "B1", "BHR"],
  ["A1", "C1", "C1"], ["A1", "C1", "C1"], ["A1", "C1", "Ore/Neige"],
  ["AHR", "C1", "C1"], ["A1", "C1", "C1"], ["A1", "B1", "BHR"],
  ["A1", "A1", "AHR"], ["AHR", "C1", "C1"], ["A1", "C1", "C1"],
  ["A1", "C1", "C1"], ["A1", "C1", "C1"], ["A1", "B1", "BHR"],
  ["BHR", "C1", "C1"], ["A1", "A1", "BHR"], ["A1", "C1", "C1"]
].map((buckets, index) => normalizeRecipeImportRow({ truck:String(index + 1), buckets, confidence:.98 }));

const summary = recipeDraftSummary(fixture);
assert.equal(fixture.length, 36);
assert.equal(summary.trips, 36);
assert.equal(summary.buckets, 106);
assert.deepEqual(summary.materials, {
  A1:31,
  C1:47,
  "Ore/Neige":5,
  AHR:6,
  B1:6,
  BHR:11
});
assert.equal(summary.buckets / BUCKETS_PER_TRIP, 106 / 3);
assert.equal(summary.plannedTonnes, 106 * 37 / 3);
assert.equal(summary.plannedTonnes.toFixed(1), "1307.3");

const partialTrip = fixture[17];
assert.equal(partialTrip.plannedBucketCount, 1);
assert.equal(partialTrip.isPartialTrip, true);
assert.deepEqual(partialTrip.buckets, ["C1", null, null]);

function haulingRow(recipeRow, index) {
  const ores = Object.fromEntries(ALL_ORES.map(ore => [ore, 0]));
  recipeBucketValues(recipeRow.buckets).forEach(code => {
    if (Object.hasOwn(ores, code)) ores[code]++;
  });
  return {
    time:index === 17 ? "06:00" : "",
    ores,
    importedRecipe:recipeRow.buckets,
    plannedBucketCount:recipeRow.plannedBucketCount
  };
}

const recipe = { rows:fixture, rowIndexes:fixture.map((_, index) => index) };
const sourcePage = { rows:fixture.map(haulingRow) };
assert.equal(rowCompleteForNext(sourcePage.rows[17]), true);
assert.equal(rowCompleteForNext({ time:"06:00", ores:Object.fromEntries(ALL_ORES.map(ore => [ore, 0])), importedRecipe:[], plannedBucketCount:null }), false);

const progress = importedRecipeProgress(recipe, sourcePage);
assert.equal(progress.plannedTrips, 36);
assert.equal(progress.plannedBuckets, 106);
assert.equal(progress.fullTripEquivalent, 106 / 3);
assert.equal(progress.plannedTonnage, 106 * 37 / 3);
assert.equal(progress.completedBuckets, 1);
assert.equal(progress.remainingBuckets, 105);
assert.equal(progress.completedTonnage.toFixed(1), "12.3");
assert.equal(progress.remainingTonnage.toFixed(1), "1295.0");
assert.equal(html.includes("imported-code-preview"), false, "Imported material labels must not render in loading-time cells");

console.log("recipe import fixture: PASS");
