import React from 'react';

interface SeatPreferenceVizProps {
    seatData: { window: number; middle: number; aisle: number };
    sideData: { left: number; right: number; center: number };
}

export default function SeatPreferenceViz({ seatData, sideData }: SeatPreferenceVizProps) {
    const seatTotal = seatData.window + seatData.middle + seatData.aisle;
    const sideTotal = sideData.left + sideData.right + sideData.center;

    const seatPct = {
        window: seatTotal > 0 ? Math.round((seatData.window / seatTotal) * 100) : 0,
        middle: seatTotal > 0 ? Math.round((seatData.middle / seatTotal) * 100) : 0,
        aisle: seatTotal > 0 ? Math.round((seatData.aisle / seatTotal) * 100) : 0,
    };

    const sidePct = {
        left: sideTotal > 0 ? Math.round((sideData.left / sideTotal) * 100) : 0,
        right: sideTotal > 0 ? Math.round((sideData.right / sideTotal) * 100) : 0,
        center: sideTotal > 0 ? Math.round((sideData.center / sideTotal) * 100) : 0,
    };

    // Max seat percentage for scaling
    const maxSeatPct = Math.max(seatPct.window, seatPct.middle, seatPct.aisle, 1);

    return (
        <div className="space-y-6">
            {/* Cross-section view */}
            {seatTotal > 0 && (
                <div>
                    <h4 className="text-sm font-semibold mb-3 text-gray-600 dark:text-gray-400">Cross-Section View</h4>
                    <svg viewBox="0 0 300 160" className="w-full max-w-xs mx-auto" role="img" aria-label="Aircraft cross-section showing seat preferences">
                        {/* Fuselage outline */}
                        <ellipse cx="150" cy="80" rx="130" ry="65" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 dark:text-gray-500" />
                        {/* Roof interior arc */}
                        <path d="M 40 80 A 110 55 0 0 1 260 80" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-gray-300 dark:text-gray-600" />

                        {/* Floor line */}
                        <line x1="40" y1="110" x2="260" y2="110" stroke="currentColor" strokeWidth="1" className="text-gray-300 dark:text-gray-600" />

                        {/* Seat columns - 3 groups */}
                        {/* Window Left */}
                        <SeatColumn
                            x={65} y={110}
                            fillPct={seatPct.window / maxSeatPct}
                            pct={seatPct.window}
                            label="Window"
                            count={seatData.window}
                        />
                        {/* Aisle indicator */}
                        <line x1="110" y1="60" x2="110" y2="110" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" className="text-gray-300 dark:text-gray-600" />

                        {/* Middle */}
                        <SeatColumn
                            x={150} y={110}
                            fillPct={seatPct.middle / maxSeatPct}
                            pct={seatPct.middle}
                            label="Middle"
                            count={seatData.middle}
                        />
                        {/* Aisle indicator */}
                        <line x1="190" y1="60" x2="190" y2="110" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" className="text-gray-300 dark:text-gray-600" />

                        {/* Window Right */}
                        <SeatColumn
                            x={235} y={110}
                            fillPct={seatPct.aisle / maxSeatPct}
                            pct={seatPct.aisle}
                            label="Aisle"
                            count={seatData.aisle}
                        />
                    </svg>
                </div>
            )}

            {/* Top-down side preference */}
            {sideTotal > 0 && (
                <div>
                    <h4 className="text-sm font-semibold mb-3 text-gray-600 dark:text-gray-400">Aircraft Side Preference</h4>
                    <svg viewBox="0 0 200 320" className="w-full max-w-[160px] mx-auto" role="img" aria-label="Top-down aircraft view showing side preferences">
                        {/* Aircraft body outline */}
                        {/* Nose */}
                        <path
                            d="M 100 10 C 70 10, 55 50, 55 80 L 55 260 C 55 280, 70 300, 100 310 C 130 300, 145 280, 145 260 L 145 80 C 145 50, 130 10, 100 10 Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-gray-400 dark:text-gray-500"
                        />
                        {/* Center line */}
                        <line x1="100" y1="30" x2="100" y2="300" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" className="text-gray-300 dark:text-gray-600" />

                        {/* Wings */}
                        <path d="M 55 140 L 10 170 L 10 180 L 55 165" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 dark:text-gray-500" />
                        <path d="M 145 140 L 190 170 L 190 180 L 145 165" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 dark:text-gray-500" />

                        {/* Tail */}
                        <path d="M 55 270 L 30 290 L 30 300 L 55 285" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 dark:text-gray-500" />
                        <path d="M 145 270 L 170 290 L 170 300 L 145 285" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 dark:text-gray-500" />

                        {/* Left side fill */}
                        <rect
                            x="58" y="85" width="40" height="170" rx="4"
                            fill="#3b82f6"
                            opacity={sideTotal > 0 ? Math.max(0.15, sidePct.left / 100) : 0.1}
                        />
                        {/* Center fill */}
                        {sidePct.center > 0 && (
                            <rect
                                x="82" y="85" width="36" height="170" rx="4"
                                fill="#8b5cf6"
                                opacity={Math.max(0.15, sidePct.center / 100)}
                            />
                        )}
                        {/* Right side fill */}
                        <rect
                            x="102" y="85" width="40" height="170" rx="4"
                            fill="#10b981"
                            opacity={sideTotal > 0 ? Math.max(0.15, sidePct.right / 100) : 0.1}
                        />

                        {/* Labels */}
                        <text x="78" y="175" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-gray-800 dark:fill-gray-200">{sidePct.left}%</text>
                        <text x="78" y="190" textAnchor="middle" fontSize="9" className="fill-gray-500 dark:fill-gray-400">Left</text>

                        {sidePct.center > 0 && (
                            <>
                                <text x="100" y="215" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-gray-800 dark:fill-gray-200">{sidePct.center}%</text>
                                <text x="100" y="230" textAnchor="middle" fontSize="9" className="fill-gray-500 dark:fill-gray-400">Center</text>
                            </>
                        )}

                        <text x="122" y="175" textAnchor="middle" fontSize="12" fontWeight="600" className="fill-gray-800 dark:fill-gray-200">{sidePct.right}%</text>
                        <text x="122" y="190" textAnchor="middle" fontSize="9" className="fill-gray-500 dark:fill-gray-400">Right</text>
                    </svg>
                </div>
            )}

            {seatTotal === 0 && sideTotal === 0 && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">No seat data recorded</p>
            )}
        </div>
    );
}

function SeatColumn({ x, y, fillPct, pct, label, count }: { x: number; y: number; fillPct: number; pct: number; label: string; count: number }) {
    const maxHeight = 40;
    const barHeight = Math.max(4, fillPct * maxHeight);
    const barWidth = 30;

    return (
        <g>
            {/* Seat rectangle */}
            <rect
                x={x - barWidth / 2}
                y={y - barHeight}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill="#3b82f6"
                opacity={Math.max(0.2, fillPct)}
            />
            {/* Seat back */}
            <rect
                x={x - barWidth / 2 - 2}
                y={y - barHeight - 6}
                width={barWidth + 4}
                height={6}
                rx={2}
                fill="currentColor"
                className="text-gray-400 dark:text-gray-500"
            />
            {/* Percentage */}
            <text
                x={x}
                y={y - barHeight - 12}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                className="fill-gray-800 dark:fill-gray-200"
            >
                {pct}%
            </text>
            {/* Label */}
            <text
                x={x}
                y={y + 14}
                textAnchor="middle"
                fontSize="9"
                className="fill-gray-500 dark:fill-gray-400"
            >
                {label}
            </text>
            {/* Count */}
            <text
                x={x}
                y={y + 24}
                textAnchor="middle"
                fontSize="8"
                className="fill-gray-400 dark:fill-gray-500"
            >
                ({count})
            </text>
        </g>
    );
}
