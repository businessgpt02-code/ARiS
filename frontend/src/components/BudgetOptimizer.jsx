import React, { useMemo, useState } from "react";
import { computeCompliance } from "../utils/compliance";

const backendUrl = "http://127.0.0.1:8000";

const levelBadgeClass = (level) => {
  switch (level) {
    case "Critical":
      return "bg-red-500/20 text-red-200 border-red-500/30";
    case "High":
      return "bg-amber-500/20 text-amber-200 border-amber-500/30";
    case "Medium":
      return "bg-yellow-500/20 text-yellow-200 border-yellow-500/30";
    case "Low":
      return "bg-emerald-500/20 text-emerald-200 border-emerald-500/30";
    default:
      return "bg-slate-500/20 text-slate-200 border-slate-500/30";
  }
};

const BudgetOptimizer = ({ blocks = [], viewMode = "ml", onSelectBlock }) => {
  const [selectedWard, setSelectedWard] = useState("");
  const [budget, setBudget] = useState(1000000);
  const [optimizerResult, setOptimizerResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const wards = useMemo(() => {
    const set = new Set();
    (blocks || []).forEach((b) => {
      if (b.ward) set.add(b.ward);
    });
    return Array.from(set).sort();
  }, [blocks]);

  const runOptimizer = async () => {
    if (!selectedWard || !budget) return;

    try {
      setLoading(true);
      setError(null);

      const wardBlocks = (blocks || []).filter((b) => b.ward === selectedWard);

      if (!wardBlocks.length) {
        setError("No segments found for this ward.");
        setOptimizerResult(null);
        return;
      }

      const segmentsPayload = wardBlocks.map((b) => {
        const comp = computeCompliance(b);

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

        const lightingQuality = String(b.lighting_quality || "").toLowerCase();
        const lighting = lightingQuality === "poor" ? 0 : 1;

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
          risk_score: riskScore,
          compliance_score: comp.pct,
          sidewalk_width: b.sidewalk_width_m,
          lighting,
          traffic_speed,
          near_school: !!b.near_school,
          near_hospital: !!b.near_hospital,
        };
      });

      const res = await fetch(`${backendUrl}/budget-optimizer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ward: selectedWard,
          budget: Number(budget),
          segments: segmentsPayload,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Backend error ${res.status}`);
      }

      const data = await res.json();
      setOptimizerResult(data);
    } catch (err) {
      console.error("Budget optimizer error:", err);
      setError("Could not run budget optimization.");
      setOptimizerResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-[calc(100vh-112px)] overflow-y-auto bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white">
            City Planning Dashboard
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Optimize intervention selection under a limited budget.
          </p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">
            Budget Optimizer Inputs
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
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

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Available Budget
              </label>
              <input
                type="number"
                min="0"
                step="10000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={runOptimizer}
                disabled={!selectedWard || !budget || loading}
                className={`w-full px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                  !selectedWard || !budget || loading
                    ? "bg-slate-900/40 border-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-500/15 border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/25"
                }`}
              >
                {loading ? "Optimizing..." : "Run Budget Optimizer"}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-3 text-[11px] text-rose-300">{error}</p>
          )}
        </div>

        {optimizerResult && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Ward
                </div>
                <div className="mt-2 text-xl font-bold text-white">
                  {optimizerResult.ward}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Budget
                </div>
                <div className="mt-2 text-xl font-bold text-white">
                  ₹{Number(optimizerResult.summary.total_budget).toLocaleString()}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Budget Used
                </div>
                <div className="mt-2 text-xl font-bold text-amber-300">
                  ₹{Number(optimizerResult.summary.budget_used).toLocaleString()}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Remaining
                </div>
                <div className="mt-2 text-xl font-bold text-emerald-300">
                  ₹{Number(optimizerResult.summary.budget_remaining).toLocaleString()}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500">
                  Segments Funded
                </div>
                <div className="mt-2 text-xl font-bold text-indigo-300">
                  {optimizerResult.summary.selected_count}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-4">
                Funded Priority Segments
              </h3>

              {optimizerResult.segments.length === 0 ? (
                <div className="text-sm text-slate-400">
                  No segments could be funded within the given budget.
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {optimizerResult.segments.map((seg) => {
                    const blockForSeg = (blocks || []).find((b) => b.id === seg.id);
                    const displayName =
                      seg.name || blockForSeg?.name || `Segment ${seg.id}`;

                    return (
                      <div
                        key={seg.id}
                        onClick={() => {
                          if (blockForSeg && onSelectBlock) {
                            onSelectBlock(blockForSeg);
                          }
                        }}
                        className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 cursor-pointer hover:border-indigo-400/40 hover:bg-slate-900 transition"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {displayName}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              ID: {seg.id}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${levelBadgeClass(
                                seg.priority_level
                              )}`}
                            >
                              {seg.priority_level}
                            </span>
                            <span className="text-xs font-mono text-slate-300">
                              ₹{Number(seg.estimated_cost).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        {seg.priority_explanation &&
                          seg.priority_explanation.length > 0 && (
                            <div className="mt-3">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                                Top Drivers
                              </div>
                              <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[11px]">
                                {seg.priority_explanation.slice(0, 3).map((item, idx) => (
                                  <li key={idx}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                        {seg.recommended_actions &&
                          seg.recommended_actions.length > 0 && (
                            <div className="mt-3">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
                                Recommended Actions
                              </div>
                              <ul className="list-disc list-inside text-slate-300 space-y-0.5 text-[11px]">
                                {seg.recommended_actions.slice(0, 2).map((item, idx) => (
                                  <li key={idx}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
              <h3 className="text-sm font-semibold text-slate-200 mb-2">
                Planning Insight
              </h3>
              <p className="text-sm text-slate-400 leading-6">
                This dashboard helps planners understand which high-priority
                segments can be funded under a limited budget. The optimizer
                selects interventions in descending priority order until the
                available budget is exhausted.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BudgetOptimizer;