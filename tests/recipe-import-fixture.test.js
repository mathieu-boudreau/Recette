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
  "recipeFinalCellConfidence",
  "normalizeRecipeBuckets",
  "recipeBucketValues",
  "plannedBucketCountForRecipeRow",
  "recipeCellMeta",
  "recipeCellIsResolved",
  "refreshRecipeRowConfidence",
  "normalizeRecipeImportRow",
  "normalizeRecipeRows",
  "recipeCodesForRow",
  "plannedBucketCountForRow",
  "rowBucketTotalFromRow",
  "rowCompleteForNext",
  "recipeDraftSummary",
  "importedRecipeProgress",
  "recipeRowIssues",
  "recipeImportIssues",
  "evaluateRecipeRecognition",
  "recipeDetectedRowHasContent"
].map(sourceOf).join("\n") + "\nreturn { recipeCodeKey, recipeKnownCodeFor, normalizeRecipeCode, normalizeRecipeOcrCode, recipeFinalCellConfidence, normalizeRecipeBuckets, recipeBucketValues, plannedBucketCountForRecipeRow, recipeCellMeta, recipeCellIsResolved, refreshRecipeRowConfidence, normalizeRecipeImportRow, normalizeRecipeRows, recipeCodesForRow, plannedBucketCountForRow, rowBucketTotalFromRow, rowCompleteForNext, recipeDraftSummary, importedRecipeProgress, recipeRowIssues, recipeImportIssues, evaluateRecipeRecognition, recipeDetectedRowHasContent };")(BUCKETS_PER_TRIP, TONNES_PER_TRIP, ALL_ORES, ALL_ORES);

const {
  normalizeRecipeCode,
  normalizeRecipeOcrCode,
  recipeFinalCellConfidence,
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
  recipeImportIssues,
  evaluateRecipeRecognition,
  recipeDetectedRowHasContent
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
assert.deepEqual(normalizeRecipeRows(fixture).map(row => row.truck), Array.from({ length:36 }, (_, index) => String(index + 1)));
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

[21, 36].forEach(rowCount => {
  [0, 1, 2, 3].forEach(inputTurns => {
    const page = ocrEngine.syntheticRecipePageBinary(rowCount, inputTurns);
    const orientation = ocrEngine.selectOrientation(page);
    assert.equal(
      (inputTurns + orientation.turns) % 4,
      0,
      rowCount + "-row page rotation " + (inputTurns * 90) + " degrees must be corrected upright"
    );
    assert.equal(
      orientation.analysis.horizontalLines.length,
      rowCount + 2,
      "The page edge must not be mistaken for recipe rows"
    );
    assert.equal(
      orientation.analysis.bounds.height < orientation.binary.height * .8,
      true,
      "The table crop must exclude the blank lower page"
    );
  });
});

const bucketOnlyPlan = ocrEngine.buildCellDescriptors({
  valid:true,
  dataRowCount:36,
  truckColumn:1,
  bucketColumns:[2, 3, 4]
});
assert.equal(bucketOnlyPlan.length, 108);
assert.equal(bucketOnlyPlan.every(cell => cell.kind === "material"), true);
assert.equal(bucketOnlyPlan.some(cell => cell.columnIndex === 0 || cell.columnIndex === 1), false, "Quarter and Truck must be geometry-only columns");
assert.deepEqual([...new Set(bucketOnlyPlan.map(cell => cell.columnIndex))], [2, 3, 4]);
assert.equal(recipeDetectedRowHasContent([{ blank:true }, { blank:true }, { blank:true }]), false);
assert.equal(recipeDetectedRowHasContent([{ blank:true }, { blank:false }, { blank:true }]), true);

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

const completedPage = {
  rows:fixture.map((row, index) => Object.assign(haulingRow(row, index), { time:"06:00" }))
};
const completedProgress = importedRecipeProgress(recipe, completedPage);
assert.equal(completedProgress.completeTrips, 36);
assert.equal(completedProgress.completedBuckets, 106);
assert.equal(completedProgress.completedTonnage.toFixed(1), "1307.3");
assert.equal(completedProgress.remainingBuckets, 0);
assert.equal(completedProgress.remainingTonnage.toFixed(1), "0.0");

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

const generatedTrips = normalizeRecipeRows([
  { quarter:"Nuit", truck:"91", buckets:["A1", "C1", "C1"] },
  { truck:"OCR?", buckets:["A1", "C1", "C1"] },
  { truck:"", buckets:["A1", "C1", "C1"] },
  { truck:"41", buckets:["A1", "C1", "C1"] },
  { truck:"5", buckets:["A1", "C1", "C1"] }
]);
assert.deepEqual(generatedTrips.map(row => row.truck), ["1", "2", "3", "4", "5"]);
assert.equal(generatedTrips.every(row => row.truckMeta.status === "generated"), true);
assert.equal(generatedTrips.every(row => row.truckMeta.reason === "row-order"), true);
assert.equal(Object.hasOwn(generatedTrips[0], "quarter"), false, "Quarter must not enter the imported data model");
generatedTrips.splice(1, 1);
assert.deepEqual(normalizeRecipeRows(generatedTrips).map(row => row.truck), ["1", "2", "3", "4"]);
assert.equal(recipeImportIssues(generatedTrips).length, 0, "Generated trips must never add OCR issues");

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

const strongCellEvidence = {
  correctColumn:true,
  validRowAlignment:true,
  rowOrder:true,
  repeatedCode:true
};
const moderateExact = normalizeRecipeOcrCode("A1", .4);
assert.equal(
  recipeFinalCellConfidence(moderateExact, .4, strongCellEvidence) >= .9,
  true,
  "An exact registry code in an aligned cell must be accepted despite moderate raw OCR confidence"
);
assert.equal(
  recipeFinalCellConfidence(normalizeRecipeOcrCode("Al", .4), .4, strongCellEvidence) >= .9,
  true,
  "A proven normalized registry match must benefit from repeated aligned-cell evidence"
);
assert.equal(
  recipeFinalCellConfidence(normalizeRecipeOcrCode("LGOJDE", .8), .8, strongCellEvidence) < .9,
  true,
  "Context must not turn an OCR artifact into a trusted code"
);

const qualityRows = normalizedReference21;
const preparedQualityFixture = {
  ok:true,
  structureConfidence:.92,
  grid:{
    valid:true,
    confidence:.91,
    rowHeightDeviation:.08,
    dataRowCount:qualityRows.length
  }
};
const reviewWithUncertainCells = evaluateRecipeRecognition(preparedQualityFixture, {
  rows:qualityRows,
  cells:[
    ...Array.from({ length:53 }, () => ({
      type:"material",
      inkRatio:.04,
      status:"exact",
      finalConfidence:.96,
      normalizationReason:"registry"
    })),
    ...Array.from({ length:10 }, () => ({
      type:"material",
      inkRatio:.04,
      status:"unresolved",
      finalConfidence:.42,
      normalizationReason:"unknown-code"
    }))
  ]
});
assert.equal(reviewWithUncertainCells.pass, true, "A few uncertain cells must open review instead of rejecting the full table");
assert.equal(reviewWithUncertainCells.outcome, "review");
assert.equal(reviewWithUncertainCells.lowConfidence, 10);

const reviewWithBlankGridRow = evaluateRecipeRecognition({
  ok:true,
  structureConfidence:.92,
  grid:{
    valid:true,
    confidence:.91,
    rowHeightDeviation:.08,
    dataRowCount:22
  }
}, {
  rows:qualityRows,
  scannedRowCount:22,
  blankRowsExcluded:1,
  cells:Array.from({ length:63 }, () => ({
    type:"material",
    inkRatio:.04,
    status:"exact",
    finalConfidence:.96,
    normalizationReason:"registry"
  }))
});
assert.equal(reviewWithBlankGridRow.pass, true, "A fully blank segmented row must be excluded without failing geometry");
assert.equal(reviewWithBlankGridRow.blankRowsExcluded, 1);

const unusableRecognition = evaluateRecipeRecognition(preparedQualityFixture, {
  rows:qualityRows,
  cells:[
    ...Array.from({ length:10 }, () => ({
      type:"material",
      inkRatio:.04,
      status:"exact",
      finalConfidence:.96,
      normalizationReason:"registry"
    })),
    ...Array.from({ length:53 }, () => ({
      type:"material",
      inkRatio:.04,
      status:"unresolved",
      finalConfidence:.2,
      normalizationReason:"ocr-artifact"
    }))
  ]
});
assert.equal(unusableRecognition.pass, false, "A mostly unreadable table must still be rejected safely");
assert.equal(unusableRecognition.outcome, "recovery");

const engineSource = fs.readFileSync("recipe-ocr-engine.js", "utf8");
assert.equal(engineSource.includes('descriptor.kind === "truck"'), false);
assert.equal(engineSource.includes('kind:"truck"'), false);
assert.equal(html.includes('tessedit_char_whitelist:"0123456789"'), false, "The OCR worker must not run a truck-number pass");
assert.equal(html.includes('data-recipe-field="truck"'), false, "Truck numbers must not have correction inputs");
assert.equal(html.includes("row.recipeQuarter ="), false, "Quarter must not be stored from OCR");
assert.equal(html.includes("row.recipeTruck ="), false, "Truck OCR output must not be stored on hauling rows");
assert.equal(html.includes('id="recipeImportSummary"'), true, "The existing top recipe summary must remain");
assert.equal(html.includes('id="operationalTotals"'), true, "The bottom operational summary must exist");
assert.equal(html.includes(".operational-totals {"), true);
assert.equal(html.includes('operationalRemainingTonnage:"Tonnage restant"'), true);
assert.equal(html.includes('#sheetTable .time-value {'), true, "Print row content must not force multi-page output");

const serviceWorker = fs.readFileSync("sw.js", "utf8");
assert.equal(serviceWorker.includes("recette-touch-v5.20.0-bucket-only-operational"), true);
assert.equal(serviceWorker.includes("./recipe-ocr-engine.js?v=5.20.0"), true);

console.log("recipe import fixtures: PASS");
