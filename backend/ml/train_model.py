import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split

# Paths
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
BLOCKS_JSON = DATA_DIR / "blocks_data.json"
MODEL_OUT = DATA_DIR / "risk_model.joblib"


def load_blocks():
    with open(BLOCKS_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["blocks"]


def build_dataset(blocks):
    df = pd.DataFrame(blocks)

    # Feature encoding (keep it SIMPLE + DETERMINISTIC)

    # Numeric features
    X = pd.DataFrame()
    X["sidewalk_width_m"] = df["sidewalk_width_m"]
    X["slope_percent"] = df["slope_percent"]
    X["has_curb_ramp"] = df["has_curb_ramp"].str.lower().map({"yes": 1, "no": 0}).fillna(0)

    # Categorical → fixed mapping (we control it)
    traffic_map = {"low": 0, "medium": 1, "high": 2}
    lighting_map = {"good": 1, "poor": 0}
    surface_map = {"smooth": 0, "uneven": 1, "broken": 2}

    X["traffic_level"] = df["traffic_level"].str.lower().map(traffic_map).fillna(0)
    X["lighting_quality"] = df["lighting_quality"].str.lower().map(lighting_map).fillna(0)
    X["surface_quality"] = df["surface_quality"].str.lower().map(surface_map).fillna(0)

    # Labels: risk_level → int
    # low = 0, medium = 1, high = 2
    risk_map = {"low": 0, "medium": 1, "high": 2}
    y = df["risk_level"].str.lower().map(risk_map).astype(int)

    return X, y, risk_map


def main():
    blocks = load_blocks()
    if not blocks:
        print("No blocks found in blocks_data.json – did you run generate_blocks.py?")
        return

    X, y, risk_map = build_dataset(blocks)

    # Train/test split (even if small, good practice)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.3, random_state=42, stratify=y
    )

    # Model
    model = RandomForestClassifier(
        n_estimators=100,
        random_state=42,
    )

    model.fit(X_train, y_train)

    # Evaluation
    y_pred = model.predict(X_test)

    print("\n=== Classification Report (0=low, 1=medium, 2=high) ===\n")
    print(classification_report(y_test, y_pred, digits=3))

    # Save model + encoding maps for inference
    feature_names = list(X.columns)
    importances = model.feature_importances_

    bundle = {
    "model": model,
    "risk_map": risk_map,
    "risk_map_inv": {v: k for k, v in risk_map.items()},
    "meta": {
        "features": feature_names,
        "feature_importances": importances.tolist(),
    },
}


    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, MODEL_OUT)

    print(f"\nModel saved to: {MODEL_OUT}")
    print("Feature order:", bundle["meta"]["features"])


if __name__ == "__main__":
    main()
