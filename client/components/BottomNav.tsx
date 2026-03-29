import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface TabProps {
    to: string;
    label: string;
    icon: React.ReactNode;
    accent?: boolean;
}

function Tab({ to, label, icon, accent = false }: TabProps) {
    return (
        <NavLink to={to} className="flex-1 flex flex-col items-center justify-center py-1">
            {({ isActive }) => (
                <div className={`flex flex-col items-center gap-0.5
                    ${accent
                        ? 'text-primary-400'
                        : isActive
                            ? 'text-primary-400'
                            : 'text-gray-400'
                    }`}>
                    <div className={accent
                        ? 'w-11 h-11 rounded-full bg-primary-500 flex items-center justify-center -mt-4 shadow-lg shadow-primary-500/30 text-white'
                        : 'w-6 h-6'
                    }>
                        {icon}
                    </div>
                    <span className={`text-[10px] font-sans font-medium leading-tight
                        ${accent
                            ? 'text-primary-400 -mt-0.5'
                            : isActive
                                ? 'text-primary-400'
                                : 'text-gray-500'
                        }`}>
                        {label}
                    </span>
                </div>
            )}
        </NavLink>
    );
}

function HomeIcon() {
    return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1V10.5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 21V14h6v7" />
        </svg>
    );
}

function FlightsIcon() {
    return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h10M4 18h6" />
        </svg>
    );
}

function AddIcon() {
    return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v8M8 12h8" />
        </svg>
    );
}

function StatsIcon() {
    return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M4 20V10M8 20V14M12 20V8M16 20V12M20 20V6" />
        </svg>
    );
}

function SettingsIcon() {
    return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1.08-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1.08 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33h.08a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v.08a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
    );
}

export default function BottomNav() {
    const location = useLocation();

    if (location.pathname === '/login') {
        return null;
    }

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden
                        bg-gray-800/90 backdrop-blur-md border-t border-gray-700/50
                        pb-safe">
            <div className="flex items-center justify-around h-16">
                <Tab to="/" label="Home" icon={<HomeIcon />} />
                <Tab to="/flights" label="Flights" icon={<FlightsIcon />} />
                <Tab to="/new" label="Add" icon={<AddIcon />} accent />
                <Tab to="/statistics" label="Stats" icon={<StatsIcon />} />
                <Tab to="/settings" label="Settings" icon={<SettingsIcon />} />
            </div>
        </nav>
    );
}
