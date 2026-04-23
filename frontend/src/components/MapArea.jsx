import React, { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Popup,
  GeoJSON,
  FeatureGroup,
  useMap,
} from "react-leaflet";
import { EditControl } from "react-leaflet-draw";
import RiskBadge from "./RiskBadge";
import jsPDF from "jspdf";
import { computeCompliance, CPWD } from "../utils/compliance";
import NewSegmentModal from "./NewSegmentModal";

const getRiskColor = (riskLevel) => {
  switch (riskLevel) {
    case "high":
      return "#ef4444";
    case "medium":
      return "#f59e0b";
    case "low":
      return "#10b981";
    default:
      return "#94a3b8";
  }
};
const getPriorityColor = (priorityLevel) => {
  switch (priorityLevel) {
    case "Critical":
      return "#e11d48"; // rose-600
    case "High":
      return "#f97316"; // orange-500
    case "Medium":
      return "#eab308"; // yellow-500
    case "Low":
      return "#22c55e"; // emerald-500
    default:
      return "#94a3b8"; // slate-400 fallback
  }
};
const ComplianceBadge = ({ ok }) => {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border
      ${
        ok
          ? "bg-emerald-500/15 text-emerald-700 border-emerald-200"
          : "bg-rose-500/15 text-rose-700 border-rose-200"
      }`}
    >
      {ok ? "Compliant" : "Non-compliant"}
    </span>
  );
};

const FlyToBlock = ({ block }) => {
  const map = useMap();

  useEffect(() => {
    if (!block || !block.geometry?.coordinates?.length) return;

    const coords = block.geometry.coordinates; // [[lng, lat], ...]
    const latLngs = coords.map(([lng, lat]) => [lat, lng]);

    const lats = latLngs.map((p) => p[0]);
    const lngs = latLngs.map((p) => p[1]);

    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    const targetZoom = 15.5;
    const targetPoint = map.project([centerLat, centerLng], targetZoom);
    
    // Shift map center UP by 320 pixels (so the segment appears lower on screen)
    targetPoint.y -= 320;
    
    const offsetCenter = map.unproject(targetPoint, targetZoom);

    map.flyTo(offsetCenter, targetZoom, { duration: 0.8 });
  }, [block, map]);

  return null;
};
const MapArea = ({
  blocks,
  center,
  viewMode,
  getEffectiveLevel,
  avgCompliance,
  onSelectBlock,
  scenarioBlock,
  scenarioMetrics,
  priorityLookup = {},   // 👈 NEW
  priorityWard = "",     // 👈 NEW
  
}) => {
  const scenarioActive = !!scenarioBlock;

  const [drawnLayer, setDrawnLayer] = useState(null);
  const [showPredictionForm, setShowPredictionForm] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);
  // 🔹 persistent list of user-drawn scenario segments
  const [scenarioSegments, setScenarioSegments] = useState([]);
  const [hasLoadedScenarios, setHasLoadedScenarios] = useState(false);
  const [editingScenarioId, setEditingScenarioId] = useState(null);
  const [modalInitialValues, setModalInitialValues] = useState(null);
  // Load from localStorage on first mount
// 1) Load scenarios once on mount
useEffect(() => {
  try {
    const stored = localStorage.getItem("auramp_scenarios");
    if (stored) {
      const parsed = JSON.parse(stored);
      setScenarioSegments(parsed);
      console.log("Loaded scenarios:", parsed);
    } else {
      console.log("Loaded scenarios: [] (nothing in storage)");
    }
  } catch (e) {
    console.error("Failed to load saved scenarios", e);
  } finally {
    // ✅ mark that we've attempted the initial load
    setHasLoadedScenarios(true);
  }
}, []);

// 2) Save whenever scenarioSegments changes,
//    BUT ONLY after initial load is done
useEffect(() => {
  if (!hasLoadedScenarios) return; // 🔑 prevent initial wipe-out

  try {
    localStorage.setItem(
      "auramp_scenarios",
      JSON.stringify(scenarioSegments)
    );
    console.log("Saved scenarios:", scenarioSegments);
  } catch (e) {
    console.error("Failed to save scenarios", e);
  }
}, [scenarioSegments, hasLoadedScenarios]);

  // ---------------- ML prediction for new drawn segment ----------------
  const handlePrediction = async (formData) => {
  try {
    const res = await fetch("http://127.0.0.1:8000/predict-ml", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (!res.ok) {
      console.error("predict-ml failed:", await res.text());
      setShowPredictionForm(false);
      return;
    }

    const data = await res.json();
    const risk = data.ml_risk_level;
    const color = getRiskColor(risk);
    const score = data.ml_risk_score ?? null;

    if (editingScenarioId) {
      // 🔄 Edit existing scenario
      setScenarioSegments((prev) =>
        prev.map((seg) =>
          seg.id === editingScenarioId
            ? {
                ...seg,
                ward: formData.ward,                    // 🔹 NEW
                near_school: formData.near_school,      // 🔹 NEW
                near_hospital: formData.near_hospital,  // 🔹 NEW
                risk_level: risk,
                ml_risk_score: score,
                attrs: formData, // full original form
              }
            : seg
        )
      );
    } else {
      // 🆕 New scenario from freshly drawn line
      if (drawnLayer) {
        drawnLayer.setStyle({ color, weight: 6 });
      }

      if (pendingCoords && pendingCoords.length > 0) {
        setScenarioSegments((prev) => [
          ...prev,
          {
            id: Date.now(),
            latLngs: pendingCoords,
            ward: formData.ward,                    // 🔹 NEW
            near_school: formData.near_school,      // 🔹 NEW
            near_hospital: formData.near_hospital,  // 🔹 NEW
            risk_level: risk,
            ml_risk_score: score,
            attrs: formData,                        // keep full attribute bundle
          },
        ]);
      }
    }
  } catch (err) {
    console.error("Error calling /predict-ml:", err);
  } finally {
    setShowPredictionForm(false);
    setPendingCoords(null);
    setEditingScenarioId(null);
    setModalInitialValues(null);
  }
};
  const stats = {
    total: blocks.length,
    high: blocks.filter((b) => getEffectiveLevel(b) === "high").length,
    medium: blocks.filter((b) => getEffectiveLevel(b) === "medium").length,
    low: blocks.filter((b) => getEffectiveLevel(b) === "low").length,
  };
  const handleScenarioEdited = (e) => {
  const edited = [];

  // e.layers is a Leaflet FeatureGroup of all edited layers
  e.layers.eachLayer((layer) => {
    const id = layer.options?.segmentId;
    if (!id) return;

    const latLngs = layer.getLatLngs(); // [{lat, lng}, ...]
    edited.push({ id, latLngs });
  });

  if (!edited.length) return;

  setScenarioSegments((prev) =>
    prev.map((seg) => {
      const match = edited.find((x) => x.id === seg.id);
      return match
        ? {
            ...seg,
            latLngs: match.latLngs, // 🔁 update coordinates
          }
        : seg;
    })
  );
};
  // ---------------- PDF export for existing blocks (unchanged from you) ----
  const exportBlockPdf = async (block, viewMode) => {
    const projectToBox = (latLngs, x, y, w, h, pad = 4) => {
      const lats = latLngs.map((p) => p[0]);
      const lngs = latLngs.map((p) => p[1]);

      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const latRange = maxLat - minLat || 1e-9;
      const lngRange = maxLng - minLng || 1e-9;

      const scaleX = (w - pad * 2) / lngRange;
      const scaleY = (h - pad * 2) / latRange;
      const scale = Math.min(scaleX, scaleY);

      const cx = x + w / 2;
      const cy = y + h / 2;

      const midLng = (minLng + maxLng) / 2;
      const midLat = (minLat + maxLat) / 2;

      const pts = latLngs.map(([lat, lng]) => {
        const px = cx + (lng - midLng) * scale;
        const py = cy - (lat - midLat) * scale;
        return [px, py];
      });

      return pts;
    };

    const hexToRgb = (hex) => {
      const h = String(hex).replace("#", "");
      const full =
        h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
      const n = parseInt(full, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const now = new Date().toLocaleString();
    const comp = computeCompliance(block);

    const safeFixed = (v, d = 2) =>
      typeof v === "number" && isFinite(v) ? v.toFixed(d) : "N/A";

    const ruleScore = safeFixed(block.risk_score, 2);
    const mlScore =
      block.ml_risk_score?.toFixed && typeof block.ml_risk_score === "number"
        ? block.ml_risk_score.toFixed(2)
        : safeFixed(Number(block.ml_risk_score), 2);

    const riskFill = (lvl) => {
      const level = String(lvl || "").toLowerCase();
      if (level === "high") return [239, 68, 68];
      if (level === "medium") return [245, 158, 11];
      if (level === "low") return [16, 185, 129];
      return [148, 163, 184];
    };

    const drawBadge = (x, y, text, rgb) => {
      const w = 24;
      const h = 8;
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.roundedRect(x, y - h + 1, w, h, 2, 2, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);

      const label = String(text ?? "N/A").toUpperCase();
      doc.text(label, x + w / 2, y - 3, { align: "center" });

      doc.setTextColor(0, 0, 0);
    };

    const toDataURL = async (url) => {
      const res = await fetch(url);
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    };

    const addHeader = async () => {
      try {
        const logoDataUrl = await toDataURL("/auramp-logo.png");
        doc.addImage(logoDataUrl, "PNG", 14, 10, 10, 10);
      } catch (e) {
        // optional
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(
        "AURaMP – Accessibility Compliance Report",
        27,
        18
      );

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

    const addKeyValue = (label, value, y) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 14, y);
      doc.setFont("helvetica", "normal");
      doc.text(String(value ?? "N/A"), 60, y);
    };

    const drawVectorThumbnail = (block, x, y, w, h) => {
      doc.setDrawColor(220);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, w, h, 3, 3, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(60);
      doc.text("Vector Snapshot (selected block)", x + 4, y + 6);
      doc.setTextColor(0);

      const coords = block?.geometry?.coordinates || [];
      const latLngs = coords.map(([lng, lat]) => [lat, lng]);
      if (latLngs.length < 2) return;

      const pts = projectToBox(latLngs, x, y + 8, w, h - 10, 6);

      const level = String(
        viewMode === "ml"
          ? block.ml_risk_level || block.risk_level
          : block.risk_level
      ).toLowerCase();

      const riskHex =
        level === "high"
          ? "#ef4444"
          : level === "medium"
          ? "#f59e0b"
          : level === "low"
          ? "#10b981"
          : "#94a3b8";
      const [r, g, b] = hexToRgb(riskHex);

      doc.setDrawColor(r, g, b);
      doc.setLineWidth(1.2);

      for (let i = 0; i < pts.length - 1; i++) {
        doc.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      }

      doc.setFillColor(r, g, b);
      doc.circle(pts[0][0], pts[0][1], 1.3, "F");
      doc.circle(pts[pts.length - 1][0], pts[pts.length - 1][1], 1.3, "F");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(80);
      doc.text(`Color: ${level.toUpperCase()} risk`, x + 4, y + h - 4);
      doc.setTextColor(0);
    };

    await addHeader();
    drawVectorThumbnail(block, 140, 38, 56, 40);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Block Details", 14, 44);

    doc.setFontSize(10);
    addKeyValue("Name:", block.name, 52);
    addKeyValue("ID:", block.id, 58);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Risk Summary", 14, 72);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const yRule = 82;
    const yML = 92;

    addKeyValue(
      "Rule-based:",
      `${ruleScore} (${block.risk_level ?? "N/A"})`,
      yRule
    );
    drawBadge(172, yRule - 2, block.risk_level, riskFill(block.risk_level));

    addKeyValue(
      "ML-predicted:",
      `${mlScore} (${block.ml_risk_level ?? "N/A"})`,
      yML
    );
    drawBadge(
      172,
      yML - 2,
      block.ml_risk_level ?? "N/A",
      riskFill(block.ml_risk_level)
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("CPWD Compliance Scorecard", 14, 100);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    
    doc.text(
      `Overall: ${comp.passed}/${comp.total}  (${comp.pct}%)`,
      14,
      108
    );
    doc.text(
      `Reference thresholds: min clear width ${CPWD.MIN_CLEAR_WIDTH_M}m; slope reference 1:12 (${CPWD.MAX_SLOPE_PERCENT}%).`,
      14,
      114
    );

    let y = 126;
    const lineHeight = 8;

    const checks = [
      {
        label: `Clear width >= ${CPWD.MIN_CLEAR_WIDTH_M}m`,
        value: `${safeFixed(Number(block.sidewalk_width_m), 2)} m`,
        ok: Number(block.sidewalk_width_m) >= CPWD.MIN_CLEAR_WIDTH_M,
      },
      {
        label: `Slope <= ${CPWD.MAX_SLOPE_PERCENT}% (1:12)`,
        value: `${safeFixed(Number(block.slope_percent), 2)} %`,
        ok: Number(block.slope_percent) <= CPWD.MAX_SLOPE_PERCENT,
      },
      {
        label: "Curb ramp present at crossing",
        value: String(block.has_curb_ramp ?? "N/A"),
        ok: String(block.has_curb_ramp).toLowerCase() === "yes",
      },
      {
        label: "Surface firm & even (smooth)",
        value: String(block.surface_quality ?? "N/A"),
        ok: String(block.surface_quality).toLowerCase() === "smooth",
      },
      {
        label: "Adequate pedestrian lighting",
        value: String(block.lighting_quality ?? "N/A"),
        ok: String(block.lighting_quality).toLowerCase() !== "poor",
      },
    ];

    doc.setFont("helvetica", "bold");
    doc.text("Criterion", 14, y);
    doc.text("Value", 120, y);
    doc.text("Status", 170, y);

    doc.setDrawColor(220);
    doc.line(14, y + 2, 196, y + 2);

    y += lineHeight;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    checks.forEach((c) => {
      if (y > 280) {
        doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(
          "AURaMP – Accessibility Compliance Report",
          14,
          16
        );
        doc.setDrawColor(220);
        doc.line(14, 20, 196, 20);
        y = 30;
      }

      doc.text(c.label, 14, y);
      doc.text(String(c.value), 120, y);

      if (c.ok) {
        doc.setTextColor(16, 185, 129);
        doc.text("Compliant", 170, y);
      } else {
        doc.setTextColor(239, 68, 68);
        doc.text("Non-compliant", 170, y);
      }
      doc.setTextColor(0, 0, 0);

      y += lineHeight;
    });

    y += 6;
    if (y > 270) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text(
        "AURaMP – Accessibility Compliance Report",
        14,
        16
      );
      doc.setDrawColor(220);
      doc.line(14, 20, 196, 20);
      y = 30;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Contributing Factors (Risk Model)", 14, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const reasons = Array.isArray(block.reasons) ? block.reasons : [];
    reasons.slice(0, 12).forEach((r) => {
      if (y > 285) {
        doc.addPage();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(
          "AURaMP – Accessibility Compliance Report",
          14,
          16
        );
        doc.setDrawColor(220);
        doc.line(14, 20, 196, 20);
        y = 30;
      }
      doc.text(`• ${String(r)}`, 14, y);
      y += 6;
    });

    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(
      "Note: Generated from dataset attributes. Field verification may be required for real-world confirmation.",
      14,
      292
    );
    doc.setTextColor(0);

    doc.save(`AURaMP_Compliance_${block.id}.pdf`);
  };

  const computeScenarioRiskLevel = (b) => {
    let score = 0;

    const width = Number(b.sidewalk_width_m);
    const slope = Number(b.slope_percent);
    const hasRamp = String(b.has_curb_ramp).toLowerCase();
    const traffic = String(b.traffic_level).toLowerCase();
    const lighting = String(b.lighting_quality).toLowerCase();
    const surface = String(b.surface_quality).toLowerCase();

    if (width < 0.9) score += 0.35;
    else if (width < 1.2) score += 0.25;
    else if (width < 1.5) score += 0.1;

    if (slope > 10) score += 0.3;
    else if (slope > 8.33) score += 0.2;
    else if (slope > 5) score += 0.1;

    if (hasRamp === "no") score += 0.2;

    if (traffic === "high") score += 0.2;
    else if (traffic === "medium") score += 0.1;

    if (lighting === "poor") score += 0.1;

    if (surface === "broken") score += 0.2;
    else if (surface === "uneven") score += 0.1;

    score = Math.min(1, score);

    return score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low";
  };

  return (
    <div
      id="map-capture"
      className="relative z-0 flex-1 h-[calc(100vh-64px)]"
    >
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%" }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
      {/* 👇 NEW – whenever scenarioBlock changes, fly to it */}
  {scenarioBlock && <FlyToBlock block={scenarioBlock} />}
        {/* 🔹 Re-draw user scenario segments (persisted) */}
      

        {/* Existing dataset blocks */}
       
          {blocks.map((block) => {
  const isSelected = scenarioBlock && block.id === scenarioBlock.id;
  const displayBlock = isSelected ? scenarioBlock : block;

  const coords =
    displayBlock?.geometry?.coordinates ||
    block?.geometry?.coordinates ||
    [];

  const latLngs = coords.map(([lng, lat]) => [lat, lng]);

  let effectiveLevel;
  if (isSelected && scenarioBlock) {
    effectiveLevel = computeScenarioRiskLevel(displayBlock);
  } else {
    effectiveLevel = getEffectiveLevel(displayBlock);
  }

  // 🔹 NEW: compute compliance metrics for this block
  const { checks, passed, total, pct, summary } = computeCompliance(displayBlock);

  // 🔎 Is this block in the active priority ward?
  const inPriorityWard =
    priorityWard && displayBlock.ward && displayBlock.ward === priorityWard;

  // 🔎 Does the Priority Engine know about this block?
  const priorityLevel = priorityLookup[displayBlock.id]; // "Critical"/"High"/"Medium"/"Low" or undefined

  // ✅ Final styling
  let color;
  let weight = 4;
  let opacity = 0.8;

  if (inPriorityWard && priorityLevel) {
    // Use priority colors for blocks in selected ward
    color = getPriorityColor(priorityLevel);
    weight = 5;
    opacity = 1;
  } else if (priorityWard) {
    // Dim everything else when a ward overlay is active
    color = getRiskColor(effectiveLevel);
    weight = 3;
    opacity = 0.35;
  } else {
    // Normal view (no ward selected)
    color = getRiskColor(effectiveLevel);
  }

  // Override weight if selected for highlight
  if (isSelected) {
    weight = 8;
    opacity = 1;
  }

  return (
    <Polyline
      key={block.id}
      positions={latLngs}
      pathOptions={{ color, weight, opacity }}
      eventHandlers={{
        click: () => onSelectBlock?.(block),
      }}
    >
      <Popup className="custom-popup" minWidth={340} maxHeight={2000} autoPan={false}>
        <div className="p-1">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-slate-900">
              {displayBlock.name}
            </h2>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
              viewMode === "ml" ? "bg-indigo-100 text-indigo-700 border border-indigo-200" : "bg-blue-100 text-blue-700 border border-blue-200"
            }`}>
              {viewMode === "ml" ? "AI Prediction Mode" : "Rule-based Analysis"}
            </span>
          </div>

          <div className="mb-3 space-y-2">
            <div className={`flex items-center justify-between rounded border p-2 text-sm transition-colors ${
              viewMode === "rule" ? "border-blue-300 bg-blue-50/80 shadow-sm" : "border-slate-100 bg-slate-50"
            }`}>
              <span className={`font-medium ${viewMode === "rule" ? "text-blue-900" : "text-slate-600"}`}>Rule-based</span>
              <div className="flex items-center gap-2">
                <span className={`font-mono ${viewMode === "rule" ? "font-bold text-blue-700 text-[15px]" : "font-medium"}`}>
                  {typeof displayBlock.risk_score === "number"
                    ? displayBlock.risk_score.toFixed(2)
                    : "N/A"}
                </span>
                <RiskBadge level={displayBlock.risk_level} />
              </div>
            </div>

            <div className={`flex flex-col rounded border p-2 text-sm transition-colors ${
              viewMode === "ml" ? "border-indigo-300 bg-indigo-50/80 shadow-sm" : "border-slate-100 bg-slate-50"
            }`}>
              <div className="flex items-center justify-between">
                <span className={`font-medium flex items-center gap-1.5 ${viewMode === "ml" ? "text-indigo-900" : "text-slate-600"}`}>
                  ML-predicted
                  {viewMode === "ml" && <span className="text-[8px] bg-indigo-200 text-indigo-800 px-1 py-0.5 rounded font-bold uppercase">AI</span>}
                </span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono ${viewMode === "ml" ? "font-bold text-indigo-700 text-[15px]" : "font-medium"}`}>
                    {displayBlock.ml_risk_score?.toFixed
                      ? displayBlock.ml_risk_score.toFixed(2)
                      : displayBlock.ml_risk_score ?? "N/A"}
                  </span>
                  <RiskBadge level={displayBlock.ml_risk_level} />
                </div>
              </div>
              
              {typeof displayBlock.ml_confidence === "number" && (
                <div className={`mt-1.5 text-[11px] flex justify-between items-center ${viewMode === "ml" ? "text-indigo-700 font-medium" : "text-slate-500"}`}>
                  <span>ML confidence:</span>
                  <span className={`font-mono ${viewMode === "ml" ? "font-bold bg-indigo-100 px-1.5 py-0.5 rounded" : "text-slate-700"}`}>
                    {(displayBlock.ml_confidence * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className={`rounded-xl border p-3 transition-colors ${
            viewMode === "rule" ? "border-blue-200 bg-blue-50/40" : "border-slate-200 bg-white"
          }`}>
            <div className="mb-2 flex items-center justify-between">
              <h4 className={`text-sm font-semibold ${viewMode === "rule" ? "text-blue-900" : "text-slate-900"}`}>
                CPWD Compliance Scorecard
              </h4>
              <span className={`text-xs ${viewMode === "rule" ? "text-blue-700 font-bold" : "text-slate-600"}`}>
                {passed}/{total} • {pct}%
              </span>
            </div>

            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500/80"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="mb-3 text-xs text-slate-600">
              Summary:{" "}
              <span className="font-semibold text-slate-900">
                {summary}
              </span>
            </div>

            <div className="space-y-2">
              {checks.map((c) => (
                <div
                  key={c.key}
                  className="flex items-start justify-between gap-3"
                >
                  <div className="text-xs leading-snug text-slate-800">
                    {c.label}
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Value: {c.value}
                    </div>
                  </div>
                  <ComplianceBadge ok={c.ok} />
                </div>
              ))}
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              Reference: MoHUA/CPWD Harmonised Guidelines (Universal
              Accessibility) – min clear width 1.2m; slope reference
              1:12.
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Contributing Factors
            </p>
            <ul className="space-y-1 text-xs text-slate-700">
              {(displayBlock.reasons || []).map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5"
                >
                  <span className="mt-1 flex h-1 w-1 flex-shrink-0 rounded-full bg-slate-400"></span>
                  {r}
                </li>
              ))}
            </ul>

            <button
              onClick={() => exportBlockPdf(displayBlock, viewMode)}
              className="mt-4 w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Export Compliance Report (PDF)
            </button>
          </div>
        </div>
      </Popup>
    </Polyline>
  );
})}

        {/* Draw control for new segments */}
        <FeatureGroup>
           {/* user-drawn scenario segments that persist across refresh */}
{scenarioSegments.map((seg) => (
  <Polyline
    key={seg.id}
    positions={seg.latLngs}
    pathOptions={{
      color: getRiskColor(seg.risk_level),
      weight: 5,
      opacity: 0.9,
      dashArray: "4 4",
      segmentId: seg.id, 
    }}
  >
    <Popup className="custom-popup" minWidth={280} maxHeight={2000} autoPanPadding={[50, 50]}>
      <div className="p-2">
        <div className="mb-1 text-xs text-slate-700">
          User scenario segment
        </div>

        <div className="mb-2 text-xs text-slate-500">
          ML risk level:{" "}
          <span className="font-semibold">
            {(seg.risk_level || "unknown").toUpperCase()}
          </span>
        </div>

        {typeof seg.ml_risk_score === "number" && (
          <div className="mb-2 text-[11px] text-slate-500">
            ML risk score:{" "}
            <span className="font-mono">
              {seg.ml_risk_score.toFixed(2)}
            </span>
          </div>
        )}

        {/* ✏️ EDIT BUTTON */}
        <button
          onClick={() => {
            setEditingScenarioId(seg.id);

            const defaultAttrs = {
              ward: seg.ward || "",            // 🔹 NEW
              sidewalk_width_m: 1.2,
              slope_percent: 5,
              has_curb_ramp: "yes",
              traffic_level: "medium",
              lighting_quality: "good",
              surface_quality: "smooth",
              near_school: seg.near_school ?? false,     // 🔹 NEW
              near_hospital: seg.near_hospital ?? false, // 🔹 NEW
            };

            setModalInitialValues(seg.attrs || defaultAttrs);

            setPendingCoords(seg.latLngs);
            setShowPredictionForm(true);
          }}
          className="mb-2 w-full rounded bg-slate-800 py-1 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition"
        >
          Edit scenario
        </button>

        {/* 🗑 DELETE BUTTON */}
        <button
          onClick={() => {
            setScenarioSegments((prev) =>
              prev.filter((s) => s.id !== seg.id)
            );
          }}
          className="w-full rounded bg-rose-600 py-1 text-xs font-semibold text-white hover:bg-rose-500 transition"
        >
          Delete scenario
        </button>
      </div>
    </Popup>
  </Polyline>
))}

  <EditControl
  position="topleft"
  onCreated={(e) => {
    const layer = e.layer;
    setDrawnLayer(layer);

    const latLngs = layer.getLatLngs();
    setPendingCoords(latLngs);

    setEditingScenarioId(null);
    setModalInitialValues(null);

    setShowPredictionForm(true);
  }}
  onEdited={handleScenarioEdited}
  edit={{
    // ✅ only pass options like remove; DO NOT nest `edit: true`
    remove: false, // keep delete disabled; we use our own Delete button
  }}
  draw={{
    polyline: true,
    rectangle: false,
    circle: false,
    polygon: false,
    marker: false,
  }}
/>
</FeatureGroup>
      </MapContainer>

      {/* New Segment Modal */}
      {showPredictionForm && (
  <NewSegmentModal
    onSubmit={handlePrediction}
    onClose={() => {
      setShowPredictionForm(false);
      setEditingScenarioId(null);
      setModalInitialValues(null);
    }}
    initialValues={modalInitialValues}
  />
)}

      {/* Floating Stats Overlay */}
      <div className="absolute right-4 top-4 z-[1000] w-48 rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-2xl backdrop-blur-md">
        {scenarioActive && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[11px] font-semibold text-indigo-200">
            What-If Scenario Active
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400" />
          </div>
        )}

        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          Area Overview
        </h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-300">Total Blocks</span>
            <span className="text-sm font-bold text-white">
              {stats.total}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-300">
              Avg Compliance
            </span>
            <span className="font-mono text-xs text-slate-100">
              {avgCompliance}%
            </span>
          </div>

          <div className="my-1 h-px bg-slate-700"></div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-red-400">High Risk</span>
            <span className="font-mono text-xs text-red-400">
              {stats.high}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-400">Medium Risk</span>
            <span className="font-mono text-xs text-amber-400">
              {stats.medium}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400">Low Risk</span>
            <span className="font-mono text-xs text-emerald-400">
              {stats.low}
            </span>
          </div>
        </div>

        {scenarioMetrics && (
          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Scenario Impact
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-300">Compliance</span>
              <span className="font-mono text-slate-100">
                {scenarioMetrics.beforeCompliance}% →{" "}
                {scenarioMetrics.afterCompliance}%
              </span>
            </div>

            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-slate-300">Change</span>
              <span
                className={`font-mono ${
                  scenarioMetrics.deltaCompliance >= 0
                    ? "text-emerald-300"
                    : "text-rose-300"
                }`}
              >
                {scenarioMetrics.deltaCompliance >= 0 ? "+" : ""}
                {scenarioMetrics.deltaCompliance}%
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapArea;