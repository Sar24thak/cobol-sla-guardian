const { spawnSync } = require("child_process");
const fs = require("fs");

// Read ML input
const data = fs.readFileSync("ml_input.json", "utf8");

try {
  // Use spawn instead of exec (handles JSON safely)
  const result = spawnSync("python", ["predict.py", data, "program"], {
    encoding: "utf8",
  });

  if (result.error) {
    console.error("❌ Error running Python:", result.error);
    process.exit(1);
  }

  if (result.stderr) {
    console.error("❌ Python Error:", result.stderr);
  }

  console.log("Prediction Output:", result.stdout);

  fs.writeFileSync("result.json", result.stdout);

  console.log("✅ Prediction Done");

} catch (err) {
  console.error("❌ Prediction Failed");
  console.error(err);
  process.exit(1);
}