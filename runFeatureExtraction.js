const fs = require('fs');

try {
    const filePath = process.argv[2];

    if (!filePath) {
        console.error("No COBOL file provided");
        process.exit(1);
    }

    const code = fs.readFileSync(filePath, 'utf-8').toUpperCase();

    // Simple feature extraction
    const features = {
        maxLoopDepth: (code.match(/PERFORM/g) || []).length,
        nestedLoopCount: (code.match(/PERFORM VARYING/g) || []).length,
        totalPerforms: (code.match(/PERFORM/g) || []).length,
        fileIOCount: (code.match(/READ|WRITE|OPEN|CLOSE/g) || []).length,
        ifCount: (code.match(/IF/g) || []).length,
        functionCalls: (code.match(/CALL/g) || []).length,
        arithmeticOps: (code.match(/ADD|SUBTRACT|MULTIPLY|DIVIDE|COMPUTE/g) || []).length
    };

    fs.writeFileSync("features.json", JSON.stringify(features, null, 2));

    console.log("Extracted Features:", features);

} catch (error) {
    console.error("Feature Extraction Error:", error);
    process.exit(1);
}