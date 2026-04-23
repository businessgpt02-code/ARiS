import React, { useEffect, useMemo, useRef, useState } from "react";
import { computeCompliance } from "../utils/compliance";
import jsPDF from "jspdf";

const backendUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

const Sidebar = ({
  selectedFilter,
  setSelectedFilter,
  viewMode,
  setViewMode,
  featureImportance,
  onlyNonCompliant,
  setOnlyNonCompliant,
  selectedBlock,
  scenarioBlock,
  setScenarioBlock,
  blocks = [],
  onSelectBlock,
  setPriorityOverlay, 
  
}) => {
  const lastScenarioKeyRef = useRef(null);

  // ---------------- XAI for selected block (ML explanation) ----------------
  const [mlExplainSelected, setMlExplainSelected] = useState([]);
  const [mlScoreSelected, setMlScoreSelected] = useState(null);
  const [mlLevelSelected, setMlLevelSelected] = useState(null);
  const [loadingSelectedExplain, setLoadingSelectedExplain] = useState(false);
  const [selectedExplainError, setSelectedExplainError] = useState(null);
  const [mlConfSelected, setMlConfSelected] = useState(null);
  const [mlProbsSelected, setMlProbsSelected] = useState(null);
    // Split SHAP explanation into risk-increasing and risk-reducing factors
  const riskIncreasingSelected = useMemo(
    () => mlExplainSelected.filter((f) => f.impact > 0),
    [mlExplainSelected]
  );

  const riskReducingSelected = useMemo(
    () => mlExplainSelected.filter((f) => f.impact < 0),
    [mlExplainSelected]
  );
  // Helper: pretty display for feature names
  const prettyFeatureName = (name) => {
    switch (name) {
      case "sidewalk_width_m":
        return "Sidewalk width";
      case "slope_percent":
        return "Slope / gradient";
      case "has_curb_ramp":
        return "Curb ramps";
      case "traffic_level":
        return "Traffic level";
      case "lighting_quality":
        return "Lighting quality";
      case "surface_quality":
        return "Surface condition";
      default:
        return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };
    // ---------------- Priority Intervention Engine (ward-wise) ----------------
  const [selectedWard, setSelectedWard] = useState("");
  const [priorityResult, setPriorityResult] = useState(null);
  const [priorityLoading, setPriorityLoading] = useState(false);
  const [priorityError, setPriorityError] = useState(null);

  // Unique ward list (from blocks; assumes you’ve added ward to each block)
  const wards = useMemo(() => {
    const set = new Set();
    (blocks || []).forEach((b) => {
      if (b.ward) set.add(b.ward);
    });
    return Array.from(set).sort();
  }, [blocks]);

  const runPriorityEngine = async () => {
    if (!selectedWard) return;

    try {
      setPriorityLoading(true);
      setPriorityError(null);

      // Filter blocks for this ward
      const wardBlocks = (blocks || []).filter(
        (b) => b.ward === selectedWard
      );

      if (!wardBlocks.length) {
        setPriorityError("No segments found for this ward.");
        setPriorityResult(null);
        return;
      }

      // Build payload for backend
      const segmentsPayload = wardBlocks.map((b) => {
        const comp = computeCompliance(b); // you already import this

        // risk score: use ML if available, else rule-based, else 0.5 fallback
        let riskScore = 0.5;
        if (viewMode === "ml") {
          if (typeof b.ml_risk_score === "number") {
            riskScore = b.ml_risk_score;
          }
        } else {
          if (typeof b.risk_score === "number") {
            riskScore = b.risk_score;
          }
        }

        // lighting → 0/1
        const lightingQuality = String(b.lighting_quality || "").toLowerCase();
        const lighting = lightingQuality === "poor" ? 0 : 1;

        // traffic speed proxy
        const trafficLevel = String(b.traffic_level || "").toLowerCase();
        const traffic_speed =
          trafficLevel === "high"
            ? 60
            : trafficLevel === "medium"
            ? 40
            : 25;

        return {
          id: b.id,
          name: b.name,
          ward: b.ward,
          risk_score: riskScore,          // 0–1
          compliance_score: comp.pct,     // 0–100
          sidewalk_width: b.sidewalk_width_m,
          lighting,
          traffic_speed,
          near_school: !!b.near_school,
          near_hospital: !!b.near_hospital,
        };
      });

      const res = await fetch(`${backendUrl}/priority-engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ward: selectedWard,
          view_mode: viewMode,
          segments: segmentsPayload,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Backend error ${res.status}`);
      }

      const data = await res.json(); // { ward, segments, summary }
      setPriorityResult(data);
    } catch (err) {
      console.error("Priority engine error:", err);
      setPriorityError("Could not compute priorities for this ward.");
      setPriorityResult(null);
    } finally {
      setPriorityLoading(false);
    }
    // 👇 NEW: inform App so MapArea can color by priority
// 👇 inform App so MapArea can color by priority
if (setPriorityOverlay) {
  setPriorityOverlay({
    ward: selectedWard,
    segments: data.segments || [],
  });
}
  };
  // Fetch ML explanation for the currently selected block
  useEffect(() => {
   if (!selectedBlock) {
  setMlExplainSelected([]);
  setMlScoreSelected(null);
  setMlLevelSelected(null);
  setMlConfSelected(null);
  setMlProbsSelected(null);
  setSelectedExplainError(null);
  return;
}

    const fetchExplain = async () => {
      try {
        setLoadingSelectedExplain(true);
        setSelectedExplainError(null);

        const res = await fetch(`${backendUrl}/predict-ml`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(selectedBlock),
        });

        if (!res.ok) {
          throw new Error(`Backend error: ${res.status}`);
        }

        const data = await res.json();
       setMlScoreSelected(
  typeof data.ml_risk_score === "number" ? data.ml_risk_score : null
);
setMlLevelSelected(data.ml_risk_level || null);
setMlExplainSelected(data.ml_explanation || []);

setMlConfSelected(
  typeof data.ml_confidence === "number" ? data.ml_confidence : null
);
setMlProbsSelected(data.ml_probabilities || null);
      } catch (err) {
        console.error("Error fetching ML explanation for selected block:", err);
        setSelectedExplainError("Could not analyze risk factors for this block.");
        setMlExplainSelected([]);
      } finally {
        setLoadingSelectedExplain(false);
      }
    };

    fetchExplain();
  }, [selectedBlock?.id]);

  // ---------------- Filter button ----------------
  const FilterButton = ({ value, label, colorClass }) => (
    <button
      onClick={() => setSelectedFilter(value)}
      className={`flex-1 py-2 text-sm font-medium rounded-md transition-all duration-200 ${
        selectedFilter === value
          ? "bg-slate-700 text-white shadow-md shadow-slate-900/20"
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
      }`}
    >
      <div className="flex flex-col items-center gap-1">
        {value !== "all" && (
          <span className={`w-2 h-2 rounded-full ${colorClass}`}></span>
        )}
        {label}
      </div>
    </button>
  );

  // ---------------- Rule-based risk (frontend mirror) ----------------
  const computeRuleRisk = (b) => {
    if (!b) return { score: 0, level: "low", violations: [] };

    const violations = [];
    let score = 0;

    const width = Number(b.sidewalk_width_m);
    const slope = Number(b.slope_percent);
    const hasRamp = String(b.has_curb_ramp).toLowerCase();
    const traffic = String(b.traffic_level).toLowerCase();
    const lighting = String(b.lighting_quality).toLowerCase();
    const surface = String(b.surface_quality).toLowerCase();

    // Width (simple)
    if (width < 0.9) {
      score += 0.35;
      violations.push("Very narrow sidewalk (<0.9m)");
    } else if (width < 1.2) {
      score += 0.25;
      violations.push("Below minimum clear width (<1.2m)");
    } else if (width < 1.5) {
      score += 0.1;
      violations.push("Below recommended clear width (<1.5m)");
    }

    // Slope
    if (slope > 10) {
      score += 0.3;
      violations.push("Very steep slope (>10%)");
    } else if (slope > 8.33) {
      score += 0.2;
      violations.push("Steep slope (>8.33%)");
    } else if (slope > 5) {
      score += 0.1;
      violations.push("Moderate slope (>5%)");
    }

    // Ramp
    if (hasRamp === "no") {
      score += 0.2;
      violations.push("Missing curb ramp");
    }

    // Traffic
    if (traffic === "high") {
      score += 0.2;
      violations.push("High traffic");
    } else if (traffic === "medium") {
      score += 0.1;
    }

    // Lighting
    if (lighting === "poor") {
      score += 0.1;
      violations.push("Poor lighting");
    }

    // Surface
    if (surface === "broken") {
      score += 0.2;
      violations.push("Broken surface");
    } else if (surface === "uneven") {
      score += 0.1;
      violations.push("Uneven surface");
    }

    score = Math.min(1, score);
    const level = score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low";

    return { score, level, violations };
  };

  // ---------------- Before / After metrics for simulator ----------------
  const before = useMemo(() => {
    if (!selectedBlock) return null;
    const comp = computeCompliance(selectedBlock);
    const risk = computeRuleRisk(selectedBlock);
    return { comp, risk };
  }, [selectedBlock]);

  const [mlScenarioResult, setMlScenarioResult] = useState(null);

  // Scenario -> call /predict-ml with scenarioBlock
  useEffect(() => {
    if (!scenarioBlock) return;

    fetch(`${backendUrl}/predict-ml`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scenarioBlock),
    })
      .then((res) => res.json())
      .then((data) => {
        setMlScenarioResult(data);
      })
      .catch((err) => console.error("ML prediction error (scenario):", err));
  }, [scenarioBlock]);

  const after = useMemo(() => {
    if (!scenarioBlock) return null;
    const comp = computeCompliance(scenarioBlock);
    const risk = computeRuleRisk(scenarioBlock);

    return {
      comp,
      risk,
      ml: mlScenarioResult,
    };
  }, [scenarioBlock, mlScenarioResult]);

  // (Note: Removed old /model/predict useEffect – now everything uses /predict-ml.)

  // ---------------- Scenario PDF export (Before vs After) ----------------
  const exportScenarioPdf = async (originalBlock, scenarioBlock, viewMode) => {
    if (!originalBlock || !scenarioBlock) return;

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const now = new Date().toLocaleString();

    const toDataURL = async (url) => {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    };

    const safeFixed = (v, d = 2) =>
      typeof v === "number" && isFinite(v) ? v.toFixed(d) : "N/A";

    const getMlInfo = (b) => {
      if (!b) return { score: null, level: null };
      const score =
        typeof b.ml_risk_score === "number" && isFinite(b.ml_risk_score)
          ? b.ml_risk_score
          : null;
      const level = b.ml_risk_level || null;
      return { score, level };
    };

    const beforeComp = computeCompliance(originalBlock);
    const afterComp = computeCompliance(scenarioBlock);

    const beforeRisk = computeRuleRisk(originalBlock);
    const afterRisk = computeRuleRisk(scenarioBlock);

    // ML for BEFORE comes from the original block (if it has ML fields)
    const beforeMl = getMlInfo(originalBlock);

    // ML for AFTER should come from the latest mlScenarioResult
    const afterMl = mlScenarioResult
      ? {
          score:
            typeof mlScenarioResult.ml_risk_score === "number"
              ? mlScenarioResult.ml_risk_score
              : null,
          level: mlScenarioResult.ml_risk_level || null,
        }
      : getMlInfo(scenarioBlock); // fallback

    const deltaComp = afterComp.pct - beforeComp.pct;
    const deltaRisk = afterRisk.score - beforeRisk.score;
    const deltaMl =
      beforeMl.score !== null && afterMl.score !== null
        ? afterMl.score - beforeMl.score
        : null;

    const addHeader = async () => {
      try {
        const logoDataUrl = await toDataURL("/auramp-logo.png");
        doc.addImage(logoDataUrl, "PNG", 14, 10, 10, 10);
      } catch (e) {
        // logo optional
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("AURaMP - Scenario Impact Report", 27, 18);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Generated: ${now}`, 14, 25);
      doc.text(
        `View Mode: ${viewMode === "ml" ? "ML-based" : "Rule-based"}`,
        14,
        31
      );

      doc.setDrawColor(220);
      doc.line(14, 34, 196, 34);
    };

    const kv = (label, value, y) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value ?? "N/A"), 60, y);
    };

    const drawDelta = (x, y, text, positive = true) => {
      const w = 28;
      const h = 7;
      const color = positive ? [16, 185, 129] : [239, 68, 68];
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(x, y - h + 1, w, h, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(text, x + w / 2, y - 2, { align: "center" });
      doc.setTextColor(0, 0, 0);
    };

    await addHeader();

    // Block info
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Block Details", 14, 44);

    doc.setFontSize(10);
    kv("Name:", originalBlock.name, 52);
    kv("ID:", originalBlock.id, 58);

    // Summary
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Before vs After Summary", 14, 72);

    const boxY = 78;
    const boxW = 88;
    const boxH = 30;

    doc.setDrawColor(220);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, boxY, boxW, boxH, 3, 3, "FD");
    doc.roundedRect(108, boxY, boxW, boxH, 3, 3, "FD");

    // BEFORE box
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("BEFORE (Actual)", 18, boxY + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Compliance: ${beforeComp.pct}%`, 18, boxY + 16);
    doc.text(
      `Rule risk: ${safeFixed(beforeRisk.score)} (${beforeRisk.level})`,
      18,
      boxY + 23
    );
    doc.text(
      `ML risk: ${
        beforeMl.score !== null ? safeFixed(beforeMl.score) : "N/A"
      } (${beforeMl.level || "N/A"})`,
      18,
      boxY + 30
    );

    // AFTER box
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("AFTER (Scenario)", 112, boxY + 8);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Compliance: ${afterComp.pct}%`, 112, boxY + 16);
    doc.text(
      `Rule risk: ${safeFixed(afterRisk.score)} (${afterRisk.level})`,
      112,
      boxY + 23
    );
    doc.text(
      `ML risk: ${
        afterMl.score !== null ? safeFixed(afterMl.score) : "N/A"
      } (${afterMl.level || "Not evaluated"})`,
      112,
      boxY + 30
    );

    // Deltas
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Net Impact", 14, 120);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `Compliance change: ${beforeComp.pct}% -> ${afterComp.pct}%`,
      14,
      128
    );
    drawDelta(
      160,
      128,
      `${deltaComp >= 0 ? "+" : ""}${deltaComp}%`,
      deltaComp >= 0
    );

    doc.text(
      `Rule risk change: ${safeFixed(beforeRisk.score)} -> ${safeFixed(
        afterRisk.score
      )}`,
      14,
      136
    );
    drawDelta(
      160,
      136,
      `${deltaRisk <= 0 ? "" : "+"}${safeFixed(deltaRisk)}`,
      deltaRisk <= 0 // lower rule risk is good
    );

    if (deltaMl !== null) {
      doc.text(
        `ML risk change: ${safeFixed(beforeMl.score)} -> ${safeFixed(
          afterMl.score
        )}`,
        14,
        144
      );
      drawDelta(
        160,
        144,
        `${deltaMl <= 0 ? "" : "+"}${safeFixed(deltaMl)}`,
        deltaMl <= 0 // lower ML risk is good
      );
    } else {
      doc.text(
        "ML risk change: Not fully evaluated for this scenario.",
        14,
        144
      );
    }

    // Criteria comparison table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("CPWD Criteria - Before vs After", 14, 152);

    const bChecks = beforeComp.checks || [];
    const aChecks = afterComp.checks || [];

    let y = 160;
    const rowH = 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Criterion", 14, y);
    doc.text("Before", 110, y);
    doc.text("After", 145, y);
    doc.text("Change", 178, y);

    doc.setDrawColor(220);
    doc.line(14, y + 2, 196, y + 2);
    y += rowH;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const count = Math.max(bChecks.length, aChecks.length);

    for (let i = 0; i < count; i++) {
      if (y > 280) {
        doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text("AURaMP - Scenario Impact Report", 14, 16);
        doc.setDrawColor(220);
        doc.line(14, 20, 196, 20);
        y = 30;
      }

      const b = bChecks[i] || {};
      const a = aChecks[i] || {};
      const label = String(b.label || a.label || `Criterion ${i + 1}`)
        .replace(/≥/g, ">=")
        .replace(/≤/g, "<=");

      const beforeStatus = b.ok ? "PASS" : "FAIL";
      const afterStatus = a.ok ? "PASS" : "FAIL";
      const change =
        beforeStatus === afterStatus ? "-" : `${beforeStatus} -> ${afterStatus}`;

      const wrapped = doc.splitTextToSize(label, 90);
      doc.text(wrapped, 14, y);

      doc.text(beforeStatus, 110, y);
      doc.text(afterStatus, 145, y);

      if (change.includes("FAIL -> PASS")) {
        doc.setTextColor(16, 185, 129);
      } else if (change.includes("PASS -> FAIL")) {
        doc.setTextColor(239, 68, 68);
      } else {
        doc.setTextColor(120);
      }
      doc.text(change, 178, y, { align: "right" });
      doc.setTextColor(0);

      y += Math.max(rowH, wrapped.length * 4.5);
    }

    // Scenario changes list
    y += 6;
    if (y > 280) {
      doc.addPage();
      y = 30;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Scenario Changes Applied", 14, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const changes = [];
    const pushIfChanged = (label, beforeVal, afterVal) => {
      if (String(beforeVal) !== String(afterVal)) {
        changes.push(`${label}: ${beforeVal} -> ${afterVal}`);
      }
    };

    pushIfChanged(
      "Sidewalk width (m)",
      originalBlock.sidewalk_width_m,
      scenarioBlock.sidewalk_width_m
    );
    pushIfChanged(
      "Slope (%)",
      originalBlock.slope_percent,
      scenarioBlock.slope_percent
    );
    pushIfChanged(
      "Curb ramp",
      originalBlock.has_curb_ramp,
      scenarioBlock.has_curb_ramp
    );
    pushIfChanged(
      "Surface",
      originalBlock.surface_quality,
      scenarioBlock.surface_quality
    );
    pushIfChanged(
      "Lighting",
      originalBlock.lighting_quality,
      scenarioBlock.lighting_quality
    );

    if (!changes.length) {
      changes.push("No parameter changes detected (scenario equals original).");
    }

    changes.slice(0, 10).forEach((c) => {
      doc.text(`- ${c}`, 14, y);
      y += 6;
    });

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      "Note: Scenario results are simulated using available attributes and rule logic. Field verification may be required.",
      14,
      292
    );
    doc.setTextColor(0);

    doc.save(`AURaMP_Scenario_${originalBlock.id}.pdf`);
  };

  // ---------------- JSX ----------------
  return (
    <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6 p-6 overflow-y-auto border-r border-slate-800 bg-slate-900 h-[calc(100vh-64px)]">
      {/* View mode */}
      <section>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          View Mode
          <div className="group relative flex cursor-help">
            <span className="w-4 h-4 rounded-full border border-slate-600 text-[10px] flex items-center justify-center text-slate-400 hover:bg-slate-700 transition-colors">
              i
            </span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1.5 text-xs bg-slate-800 text-slate-200 rounded opacity-0 group-hover:opacity-100 transition-opacity w-48 text-center pointer-events-none border border-slate-700 shadow-xl z-50">
              {viewMode === "ml"
                ? "Uses machine learning predictions"
                : "Uses fixed accessibility standards"}
            </span>
          </div>
        </h3>
        <div className="bg-slate-800 p-1 rounded-lg flex relative">
          <div
            className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md transition-all duration-300 ease-out shadow-sm ${
              viewMode === "ml"
                ? "translate-x-[calc(100%+4px)] bg-indigo-500/80"
                : "translate-x-0 bg-blue-500/80"
            }`}
          />
          <button
            onClick={() => setViewMode("rule")}
            className={`flex-1 relative z-10 py-1.5 text-sm font-medium transition-colors duration-300 ${
              viewMode === "rule"
                ? "text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Rule-based
          </button>
          <button
            onClick={() => setViewMode("ml")}
            className={`flex-1 relative z-10 py-1.5 text-sm font-medium transition-colors duration-300 ${
              viewMode === "ml"
                ? "text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            ML-based
          </button>
        </div>
      </section>

      {/* Risk Filter */}
      <section>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Risk Filter
        </h3>
        <div className="p-1 rounded-lg bg-slate-800/50 flex gap-1">
          <FilterButton value="all" label="All" />
          <FilterButton value="high" label="High" colorClass="bg-red-500" />
          <FilterButton
            value="medium"
            label="Medium"
            colorClass="bg-amber-500"
          />
          <FilterButton value="low" label="Low" colorClass="bg-emerald-500" />
        </div>
      </section>

      {/* Compliance Filter */}
      <section>
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Compliance Filter
        </h3>

        <button
          onClick={() => setOnlyNonCompliant((v) => !v)}
          className={`w-full px-3 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
            onlyNonCompliant
              ? "bg-rose-500/15 border-rose-500/30 text-rose-200 shadow-[0_0_20px_rgba(244,63,94,0.12)]"
              : "bg-slate-800/40 border-slate-800 text-slate-300 hover:bg-slate-800/70"
          }`}
        >
          <div className="flex items-center justify-between">
            <span>
              {onlyNonCompliant ? "Non-compliant only" : "Show all blocks"}
            </span>

            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${
                onlyNonCompliant
                  ? "border-rose-500/30 text-rose-200"
                  : "border-slate-700 text-slate-400"
              }`}
            >
              {onlyNonCompliant ? "ON" : "OFF"}
            </span>
          </div>

          <div className="text-[11px] text-slate-500 mt-1 text-left">
            Filters blocks that fail at least one CPWD compliance check.
          </div>
        </button>
      </section>
            {/* Priority Intervention Engine (Ward-level) */}
      {wards.length > 0 && (
        <section className="bg-slate-800/40 rounded-xl p-4 border border-slate-800">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Priority Intervention Engine
          </h3>

          {/* Ward selector */}
          <div className="mb-3">
            <label className="block text-[11px] text-slate-400 mb-1">
              Ward / Zone
            </label>
            <select
              value={selectedWard}
              onChange={(e) => setSelectedWard(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select ward</option>
              {wards.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>

          {/* Run button */}
          <button
            onClick={runPriorityEngine}
            disabled={!selectedWard || priorityLoading}
            className={`w-full px-3 py-2 rounded-lg text-xs font-semibold border transition ${
              !selectedWard || priorityLoading
                ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
                : "bg-emerald-500/15 border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25"
            }`}
          >
            {priorityLoading
              ? "Analyzing ward..."
              : "Run Priority Engine for Ward"}
          </button>

          {/* Error */}
          {priorityError && (
            <p className="mt-2 text-[11px] text-rose-300">{priorityError}</p>
          )}

          {/* Results */}
          {priorityResult && (
            <div className="mt-3 space-y-3">
              {/* Ward summary */}
              <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3">
                <div className="text-[11px] text-slate-400 mb-1">
                  Ward Summary – {priorityResult.summary.ward}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <div>
                    <div className="text-slate-400">Segments</div>
                    <div className="font-mono text-slate-100">
                      {priorityResult.summary.segments_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Avg Risk</div>
                    <div className="font-mono text-slate-100">
                      {priorityResult.summary.avg_risk.toFixed(1)} / 100
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Avg Compliance</div>
                    <div className="font-mono text-slate-100">
                      {priorityResult.summary.avg_compliance.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Critical / High</div>
                    <div className="font-mono">
                      <span className="text-red-400">
                        {priorityResult.summary.critical_count}
                      </span>{" "}
                      /{" "}
                      <span className="text-amber-400">
                        {priorityResult.summary.high_count}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ranked segments */}
              <div className="rounded-lg bg-slate-900/70 border border-slate-800 p-3 max-h-56 overflow-y-auto">
                <div className="text-[11px] text-slate-400 mb-2">
                  Ranked Segments (highest priority first)
                </div>
                <div className="space-y-2">
                 {priorityResult.segments.map((seg) => {
  const level = seg.priority_level;
  const colorClass =
    level === "Critical"
      ? "bg-red-500/20 text-red-200"
      : level === "High"
      ? "bg-amber-500/20 text-amber-200"
      : level === "Medium"
      ? "bg-yellow-500/20 text-yellow-200"
      : "bg-emerald-500/20 text-emerald-200";

  const blockForSeg = (blocks || []).find((b) => b.id === seg.id);
  const displayName = seg.name || blockForSeg?.name || `Segment ${seg.id}`;
return (
  <div
    key={seg.id}
    onClick={() => {
      if (blockForSeg && onSelectBlock) {
        onSelectBlock(blockForSeg);
      }
    }}
    className="rounded-md border border-slate-800 bg-slate-950/80 p-2 text-[11px] cursor-pointer hover:border-emerald-400/50 hover:bg-slate-900 transition-colors"
  >
    <div className="flex items-center justify-between mb-1">
      <div className="flex flex-col">
        <span className="font-semibold text-slate-100">
          {displayName}
        </span>
        <span className="text-[10px] text-slate-500">
          ID: {seg.id}
        </span>
      </div>
      <span className={`px-2 py-0.5 rounded-full ${colorClass}`}>
        {level} · {seg.priority_score.toFixed(1)}
      </span>
    </div>

    {seg.priority_explanation && seg.priority_explanation.length > 0 && (
      <div className="mt-2 mb-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          Top Drivers
        </div>
        <ul className="list-disc list-inside text-slate-300 space-y-0.5">
          {seg.priority_explanation.slice(0, 3).map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>
    )}

    {seg.recommended_actions && seg.recommended_actions.length > 0 && (
      <div className="mt-2">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
          Recommended Actions
        </div>
        <ul className="list-disc list-inside text-slate-300 space-y-0.5">
          {seg.recommended_actions.slice(0, 2).map((a, idx) => (
            <li key={idx}>{a}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);
})}
  
                   
                </div>
              </div>
            </div>
          )}
        </section>
      )}          
           {/* AI Explanation for Selected Block */}
      {selectedBlock && (
        <section className={`rounded-xl p-4 border transition-colors duration-300 ${
          viewMode === "ml"
            ? "bg-indigo-900/10 border-indigo-800/50"
            : "bg-slate-800/40 border-slate-800"
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              AI Risk Explanation (Selected Block)
            </h3>
            {viewMode === "ml" && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                AI Prediction Mode
              </span>
            )}
          </div>

          <div className="text-sm text-slate-200 mb-1">
            {selectedBlock.name}{" "}
            <span className="text-xs text-slate-500">({selectedBlock.id})</span>
          </div>

          {mlScoreSelected !== null && (
  <div className="mb-2 space-y-1">
    <p className="text-xs text-slate-300">
      ML risk level:{" "}
      <span
        className={
          mlLevelSelected === "high"
            ? "text-red-400 font-semibold"
            : mlLevelSelected === "medium"
            ? "text-amber-300 font-semibold"
            : "text-emerald-300 font-semibold"
        }
      >
        {mlLevelSelected ? mlLevelSelected.toUpperCase() : "UNKNOWN"}
      </span>{" "}
      <span className="text-[11px] text-slate-400">
        (risk index {(mlScoreSelected * 100).toFixed(0)} / 100)
      </span>
    </p>

    {mlConfSelected !== null && (
      <p className={`text-[11px] ${viewMode === "ml" ? "text-indigo-300 text-xs font-medium mt-1" : "text-slate-400"}`}>
        Model confidence in this classification:{" "}
        <span className={`font-mono ${viewMode === "ml" ? "text-indigo-100 text-sm font-bold" : "text-slate-100"}`}>
          {(mlConfSelected * 100).toFixed(1)}%
        </span>
      </p>
    )}

    {mlProbsSelected && (
      <div className={`grid grid-cols-3 gap-1 ${
        viewMode === "ml"
          ? "text-xs text-indigo-200 bg-indigo-900/30 p-2 rounded-lg border border-indigo-800/50 mt-3"
          : "text-[10px] text-slate-400 mt-1"
      }`}>
        <div>
          Low{" "}
          <span className={`font-mono ${viewMode === "ml" ? "text-white font-bold" : "text-slate-200"}`}>
            {((mlProbsSelected.low ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
        <div>
          Med{" "}
          <span className={`font-mono ${viewMode === "ml" ? "text-white font-bold" : "text-slate-200"}`}>
            {((mlProbsSelected.medium ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
        <div>
          High{" "}
          <span className={`font-mono ${viewMode === "ml" ? "text-white font-bold" : "text-slate-200"}`}>
            {((mlProbsSelected.high ?? 0) * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    )}
  </div>
)}

          {loadingSelectedExplain && (
            <p className="text-xs text-slate-400 italic">
              Analyzing key factors…
            </p>
          )}

          {selectedExplainError && (
            <p className="text-xs text-red-400">{selectedExplainError}</p>
          )}

          {!loadingSelectedExplain &&
            !selectedExplainError &&
            mlExplainSelected.length > 0 && (
              <div className="space-y-3">
                {/* Risk drivers */}
                {riskIncreasingSelected.length > 0 && (
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1">
                      <span className="font-semibold text-slate-100">
                        Risk drivers
                      </span>{" "}
                      (features that <span className="text-red-300">
                        increase
                      </span>{" "}
                      risk):
                    </p>
                    <ExplanationBars
                      explanation={riskIncreasingSelected}
                      prettyFeatureName={prettyFeatureName}
                    />
                  </div>
                )}

                {/* Protective factors */}
                {riskReducingSelected.length > 0 && (
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1 mt-1">
                      <span className="font-semibold text-slate-100">
                        Protective factors
                      </span>{" "}
                      (features that{" "}
                      <span className="text-emerald-300">reduce</span> risk):
                    </p>
                    <ExplanationBars
                      explanation={riskReducingSelected}
                      prettyFeatureName={prettyFeatureName}
                    />
                  </div>
                )}
              </div>
            )}

          {!loadingSelectedExplain &&
            !selectedExplainError &&
            mlExplainSelected.length === 0 && (
              <p className="text-xs text-slate-400">
                No detailed explanation available for this block.
              </p>
            )}
        </section>
      )}

      {/* Scenario Simulator */}
      <section className={`rounded-xl p-4 border transition-colors duration-300 ${
        viewMode === "rule"
          ? "bg-blue-900/10 border-blue-800/50"
          : "bg-indigo-900/10 border-indigo-800/50"
      }`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            What-If Scenario Simulator
          </h3>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            viewMode === "rule"
              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
              : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
          }`}>
            {viewMode === "rule" ? "Rule-based Analysis" : "AI Prediction Mode"}
          </span>
        </div>

        {!selectedBlock || !scenarioBlock || !before || !after ? (
          <div className="text-sm text-slate-400">
            Click a block on the map to simulate improvements.
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-semibold text-slate-200">
                {selectedBlock.name}
              </div>
              <div className="text-xs text-slate-500">
                ID: {selectedBlock.id}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className={`rounded-lg p-3 border transition-colors duration-300 ${
                viewMode === "rule" ? "bg-blue-900/20 border-blue-800/50" : "bg-slate-900/60 border-slate-800"
              }`}>
                <div className="text-[11px] text-slate-500 uppercase tracking-wider">
                  Before
                </div>
                <div className={`mt-2 text-xs ${viewMode === "rule" ? "text-blue-200 font-medium" : "text-slate-300"}`}>
                  Compliance:{" "}
                  <span className={`font-mono ${viewMode === "rule" ? "text-white text-sm font-bold" : "text-slate-100"}`}>
                    {before.comp.pct}%
                  </span>
                </div>
                <div className={`mt-1 text-xs ${viewMode === "rule" ? "text-blue-200" : "text-slate-300"}`}>
                  Rule risk:{" "}
                  <span className="font-mono text-slate-100">
                    {before.risk.score.toFixed(2)}
                  </span>{" "}
                  <span className="text-slate-400">
                    ({before.risk.level})
                  </span>
                </div>
                <div className={`mt-1 text-xs ${viewMode === "ml" ? "text-indigo-300 font-medium" : "text-slate-300"}`}>
                  ML risk:{" "}
                  <span className={`font-mono ${viewMode === "ml" ? "text-white text-sm font-bold" : "text-slate-100"}`}>
                    {selectedBlock.ml_risk_score?.toFixed
                      ? selectedBlock.ml_risk_score.toFixed(2)
                      : selectedBlock.ml_risk_score}
                  </span>{" "}
                  <span className={viewMode === "ml" ? "text-indigo-200" : "text-slate-400"}>
                    ({selectedBlock.ml_risk_level})
                  </span>
                  {viewMode === "ml" && <span className="ml-1 text-[9px] bg-indigo-500/30 text-indigo-200 px-1 rounded border border-indigo-500/30">AI</span>}
                </div>
              </div>

              <div className={`rounded-lg p-3 border transition-colors duration-300 ${
                viewMode === "rule" ? "bg-blue-900/20 border-blue-800/50" : "bg-slate-900/60 border-slate-800"
              }`}>
                <div className="text-[11px] text-slate-500 uppercase tracking-wider">
                  After
                </div>
                <div className={`mt-2 text-xs ${viewMode === "rule" ? "text-blue-200 font-medium" : "text-slate-300"}`}>
                  Compliance:{" "}
                  <span className={`font-mono ${viewMode === "rule" ? "text-white text-sm font-bold" : "text-slate-100"}`}>
                    {after.comp.pct}%
                  </span>
                </div>
                <div className={`mt-1 text-xs ${viewMode === "rule" ? "text-blue-200" : "text-slate-300"}`}>
                  Rule risk:{" "}
                  <span className="font-mono text-slate-100">
                    {after.risk.score.toFixed(2)}
                  </span>{" "}
                  <span className="text-slate-400">
                    ({after.risk.level})
                  </span>
                </div>
                <div className={`mt-1 text-xs ${viewMode === "ml" ? "text-indigo-300 font-medium" : "text-slate-300"}`}>
                  ML risk:{" "}
                  <span className={`font-mono ${viewMode === "ml" ? "text-white text-sm font-bold" : "text-slate-100"}`}>
                    {after.ml?.ml_risk_score?.toFixed
                      ? after.ml.ml_risk_score.toFixed(2)
                      : after.ml?.ml_risk_score}
                  </span>{" "}
                  <span className={viewMode === "ml" ? "text-indigo-200" : "text-slate-400"}>
                    ({after.ml?.ml_risk_level})
                  </span>
                  {viewMode === "ml" && <span className="ml-1 text-[9px] bg-indigo-500/30 text-indigo-200 px-1 rounded border border-indigo-500/30">AI</span>}
                </div>
              </div>
            </div>

            
              
            <div className="space-y-3">
              {/* Width */}
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Sidewalk width (m)</span>
                  <span className="font-mono text-slate-100">
                    {Number(scenarioBlock.sidewalk_width_m).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.05"
                  value={scenarioBlock.sidewalk_width_m}
                  onChange={(e) =>
                    setScenarioBlock((s) => ({
                      ...s,
                      sidewalk_width_m: Number(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </div>

              {/* Slope */}
              <div>
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Slope (%)</span>
                  <span className="font-mono text-slate-100">
                    {Number(scenarioBlock.slope_percent).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="0.25"
                  value={scenarioBlock.slope_percent}
                  onChange={(e) =>
                    setScenarioBlock((s) => ({
                      ...s,
                      slope_percent: Number(e.target.value),
                    }))
                  }
                  className="w-full"
                />
              </div>

              {/* Ramp */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-300">Curb ramp</div>
                <button
                  onClick={() =>
                    setScenarioBlock((s) => ({
                      ...s,
                      has_curb_ramp:
                        String(s.has_curb_ramp).toLowerCase() === "yes"
                          ? "no"
                          : "yes",
                    }))
                  }
                  className={`px-3 py-1 rounded-md text-xs font-semibold border transition ${
                    String(scenarioBlock.has_curb_ramp).toLowerCase() === "yes"
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
                      : "bg-rose-500/15 border-rose-500/30 text-rose-200"
                  }`}
                >
                  {String(scenarioBlock.has_curb_ramp).toLowerCase() === "yes"
                    ? "Yes"
                    : "No"}
                </button>
              </div>

              {/* Surface */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-300">Surface</div>
                <select
                  value={scenarioBlock.surface_quality}
                  onChange={(e) =>
                    setScenarioBlock((s) => ({
                      ...s,
                      surface_quality: e.target.value,
                    }))
                  }
                  className="bg-slate-900/60 border border-slate-800 rounded-md text-xs text-slate-200 px-2 py-1"
                >
                  <option value="smooth">smooth</option>
                  <option value="uneven">uneven</option>
                  <option value="broken">broken</option>
                </select>
              </div>

              {/* Lighting */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-slate-300">Lighting</div>
                <select
                  value={scenarioBlock.lighting_quality}
                  onChange={(e) =>
                    setScenarioBlock((s) => ({
                      ...s,
                      lighting_quality: e.target.value,
                    }))
                  }
                  className="bg-slate-900/60 border border-slate-800 rounded-md text-xs text-slate-200 px-2 py-1"
                >
                  <option value="good">good</option>
                  <option value="average">average</option>
                  <option value="poor">poor</option>
                </select>
              </div>

              {/* Reset */}
              <button
                onClick={() => setScenarioBlock(selectedBlock)}
                className="w-full mt-2 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-900 transition"
              >
                Reset to Actual Data
              </button>

              {/* Export PDF */}
              <button
                onClick={() =>
                  exportScenarioPdf(selectedBlock, scenarioBlock, viewMode)
                }
                disabled={!selectedBlock || !scenarioBlock}
                className={`w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold transition border ${
                  !selectedBlock || !scenarioBlock
                    ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-500/15 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/20"
                }`}
              >
                Export Before vs After PDF
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Legend */}
      <section className="bg-slate-800/40 rounded-xl p-4 border border-slate-800">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Legend
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]"></span>
              <span className="text-slate-300">High Risk</span>
            </div>
            <span className="text-xs text-slate-500">Critical attention</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]"></span>
              <span className="text-slate-300">Medium Risk</span>
            </div>
            <span className="text-xs text-slate-500">Needs improvement</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></span>
              <span className="text-slate-300">Low Risk</span>
            </div>
            <span className="text-xs text-slate-500">Accessible</span>
          </div>
        </div>
      </section>

      {/* Feature importance */}
      {featureImportance.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            ML Feature Importance
            <span className="group relative flex cursor-help">
              <span className="w-4 h-4 rounded-full border border-slate-600 text-[10px] flex items-center justify-center text-slate-400">
                ?
              </span>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-slate-800 text-slate-200 rounded opacity-0 group-hover:opacity-100 transition-opacity w-48 text-center pointer-events-none border border-slate-700 z-50">
                Higher values indicate greater influence on the risk model.
              </span>
            </span>
          </h3>
          <div className="space-y-3">
            {featureImportance.map((f) => (
              <div key={f.name} className="group">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300 capitalize group-hover:text-white transition-colors">
                    {f.name.replace(/_/g, " ")}
                  </span>
                  <span className="text-slate-500 font-mono">
                    {(f.normalized_importance * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out"
                    style={{
                      width: `${Math.round(
                        f.normalized_importance * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ---------------- Reusable XAI bar component ----------------
const ExplanationBars = ({ explanation, prettyFeatureName }) => {
  if (!explanation || explanation.length === 0) return null;

  // Find the largest absolute impact so we can normalize everything to 0–100%
  const maxImpact =
    Math.max(...explanation.map((e) => Math.abs(e.impact))) || 1;

  return (
    <div className="space-y-1.5">
      {explanation.map((item, idx) => {
        const absImpact = Math.abs(item.impact);

        // Relative importance (0–1)
        const relative = absImpact / maxImpact;

        // For the bar width
        const widthPercent = relative * 100;

        // What we show next to the feature name
        const labelPercent = (relative * 100).toFixed(1); // e.g. 72.3%

        const isRiskIncreasing = item.impact > 0;

        return (
          <div key={idx} className="flex flex-col gap-0.5">
            <div className="flex justify-between text-[11px] text-slate-300">
              <span>{prettyFeatureName(item.feature)}</span>
              <span
                className={
                  isRiskIncreasing ? "text-red-300" : "text-emerald-300"
                }
              >
                {isRiskIncreasing ? "+" : "-"}
                {labelPercent}%
              </span>
            </div>
            <div className="w-full bg-slate-700/80 rounded-full h-1.5 overflow-hidden">
              <div
                className={
                  "h-1.5 rounded-full transition-all duration-500 " +
                  (isRiskIncreasing ? "bg-red-500" : "bg-emerald-500")
                }
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Sidebar;