import json

with open("result.json") as f:
    data = json.load(f)

cpu_time = data.get("cpu_time", 0)

THRESHOLD = 100  # adjust if needed

if cpu_time > THRESHOLD:
    print("❌ SLA BREACH - BUILD FAILED")
    exit(1)
else:
    print("✅ SLA OK - BUILD PASSED")