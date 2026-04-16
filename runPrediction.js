const { execSync } = require('child_process');
const fs = require('fs');

try {
    const features = JSON.parse(fs.readFileSync("features.json"));

    const input = JSON.stringify(features);

    const result = execSync(`python predict.py '${input}'`, {
        encoding: 'utf-8'
    });

    console.log("Prediction Output:", result);

    fs.writeFileSync("result.json", result);

} catch (error) {
    console.error("Prediction Error:", error);
    process.exit(1);
}