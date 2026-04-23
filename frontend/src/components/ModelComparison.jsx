import React, { useMemo } from "react";

const levels = ["high", "medium", "low"];

const badgeClass = (level) => {
  switch (level) {
    case "high":
      return "bg-red-500/15 text-red-300 border-red-500/30";
    case "medium":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "low":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    default:
      return "bg-slate-500/15 text-slate-300 border-slate-500/30";
  }
};

const pretty = (value) => {
  if (!value) return "Unknown";
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const ModelComparison = ({ blocks = [], onSelectBlock }) => {
  const comparison = useMemo(() => {
    const validBlocks = blocks.filter((b) => b.risk_level && b.ml_risk_level);

    const agreement = validBlocks.filter(
      (b) => b.risk_level === b.ml_risk_level
    );

    const disagreement = validBlocks.filter(
      (b) => b.risk_level !== b.ml_risk_level
    );

    const matrix = {
      high: { high: 0, medium: 0, low: 0 },
      medium: { high: 0, medium: 0, low: 0 },
      low: { high: 0, medium: 0, low: 0 },
    };

    validBlocks.forEach((b) => {
      const rule = b.risk_level;
      const ml = b.ml_risk_level;
      if (matrix[rule] && matrix[rule][ml] !== undefined) {
        matrix[rule][ml] += 1;
      }
    });

    const severeDisagreements = [...disagreement].sort((a, b) => {
      const order = { high: 3, medium: 2, low: 1 };
      const diffA = Math.abs(order[a.risk_level] - order[a.ml_risk_level]);
      const diffB = Math.abs(order[b.risk_level] - order[b.ml_risk_level]);
      return diffB - diffA;
    });

    // 🔹 Score-based comparison
    const scoreBlocks = validBlocks.filter(
      (b) =>
        typeof b.risk_score === "number" &&
        typeof b.ml_risk_score === "number"
    );

    const avgRuleScore =
      scoreBlocks.length > 0
        ? (
            scoreBlocks.reduce((sum, b) => sum + b.risk_score, 0) /
            scoreBlocks.length
          ).toFixed(2)
        : "0.00";

    const avgMlScore =
      scoreBlocks.length > 0
        ? (
            scoreBlocks.reduce((sum, b) => sum + b.ml_risk_score, 0) /
            scoreBlocks.length
          ).toFixed(2)
        : "0.00";

    const avgScoreDifference =
      scoreBlocks.length > 0
        ? (
            scoreBlocks.reduce(
              (sum, b) => sum + Math.abs(b.ml_risk_score - b.risk_score),
              0
            ) / scoreBlocks.length
          ).toFixed(2)
        : "0.00";

    const topScoreDifferences = [...scoreBlocks]
      .map((b) => ({
        ...b,
        score_diff: Math.abs(b.ml_risk_score - b.risk_score),
        signed_diff: b.ml_risk_score - b.risk_score,
      }))
      .sort((a, b) => b.score_diff - a.score_diff)
      .slice(0, 10);

    let scoreInsight = "Rule-based and ML classifications are being compared.";
    if (Number(avgScoreDifference) > 0) {
      if (Number(avgMlScore) > Number(avgRuleScore)) {
        scoreInsight =
          "Although classification agreement is high, the ML model assigns slightly higher risk scores on average, suggesting stronger severity within the same class boundaries.";
      } else if (Number(avgMlScore) < Number(avgRuleScore)) {
        scoreInsight =
          "Although classification agreement is high, the ML model assigns slightly lower risk scores on average, suggesting more conservative severity estimates than the rule-based system.";
      } else {
        scoreInsight =
          "The rule-based and ML models show very similar average risk severity across the dataset.";
      }
    }

    return {
      total: validBlocks.length,
      agreementCount: agreement.length,
      disagreementCount: disagreement.length,
      agreementPct:
        validBlocks.length > 0
          ? ((agreement.length / validBlocks.length) * 100).toFixed(1)
          : "0.0",
      matrix,
      disagreement,
      severeDisagreements,
      avgRuleScore,
      avgMlScore,
      avgScoreDifference,
      topScoreDifferences,
      scoreInsight,
    };
  }, [blocks]);

  return (
    <div className="w-full h-[calc(100vh-112px)] overflow-y-auto bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Model Comparison Dashboard
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Compare rule-based accessibility risk against ML-based predictions.
          </p>
        </div>

        {/* Top summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Total Blocks
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {comparison.total}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Agreement
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-300">
              {comparison.agreementCount}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Disagreement
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-300">
              {comparison.disagreementCount}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Agreement %
            </div>
            <div className="mt-2 text-2xl font-bold text-indigo-300">
              {comparison.agreementPct}%
            </div>
          </div>
        </div>

        {/* Score comparison cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Avg Rule Risk Score
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {comparison.avgRuleScore}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Avg ML Risk Score
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {comparison.avgMlScore}
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
            <div className="text-xs uppercase tracking-wider text-slate-500">
              Avg Score Difference
            </div>
            <div className="mt-2 text-2xl font-bold text-indigo-300">
              {comparison.avgScoreDifference}
            </div>
          </div>
        </div>

        {/* Matrix */}
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">
            Rule vs ML Comparison Matrix
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-slate-400">
                  <th className="text-left p-3 border-b border-slate-800">
                    Rule \ ML
                  </th>
                  <th className="text-left p-3 border-b border-slate-800">
                    High
                  </th>
                  <th className="text-left p-3 border-b border-slate-800">
                    Medium
                  </th>
                  <th className="text-left p-3 border-b border-slate-800">
                    Low
                  </th>
                </tr>
              </thead>
              <tbody>
                {levels.map((rule) => (
                  <tr key={rule} className="text-slate-300">
                    <td className="p-3 border-b border-slate-800 font-medium">
                      {pretty(rule)}
                    </td>
                    {levels.map((ml) => (
                      <td
                        key={`${rule}-${ml}`}
                        className="p-3 border-b border-slate-800"
                      >
                        {comparison.matrix[rule][ml]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Disagreement cases */}
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">
            Disagreement Cases
          </h3>

          {comparison.severeDisagreements.length === 0 ? (
            <div className="text-sm text-slate-400">
              No disagreement cases found.
            </div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {comparison.severeDisagreements.map((block) => (
                <div
                  key={block.id}
                  onClick={() => onSelectBlock?.(block)}
                  className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 cursor-pointer hover:border-indigo-400/40 hover:bg-slate-900 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {block.name || block.id}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        ID: {block.id} {block.ward ? `• ${block.ward}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">Rule:</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(
                        block.risk_level
                      )}`}
                    >
                      {pretty(block.risk_level)}
                    </span>

                    <span className="text-xs text-slate-400 ml-2">ML:</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(
                        block.ml_risk_level
                      )}`}
                    >
                      {pretty(block.ml_risk_level)}
                    </span>

                    {typeof block.ml_confidence === "number" && (
                      <span className="ml-2 text-xs text-slate-400">
                        Confidence:{" "}
                        <span className="font-mono text-slate-200">
                          {(block.ml_confidence * 100).toFixed(1)}%
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top score differences */}
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-4">
            Top Rule vs ML Score Differences
          </h3>

          {comparison.topScoreDifferences.length === 0 ? (
            <div className="text-sm text-slate-400">
              No comparable score data found.
            </div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {comparison.topScoreDifferences.map((block) => (
                <div
                  key={block.id}
                  onClick={() => onSelectBlock?.(block)}
                  className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 cursor-pointer hover:border-indigo-400/40 hover:bg-slate-900 transition"
                >
                  <div className="text-sm font-semibold text-white">
                    {block.name || block.id}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    ID: {block.id} {block.ward ? `• ${block.ward}` : ""}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <div className="text-slate-400">Rule Score</div>
                      <div className="font-mono text-slate-100">
                        {block.risk_score.toFixed(2)}
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400">ML Score</div>
                      <div className="font-mono text-slate-100">
                        {block.ml_risk_score.toFixed(2)}
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400">Difference</div>
                      <div
                        className={`font-mono ${
                          block.signed_diff >= 0
                            ? "text-amber-300"
                            : "text-emerald-300"
                        }`}
                      >
                        {block.signed_diff >= 0 ? "+" : ""}
                        {block.signed_diff.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">Rule:</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(
                        block.risk_level
                      )}`}
                    >
                      {pretty(block.risk_level)}
                    </span>

                    <span className="text-xs text-slate-400 ml-2">ML:</span>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(
                        block.ml_risk_level
                      )}`}
                    >
                      {pretty(block.ml_risk_level)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Insight */}
        <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4">
          <h3 className="text-sm font-semibold text-slate-200 mb-2">
            Key Insight
          </h3>
          <p className="text-sm text-slate-400 leading-6">
            This dashboard compares rule-based accessibility outputs with
            ML-based predictions. Agreement indicates that the model has learned
            the same broad class boundaries as the rule system, while score-based
            differences reveal whether the ML model assigns stronger or weaker
            severity within those same categories. {comparison.scoreInsight}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ModelComparison;