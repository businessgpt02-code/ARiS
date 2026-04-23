from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
from fastapi import Body, HTTPException
from typing import List, Optional
from pydantic import BaseModel, Field
import json
import joblib
import numpy as np      # 👈 ML + SHAP
import shap   

app = FastAPI(
    title="ARiS API",
    description="Backend API for AI-Driven Urban Accessibility Risk Mapping & Prediction System",
    version="0.1.0",
)

# --- CORS (allow frontend) ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    # later add your deployed frontend URL here
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Paths ---
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data"
BLOCKS_JSON = DATA_DIR / "blocks_data.json"
MODEL_PATH = DATA_DIR / "risk_model.joblib"

# --- Globals for ML ---
ml_model = None
risk_map_inv = None        # {0: "low", 1: "medium", 2: "high"}
FEATURE_ORDER = []
FEATURE_IMPORTANCES = []
explainer = None           # SHAP explainer


def encode_features(block: dict):
    """
    Convert a block dict into a feature vector in the SAME order as training.
    ['sidewalk_width_m', 'slope_percent', 'has_curb_ramp',
     'traffic_level', 'lighting_quality', 'surface_quality']
    """
    width = block.get("sidewalk_width_m", 1.2)
    slope = block.get("slope_percent", 0.0)
    has_ramp_str = str(block.get("has_curb_ramp", "no")).lower()
    traffic_str = str(block.get("traffic_level", "low")).lower()
    lighting_str = str(block.get("lighting_quality", "good")).lower()
    surface_str = str(block.get("surface_quality", "smooth")).lower()

    has_ramp = 1 if has_ramp_str == "yes" else 0

    traffic_map = {"low": 0, "medium": 1, "high": 2}
    lighting_map = {"good": 1, "poor": 0}
    surface_map = {"smooth": 0, "uneven": 1, "broken": 2}

    traffic_val = traffic_map.get(traffic_str, 0)
    lighting_val = lighting_map.get(lighting_str, 1)
    surface_val = surface_map.get(surface_str, 0)

    features = [
        width,
        slope,
        has_ramp,
        traffic_val,
        lighting_val,
        surface_val,
    ]
    return features


def load_blocks():
    """Load rule-based blocks (with risk_score & risk_level) from JSON."""
    if BLOCKS_JSON.exists():
        with open(BLOCKS_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("blocks", [])
    return []


def load_ml_model():
    """Load trained ML model from disk if available."""
    global ml_model, risk_map_inv, FEATURE_ORDER, FEATURE_IMPORTANCES, explainer

    if not MODEL_PATH.exists():
        print(f"[AURaMP] No ML model found at {MODEL_PATH}, using rule-based only.")
        return

    bundle = joblib.load(MODEL_PATH)

    ml_model = bundle.get("model")
    risk_map_inv = bundle.get("risk_map_inv")
    FEATURE_ORDER = bundle.get("meta", {}).get("features", [])
    FEATURE_IMPORTANCES = bundle.get("meta", {}).get("feature_importances", [])

    # SHAP explainer
    try:
        explainer = shap.TreeExplainer(ml_model)
        print("[AURaMP] SHAP explainer initialized.")
    except Exception as e:
        explainer = None
        print("[AURaMP] Could not initialize SHAP explainer:", e)

    print("[AURaMP] ML model loaded.")
    print("[AURaMP] Feature order:", FEATURE_ORDER)
    print("[AURaMP] Feature importances:", FEATURE_IMPORTANCES)


def predict_risk_ml(block: dict):
    """
    Use ML model to predict risk_level for a given block.
    Returns:
      - risk_score (0–1 simplified severity index)
      - risk_level ("low" / "medium" / "high")
      - confidence (0–1, probability of predicted class)
      - probs (list of class probabilities) or None
    """
    if ml_model is None or risk_map_inv is None:
        # fallback: just return existing rule-based values, no confidence
        return (
            block.get("risk_score", 0.0),
            block.get("risk_level", "unknown"),
            None,
            None,
        )

    features = encode_features(block)
    X = [features]  # shape (1, n_features)

    # 🔹 Full probability distribution over classes
    probs = ml_model.predict_proba(X)[0]  # e.g. [p_low, p_med, p_high]

    # 🔹 Predicted class = argmax probability
    pred_int = int(np.argmax(probs))
    risk_level = risk_map_inv.get(pred_int, "unknown")

    # 🔹 Simple severity index (same as before)
    # probs format = [p_low, p_medium, p_high]
    severity_score = float(
    (0.0 * probs[0]) +
    (0.5 * probs[1]) +
    (1.0 * probs[2])
)
    
    # 🔹 Confidence = highest class probability
    confidence = float(np.max(probs))

    return severity_score, risk_level, confidence, probs.tolist()


def explain_risk_ml(block: dict):
    """
    Use SHAP to explain which features contributed most to the ML risk prediction.
    Returns a list of {feature, impact}, sorted by |impact|.
    """
    if ml_model is None or risk_map_inv is None or explainer is None:
        return []

    features = encode_features(block)
    X = np.array([features])   # shape (1, n_features)

    # Predict class (0/1/2)
    pred_int = ml_model.predict([features])[0]

    # SHAP values for each class; pick for predicted class
    shap_values = explainer.shap_values(X)

    if isinstance(shap_values, list):
        shap_for_class = shap_values[int(pred_int)][0]   # (n_features, ...)
    else:
        shap_for_class = shap_values[0]

    explanation = []

    feature_names = FEATURE_ORDER or [
        "sidewalk_width_m",
        "slope_percent",
        "has_curb_ramp",
        "traffic_level",
        "lighting_quality",
        "surface_quality",
    ]

    for name, val in zip(feature_names, shap_for_class):
        arr = np.array(val)
        if arr.ndim == 0:
            impact = float(arr)
        else:
            impact = float(arr.mean())
        explanation.append({
            "feature": name,
            "impact": impact,
        })

    explanation = sorted(explanation, key=lambda x: abs(x["impact"]), reverse=True)
    return explanation[:5]


# ----------------------------------------------------------
# 🔹 Priority Intervention Engine – Pydantic models
# ----------------------------------------------------------

class SegmentIn(BaseModel):
    id: str
    name: Optional[str] = None
    ward: str
    risk_score: float = Field(..., ge=0.0, le=1.0)      # 0–1 (from ML or rule)
    compliance_score: float = Field(..., ge=0.0, le=100.0)
    sidewalk_width: Optional[float] = None              # metres
    lighting: Optional[int] = None                      # 0 = poor, 1 = ok
    traffic_speed: Optional[float] = None               # km/h (proxy)
    near_school: bool = False
    near_hospital: bool = False


class SegmentOut(BaseModel):
    id: str
    name: Optional[str] = None
    priority_score: float          # 0–100
    priority_level: str            # "Critical" | "High" | "Medium" | "Low"
    priority_explanation: List[str]
    recommended_actions: List[str]


class WardSummary(BaseModel):
    ward: str
    segments_count: int
    avg_risk: float                # 0–100
    avg_compliance: float          # 0–100
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int


class PriorityRequest(BaseModel):
    ward: str
    segments: List[SegmentIn]


class PriorityResponse(BaseModel):
    ward: str
    summary: WardSummary
    segments: List[SegmentOut]

class BudgetRequest(BaseModel):
    ward: str
    budget: float = Field(..., ge=0.0)
    segments: List[SegmentIn]


class BudgetSegmentOut(BaseModel):
    id: str
    name: Optional[str] = None
    priority_score: float
    priority_level: str
    priority_explanation: List[str]
    recommended_actions: List[str]
    estimated_cost: float


class BudgetSummary(BaseModel):
    ward: str
    total_budget: float
    budget_used: float
    budget_remaining: float
    selected_count: int


class BudgetResponse(BaseModel):
    ward: str
    summary: BudgetSummary
    segments: List[BudgetSegmentOut]
# ----------------------------------------------------------
# 🔹 Priority Intervention Engine – helpers
# ----------------------------------------------------------

def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))

def build_priority_explanation(seg: SegmentIn) -> List[str]:
    """
    Explain why a segment received its priority score.
    Returns the main contributing factors in simple human-readable form.
    """
    factors: List[str] = []

    # compliance
    if seg.compliance_score < 50:
        factors.append("Low compliance score")
    elif seg.compliance_score < 70:
        factors.append("Moderate compliance deficiency")

    # width
    if seg.sidewalk_width is not None:
        if seg.sidewalk_width < 1.0:
            factors.append("Very narrow sidewalk width")
        elif seg.sidewalk_width < 1.5:
            factors.append("Below-recommended sidewalk width")

    # lighting
    if seg.lighting == 0:
        factors.append("Poor lighting conditions")

    # traffic
    if seg.traffic_speed is not None:
        if seg.traffic_speed > 50:
            factors.append("High traffic speed")
        elif seg.traffic_speed > 40:
            factors.append("Moderately high traffic speed")

    # vulnerable users
    if seg.near_school:
        factors.append("Located near a school")
    if seg.near_hospital:
        factors.append("Located near a hospital")

    # base risk
    if seg.risk_score >= 0.8:
        factors.append("High predicted accessibility risk")
    elif seg.risk_score >= 0.5:
        factors.append("Moderate predicted accessibility risk")

    if not factors:
        factors.append("General infrastructure conditions contribute to priority")

    return factors[:4]


def compute_priority_score(seg: SegmentIn) -> float:
    """
    Multi-criteria prioritisation, scaled to 0–100.
    Higher score = higher priority.
    """

    # 1) Base risk (0–100)
    risk_component = seg.risk_score * 100.0

    # 2) Non-compliance (0–100)
    noncomp_component = max(0.0, 100.0 - seg.compliance_score)

    # 3) Vulnerable users (schools / hospitals)
    vuln_score = 0.0
    if seg.near_school:
        vuln_score += 25.0
    if seg.near_hospital:
        vuln_score += 20.0
    vuln_component = clamp(vuln_score, 0.0, 45.0)

    # 4) Traffic speed
    if seg.traffic_speed is not None:
        norm_speed = clamp((seg.traffic_speed - 20.0) / (70.0 - 20.0), 0.0, 1.0)
        speed_component = norm_speed * 30.0
    else:
        speed_component = 10.0

    # 5) Lighting (0 poor, 1 ok)
    if seg.lighting is not None:
        lighting_component = (1 - seg.lighting) * 20.0  # poor → 20, ok → 0
    else:
        lighting_component = 5.0

    # 6) Sidewalk width deficit
    width_component = 0.0
    if seg.sidewalk_width is not None:
        width_deficit = clamp((1.8 - seg.sidewalk_width) / 1.8, 0.0, 1.0)
        width_component = width_deficit * 30.0

    score = (
        0.35 * risk_component +
        0.25 * noncomp_component +
        0.20 * vuln_component +
        0.10 * speed_component +
        0.05 * lighting_component +
        0.05 * width_component
    )

    return clamp(score, 0.0, 100.0)


def classify_priority_level(score: float) -> str:
    if score >= 80.0:
        return "Critical"
    elif score >= 60.0:
        return "High"
    elif score >= 40.0:
        return "Medium"
    else:
        return "Low"


def build_recommended_actions(seg: SegmentIn, level: str) -> List[str]:
    actions: List[str] = []

    # Scheduling note by band
    if level == "Critical":
        actions.append(
            "Include in Year 1 capital programme for immediate safety and accessibility upgrades."
        )
    elif level == "High":
        actions.append(
            "Schedule for short-term (1–2 year) improvement package with focused accessibility upgrades."
        )
    elif level == "Medium":
        actions.append(
            "Plan for medium-term improvements; bundle with adjacent links for network continuity."
        )
    else:
        actions.append(
            "Monitor conditions; integrate improvements when undertaking area-wide upgrades."
        )

    # Geometry / width
    if seg.sidewalk_width is not None:
        if seg.sidewalk_width < 1.0:
            actions.append(
                "Widen sidewalk to at least 1.5 m clear width; target 1.8–2.0 m on primary streets."
            )
        elif seg.sidewalk_width < 1.5:
            actions.append(
                "Increase clear width to a minimum of 1.8 m where feasible, removing obstructions."
            )

    # Lighting
    if seg.lighting == 0:
        actions.append(
            "Upgrade to continuous, uniform pedestrian-scale lighting, focusing on crossings and intersections."
        )

    # Traffic
    if seg.traffic_speed is not None and seg.traffic_speed > 40:
        actions.append(
            "Introduce traffic calming (raised crossings, narrowed entries, speed management) to keep speeds below 30–40 km/h."
        )

    # Vulnerable uses
    if seg.near_school:
        actions.append(
            "Prioritise as part of a ‘Safe Routes to School’ corridor with wider footpaths, protected crossings and clear signage."
        )
    if seg.near_hospital:
        actions.append(
            "Ensure step-free, obstruction-free access to nearby hospital, including curb ramps and tactile guidance."
        )

    if not actions:
        actions.append("Review segment in context and define targeted design interventions.")

    return actions[:4]

def estimate_intervention_cost(seg: SegmentIn, level: str) -> float:
    """
    Estimate cost of intervention for a segment.
    Simple planning-grade approximation based on severity + issues.
    """

    # base cost by priority level
    if level == "Critical":
        cost = 250000.0
    elif level == "High":
        cost = 180000.0
    elif level == "Medium":
        cost = 100000.0
    else:
        cost = 60000.0

    # add cost for narrow width
    if seg.sidewalk_width is not None:
        if seg.sidewalk_width < 1.0:
            cost += 80000.0
        elif seg.sidewalk_width < 1.5:
            cost += 40000.0

    # add lighting upgrade cost
    if seg.lighting == 0:
        cost += 30000.0

    # add traffic calming cost
    if seg.traffic_speed is not None and seg.traffic_speed > 40:
        cost += 50000.0

    # add safer design around vulnerable users
    if seg.near_school:
        cost += 25000.0
    if seg.near_hospital:
        cost += 25000.0

    return float(cost)
# ----------------------------------------------------------
# 🔹 API endpoints
# ----------------------------------------------------------

# Load ML model once when app starts
load_ml_model()


@app.post("/predict-ml")
def predict_ml(block: dict = Body(...)):
    """
    Predict ML risk for a modified block (scenario simulator)
    and return:
      - risk score & level
      - confidence & probability distribution
      - SHAP-based explanation
    """
    score, level, confidence, probs = predict_risk_ml(block)
    explanation = explain_risk_ml(block)

    probs_dict = None
    if probs is not None and len(probs) >= 3:
        probs_dict = {
            "low": float(probs[0]),
            "medium": float(probs[1]),
            "high": float(probs[2]),
        }

    return {
        "ml_risk_score": score,
        "ml_risk_level": level,
        "ml_confidence": confidence,
        "ml_probabilities": probs_dict,
        "ml_explanation": explanation,
    }

@app.post("/priority-engine", response_model=PriorityResponse)
def run_priority_engine(payload: PriorityRequest) -> PriorityResponse:
    """
    Ward-level prioritisation engine.
    Frontend sends:
      { ward: "...", segments: [...] }
    """
    if not payload.segments:
        raise HTTPException(status_code=400, detail="No segments provided.")

    out_segments: List[SegmentOut] = []
    risk_values: List[float] = []
    comp_values: List[float] = []

    for seg in payload.segments:
        score = compute_priority_score(seg)
        level = classify_priority_level(score)
        explanation = build_priority_explanation(seg)
        actions = build_recommended_actions(seg, level)

        out_segments.append(
            SegmentOut(
                id=str(seg.id),
                name=seg.name or f"Segment {seg.id}",
                priority_score=round(score, 1),
                priority_level=level,
                priority_explanation=explanation,
                recommended_actions=actions,
            )
        )

        risk_values.append(seg.risk_score * 100.0)   # convert 0–1 to 0–100
        comp_values.append(seg.compliance_score)

    # Sort highest priority first
    out_segments.sort(key=lambda s: s.priority_score, reverse=True)

    n = len(payload.segments)
    avg_risk = sum(risk_values) / n if n else 0.0
    avg_compliance = sum(comp_values) / n if n else 0.0

    critical_count = sum(1 for s in out_segments if s.priority_level == "Critical")
    high_count = sum(1 for s in out_segments if s.priority_level == "High")
    medium_count = sum(1 for s in out_segments if s.priority_level == "Medium")
    low_count = sum(1 for s in out_segments if s.priority_level == "Low")

    summary = WardSummary(
        ward=payload.ward,
        segments_count=n,
        avg_risk=round(avg_risk, 1),
        avg_compliance=round(avg_compliance, 1),
        critical_count=critical_count,
        high_count=high_count,
        medium_count=medium_count,
        low_count=low_count,
    )

    return PriorityResponse(
        ward=payload.ward,
        summary=summary,
        segments=out_segments,
    )

@app.post("/budget-optimizer", response_model=BudgetResponse)
def run_budget_optimizer(payload: BudgetRequest) -> BudgetResponse:
    """
    Select the best segments that can be funded within the available budget.
    Uses greedy selection based on descending priority score.
    """
    if not payload.segments:
        raise HTTPException(status_code=400, detail="No segments provided.")

    ranked_segments = []

    # First compute priority for all segments
    for seg in payload.segments:
        score = compute_priority_score(seg)
        level = classify_priority_level(score)
        explanation = build_priority_explanation(seg)
        actions = build_recommended_actions(seg, level)
        estimated_cost = estimate_intervention_cost(seg, level)

        ranked_segments.append(
            {
                "id": str(seg.id),
                "name": seg.name or f"Segment {seg.id}",
                "priority_score": round(score, 1),
                "priority_level": level,
                "priority_explanation": explanation,
                "recommended_actions": actions,
                "estimated_cost": float(estimated_cost),
            }
        )

    # Sort by highest priority first
    ranked_segments.sort(key=lambda s: s["priority_score"], reverse=True)

    selected_segments: List[BudgetSegmentOut] = []
    budget_used = 0.0

    # Greedy budget allocation
    for seg in ranked_segments:
        next_cost = seg["estimated_cost"]
        if budget_used + next_cost <= payload.budget:
            selected_segments.append(
                BudgetSegmentOut(
                    id=seg["id"],
                    name=seg["name"],
                    priority_score=seg["priority_score"],
                    priority_level=seg["priority_level"],
                    priority_explanation=seg["priority_explanation"],
                    recommended_actions=seg["recommended_actions"],
                    estimated_cost=seg["estimated_cost"],
                )
            )
            budget_used += next_cost

    summary = BudgetSummary(
        ward=payload.ward,
        total_budget=float(payload.budget),
        budget_used=float(round(budget_used, 2)),
        budget_remaining=float(round(payload.budget - budget_used, 2)),
        selected_count=len(selected_segments),
    )

    return BudgetResponse(
        ward=payload.ward,
        summary=summary,
        segments=selected_segments,
    )
@app.get("/health")
def health_check():
    return {"status": "ok", "message": "AURaMP backend is running"}


@app.get("/blocks")
def get_blocks():
    """
    Returns block data with:
    - rule-based risk_score & risk_level
    - ml_risk_score & ml_risk_level predicted by ML model
    - ml_confidence (0–1)
    - ml_probabilities {low, medium, high}
    """
    blocks = load_blocks()
    enriched = []

    for block in blocks:
        ml_score, ml_level, ml_conf, probs = predict_risk_ml(block)

        probs_dict = None
        if probs is not None and len(probs) >= 3:
            probs_dict = {
                "low": float(probs[0]),
                "medium": float(probs[1]),
                "high": float(probs[2]),
            }

        b = block.copy()
        b["ml_risk_score"] = ml_score
        b["ml_risk_level"] = ml_level
        b["ml_confidence"] = ml_conf
        b["ml_probabilities"] = probs_dict

        enriched.append(b)

    return {"blocks": enriched}


@app.get("/model/feature-importance")
def get_feature_importance():
    """
    Returns feature importance values from the trained ML model.
    Useful for explaining which factors influence accessibility risk.
    """
    if ml_model is None or not FEATURE_ORDER or not FEATURE_IMPORTANCES:
        return {"features": []}

    importances = FEATURE_IMPORTANCES
    max_imp = max(importances) if importances else 1.0
    norm_importances = [float(i) / max_imp if max_imp > 0 else 0.0 for i in importances]

    features = []
    for name, raw_value, norm_val in zip(FEATURE_ORDER, importances, norm_importances):
        features.append(
            {
                "name": name,
                "raw_importance": float(raw_value),
                "normalized_importance": float(norm_val),
            }
        )

    return {"features": features}