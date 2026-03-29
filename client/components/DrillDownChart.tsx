import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';

interface DrillDownNode {
    name: string;
    value: number;
    children?: DrillDownNode[];
}

interface DrillDownLevel {
    label: string;
    data: DrillDownNode[];
}

interface DrillDownChartProps {
    title: string;
    levels: DrillDownLevel[];
}

const LEVEL_COLORS = [
    '#60a5fa', // blue
    '#2dd4bf', // teal
    '#4ade80', // green
];

const CHART_GRID_COLOR = 'rgba(107, 114, 128, 0.3)';
const CHART_TICK_STYLE = { fontSize: 11, fill: '#9CA3AF' };

export default function DrillDownChart({ title, levels }: DrillDownChartProps) {
    // Stack of breadcrumb entries: [{levelIndex, label, data}]
    const [stack, setStack] = useState<{ levelIndex: number; label: string; data: DrillDownNode[] }[]>([
        { levelIndex: 0, label: levels[0]?.label || 'All', data: levels[0]?.data || [] },
    ]);

    const current = stack[stack.length - 1];
    const depth = stack.length - 1;

    const chartData = useMemo(() => {
        if (!current?.data) return [];
        const sorted = [...current.data].sort((a, b) => b.value - a.value);
        return sorted.slice(0, 15); // show top 15
    }, [current]);

    const totalValue = useMemo(() => {
        return chartData.reduce((sum, d) => sum + d.value, 0);
    }, [chartData]);

    const barColor = LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)];

    const handleBarClick = (entry: DrillDownNode) => {
        if (entry.children && entry.children.length > 0) {
            setStack(prev => [
                ...prev,
                {
                    levelIndex: prev.length,
                    label: entry.name,
                    data: entry.children!,
                },
            ]);
        }
    };

    const handleBreadcrumbClick = (index: number) => {
        setStack(prev => prev.slice(0, index + 1));
    };

    if (!chartData || chartData.length === 0) {
        return (
            <div className="text-gray-400 text-sm py-4">No data available</div>
        );
    }

    const chartHeight = Math.max(200, chartData.length * 28);

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">{title}</h3>
            </div>

            {/* Breadcrumb navigation */}
            <div className="flex items-center gap-1 text-sm mb-3 flex-wrap">
                {stack.map((entry, i) => (
                    <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="text-gray-500 dark:text-gray-400">/</span>}
                        {i < stack.length - 1 ? (
                            <button
                                onClick={() => handleBreadcrumbClick(i)}
                                className="text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                            >
                                {entry.label}
                            </button>
                        ) : (
                            <span className="text-gray-200 font-medium">{entry.label}</span>
                        )}
                    </span>
                ))}
            </div>

            {/* Back button when drilled in */}
            {stack.length > 1 && (
                <button
                    onClick={() => setStack(prev => prev.slice(0, prev.length - 1))}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 mb-2 transition-colors"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                </button>
            )}

            {/* Chart */}
            <div
                style={{
                    transition: 'opacity 0.2s ease',
                }}
            >
                <ResponsiveContainer width="100%" height={chartHeight}>
                    <BarChart
                        data={chartData}
                        layout="vertical"
                        margin={{ left: 10, right: 40 }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={CHART_TICK_STYLE} />
                        <YAxis
                            type="category"
                            dataKey="name"
                            tick={CHART_TICK_STYLE}
                            width={100}
                            interval={0}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: '#1F2937',
                                border: '1px solid #374151',
                                borderRadius: '8px',
                                color: '#F3F4F6',
                            }}
                            labelStyle={{ color: '#9CA3AF' }}
                            formatter={(value: number) => {
                                const pct = totalValue > 0 ? ((value / totalValue) * 100).toFixed(1) : '0';
                                return [`${value} (${pct}%)`, 'Flights'];
                            }}
                        />
                        <Bar
                            dataKey="value"
                            name="Flights"
                            radius={[0, 4, 4, 0]}
                            cursor="pointer"
                            onClick={(data: any) => {
                                // Recharts 3 passes the cell payload; name lives at top level or in payload
                                const name = data?.name ?? data?.payload?.name;
                                if (name) {
                                    const node = chartData.find(d => d.name === name);
                                    if (node) handleBarClick(node);
                                }
                            }}
                        >
                            {chartData.map((entry, index) => {
                                const hasChildren = entry.children && entry.children.length > 0;
                                return (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={barColor}
                                        opacity={hasChildren ? 1 : 0.7}
                                        style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                                    />
                                );
                            })}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>

                {/* Percentage labels */}
                <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-400">
                    {chartData.slice(0, 5).map((entry, i) => {
                        const pct = totalValue > 0 ? ((entry.value / totalValue) * 100).toFixed(1) : '0';
                        return (
                            <span key={i} className="flex items-center gap-1">
                                <span
                                    className="inline-block w-2 h-2 rounded-full"
                                    style={{ backgroundColor: barColor }}
                                />
                                {entry.name}: {pct}%
                            </span>
                        );
                    })}
                </div>

                {/* Drill-down hint */}
                {chartData.some(d => d.children && d.children.length > 0) && (
                    <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-2 italic">
                        Click a bar to drill down
                    </p>
                )}
            </div>
        </div>
    );
}

// ---- Data builder utility ----

// Continent mapping - reuses the same structure as CountryProgress.tsx
const CONTINENT_TO_COUNTRIES: Record<string, string[]> = {
    'Europe': [
        'Albania', 'Andorra', 'Austria', 'Belarus', 'Belgium', 'Bosnia and Herzegovina',
        'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Czechia', 'Denmark', 'Estonia',
        'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Iceland', 'Ireland', 'Italy',
        'Kosovo', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Malta', 'Moldova',
        'Monaco', 'Montenegro', 'Netherlands', 'North Macedonia', 'Macedonia', 'Norway',
        'Poland', 'Portugal', 'Romania', 'Russia', 'San Marino', 'Serbia', 'Slovakia',
        'Slovenia', 'Spain', 'Sweden', 'Switzerland', 'United Kingdom', 'UK', 'England',
        'Great Britain', 'Scotland', 'Wales', 'Northern Ireland', 'Ukraine', 'Vatican City',
    ],
    'Asia': [
        'Afghanistan', 'Armenia', 'Azerbaijan', 'Bahrain', 'Bangladesh', 'Bhutan', 'Brunei',
        'Cambodia', 'China', 'Georgia', 'India', 'Indonesia', 'Iran', 'Iraq', 'Israel',
        'Japan', 'Jordan', 'Kazakhstan', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Lebanon',
        'Malaysia', 'Maldives', 'Mongolia', 'Myanmar', 'Nepal', 'North Korea', 'Oman',
        'Pakistan', 'Palestine', 'Philippines', 'Qatar', 'Saudi Arabia', 'Singapore',
        'South Korea', 'Sri Lanka', 'Syria', 'Taiwan', 'Tajikistan', 'Thailand',
        'Timor-Leste', 'East Timor', 'Turkey', 'Turkmenistan', 'United Arab Emirates',
        'UAE', 'Uzbekistan', 'Vietnam', 'Yemen', 'Hong Kong', 'Macau',
    ],
    'North America': [
        'Antigua and Barbuda', 'Bahamas', 'Barbados', 'Belize', 'Canada', 'Costa Rica',
        'Cuba', 'Dominica', 'Dominican Republic', 'El Salvador', 'Grenada', 'Guatemala',
        'Haiti', 'Honduras', 'Jamaica', 'Mexico', 'Nicaragua', 'Panama',
        'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent', 'Trinidad and Tobago',
        'United States', 'USA', 'US', 'Puerto Rico', 'Bermuda', 'Cayman Islands',
        'Curacao', 'Aruba', 'Turks and Caicos',
    ],
    'South America': [
        'Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana',
        'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela', 'French Guiana',
    ],
    'Africa': [
        'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi', 'Cabo Verde',
        'Cape Verde', 'Cameroon', 'Central African Republic', 'Chad', 'Comoros', 'Congo',
        'DR Congo', 'Democratic Republic of the Congo', 'Djibouti', 'Egypt',
        'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Swaziland', 'Ethiopia', 'Gabon',
        'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Ivory Coast', "Cote d'Ivoire",
        'Kenya', 'Lesotho', 'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali',
        'Mauritania', 'Mauritius', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria',
        'Rwanda', 'Sao Tome and Principe', 'Senegal', 'Seychelles', 'Sierra Leone',
        'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo', 'Tunisia',
        'Uganda', 'Zambia', 'Zimbabwe',
    ],
    'Oceania': [
        'Australia', 'Fiji', 'Kiribati', 'Marshall Islands', 'Micronesia', 'Nauru',
        'New Zealand', 'Palau', 'Papua New Guinea', 'Samoa', 'Solomon Islands', 'Tonga',
        'Tuvalu', 'Vanuatu', 'New Caledonia', 'French Polynesia', 'Guam',
    ],
};

// Build a reverse lookup: lowercase country name -> continent name
const COUNTRY_TO_CONTINENT: Record<string, string> = {};
for (const [continent, countries] of Object.entries(CONTINENT_TO_COUNTRIES)) {
    for (const country of countries) {
        COUNTRY_TO_CONTINENT[country.toLowerCase()] = continent;
    }
}

function findContinent(countryName: string): string {
    const lower = countryName.toLowerCase().trim();
    if (COUNTRY_TO_CONTINENT[lower]) return COUNTRY_TO_CONTINENT[lower];

    // Fuzzy: check if any key is contained in the country name or vice versa
    for (const [key, continent] of Object.entries(COUNTRY_TO_CONTINENT)) {
        if (lower.includes(key) || key.includes(lower)) return continent;
    }

    return 'Other';
}

/**
 * Build a hierarchical drill-down structure from statistics data.
 *
 * mostCommonCountries: { "Germany": 10, "United States": 8, ... }
 * mostVisitedAirports: { "FRA - Frankfurt/Germany": 5, "JFK - New York/United States": 3, ... }
 *
 * Returns levels: Continent -> Country -> Airport
 */
export function buildGeographicDrillDown(
    mostCommonCountries: Record<string, number>,
    mostVisitedAirports: Record<string, number>,
): DrillDownLevel[] {
    // Parse airport keys to extract country: "IATA - City/Country" -> { display, country, count }
    const airports: { display: string; country: string; count: number }[] = [];
    for (const [key, count] of Object.entries(mostVisitedAirports)) {
        // Format: "IATA - City/Country" or "ICAO - City/Country"
        const slashIdx = key.lastIndexOf('/');
        const country = slashIdx !== -1 ? key.substring(slashIdx + 1).trim() : 'Unknown';
        airports.push({ display: key, country, count: count as number });
    }

    // Group countries by continent
    const continentMap: Record<string, { country: string; count: number; airports: { display: string; count: number }[] }[]> = {};

    for (const [country, count] of Object.entries(mostCommonCountries)) {
        const continent = findContinent(country);
        if (!continentMap[continent]) continentMap[continent] = [];

        // Find airports in this country
        const countryAirports = airports
            .filter(a => a.country.toLowerCase() === country.toLowerCase())
            .map(a => ({ display: a.display, count: a.count }));

        continentMap[continent].push({
            country,
            count: count as number,
            airports: countryAirports,
        });
    }

    // Build the tree
    const continentNodes: DrillDownNode[] = Object.entries(continentMap)
        .map(([continent, countries]) => ({
            name: continent,
            value: countries.reduce((sum, c) => sum + c.count, 0),
            children: countries
                .sort((a, b) => b.count - a.count)
                .map(c => ({
                    name: c.country,
                    value: c.count,
                    children: c.airports.length > 0
                        ? c.airports.sort((a, b) => b.count - a.count).map(a => ({
                            name: a.display,
                            value: a.count,
                        }))
                        : undefined,
                })),
        }))
        .sort((a, b) => b.value - a.value);

    return [
        { label: 'Continents', data: continentNodes },
    ];
}
