import React, { useMemo, useState } from 'react';

interface HeatmapCalendarProps {
    flights: { date: string; count: number }[];
    year: number;
}

export default function HeatmapCalendar({ flights, year }: HeatmapCalendarProps) {
    const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; count: number } | null>(null);

    const { weeks, monthLabels } = useMemo(() => {
        // Build a map of date -> count
        const countMap: Record<string, number> = {};
        flights.forEach(f => { countMap[f.date] = (countMap[f.date] || 0) + f.count; });

        // Jan 1 of the given year
        const startDate = new Date(year, 0, 1);
        const endDate = new Date(year, 11, 31);

        // Pad back to the previous Sunday so week columns align
        const padStart = new Date(startDate);
        padStart.setDate(padStart.getDate() - padStart.getDay());

        // Build week columns
        const weeks: { date: string; count: number; inYear: boolean }[][] = [];
        let currentWeek: { date: string; count: number; inYear: boolean }[] = [];

        const cursor = new Date(padStart);
        // Go until we've passed Dec 31 and completed the week
        while (cursor <= endDate || currentWeek.length > 0) {
            const dateStr = cursor.toISOString().substring(0, 10);
            const inYear = cursor.getFullYear() === year;
            currentWeek.push({
                date: dateStr,
                count: countMap[dateStr] || 0,
                inYear,
            });

            if (currentWeek.length === 7) {
                weeks.push(currentWeek);
                currentWeek = [];
                if (cursor > endDate) break;
            }

            cursor.setDate(cursor.getDate() + 1);
        }
        if (currentWeek.length > 0) {
            weeks.push(currentWeek);
        }

        // Compute month label positions
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthLabels: { label: string; weekIndex: number }[] = [];
        const seen = new Set<number>();

        weeks.forEach((week, wi) => {
            for (const day of week) {
                if (!day.inYear) continue;
                const d = new Date(day.date + 'T00:00:00');
                const m = d.getMonth();
                if (!seen.has(m)) {
                    seen.add(m);
                    monthLabels.push({ label: monthNames[m], weekIndex: wi });
                }
                break; // only need the first in-year day per week
            }
        });

        return { weeks, monthLabels };
    }, [flights, year]);

    const CELL = 11;
    const GAP = 2;
    const LEFT_MARGIN = 28;
    const TOP_MARGIN = 16;
    const svgWidth = LEFT_MARGIN + weeks.length * (CELL + GAP);
    const svgHeight = TOP_MARGIN + 7 * (CELL + GAP);

    const getColor = (count: number, inYear: boolean): string => {
        if (!inYear) return 'transparent';
        if (count === 0) return 'var(--heatmap-0)';
        if (count === 1) return 'var(--heatmap-1)';
        if (count === 2) return 'var(--heatmap-2)';
        return 'var(--heatmap-3)';
    };

    const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

    return (
        <div className="overflow-x-auto">
            <style>{`
                :root {
                    --heatmap-0: #d4d4d8;
                    --heatmap-1: #1e3a8a;
                    --heatmap-2: #1d4ed8;
                    --heatmap-3: #3b82f6;
                }
                .dark {
                    --heatmap-0: #27272a;
                    --heatmap-1: #1e3a8a;
                    --heatmap-2: #1d4ed8;
                    --heatmap-3: #3b82f6;
                }
            `}</style>
            <svg
                width={svgWidth}
                height={svgHeight}
                className="block"
                onMouseLeave={() => setTooltip(null)}
            >
                {/* Month labels */}
                {monthLabels.map((ml, i) => (
                    <text
                        key={i}
                        x={LEFT_MARGIN + ml.weekIndex * (CELL + GAP)}
                        y={TOP_MARGIN - 4}
                        className="fill-gray-500 dark:fill-gray-400"
                        fontSize={9}
                        fontFamily="Inter, system-ui, sans-serif"
                    >
                        {ml.label}
                    </text>
                ))}

                {/* Day labels */}
                {dayLabels.map((label, di) => (
                    label ? (
                        <text
                            key={di}
                            x={0}
                            y={TOP_MARGIN + di * (CELL + GAP) + CELL - 1}
                            className="fill-gray-500 dark:fill-gray-400"
                            fontSize={9}
                            fontFamily="Inter, system-ui, sans-serif"
                        >
                            {label}
                        </text>
                    ) : null
                ))}

                {/* Cells */}
                {weeks.map((week, wi) =>
                    week.map((day, di) => (
                        <rect
                            key={`${wi}-${di}`}
                            x={LEFT_MARGIN + wi * (CELL + GAP)}
                            y={TOP_MARGIN + di * (CELL + GAP)}
                            width={CELL}
                            height={CELL}
                            rx={2}
                            fill={getColor(day.count, day.inYear)}
                            className="cursor-pointer"
                            onMouseEnter={(e) => {
                                if (!day.inYear) return;
                                const rect = (e.target as SVGRectElement).getBoundingClientRect();
                                setTooltip({
                                    x: rect.left + rect.width / 2,
                                    y: rect.top,
                                    date: day.date,
                                    count: day.count,
                                });
                            }}
                            onMouseLeave={() => setTooltip(null)}
                        />
                    ))
                )}
            </svg>

            {/* Tooltip */}
            {tooltip && (
                <div
                    className="fixed z-50 px-2 py-1 text-xs rounded shadow-lg bg-gray-900 text-gray-100 dark:bg-gray-700 dark:text-gray-200 pointer-events-none whitespace-nowrap"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y - 30,
                        transform: 'translateX(-50%)',
                    }}
                >
                    {tooltip.date}: {tooltip.count} flight{tooltip.count !== 1 ? 's' : ''}
                </div>
            )}

            {/* Legend */}
            <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-400">
                <span>Less</span>
                {[0, 1, 2, 3].map(level => (
                    <div
                        key={level}
                        className="rounded-sm"
                        style={{
                            width: 10,
                            height: 10,
                            backgroundColor: level === 0
                                ? 'var(--heatmap-0)'
                                : level === 1
                                ? 'var(--heatmap-1)'
                                : level === 2
                                ? 'var(--heatmap-2)'
                                : 'var(--heatmap-3)',
                        }}
                    />
                ))}
                <span>More</span>
            </div>
        </div>
    );
}
