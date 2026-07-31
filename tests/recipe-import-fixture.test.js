const assert = require("node:assert/strict");
const fs = require("node:fs");
const ocrEngine = require("../recipe-ocr-engine.js");

const html = fs.readFileSync("index.html", "utf8");
const engineSource = fs.readFileSync("recipe-ocr-engine.js", "utf8");
const serviceWorker = fs.readFileSync("sw.js", "utf8");
const ALL_ORES = ["A1", "A2", "A3", "A4 pad ore", "A4 dump", "Bldr Cassé A", "AHR", "Ore/Neige", "B1", "B2", "B3", "BHR", "C1", "C2", "Bldr Cassé B", "D1", "D2", "D3", "D4"];
const ORES = ALL_ORES.filter(code => !/^D\d$/.test(code));
const BUCKETS_PER_TRIP = 3;
const TONNES_PER_TRIP = 37;

function sourceOf(name){
  const patterns = [
    new RegExp(`  function ${name}\\([^]*?\\n  }(?=\\n\\n  (?:function|const|let|document|if \\())`),
    new RegExp(`  function ${name}\\([^]*?\\n  }`)
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[0];
  }
  throw new Error(`Unable to extract ${name}`);
}

const names = [
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
  "recipeStartingTruck",
  "normalizeRecipeRows",
  "recipeDraftSummary",
  "recipeRowIssues",
  "recipeImportIssues",
  "recipeDetectedRowHasContent",
  "evaluateRecipeRecognition"
];
const functions = Function("BUCKETS_PER_TRIP", "TONNES_PER_TRIP", "ORES", "ALL_ORES", `${names.map(sourceOf).join("\n")}\nreturn {${names.join(",")}};`)(BUCKETS_PER_TRIP, TONNES_PER_TRIP, ORES, ALL_ORES);

const {
  normalizeRecipeOcrCode,
  normalizeRecipeRows,
  normalizeRecipeImportRow,
  recipeCellIsResolved,
  recipeDraftSummary,
  recipeImportIssues,
  evaluateRecipeRecognition,
  recipeDetectedRowHasContent
} = functions;

function confirmedRows(rows, startTruck = 1){
  return normalizeRecipeRows(rows.map((buckets, index) => ({
    truck:String(startTruck + index),
    buckets,
    bucketMeta:buckets.map(value => value
      ? { raw:value, value, status:"recognized", confidence:.97, reason:"visual-template" }
      : { raw:"", value:null, status:"empty", confidence:1, reason:"visual-empty" })
  })), startTruck);
}

const reference21 = [
  ["A1","C1","C1"],["AHR","B1","B1"],["A1","A1","C1"],
  ["A1","C1","C1"],["AHR","B1","B1"],["A1","C1","C1"],
  ["A1","C1","C1"],["A1","A1","C1"],["A1","A1","AHR"],
  ["A1","C1","C1"],["A1","C1","C1"],["A1","A1","AHR"],
  ["A1","A1","A1"],["A1","C1","C1"],["A1","C1","C1"],
  ["A1","A1","AHR"],["A1","C1","C1"],["A1","A1","A1"],
  ["A1","A1","AHR"],["A1","C1","C1"],["A1","C1","C1"]
];
const reference36 = [
  ["A1","C1","Ore/Neige"],["A1","AHR","C1"],["A1","B1","BHR"],
  ["A1","C1","C1"],["A1","C1","C1"],["A1","C1","Ore/Neige"],
  ["AHR","C1","C1"],["A1","C1","C1"],["A1","B1","BHR"],
  ["A1","C1","Ore/Neige"],["BHR","C1","C1"],["A1","C1","C1"],
  ["A1","C1","C1"],["A1","C1","C1"],["A1","B1","BHR"],
  ["BHR","C1","C1"],["A1","A1","BHR"],["C1",null,null],
  ["A1","C1","Ore/Neige"],["AHR","C1","C1"],["A1","B1","BHR"],
  ["A1","C1","C1"],["A1","C1","C1"],["A1","C1","Ore/Neige"],
  ["AHR","C1","C1"],["A1","C1","C1"],["A1","B1","BHR"],
  ["A1","A1","AHR"],["AHR","C1","C1"],["A1","C1","C1"],
  ["A1","C1","C1"],["A1","C1","C1"],["A1","B1","BHR"],
  ["BHR","C1","C1"],["A1","A1","BHR"],["A1","C1","C1"]
];

const summary21 = recipeDraftSummary(confirmedRows(reference21));
assert.deepEqual(summary21, { trips:21, buckets:63, plannedTonnes:777, materials:{ A1:29, C1:24, AHR:6, B1:4 } });
const summary36 = recipeDraftSummary(confirmedRows(reference36));
assert.equal(summary36.trips, 36);
assert.equal(summary36.buckets, 106);
assert.equal(summary36.plannedTonnes.toFixed(1), "1307.3");
assert.deepEqual(summary36.materials, { A1:31, C1:47, "Ore/Neige":5, AHR:6, B1:6, BHR:11 });

const nonOne = confirmedRows(Array.from({ length:17 }, () => ["A1", null, null]), 41);
assert.equal(nonOne[0].truck, "41");
assert.equal(nonOne.at(-1).truck, "57");
assert.equal(nonOne.every(row => row.plannedBucketCount === 1 && row.isPartialTrip), true);

assert.equal(normalizeRecipeOcrCode("A1", .51).status, "recognized");
assert.equal(normalizeRecipeOcrCode("Ore Neige", .51).value, "Ore/Neige");
for (const garbage of ["DA", "AD", "AA", "MA", "JA1", "JAHR", "CELLUL", "LODET", "GODE", "TOMO", "ZX9"]) {
  const result = normalizeRecipeOcrCode(garbage, .99);
  assert.equal(result.status, "uncertain", `${garbage} must remain uncertain`);
  assert.equal(result.value, null, `${garbage} must never map to a material`);
  assert.equal(result.canMarkAsNew, false, `${garbage} must never create a code`);
}

const unresolved = normalizeRecipeRows([{
  buckets:[null, "C1", null],
  bucketMeta:[
    { raw:"ZX9", value:null, status:"uncertain", confidence:.62, reason:"unreadable", candidates:[{ code:"BHR", score:.55 }] },
    { raw:"C1", value:"C1", status:"recognized", confidence:.96 },
    { raw:"", value:null, status:"empty", confidence:1 }
  ]
}]);
assert.equal(recipeImportIssues(unresolved).length, 1);
assert.equal(recipeCellIsResolved(unresolved[0].bucketMeta[0]), false);
assert.equal(recipeDetectedRowHasContent([{ blank:true }, { blank:false }, { blank:true }]), true);

const uncertainCells = Array.from({ length:63 }, (_, index) => ({
  type:"material",
  inkRatio:.04,
  status:index < 8 ? "uncertain" : "recognized",
  finalConfidence:index < 8 ? .62 : .96,
  normalizationReason:index < 8 ? "unreadable" : "visual-template"
}));
const quality = evaluateRecipeRecognition({
  ok:true,
  structureConfidence:.92,
  grid:{ valid:true, confidence:.91, rowHeightDeviation:.08, dataRowCount:21 }
}, {
  rows:confirmedRows(reference21),
  scannedRowCount:21,
  blankRowsExcluded:0,
  cells:uncertainCells
});
assert.equal(quality.pass, true, "uncertain cells in a sound grid must open review");
assert.equal(quality.outcome, "review");
assert.equal(quality.unresolved, 8);

for (const rowCount of [1, 17, 21, 36, 47, 60]) {
  const grid = { valid:true, dataRowCount:rowCount, bucketColumns:[2,3,4] };
  const descriptors = ocrEngine.buildCellDescriptors(grid);
  assert.equal(descriptors.length, rowCount * 3);
  assert.equal(descriptors.every(item => item.kind === "material"), true);
}

let seed = 128991;
const random = () => ((seed = seed * 1664525 + 1013904223 >>> 0) / 4294967296);
for (let iteration = 0; iteration < 80; iteration++) {
  const count = 1 + Math.floor(random() * 60);
  const rows = Array.from({ length:count }, () => Array.from({ length:3 }, (_, bucketIndex) => {
    if (bucketIndex > 0 && random() < .18) return null;
    return ORES[Math.floor(random() * ORES.length)];
  }));
  const normalized = confirmedRows(rows, 1 + Math.floor(random() * 70));
  const expectedBuckets = rows.flat().filter(Boolean).length;
  const summary = recipeDraftSummary(normalized);
  assert.equal(summary.trips, count);
  assert.equal(summary.buckets, expectedBuckets);
  assert.equal(summary.plannedTonnes, expectedBuckets * 37 / 3);
  assert.equal(recipeImportIssues(normalized).length, 0);
}

assert.equal(typeof ocrEngine.buildMaterialTemplateLibrary, "function");
assert.equal(typeof ocrEngine.rankMaterialCandidates, "function");
assert.equal(engineSource.includes("normalizedCodeCounts"), false);
assert.equal(html.includes("numericCodesByPrefix"), false);
assert.equal(html.includes("repeatedCode"), false);
assert.equal(html.includes('JA1:"A1"'), false);
assert.equal(html.includes('JAHR:"AHR"'), false);
assert.equal(html.includes("data-accept-new-code"), false);
assert.equal(html.includes('input[data-recipe-row'), false);
assert.equal(html.includes("structured-template-classifier"), true);
assert.equal(html.includes('id="recipeFocusReview"'), true);
assert.equal(html.includes('id="recipeFullReviewDetails"'), true);
assert.equal(html.includes('id="recipeStartTruck"'), true);
assert.equal(html.includes('id="recipeLocalRegistryForm"'), true);
assert.equal(html.includes('recette_touch_custom_material_registry_v1'), true);
assert.equal(html.includes('localStorage.setItem(CUSTOM_MATERIAL_REGISTRY_KEY'), true);
assert.equal(html.includes("3 buckets = 40"), false);
assert.equal(html.includes("3 buckets = 37"), true);
assert.equal(engineSource.includes("reference21"), false);
assert.equal(engineSource.includes("reference36"), false);
assert.equal(html.includes("reference21"), false);
assert.equal(html.includes("reference36"), false);
assert.equal(serviceWorker.includes("recette-touch-v5.21.0-structured-recognition"), true);
assert.equal(serviceWorker.includes("./recipe-ocr-engine.js?v=5.21.0"), true);

const sanitized = normalizeRecipeImportRow({
  buckets:["A1", null, null],
  bucketMeta:[{ raw:"A1", value:"A1", status:"manual", confidence:1 }, { status:"empty" }, { status:"empty" }]
}, 0, 9);
assert.equal(sanitized.truck, "9");
assert.equal(sanitized.plannedBucketCount, 1);
assert.equal(sanitized.bucketMeta[0].status, "manual");

console.log("structured recipe recognition fixtures: PASS");
