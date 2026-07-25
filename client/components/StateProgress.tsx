import React, { useMemo } from 'react';

interface StateProgressProps {
    visitedStates: string[];
}

interface RegionData {
    name: string;
    states: string[];
}

// 50 US states grouped by Census region (mirrors the by-continent country layout).
const US_REGIONS: RegionData[] = [
    {
        name: 'Northeast',
        states: [
            'Connecticut', 'Maine', 'Massachusetts', 'New Hampshire', 'New Jersey',
            'New York', 'Pennsylvania', 'Rhode Island', 'Vermont',
        ],
    },
    {
        name: 'Midwest',
        states: [
            'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Michigan', 'Minnesota',
            'Missouri', 'Nebraska', 'North Dakota', 'Ohio', 'South Dakota', 'Wisconsin',
        ],
    },
    {
        name: 'South',
        states: [
            'Alabama', 'Arkansas', 'Delaware', 'Florida', 'Georgia', 'Kentucky',
            'Louisiana', 'Maryland', 'Mississippi', 'North Carolina', 'Oklahoma',
            'South Carolina', 'Tennessee', 'Texas', 'Virginia', 'West Virginia',
        ],
    },
    {
        name: 'West',
        states: [
            'Alaska', 'Arizona', 'California', 'Colorado', 'Hawaii', 'Idaho',
            'Montana', 'Nevada', 'New Mexico', 'Oregon', 'Utah', 'Washington', 'Wyoming',
        ],
    },
];

function DonutChart({ visited, total, size = 64 }: { visited: number; total: number; size?: number }) {
    const radius = (size - 8) / 2;
    const center = size / 2;
    const circumference = 2 * Math.PI * radius;
    const pct = total > 0 ? visited / total : 0;
    const strokeDashoffset = circumference * (1 - pct);

    return (
        <svg width={size} height={size} className="block mx-auto">
            <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={6}
                className="stroke-gray-200 dark:stroke-gray-700" />
            <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={6}
                strokeLinecap="round" className="stroke-primary-500"
                strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
            <text x={center} y={center - 4} textAnchor="middle" dominantBaseline="central"
                fontSize="14" fontWeight="700" className="fill-gray-800 dark:fill-gray-200">
                {Math.round(pct * 100)}%
            </text>
            <text x={center} y={center + 12} textAnchor="middle" dominantBaseline="central"
                fontSize="9" className="fill-gray-500 dark:fill-gray-400">
                {visited}/{total}
            </text>
        </svg>
    );
}

export default function StateProgress({ visitedStates }: StateProgressProps) {
    const visitedSet = useMemo(() => {
        const set = new Set<string>();
        visitedStates.forEach(s => set.add(s.toLowerCase().trim()));
        return set;
    }, [visitedStates]);

    const regionStats = useMemo(() => {
        return US_REGIONS.map(region => {
            const states = region.states.map(name => ({
                name,
                visited: visitedSet.has(name.toLowerCase()),
            }));
            return {
                name: region.name,
                states,
                visited: states.filter(s => s.visited).length,
                total: states.length,
            };
        });
    }, [visitedSet]);

    const totalVisited = regionStats.reduce((sum, r) => sum + r.visited, 0);
    const totalStates = regionStats.reduce((sum, r) => sum + r.total, 0);

    return (
        <div>
            <div className="text-center mb-4">
                <span className="text-2xl font-bold">{totalVisited}</span>
                <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">of {totalStates} states</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {regionStats.map(region => (
                    <div key={region.name} className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                        <div className="flex items-center gap-3 mb-2">
                            <DonutChart visited={region.visited} total={region.total} size={64} />
                            <div>
                                <h4 className="font-semibold text-sm">{region.name}</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {region.visited} of {region.total} states
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                            {region.states.map(state => (
                                <span
                                    key={state.name}
                                    className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded ${
                                        state.visited
                                            ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium'
                                            : 'bg-gray-100 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500'
                                    }`}
                                    title={state.name}
                                >
                                    {state.name}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
