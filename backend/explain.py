import shap
import numpy as np
import joblib

# Load trained model
model = joblib.load("model.pkl")

# Create SHAP explainer (Tree-based model)
explainer = shap.TreeExplainer(model)

def explain_prediction(input_array, feature_names):
    shap_values = explainer.shap_values(input_array)

    # For binary classification, use index 1 (positive class)
    shap_values = shap_values[1][0]

    explanation = []
    for i in range(len(feature_names)):
        explanation.append({
            "feature": feature_names[i],
            "impact": float(shap_values[i])
        })

    # Sort by absolute impact
    explanation = sorted(
        explanation,
        key=lambda x: abs(x["impact"]),
        reverse=True
    )

    return explanation[:5]  # Top 5 important factors