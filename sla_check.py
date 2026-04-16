import json
import sys

# Load result
with open("result.json") as f:
    data = json.load(f)

cpu_time = data.get("cpu_time", 0)

threshold = 50   # 🔥 Set realistic threshold

print(f"CPU Time: {cpu_time}")
print(f"Threshold: {threshold}")

if cpu_time <= threshold:
    print("✅ SLA OK - BUILD PASSED")
else:
    print("❌ SLA BREACH - BUILD FAILED")
    sys.exit(1)   # 🚨 THIS FAILS PIPELINE