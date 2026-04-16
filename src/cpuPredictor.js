'use strict';

const { execFile } = require('child_process');
const path = require('path');

/**
 * Calls the Python predictor script.
 * @param {Object} features - The extracted feature data.
 * @param {string} mode - The model to use: "program" (default) or "statement" (Random Forest).
 */
function predict(features, mode = "program") {
  return new Promise((resolve) => {
    // Path to predict.py in the root directory
    const scriptPath = path.join(__dirname, '..', 'predict.py');
    const inputString = JSON.stringify(features);

    // Pass both the feature JSON and the mode as arguments to the Python script
    execFile('python', [scriptPath, inputString, mode], (err, stdout, stderr) => {
      if (err) {
        console.error("Execution Error:", stderr || err);
        return resolve({ 
            error: "Failed to execute ML script. Ensure Python, joblib, and scikit-learn are installed." 
        });
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (parseError) {
        console.error("Parse Error:", parseError, "Raw Output:", stdout);
        resolve({ error: "Failed to parse ML output" });
      }
    });
  });
}

module.exports = { predict };