import React, { useMemo } from "react";

const ModelInsights = ({ featureImportance }) => {
  const processed = useMemo(() => {
    if (!featureImportance || featureImportance.length === 0) return [];

    const totalRaw =
      featureImportance.reduce(
        (sum, f) => sum + (f.raw_importance ?? 0),
        0
      ) || 1;

    // Sort by raw importance and compute share of total
    return [...featureImportance]
      .sort((a, b) => b.raw_importance - a.raw_importance)
      .map((f, index) => ({
        ...f,
        rank: index + 1,
        share: (f.raw_importance ?? 0) / totalRaw,
      }));
  }, [featureImportance]);

  const topFeature = processed[0];

  return (
    <div className="w-full h-full bg-slate-950 text-slate-50 px-6 lg:px-8 py-6 lg:py-8 overflow-y-auto">
      {/* Header */}
      <header className="mb-6 lg:mb-8 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-semibold tracking-tight">
            Model Insights
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Global feature importance for the accessibility risk model. Higher
            values indicate features that influence predictions more across all
            blocks in the dataset.
          </p>
        </div>

        <div className="mt-3 lg:mt-0 flex flex-wrap gap-3 text-xs">
          <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">
            <div className="text-slate-500 uppercase tracking-wider">
              Features
            </div>
            <div className="text-lg font-semibold">
              {processed.length || 0}
            </div>
          </div>

          {topFeature && (
            <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">
              <div className="text-slate-500 uppercase tracking-wider">
                Top risk driver
              </div>
              <div className="text-sm font-semibold">
                {prettyFeatureName(topFeature.name)}
              </div>
              <div className="text-[11px] text-slate-400">
                ~{(topFeature.share * 100).toFixed(1)}% of total importance
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: big bar chart */}
        <section className="lg:col-span-3 bg-slate-900/70 border border-slate-800 rounded-xl p-4 lg:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-200">
              Global Feature Importance
            </h2>
            <span className="text-[11px] text-slate-500">
              Normalized to the most important feature (100%)
            </span>
          </div>

          {processed.length === 0 ? (
            <p className="text-sm text-slate-400">
              No feature importance data available. Make sure the ML model is
              trained and <code className="text-xs">/model/feature-importance</code>{" "}
              is returning data.
            </p>
          ) : (
            <div className="space-y-3 mt-1">
              {processed.map((f) => {
                const relPercent =
                  (f.normalized_importance || 0) * 100;
                return (
                  <div key={f.name} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 w-4 text-right">
                          #{f.rank}
                        </span>
                        <span className="text-xs text-slate-200 group-hover:text-white transition-colors">
                          {prettyFeatureName(f.name)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-slate-500">
                          Rel: {relPercent.toFixed(1)}%
                        </span>
                        <span className="text-slate-500">
                          Share: {(f.share * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-[0_0_12px_rgba(129,140,248,0.6)] transition-all duration-700 ease-out"
                        style={{ width: `${Math.max(relPercent, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: interpretation + table */}
        <section className="lg:col-span-2 flex flex-col gap-4">
          {/* Interpretation card */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 lg:p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-2">
              How to interpret this chart
            </h2>
            <ul className="text-xs text-slate-400 space-y-2 list-disc list-inside">
              <li>
                The model is a tree-based ensemble (Random Forest). Feature
                importance is computed as the average decrease in impurity
                contributed by each feature during training.
              </li>
              <li>
                The{" "}
                <span className="font-semibold">relative importance</span> bar
                is scaled so that the most important feature has value 1 (100%).
              </li>
              <li>
                The <span className="font-semibold">share (%)</span> column
                shows how much of the model&rsquo;s total importance is
                attributed to each feature.
              </li>
              <li>
                At block level, SHAP explanations break this global view down
                into{" "}
                <span className="font-semibold">
                  risk drivers vs protective factors
                </span>{" "}
                for individual locations (see the sidebar on the map view).
              </li>
            </ul>
          </div>

          {/* Table */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 lg:p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-2">
              Ranked Feature Table
            </h2>
            <div className="max-h-64 overflow-y-auto border border-slate-800 rounded-lg">
              <table className="w-full text-[11px] text-left border-collapse">
                <thead className="bg-slate-900/80 text-slate-400 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 font-medium border-b border-slate-800">
                      #
                    </th>
                    <th className="px-3 py-2 font-medium border-b border-slate-800">
                      Feature
                    </th>
                    <th className="px-3 py-2 font-medium border-b border-slate-800 text-right">
                      Rel. importance
                    </th>
                    <th className="px-3 py-2 font-medium border-b border-slate-800 text-right">
                      Share of total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {processed.map((f) => (
                    <tr
                      key={f.name}
                      className="odd:bg-slate-900/40 even:bg-slate-900/20 hover:bg-slate-800/60 transition-colors"
                    >
                      <td className="px-3 py-1.5 border-b border-slate-800">
                        {f.rank}
                      </td>
                      <td className="px-3 py-1.5 border-b border-slate-800">
                        {prettyFeatureName(f.name)}
                      </td>
                      <td className="px-3 py-1.5 border-b border-slate-800 text-right">
                        {(f.normalized_importance * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-1.5 border-b border-slate-800 text-right">
                        {(f.share * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}

                  {processed.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-3 text-center text-slate-500"
                      >
                        No data available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              This view is useful for documentation and viva: it shows the
              model is not a black box and quantifies which urban variables
              drive accessibility risk globally.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
};

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

export default ModelInsights;