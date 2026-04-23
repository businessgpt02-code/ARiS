import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import MapArea from "./components/MapArea";
import { computeCompliance, isNonCompliant } from "./utils/compliance";
import ModelInsights from "./components/ModelInsights";
import ModelComparison from "./components/ModelComparison";
import BudgetOptimizer from "./components/BudgetOptimizer";

function App() {
  const [featureImportance, setFeatureImportance] = useState([]);
  const [apiStatus, setApiStatus] = useState("Checking backend...");
  const [blocks, setBlocks] = useState([]);
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [viewMode, setViewMode] = useState("ml");
  const [onlyNonCompliant, setOnlyNonCompliant] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [scenarioBlock, setScenarioBlock] = useState(null);
  const [priorityOverlay, setPriorityOverlay] = useState(null);
  const [activeTab, setActiveTab] = useState("map"); // map | insights | comparison | budget

  useEffect(() => {
    const backendUrl = "http://127.0.0.1:8000";

    fetch(`${backendUrl}/health`)
      .then((res) => res.json())
      .then((data) => {
        setApiStatus(`Backend status: ${data.status} – ${data.message}`);
      })
      .catch((err) => {
        console.error(err);
        setApiStatus("Failed to reach backend");
      });

    fetch(`${backendUrl}/blocks`)
      .then((res) => res.json())
      .then((data) => {
        const rawBlocks = data.blocks || [];

        const enrichedBlocks = rawBlocks.map((b, idx) => ({
          ...b,
          ward:
            b.ward ||
            (idx % 3 === 0 ? "Ward-1" : idx % 3 === 1 ? "Ward-2" : "Ward-3"),
        }));

        setBlocks(enrichedBlocks);
      })
      .catch((err) => {
        console.error("Error fetching blocks:", err);
      });

    fetch(`${backendUrl}/model/feature-importance`)
      .then((res) => res.json())
      .then((data) => {
        setFeatureImportance(data.features || []);
      })
      .catch((err) => {
        console.error("Error fetching feature importance:", err);
      });
  }, []);

  const mumbaiCenter = [18.9388, 72.8354];

  const getEffectiveLevel = (block) => {
    if (viewMode === "ml") return block.ml_risk_level || block.risk_level;
    return block.risk_level;
  };

  const filteredBlocks = useMemo(() => {
    const riskFiltered =
      selectedFilter === "all"
        ? blocks
        : blocks.filter((b) => getEffectiveLevel(b) === selectedFilter);

    if (!onlyNonCompliant) return riskFiltered;

    return riskFiltered.filter((b) => isNonCompliant(b));
  }, [blocks, selectedFilter, onlyNonCompliant, viewMode]);

  const avgCompliance = useMemo(() => {
    if (!filteredBlocks.length) return 0;
    const total = filteredBlocks.reduce(
      (sum, b) => sum + computeCompliance(b).pct,
      0
    );
    return Math.round(total / filteredBlocks.length);
  }, [filteredBlocks]);

  useEffect(() => {
    setScenarioBlock(selectedBlock);
  }, [selectedBlock]);

  const priorityLookup = useMemo(() => {
    if (!priorityOverlay || !priorityOverlay.segments) return {};
    const map = {};
    priorityOverlay.segments.forEach((seg) => {
      map[seg.id] = seg.priority_level;
    });
    return map;
  }, [priorityOverlay]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100 font-sans overflow-hidden">
      <Header apiStatus={apiStatus} />

      <div className="px-6 pt-2 pb-3 bg-slate-900 border-b border-slate-800">
        <div className="inline-flex rounded-lg bg-slate-800/60 p-1 flex-wrap">
          <button
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === "map"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveTab("map")}
          >
            Map & Block View
          </button>

          <button
            className={`ml-1 px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === "insights"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveTab("insights")}
          >
            Model Insights
          </button>

          <button
            className={`ml-1 px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === "comparison"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveTab("comparison")}
          >
            Model Comparison
          </button>

          <button
            className={`ml-1 px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === "budget"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveTab("budget")}
          >
            City Planning Dashboard
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {activeTab === "map" ? (
          <>
            <Sidebar
              selectedFilter={selectedFilter}
              setSelectedFilter={setSelectedFilter}
              viewMode={viewMode}
              setViewMode={setViewMode}
              featureImportance={featureImportance}
              onlyNonCompliant={onlyNonCompliant}
              setOnlyNonCompliant={setOnlyNonCompliant}
              selectedBlock={selectedBlock}
              scenarioBlock={scenarioBlock}
              setScenarioBlock={setScenarioBlock}
              blocks={blocks}
              onSelectBlock={setSelectedBlock}
              setPriorityOverlay={setPriorityOverlay}
            />

            <MapArea
              blocks={filteredBlocks}
              center={mumbaiCenter}
              viewMode={viewMode}
              getEffectiveLevel={getEffectiveLevel}
              avgCompliance={avgCompliance}
              onSelectBlock={setSelectedBlock}
              scenarioBlock={scenarioBlock}
              priorityLookup={priorityLookup}
              priorityWard={priorityOverlay?.ward || ""}
            />
          </>
        ) : activeTab === "insights" ? (
          <ModelInsights featureImportance={featureImportance} />
        ) : activeTab === "comparison" ? (
          <ModelComparison
            blocks={blocks}
            onSelectBlock={setSelectedBlock}
          />
        ) : (
          <BudgetOptimizer
            blocks={blocks}
            viewMode={viewMode}
            onSelectBlock={setSelectedBlock}
          />
        )}
      </div>
    </div>
  );
}

export default App;