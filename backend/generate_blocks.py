import pandas as pd
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
RAW_CSV = DATA_DIR / "blocks_raw.csv"
OUT_JSON = DATA_DIR / "blocks_data.json"


def compute_risk(row):
    """
    Accessibility risk model inspired by CPWD Harmonised Guidelines (2016).
    CPWD-aligned thresholds:
      - Minimum clear width: 1.2m
      - Max gradient for accessible ramps/routes: 1:12 ≈ 8.33%
    Weighted scoring is a heuristic severity model designed for this project.
    """

    violations = []
    score = 0.0

    width = float(row["sidewalk_width_m"])
    slope = float(row["slope_percent"])
    has_ramp = str(row["has_curb_ramp"]).lower()
    traffic = str(row["traffic_level"]).lower()
    lighting = str(row["lighting_quality"]).lower()
    surface = str(row["surface_quality"]).lower()

    # --- CPWD constants ---
    CPWD_MIN_WIDTH_M = 1.2
    CPWD_MAX_SLOPE_PERCENT = 8.33  # 1:12 ≈ 8.33%

    # 1) Sidewalk width (CPWD min 1.2m)
    # 0.9m band is a "severe" heuristic (not a CPWD number)
    if width < 0.9:
        violations.append("Severe: clear width extremely narrow (< 0.9m) [below CPWD minimum 1.2m]")
        score += 0.35
    elif width < CPWD_MIN_WIDTH_M:
        violations.append("Non-compliant: clear width below CPWD minimum (1.2m)")
        score += 0.25
    elif width < 1.5:
        violations.append("Below recommended width (~1.5m preferred for comfortable passing)")
        score += 0.10

    # 2) Slope / gradient (CPWD reference: 1:12 ≈ 8.33% max)
    # 5% band is a "caution" heuristic (not a CPWD max)
    if slope > 10:
        violations.append("Severe: gradient very high (> 10%) [exceeds CPWD reference 1:12 ≈ 8.33%]")
        score += 0.30
    elif slope > CPWD_MAX_SLOPE_PERCENT:
        violations.append("Non-compliant: gradient exceeds CPWD reference (1:12 ≈ 8.33%)")
        score += 0.20
    elif slope > 5:
        violations.append("Caution: moderate gradient (> 5%) may reduce usability")
        score += 0.10

    # 3) Curb ramp (CPWD: curb ramps required at crossings for accessibility)
    if has_ramp == "no":
        violations.append("Non-compliant: missing curb ramp at crossing (accessibility barrier)")
        score += 0.20
    elif has_ramp not in ["yes", "no"]:
        violations.append("Unknown curb ramp condition (treated as uncertain risk)")
        score += 0.05

    # 4) Traffic level (contextual risk; not a CPWD geometric requirement)
    if traffic == "high":
        violations.append("Context risk: high traffic exposure")
        score += 0.20
    elif traffic == "medium":
        score += 0.10

    # 5) Lighting (CPWD emphasizes safe/usable environments; lighting is an operational safety factor)
    if lighting == "poor":
        violations.append("Safety risk: inadequate pedestrian lighting")
        score += 0.10

    # 6) Surface quality (CPWD: surfaces should be firm, even, non-slip)
    if surface == "broken":
        violations.append("Non-compliant: surface not firm/even (broken)")
        score += 0.20
    elif surface == "uneven":
        violations.append("Non-compliant: surface not firm/even (uneven)")
        score += 0.10

    # Cap score at 1.0
    score = min(score, 1.0)

    # Map to risk level (your design choice)
    if score >= 0.7:
        level = "high"
    elif score >= 0.4:
        level = "medium"
    else:
        level = "low"

    if not violations:
        violations.append("No major accessibility violations detected (based on available data).")

    return score, level, violations




def main():
    df = pd.read_csv(RAW_CSV)

    blocks = []
    for _, row in df.iterrows():
        risk_score, risk_level, reasons = compute_risk(row)

        block = {
            "id": row["id"],
            "name": row["name"],
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [row["lng_start"], row["lat_start"]],
                    [row["lng_end"], row["lat_end"]],
                ],
            },
            "sidewalk_width_m": row["sidewalk_width_m"],
            "slope_percent": row["slope_percent"],
            "has_curb_ramp": row["has_curb_ramp"],
            "traffic_level": row["traffic_level"],
            "lighting_quality": row["lighting_quality"],
            "surface_quality": row["surface_quality"],
            "risk_score": risk_score,
            "risk_level": risk_level,
            "reasons": reasons,
        }
        blocks.append(block)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump({"blocks": blocks}, f, indent=2)

    print(f"Generated {len(blocks)} blocks with risk scores into {OUT_JSON}")


if __name__ == "__main__":
    main()
