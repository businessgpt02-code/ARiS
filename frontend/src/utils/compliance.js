export const CPWD = {
  MIN_CLEAR_WIDTH_M: 1.2,
  MAX_SLOPE_PERCENT: 8.33, // 1:12 ≈ 8.33%
};

export function computeCompliance(block) {
  const width = Number(block.sidewalk_width_m);
  const slope = Number(block.slope_percent);
  const ramp = String(block.has_curb_ramp).toLowerCase();
  const lighting = String(block.lighting_quality).toLowerCase();
  const surface = String(block.surface_quality).toLowerCase();

  const checks = [
    {
      key: "width",
      label: `Clear width ≥ ${CPWD.MIN_CLEAR_WIDTH_M}m`,
      ok: width >= CPWD.MIN_CLEAR_WIDTH_M,
      value: `${isFinite(width) ? width.toFixed(2) : width} m`,
    },
    {
      key: "slope",
      label: `Slope ≤ ${CPWD.MAX_SLOPE_PERCENT}% (1:12)`,
      ok: slope <= CPWD.MAX_SLOPE_PERCENT,
      value: `${isFinite(slope) ? slope.toFixed(2) : slope} %`,
    },
    {
      key: "ramp",
      label: "Curb ramp present at crossing",
      ok: ramp === "yes",
      value: ramp,
    },
    {
      key: "surface",
      label: "Surface firm & even (smooth)",
      ok: surface === "smooth",
      value: surface,
    },
    {
      key: "lighting",
      label: "Adequate pedestrian lighting",
      ok: lighting !== "poor",
      value: lighting,
    },
  ];

  const passed = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const pct = Math.round((passed / total) * 100);

  let summary = "Partially compliant";
  if (passed === total) summary = "Fully compliant";
  else if (passed <= 2) summary = "High non-compliance";

  return { checks, passed, total, pct, summary };
}

export function isNonCompliant(block) {
  const c = computeCompliance(block);
  return c.passed < c.total;
}
