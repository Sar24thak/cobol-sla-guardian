const fs = require("fs");
const { CobolAnalyzer } = require("./src/cobolAnalyzer");

const filePath = process.argv[2];

if (!filePath) {
  console.error("❌ Provide COBOL file");
  process.exit(1);
}

const sourceText = fs.readFileSync(filePath, "utf8");

// ✅ CREATE OBJECT
const analyzer = new CobolAnalyzer(sourceText, filePath);

// ✅ CALL METHOD
const features = analyzer.extractFeatures();

// Save raw features
fs.writeFileSync("features.json", JSON.stringify(features, null, 2));

// Prepare ML input (program-level)
const programData = {
  maxLoopDepth: features.loopAnalysis?.maxLoopDepth || 0,
  nestedLoopCount: features.loopAnalysis?.nestedLoopCount || 0,
  totalPerforms: features.loopAnalysis?.totalPerforms || 0,
  fileIOCount:
    (features.fileIO?.open || 0) +
    (features.fileIO?.close || 0) +
    (features.fileIO?.read || 0) +
    (features.fileIO?.write || 0),
  ifCount: features.controlFlow?.ifStatements || 0,
  functionCalls: features.controlFlow?.callStatements || 0,
  arithmeticOps: features.operationsAndFunctions?.totalArithmetic || 0,
};

fs.writeFileSync("ml_input.json", JSON.stringify(programData));

console.log("✅ Feature Extraction Done");