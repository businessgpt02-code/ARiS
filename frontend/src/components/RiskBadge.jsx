import React from 'react';

const RiskBadge = ({ level }) => {
    const colorClasses =
        level === "high" ? "bg-red-500/10 text-red-500 border-red-500/20" :
            level === "medium" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                level === "low" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                    "bg-slate-500/10 text-slate-400 border-slate-500/20";

    const label = level ? level.toUpperCase() : "UNKNOWN";

    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded border ${colorClasses}`}
        >
            {label}
        </span>
    );
};

export default RiskBadge;
