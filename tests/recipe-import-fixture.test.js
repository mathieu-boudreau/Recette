"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const ocrEngine = require("../recipe-ocr-engine.js");

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
  "recipeCodeKey",
  "recipeKnownCodeFor",
  "normalizeRecipeCode",
  "normalizeRecipeOcrCode",
  "normalizeRecipeTruck",
  "normalizeRecipeBuckets",
  "recipeBucketValues",
  "plannedBucketCountForRecipeRow",
  "recipeCellMeta",
  "recipeCellIsResolved",
  "refreshRecipeRowConfidence",
  "normalizeRecipeImportRow",
  "numericRecipeTruck",
  "markRecipeTruckUnresolved",
  "normalizeRecipeTruckSequence",
  "normalizeRecipeRows",
  "recipeCodesForRow",
  "plannedBucketCountForRow",
  "rowBucketTotalFromRow",
  "rowCompleteForNext",
  "recipeDraftSummary",
  "importedRecipeProgress",
  "recipeRowIssues",
  "recipeImportIssues"
].map(sourceOf).join("\n") + "\nreturn { recipeCodeKey, recipeKnownCodeFor, normalizeRecipeCode, normalizeRecipeOcrCode, normalizeRecipeTruck, normalizeRecipeBuckets, recipeBucketValues, plannedBucketCountForRecipeRow, recipeCellMeta, recipeCellIsResolved, refreshRecipeRowConfidence, normalizeRecipeImportRow, numericRecipeTruck, markRecipeTruckUnresolved, normalizeRecipeTruckSequence, normalizeRecipeRows, recipeCodesForRow, plannedBucketCountForRow, rowBucketTotalFromRow, rowCompleteForNext, recipeDraftSummary, importedRecipeProgress, recipeRowIssues, recipeImportIssues };")(BUCKETS_PER_TRIP, TONNES_PER_TRIP, ALL_ORES, ALL_ORES);

const {
  normalizeRecipeCode,
  normalizeRecipeOcrCode,
  normalizeRecipeTruck,
  normalizeRecipeBuckets,
  recipeBucketValues,
  plannedBucketCountForRecipeRow,
  normalizeRecipeRows,
  normalizeRecipeImportRow,
  recipeCodesForRow,
  plannedBucketCountForRow,
  rowBucketTotalFromRow,
  rowCompleteForNext,
  recipeDraftSummary,
  importedRecipeProgress,
  recipeImportIssues
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

[0, 1, 2, 3].forEach(inputTurns => {
  const synthetic = ocrEngine.syntheticRecipeBinary(36, inputTurns);
  const orientation = ocrEngine.selectOrientation(synthetic);
  assert.equal(
    (inputTurns + orientation.turns) % 4,
    0,
    "Rotation " + (inputTurns * 90) + " degrees must be corrected upright"
  );
  assert.equal(orientation.analysis.verticalLines.length, 6);
  assert.equal(orientation.analysis.horizontalLines.length >= 36, true);
  const rotatedSummary = recipeDraftSummary(normalizeRecipeRows(fixture));
  assert.deepEqual(rotatedSummary.materials, summary.materials);
  assert.equal(rotatedSummary.buckets, 106);
  assert.equal(rotatedSummary.plannedTonnes.toFixed(1), "1307.3");
});

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

[
  ["A1", "A1"], ["AI", "A1"], ["Al", "A1"], ["A I", "A1"], ["JA1", "A1"],
  ["AHR", "AHR"], ["A H R", "AHR"], ["JAHR", "AHR"], ["OH", "AHR"],
  ["C1", "C1"], ["CI", "C1"], ["CT", "C1"], ["B Hl R", "BHR"]
].forEach(([raw, expected]) => {
  const result = normalizeRecipeOcrCode(raw, .52);
  assert.equal(result.value, expected, raw + " should normalize to " + expected);
  assert.notEqual(result.status, "unresolved", raw + " must not remain unresolved");
});

assert.equal(normalizeRecipeOcrCode("CELL...").status, "unresolved");
assert.equal(normalizeRecipeOcrCode("XYZ").status, "unresolved");
assert.equal(normalizeRecipeOcrCode("XYZ").canMarkAsNew, true);
["O1N1", "O1M", "TOMO", "CELLUL", "XL 5 OC", "DR ZT J", "LGOJDE", "GODE", "ZB", "LODET"].forEach(raw => {
  const value = normalizeRecipeOcrCode(raw, .22);
  assert.equal(value.status, "unresolved", raw + " must never become a confirmed material");
});
["CELLUL", "XL 5 OC", "DR ZT J", "LGOJDE", "GODE", "LODET"].forEach(raw => {
  assert.equal(normalizeRecipeOcrCode(raw, .22).canMarkAsNew, false, raw + " must be classified as OCR garbage");
});

const correctedTrucks = normalizeRecipeRows([
  { truck:"1", buckets:["A1", "C1", "C1"] },
  { truck:"2", buckets:["A1", "C1", "C1"] },
  { truck:"3", buckets:["A1", "C1", "C1"] },
  { truck:"41", buckets:["A1", "C1", "C1"] },
  { truck:"5", buckets:["A1", "C1", "C1"] }
]);
assert.deepEqual(correctedTrucks.map(row => row.truck), ["1", "2", "3", "4", "5"]);
assert.equal(correctedTrucks[3].truckMeta.status, "corrected");

const correctedMiddleTruck = normalizeRecipeRows([
  { truck:"5", buckets:["A1", "C1", "C1"] },
  { truck:"61", buckets:["A1", "C1", "C1"] },
  { truck:"7", buckets:["A1", "C1", "C1"] }
]);
assert.equal(correctedMiddleTruck[1].truck, "6");

const unresolvedRecipe = normalizeRecipeRows([{ truck:"1", buckets:["CELL", "C1", "C1"] }]);
assert.equal(recipeImportIssues(unresolvedRecipe).length > 0, true, "Unresolved OCR artifacts must block import");
const validPartialRecipe = normalizeRecipeRows([{ truck:"1", buckets:["C1", null, null] }]);
assert.equal(recipeImportIssues(validPartialRecipe).length, 0, "Confirmed empty bucket cells are valid partial trips");

const reference21 = [
  ["JA1", "CT", "CT"], ["JAHR", "B1", "BI"], ["A1", "AI", "C1"],
  ["A1", "C1", "C1"], ["AHR", "B1", "B1"], ["A1", "C1", "C1"],
  ["A1", "C1", "C1"], ["A1", "A1", "C1"], ["A1", "A1", "AHR"],
  ["A1", "C1", "C1"], ["A1", "C1", "C1"], ["A1", "A1", "AHR"],
  ["A1", "A1", "A1"], ["A1", "C1", "C1"], ["A1", "C1", "C1"],
  ["A1", "A1", "AHR"], ["A1", "C1", "C1"], ["A1", "A1", "A1"],
  ["A1", "A1", "AHR"], ["A1", "C1", "C1"], ["A1", "C1", "C1"]
].map((buckets, index) => ({
  truck:String(index === 3 ? 41 : index === 5 ? 61 : index + 1),
  buckets,
  confidence:.51
}));
const normalizedReference21 = normalizeRecipeRows(reference21);
const referenceSummary = recipeDraftSummary(normalizedReference21);
assert.deepEqual(normalizedReference21.map(row => row.truck), Array.from({ length:21 }, (_, index) => String(index + 1)));
assert.equal(recipeImportIssues(normalizedReference21).length, 0);
assert.deepEqual(referenceSummary.materials, { A1:29, C1:24, AHR:6, B1:4 });
assert.equal(referenceSummary.trips, 21);
assert.equal(referenceSummary.buckets, 63);
assert.equal(referenceSummary.plannedTonnes, 777);
assert.equal((29 / 63 * 100).toFixed(1), "46.0");
assert.equal((6 / 63 * 100).toFixed(1), "9.5");
assert.equal((4 / 63 * 100).toFixed(1), "6.3");
assert.equal((24 / 63 * 100).toFixed(1), "38.1");
normalizedReference21.forEach(row => row.bucketMeta.forEach(cell => {
  if (cell.status !== "empty") assert.notEqual(cell.status, "unresolved", "Reference recipe must not retain unresolved OCR values");
}));

console.log("recipe import fixtures: PASS");
