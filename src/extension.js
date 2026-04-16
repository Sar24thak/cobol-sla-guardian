'use strict';

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { CobolAnalyzer } = require('./cobolAnalyzer');
const { FeatureExtractor } = require('./featureExtractor');
const { DashboardPanel } = require('./dashboardPanel');
const { predict } = require('./cpuPredictor');

let diagnosticCollection;
const cache = new Map();
let lastAnalyzedDoc = null; 

function activate(context) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('slaGuardian');
    context.subscriptions.push(diagnosticCollection);

    // Trigger on save
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (doc) => {
            if (isCobol(doc)) {
                lastAnalyzedDoc = doc;
                await runAnalysis(doc, context);
            }
        })
    );

    // Commands
    context.subscriptions.push(
        vscode.commands.registerCommand('slaGuardian.showDashboard', () => {
            const ed = vscode.window.activeTextEditor;
            const doc = (ed && isCobol(ed.document)) ? ed.document : lastAnalyzedDoc;
            if (!doc) { vscode.window.showWarningMessage('Open a COBOL file first.'); return; }
            const result = cache.get(doc.uri.toString());
            DashboardPanel.createOrShow(context.extensionUri, result, doc.fileName);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('slaGuardian.extractFeatures', async () => {
            const ed = vscode.window.activeTextEditor;
            const doc = (ed && isCobol(ed.document)) ? ed.document : lastAnalyzedDoc;
            if (!doc) { vscode.window.showErrorMessage('No active COBOL file.'); return; }
            await doExtract(doc, context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('slaGuardian.passFeaturesToModelTraining', async () => {
            const ed = vscode.window.activeTextEditor;
            const doc = (ed && isCobol(ed.document)) ? ed.document : lastAnalyzedDoc;
            if (!doc) { vscode.window.showErrorMessage('No active COBOL file.'); return; }
            await doPassToTraining(doc, context);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('slaGuardian.clearDiagnostics', () => {
            diagnosticCollection.clear();
            cache.clear();
            lastAnalyzedDoc = null;
        })
    );

    const sb = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    sb.text = '$(shield) Static Code Parser';
    sb.command = 'slaGuardian.showDashboard';
    sb.show();
    context.subscriptions.push(sb);
}

async function runAnalysis(doc, context) {
    const uri = doc.uri;
    const analyzer = new CobolAnalyzer(doc.getText(), doc.fileName);
    const diagnostics = [];

    const syntaxErrors = analyzer.validateSyntax();
    for (const e of syntaxErrors) diagnostics.push(makeDiag(doc, e.line, `[Syntax] ${e.message}`, vscode.DiagnosticSeverity.Error, e.code));

    const deadIssues = analyzer.detectDeadCode();
    for (const d of deadIssues) diagnostics.push(makeDiag(doc, d.line, `[Dead Code] ${d.message}`, vscode.DiagnosticSeverity.Warning, d.code));

    diagnosticCollection.set(uri, diagnostics);

    const features = analyzer.extractFeatures();
    const isClean = syntaxErrors.length === 0;

    let mlResult = null; // Program-level
    let lineByLineResults = []; // Statement-level (Random Forest)

    if (isClean) {
        try {
            const io = features.fileIO || {};
            const fileIOCount = (io.open || 0) + (io.close || 0) + (io.read || 0) +
                (io.write || 0) + (io.rewrite || 0) + (io.delete || 0) + (io.start || 0);

            // 1. OVERALL PROGRAM PREDICTION
            mlResult = await predict({
                maxLoopDepth: features.loopAnalysis.maxLoopDepth || 0,
                nestedLoopCount: features.loopAnalysis.nestedLoopCount || 0,
                totalPerforms: features.loopAnalysis.totalPerforms || 0,
                fileIOCount: fileIOCount,
                ifCount: features.controlFlow.ifStatements || 0,
                functionCalls: features.operationsAndFunctions.builtInFunctionCalls || 0,
                arithmeticOps: features.operationsAndFunctions.totalArithmetic || 0
            }, "program");

            // 2. LINE-BY-LINE PREDICTION
            // Pass deadIssues into features so featureExtractor can skip dead code paragraphs
            const featuresWithDead = Object.assign({}, features, { deadIssues });
            const extractor = new FeatureExtractor(featuresWithDead, doc.fileName, doc.getText());
            const statementRows = extractor._statementRows();

            // statementRows columns:
            // [0] lineNumber   — display only, NOT a model feature
            // [1] programId    — display only, NOT a model feature
            // [2] statementType (string)
            // [3] is_loop      (0/1)
            // [4] loop_depth   (int)
            // [5] is_arithmetic(0/1)
            // [6] is_io        (0/1)
            // [7] is_sql       (0/1)

            for (const row of statementRows) {
                const rfPred = await predict({
                    statement_enc: mapStatementToId(row[2]),  // Statement encoded
                    is_loop:       row[3],                     // Loop flag
                    loop_depth:    row[4],                     // Loop Depth
                    is_arithmetic: row[5],                     // Arithmetic flag
                    is_io:         row[6]                      // IO flag
                }, "statement");

                lineByLineResults.push({
                    line:       row[0],              // line number (display only)
                    type:       row[2],              // statement type string
                    combined:   rfPred.combined   || 0,  // COMBINED %
                    attributed: rfPred.attributed || 0,  // ATTRIBUTED %
                    executed:   rfPred.executed   || 0,  // EXECUTED %
                    cpu:        rfPred.cpu_time   || 0   // backward compat alias
                });
            }
        } catch (err) {
            console.error("ML Integration Error:", err);
        }
    }

    const result = {
        fileName: doc.fileName,
        analyzedAt: new Date().toISOString(),
        syntaxErrors,
        deadIssues,
        features,
        mlResult,
        lineByLineResults, // New data for Dashboard
        isClean,
        featuresExtracted: false,
        featuresPath: null
    };
    cache.set(uri.toString(), result);

    DashboardPanel.createOrShow(context.extensionUri, result, doc.fileName);
}

// Helper for Label Encoding (Must match your Training Dataset encoding)
function mapStatementToId(stmt) {
    // MUST match sklearn LabelEncoder alphabetical order from label_encoder.pkl
    // Generated from DATASET_1.xlsx / Sheet1 — 27 unique statement types
    const mapping = {
        "ADD":              0,
        "CALCULATION-LOOP": 1,
        "CHECK-LOGIC":      2,
        "CLOSE":            3,
        "COMPUTE":          4,
        "DECIDE-STEP":      5,
        "DECISION-LOGIC":   6,
        "DISPLAY":          7,
        "DIVIDE":           8,
        "EVALUATE":         9,
        "IF":               10,
        "INNER-CALC":       11,
        "INNER-STEP":       12,
        "MOVE":             13,
        "MULTIPLY":         14,
        "OPEN":             15,
        "PERFORM":          16,
        "SALTLOAD":         17,
        "SCANLOOP":         18,
        "SCONH":            19,
        "SFLWMATH":         20,
        "SMODECAL":         21,
        "SMULCOMP":         22,
        "SNESTED":          23,
        "STOP":             24,
        "STRING":           25,
        "SUBTRACT":         26
    };
    return mapping.hasOwnProperty(stmt) ? mapping[stmt] : 0;
}

async function doExtract(doc, context, preFeatures) {
    const result = cache.get(doc.uri.toString());
    if (!result || !result.isClean) {
        vscode.window.showErrorMessage('Fix syntax errors before extracting features.');
        return;
    }
    const features = preFeatures || result.features;
    const cfg = vscode.workspace.getConfiguration('slaGuardian');
    const extractor = new FeatureExtractor(features, doc.fileName, doc.getText());
    try {
        const saved = await extractor.saveToFile(cfg.get('featureOutputPath') || cfg.get('outputPath') || './sla_features');
        result.featuresExtracted = true;
        result.featuresPath = saved;
        cache.set(doc.uri.toString(), result);
        DashboardPanel.createOrShow(context.extensionUri, result, doc.fileName);
        vscode.window.showInformationMessage(`✅ Features extracted successfully.`);
    } catch (e) {
        vscode.window.showErrorMessage(`Feature extraction failed: ${e.message}`);
    }
}

async function doPassToTraining(doc, context) {
    const result = cache.get(doc.uri.toString());
    if (!result || !result.isClean) {
        vscode.window.showErrorMessage('Fix syntax errors before passing to model.');
        return;
    }
    const extractor = new FeatureExtractor(result.features, doc.fileName, doc.getText());
    try {
        const wf = vscode.workspace.workspaceFolders;
        const rootPath = wf && wf.length > 0 ? wf[0].uri.fsPath : path.dirname(doc.fileName);
        const datasetPath = path.join(rootPath, "augmented_dataset.csv");
        const programHeaders = extractor._programHeaders();
        const programRow = extractor._programRow();

        if (!fs.existsSync(datasetPath)) {
            fs.writeFileSync(datasetPath, programHeaders.join(",") + "\n", "utf8");
        }
        fs.appendFileSync(datasetPath, programRow.join(",") + "\n", "utf8");
        vscode.window.showInformationMessage(`🚀 Features successfully appended to ${path.basename(datasetPath)}`);
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to pass features: ${e.message}`);
    }
}

function makeDiag(doc, lineNum, msg, severity, code) {
    const n = Math.max(0, Math.min(lineNum, doc.lineCount - 1));
    const line = doc.lineAt(n);
    const range = new vscode.Range(n, line.firstNonWhitespaceCharacterIndex, n, line.text.length);
    const d = new vscode.Diagnostic(range, msg, severity);
    d.source = 'SLA Guardian';
    if (code) d.code = code;
    return d;
}

function isCobol(doc) {
    const ext = doc.fileName.toLowerCase();
    return doc.languageId === 'cobol' || ext.endsWith('.cbl') || ext.endsWith('.cob') || ext.endsWith('.cobol');
}

function deactivate() { if (diagnosticCollection) diagnosticCollection.dispose(); }
module.exports = { activate, deactivate };