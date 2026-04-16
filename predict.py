import sys
import json
import joblib
import numpy as np
import os
import warnings
warnings.filterwarnings("ignore")

def main():
    try:
        if len(sys.argv) < 2:
            print(json.dumps({"error": "No input data provided"}))
            return

        data = json.loads(sys.argv[1])
        mode = sys.argv[2] if len(sys.argv) > 2 else "program"

        base_dir = os.path.dirname(os.path.abspath(__file__))

        if mode == "statement":
            # ── MODEL 2: LINE-BY-LINE (Extra Trees) ─────────────────────────
            # Features (5): Statement_enc, Loop, Loop Depth, Arithmetic, IO
            # Targets  (3): COMBINED, ATTRIBUTED, EXECUTED
            # NOTE: Line number is NOT a feature — it is display-only

            scaler_path  = os.path.join(base_dir, "scaler_X.pkl")
            model_path   = os.path.join(base_dir, "random_forest_model.pkl")
            encoder_path = os.path.join(base_dir, "label_encoder.pkl")

            scaler  = joblib.load(scaler_path)
            model   = joblib.load(model_path)
            le      = joblib.load(encoder_path)

            # statement_enc is already encoded by mapStatementToId in extension.js
            # using the same alphabetical LabelEncoder order — so we use it directly
            features = [[
                data.get("statement_enc", 0),   # Statement_enc  (int 0-26)
                data.get("is_loop",        0),   # Loop           (0/1/2)
                data.get("loop_depth",     0),   # Loop Depth     (0-4)
                data.get("is_arithmetic",  0),   # Arithmetic     (0/1)
                data.get("is_io",          0),   # IO             (0/1)
            ]]

            scaled = scaler.transform(features)
            pred   = model.predict(scaled)[0]

            # Outputs: COMBINED (%), ATTRIBUTED (%), EXECUTED (%)
            combined   = round(float(pred[0]), 4)
            attributed = round(float(pred[1]), 4)
            executed   = round(float(pred[2]), 4)

            output = {
                "combined":   combined,    # total combined CPU % for this statement
                "attributed": attributed,  # CPU % attributed directly to this line
                "executed":   executed,    # actual executed CPU %
                # For backward compat with dashboard — map combined → cpu_time
                "cpu_time":   combined
            }

        else:
            # ── MODEL 1: OVERALL PROGRAM PERFORMANCE ────────────────────────
            # Features (7): Max Loop Depth, Nested Loop Count, Loop_Stmt Count,
            #               File_IO_Count, If_Count, Function Calls, Arithmetic Ops
            # Targets  (4): CPU_TIME(S), WAIT_PERCENT, SESSION_TIME(s), STRETCH_TIME(s)

            scaler_path = os.path.join(base_dir, "scaler.pkl")
            model_path  = os.path.join(base_dir, "cobol_model.pkl")

            scaler = joblib.load(scaler_path)
            model  = joblib.load(model_path)

            features = [[
                data["maxLoopDepth"],
                data["nestedLoopCount"],
                data["totalPerforms"],
                data["fileIOCount"],
                data["ifCount"],
                data["functionCalls"],
                data["arithmeticOps"]
            ]]

            scaled = scaler.transform(features)
            pred   = model.predict(scaled)[0]

            cpu_time     = round(float(pred[0]), 6)
            wait_percent = round(float(pred[1]), 4) if len(pred) > 1 else 0.0
            session_time = round(float(pred[2]), 6) if len(pred) > 2 else 0.0
            stretch_time = round(float(pred[3]), 6) if len(pred) > 3 else 0.0

            if session_time < cpu_time:
                session_time = round(cpu_time + stretch_time, 6)

            output = {
                "cpu_time":     cpu_time,
                "wait_percent": wait_percent,
                "session_time": session_time,
                "stretch_time": stretch_time
            }

        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
