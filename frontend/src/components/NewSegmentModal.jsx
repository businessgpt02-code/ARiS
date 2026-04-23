// NewSegmentModal.jsx
import { useState } from "react";

const NewSegmentModal = ({ onSubmit, onClose, initialValues }) => {
  const [formData, setFormData] = useState(() =>
    initialValues || {
      ward: "",                 // 🔹 NEW
      sidewalk_width_m: 1.2,
      slope_percent: 5,
      has_curb_ramp: "yes",
      traffic_level: "medium",
      lighting_quality: "good",
      surface_quality: "smooth",
      near_school: false,       // 🔹 NEW (optional)
      near_hospital: false,     // 🔹 NEW (optional)
    }
  );

  const handleChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = () => {
    // You can enforce ward: if (!formData.ward) return;
    onSubmit({
      ward: formData.ward, // 🔹 NEW

      sidewalk_width_m: Number(formData.sidewalk_width_m),
      slope_percent: Number(formData.slope_percent),
      has_curb_ramp: formData.has_curb_ramp.toLowerCase(),
      traffic_level: formData.traffic_level.toLowerCase(),
      lighting_quality: formData.lighting_quality.toLowerCase(),
      surface_quality: formData.surface_quality.toLowerCase(),

      near_school: Boolean(formData.near_school),     // 🔹 NEW
      near_hospital: Boolean(formData.near_hospital), // 🔹 NEW
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-[360px] p-5 shadow-2xl">
        <h2 className="text-base font-semibold text-slate-100 mb-4">
          Predict Accessibility Risk
        </h2>

        <div className="space-y-3 text-sm">
          {/* 🔹 Ward / Zone */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Ward / Zone
            </label>
            <select
              value={formData.ward}
              onChange={(e) => handleChange("ward", e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Select ward</option>
              <option value="Ward-1">Ward 1</option>
              <option value="Ward-2">Ward 2</option>
              <option value="Ward-3">Ward 3</option>
              {/* later replace with your real wards/zones */}
            </select>
          </div>

          {/* Sidewalk width */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Sidewalk width (m)
            </label>
            <input
              type="number"
              step="0.05"
              min="0.5"
              max="3"
              value={formData.sidewalk_width_m}
              onChange={(e) =>
                handleChange("sidewalk_width_m", e.target.value)
              }
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Slope */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Slope (%)
            </label>
            <input
              type="number"
              step="0.25"
              min="0"
              max="15"
              value={formData.slope_percent}
              onChange={(e) =>
                handleChange("slope_percent", e.target.value)
              }
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Curb ramp */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Curb ramps
            </label>
            <select
              value={formData.has_curb_ramp}
              onChange={(e) =>
                handleChange("has_curb_ramp", e.target.value)
              }
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="yes">Yes (accessible)</option>
              <option value="no">No (missing)</option>
            </select>
          </div>

          {/* Traffic level */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Traffic level
            </label>
            <select
              value={formData.traffic_level}
              onChange={(e) =>
                handleChange("traffic_level", e.target.value)
              }
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* Lighting quality */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Lighting quality
            </label>
            <select
              value={formData.lighting_quality}
              onChange={(e) =>
                handleChange("lighting_quality", e.target.value)
              }
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="good">Good</option>
              <option value="average">Average</option>
              <option value="poor">Poor</option>
            </select>
          </div>

          {/* Surface quality */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Surface condition
            </label>
            <select
              value={formData.surface_quality}
              onChange={(e) =>
                handleChange("surface_quality", e.target.value)
              }
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="smooth">Smooth</option>
              <option value="uneven">Uneven</option>
              <option value="broken">Broken</option>
            </select>
          </div>

          {/* 🔹 Proximity flags (for priority engine) */}
          <div className="flex items-center gap-3 pt-1">
            <label className="flex items-center gap-1 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={formData.near_school}
                onChange={(e) =>
                  handleChange("near_school", e.target.checked)
                }
              />
              Near school
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={formData.near_hospital}
                onChange={(e) =>
                  handleChange("near_hospital", e.target.checked)
                }
              />
              Near hospital
            </label>
          </div>
        </div>

        <div className="mt-5 space-y-2">
          <button
            onClick={handleSubmit}
            className="w-full py-2.5 rounded-md bg-indigo-500 text-sm font-semibold text-white hover:bg-indigo-500/90 transition"
          >
            Predict
          </button>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-md bg-slate-800 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewSegmentModal;