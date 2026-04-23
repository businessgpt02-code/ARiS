import { useMemo, useState } from "react";
import RiskBadge from "./RiskBadge";
import { computeCompliance, CPWD } from "../utils/compliance";

// --- Rule-based risk (JS mirror of your backend rules) ---
function computeRuleRisk(b) {
  const violations = [];
  let score = 0;

  const width = Number(b.sidewalk_width_m);
  const slope = Number(b.slope_percent);
  const hasRamp = String(b.has_curb_ramp).toLowerCase();
  const traffic = String(b.traffic_level).toLowerCase();
  const lighting = String(b.lighting_quality).toLowerCase();
  const surface = String(b.surface_quality).toLowerCase();

  // 1) Sidewalk width (same thresholds as your current backend)
  if (width < 0.9) {
    violations.push("Very narrow sidewalk (< 0.9m)");
    score += 0.35;
  } else if (width < 1.2) {
    violations.push("Sub-minimum sidewalk width (< 1.2m)");
    score += 0.25;
  } else if (width < 1.5) {
    violations.push("Below recommended sidewalk width (< 1.5m)");
    score += 0.1;
  }

  // 2) Slope
  if (slope > 10) {
    violations.push("Very steep slope (> 10%)");
    score += 0.3;
  } else if (slope > 8) {
    violations.push("Steep slope (> 8%)");
    score += 0.2;
  } else if (slope > 5) {
    violations.push("Moderate slope (> 5%)");
    score += 0.1;
  }

  // 3) Curb ramp
  if (hasRamp === "no") {
    violations.push("Missing curb ramp at crossing");
    score += 0.2;
  } else if (hasRamp !== "yes") {
    violations.push("Unknown curb ramp condition");
    score += 0.05;
  }

  // 4) Traffic
  if (traffic === "high") {
    violations.push("High traffic road");
    score += 0.2;
  } else if (traffic === "medium") {
    score += 0.1;
  }

  // 5) Lighting
  if (lighting === "poor") {
    violations.push("Poor street lighting");
    score += 0.1;
  }

  // 6) Surface
  if (surface === "broken") {
    violations.push("Broken / highly uneven surface");
    score += 0.2;
  } else if (surface === "uneven") {
    violations.push("Uneven surface");
    score += 0.1;
  }

  score = Math.min(score, 1.0);
  const level = score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low";

  if (!violations.length) {
    violations.push("No major accessibility violations detected (based on available data).");
  }

  return { score, level, reasons: violations };
}

const ComplianceBadge = ({ ok }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
      ok
        ? "bg-emerald-500/15 text-emerald-700 border-emerald-200"
        : "bg-rose-500/15 text-rose-700 border-rose-200"
    }`}
  >
    {ok ? "Compliant" : "Non-compliant"}
  </span>
);

export default function BlockPopup({ block, viewMode, exportBlockPdf }) {
  // Scenario state = editable copy of block attributes
  const [scenario, setScenario] = useState(() => ({
    sidewalk_width_m: block.sidewalk_width_m,
    slope_percent: block.slope_percent,
    has_curb_ramp: block.has_curb_ramp,
    traffic_level: block.traffic_level,
    lighting_quality: block.lighting_quality,
    surface_quality: block.surface_quality,
  }));

  const resetScenario = () =>
    setScenario({
      sidewalk_width_m: block.sidewalk_width_m,
      slope_percent: block.slope_percent,
      has_curb_ramp: block.has_curb_ramp,
      traffic_level: block.traffic_level,
      lighting_quality: block.lighting_quality,
      surface_quality: block.surface_quality,
    });

  // BEFORE metrics (actual)
  const beforeCompliance = useMemo(() => computeCompliance(block), [block]);
  const beforeRule = useMemo(() => computeRuleRisk(block), [block]);

  // AFTER metrics (scenario)
  const scenarioBlock = useMemo(() => ({ ...block, ...scenario }), [block, scenario]);
  const afterCompliance = useMemo(() => computeCompliance(scenarioBlock), [scenarioBlock]);
  const afterRule = useMemo(() => computeRuleRisk(scenarioBlock), [scenarioBlock]);

  const deltaCompliance = afterCompliance.pct - beforeCompliance.pct;
  const deltaRisk = (afterRule.score - beforeRule.score);

  const effectiveRisk = viewMode === "ml"
    ? { score: block.ml_risk_score, level: block.ml_risk_level }
    : { score: block.risk_score, level: block.risk_level };

  return (
    <div className="p-1">
      <h2 className="font-bold text-base mb-2 text-slate-900">{block.name}</h2>

      {/* Existing cards (keep as-is, but safe toFixed) */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded border border-slate-100">
          <span className="text-slate-600">Rule-based</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">
              {typeof block.risk_score === "number" ? block.risk_score.toFixed(2) : "N/A"}
            </span>
            <RiskBadge level={block.risk_level} />
          </div>
        </div>

        <div className="flex items-center justify-between text-sm bg-slate-50 p-2 rounded border border-slate-100">
          <span className="text-slate-600">ML-predicted</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">
              {block.ml_risk_score?.toFixed ? block.ml_risk_score.toFixed(2) : (block.ml_risk_score ?? "N/A")}
            </span>
            <RiskBadge level={block.ml_risk_level} />
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Active view:{" "}
          <span className="font-semibold text-slate-700">
            {viewMode === "ml" ? "ML-based" : "Rule-based"}
          </span>
        </div>
      </div>

      {/* ✅ Scenario Simulator */}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-slate-900">What-If Scenario Simulator</h4>
          <button
            onClick={resetScenario}
            className="text-xs px-2 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Reset
          </button>
        </div>

        {/* Controls */}
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>Sidewalk width (m)</span>
              <span className="font-mono">{Number(scenario.sidewalk_width_m).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.6"
              max="2.5"
              step="0.05"
              value={scenario.sidewalk_width_m}
              onChange={(e) => setScenario(s => ({ ...s, sidewalk_width_m: Number(e.target.value) }))}
              className="w-full"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              CPWD min clear width (reference): {CPWD.MIN_CLEAR_WIDTH_M}m
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>Slope (%)</span>
              <span className="font-mono">{Number(scenario.slope_percent).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="15"
              step="0.25"
              value={scenario.slope_percent}
              onChange={(e) => setScenario(s => ({ ...s, slope_percent: Number(e.target.value) }))}
              className="w-full"
            />
            <div className="text-[11px] text-slate-500 mt-1">
              CPWD ramp reference slope: 1:12 (~{CPWD.MAX_SLOPE_PERCENT}%)
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-600">
              Curb ramp
              <select
                className="mt-1 w-full text-sm rounded-lg border border-slate-200 p-2"
                value={String(scenario.has_curb_ramp).toLowerCase()}
                onChange={(e) => setScenario(s => ({ ...s, has_curb_ramp: e.target.value }))}
              >
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </label>

            <label className="text-xs text-slate-600">
              Surface
              <select
                className="mt-1 w-full text-sm rounded-lg border border-slate-200 p-2"
                value={String(scenario.surface_quality).toLowerCase()}
                onChange={(e) => setScenario(s => ({ ...s, surface_quality: e.target.value }))}
              >
                <option value="smooth">smooth</option>
                <option value="uneven">uneven</option>
                <option value="broken">broken</option>
              </select>
            </label>

            <label className="text-xs text-slate-600">
              Lighting
              <select
                className="mt-1 w-full text-sm rounded-lg border border-slate-200 p-2"
                value={String(scenario.lighting_quality).toLowerCase()}
                onChange={(e) => setScenario(s => ({ ...s, lighting_quality: e.target.value }))}
              >
                <option value="good">good</option>
                <option value="average">average</option>
                <option value="poor">poor</option>
              </select>
            </label>

            <label className="text-xs text-slate-600">
              Traffic
              <select
                className="mt-1 w-full text-sm rounded-lg border border-slate-200 p-2"
                value={String(scenario.traffic_level).toLowerCase()}
                onChange={(e) => setScenario(s => ({ ...s, traffic_level: e.target.value }))}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
          </div>
        </div>

        {/* Before vs After summary */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 p-2 bg-slate-50">
            <div className="text-[11px] font-semibold text-slate-600 uppercase">Before</div>
            <div className="text-sm mt-1 flex items-center justify-between">
              <span className="text-slate-700">Compliance</span>
              <span className="font-mono">{beforeCompliance.pct}%</span>
            </div>
            <div className="text-sm mt-1 flex items-center justify-between">
              <span className="text-slate-700">Rule Risk</span>
              <span className="font-mono">{beforeRule.score.toFixed(2)}</span>
            </div>
            <div className="mt-2"><RiskBadge level={beforeRule.level} /></div>
          </div>

          <div className="rounded-lg border border-slate-200 p-2 bg-white">
            <div className="text-[11px] font-semibold text-slate-600 uppercase">After (Scenario)</div>
            <div className="text-sm mt-1 flex items-center justify-between">
              <span className="text-slate-700">Compliance</span>
              <span className="font-mono">{afterCompliance.pct}%</span>
            </div>
            <div className="text-sm mt-1 flex items-center justify-between">
              <span className="text-slate-700">Rule Risk</span>
              <span className="font-mono">{afterRule.score.toFixed(2)}</span>
            </div>
            <div className="mt-2"><RiskBadge level={afterRule.level} /></div>
          </div>
        </div>

        {/* Delta */}
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="text-slate-600">
            Δ Compliance:{" "}
            <span className={`font-mono font-semibold ${deltaCompliance >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {deltaCompliance >= 0 ? "+" : ""}{deltaCompliance}%
            </span>
          </div>
          <div className="text-slate-600">
            Δ Risk:{" "}
            <span className={`font-mono font-semibold ${deltaRisk <= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {deltaRisk >= 0 ? "+" : ""}{deltaRisk.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Existing CPWD Scorecard (keep your current one if you want) */}
      {/* (Optional) You can keep your existing CPWD scorecard section below this simulator */}

      {/* Export PDF (your existing feature) */}
      <button
        onClick={() => exportBlockPdf(block, viewMode)}
        className="mt-4 w-full rounded-lg bg-slate-900 text-white text-sm font-semibold py-2 hover:bg-slate-800 transition"
      >
        Export Compliance Report (PDF)
      </button>
    </div>
  );
}
