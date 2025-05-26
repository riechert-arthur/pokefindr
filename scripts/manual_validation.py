
#!/usr/bin/env python3
"""
Interactive reviewer for flagged vending-machine entries with auto-save after each decision.

Usage: python verify_flagged.py

Assumes in cwd:
  - vending_machines.json
  - vending_machines_flagged.json

This script also tags manually verified or edited entries with a
`_manual_override` flag so future automated updates will preserve them.
"""
import json, os, sys

MAIN_PATH    = "vending_machines.json"
FLAGGED_PATH = "vending_machines_flagged.json"


def load(path):
    if not os.path.exists(path):
        print(f"Error: {path} not found.")
        sys.exit(1)
    return json.load(open(path, encoding="utf-8"))


def save(data, path):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def prompt_choice():
    prompt = (
        "Choose action for this entry:\n"
        "  [v]erify (mark as valid, false flag)\n"
        "  [e]dit   (correct coordinates/accuracy/confidence)\n"
        "  [s]kip   (leave flagged for later)\n"
        "Enter v/e/s: "
    )
    while True:
        c = input(prompt).strip().lower()
        if c in ("v","verify","f","false"): return "verify"
        if c in ("e","edit"):             return "edit"
        if c in ("s","skip"):             return "skip"
        print("Invalid choice. Type 'v', 'e', or 's'.")


def prompt_input(label, current, tip=None):
    tip_str = f" [{tip}]" if tip else ""
    line = input(f"{label}{tip_str} (current: {current}) → ").strip()
    return line if line else current


def get_accuracy(feat):
    return feat["properties"].get("coordinates", {}).get("accuracy")


def get_confidence(feat):
    return feat["properties"].get("match_code", {}).get("confidence")


def review():
    main = load(MAIN_PATH)
    flagged_data = load(FLAGGED_PATH)

    # Build main map by machineID, preserving manual overrides
    main_map = {f["properties"]["machineID"]: f for f in main["features"]}
    remaining = flagged_data["features"][:]
    verified = []     # approved or edited
    still_flagged = []

    while remaining:
        feat = remaining.pop(0)
        props = feat["properties"]
        mid   = props["machineID"]
        retailer = props.get("retailer", "")
        addr  = f"{props.get('address')}, {props.get('city')}, {props.get('state')}"

        # Safe geometry access
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")

        acc  = get_accuracy(feat)
        conf = get_confidence(feat)

        # formatted for easy copy-paste: latitude, longitude
        if isinstance(coords, (list, tuple)) and len(coords) == 2:
            lon_val, lat_val = coords
        else:
            lat_val = lon_val = ''

        print("\n" + "="*40)
        print(f"MachineID   : {mid}")
        print(f"Retailer    : {retailer}")
        print(f"Location    : {addr}")
        print(f"Coordinates : {lat_val}, {lon_val} (latitude, longitude)")
        print(f"Accuracy    : {acc} (rooftop/parcel/point/interpolated/approximate)")
        print(f"Confidence  : {conf} (exact/high/medium/low)")
        print("="*40)

        choice = prompt_choice()
        if choice == "verify":
            feat["properties"]["_manual_override"] = True
            verified.append(feat)
        elif choice == "skip":
            still_flagged.append(feat)
        else:
            print("\nEnter new values or leave blank to keep current.")
            lon = prompt_input("Longitude", lon_val, tip="-180 to 180")
            lat = prompt_input("Latitude",  lat_val, tip="-90 to 90")
            try:
                feat["geometry"] = {"type": "Point", "coordinates": [float(lon), float(lat)]}
            except ValueError:
                print("  ↳ Invalid coords; keeping original.")

            new_acc = prompt_input("Accuracy", acc, tip="rooftop/parcel/point/interpolated/approximate")
            feat["properties"].setdefault("coordinates", {})["accuracy"] = new_acc

            new_conf = prompt_input("Confidence", conf, tip="exact/high/medium/low")
            feat["properties"].setdefault("match_code", {})["confidence"] = new_conf

            feat["properties"]["_manual_override"] = True
            verified.append(feat)

        # Auto-save after each decision
        merged_feats = []
        # collect existing main (excluding flagged) and overrides
        for f in main["features"]:
            mid_old = f["properties"]["machineID"]
            if mid_old in main_map:
                merged_feats.append(main_map[mid_old])
        merged_feats.extend(verified)

        save({"type":"FeatureCollection", "features":merged_feats}, MAIN_PATH)
        save({"type":"FeatureCollection", "features":remaining + still_flagged}, FLAGGED_PATH)

        print(f"Saved progress: {len(merged_feats)} in main, {len(remaining)+len(still_flagged)} still flagged.")

    print("\nAll flagged entries processed.")
    final_main = load(MAIN_PATH)["features"]
    print(f" → vending_machines.json now has {len(final_main)} features.")
    print(f" → 0 features remain in {FLAGGED_PATH}.")

if __name__ == "__main__":
    review()

