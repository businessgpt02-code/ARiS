import React from 'react';

const Header = ({ apiStatus }) => {
    const isOnline = apiStatus && apiStatus.includes("online");

    return (
        <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md sticky top-0 z-50 flex items-center justify-between px-6 shadow-sm">
            <div className="flex items-center gap-3">
                {/* Placeholder for AI Icon */}
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-indigo-500/20">
                    AI
                </div>
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                    ARiS <span className="text-slate-500 font-medium text-sm ml-2 hidden sm:inline">Urban Accessibility Risk Mapping</span>
                </h1>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-400">
                <div className="relative flex h-2.5 w-2.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                </div>
                <span className="truncate max-w-[200px]">{apiStatus}</span>
            </div>
        </header>
    );
};

export default Header;
