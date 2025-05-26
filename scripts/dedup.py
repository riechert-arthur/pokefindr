import json
import os
from collections import defaultdict

MAIN_PATH = "vending_machines.json"

def accuracy_score(acc):
    order = {
        "rooftop":      4,
        "parcel":       3,
        "point":        2,
        "interpolated": 1,
        "approximate":  0,
        None:          -1
    }
    return order.get(acc, -1)

def get_accuracy(entry):
    return entry["properties"].get("coordinates", {}).get("accuracy")

def main():
    if not os.path.exists(MAIN_PATH):
        print(f"Error: {MAIN_PATH} not found.")
        return

    with open(MAIN_PATH, encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    grouped = defaultdict(list)
    for feat in features:
        mid = feat["properties"].get("machineID")
        grouped[mid].append(feat)

    new_features = []
    removed = {}

    for mid, feats in grouped.items():
        count = len(feats)
        if count == 1:
            new_features.append(feats[0])
            continue

        # 1) If *all* entries are exactly identical, just keep one
        first = feats[0]
        if all(f == first for f in feats[1:]):
            new_features.append(first)
            removed[mid] = count - 1
            continue

        # 2) Otherwise, apply manual-override vs. accuracy logic
        manual = [f for f in feats if f["properties"].get("_manual_override")]
        auto   = [f for f in feats if not f["properties"].get("_manual_override")]

        if manual:
            # Keep all manual entries, drop all auto
            new_features.extend(manual)
            removed[mid] = len(auto)
        else:
            # Keep only the one with highest accuracy
            best = max(auto, key=lambda f: accuracy_score(get_accuracy(f)))
            new_features.append(best)
            removed[mid] = len(auto) - 1

    # Overwrite the JSON file with deduped features
    with open(MAIN_PATH, "w", encoding="utf-8") as f:
        json.dump(
            {"type": "FeatureCollection", "features": new_features},
            f,
            ensure_ascii=False,
            indent=2
        )

    total_removed = sum(removed.values())
    print(f"Removed {total_removed} duplicate entries across {len(removed)} machineIDs.")
    for mid, count in removed.items():
        print(f"  • {mid}: removed {count} duplicate(s)")

if __name__ == "__main__":
    main()

