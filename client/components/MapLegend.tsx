import React from 'react';

const LEGEND_ITEMS = [
    { label: '1', color: 'rgb(100, 149, 237)' },
    { label: '2-3', color: 'rgb(0, 200, 200)' },
    { label: '4-6', color: 'rgb(50, 205, 50)' },
    { label: '7-10', color: 'rgb(255, 215, 0)' },
    { label: '11+', color: 'rgb(255, 69, 0)' },
];

export default function MapLegend() {
    return (
        <div
            className="absolute bottom-3 left-3 z-40 px-3 py-2 rounded-lg text-xs text-white pointer-events-none"
            style={{
                background: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
        >
            <div className="font-semibold mb-1.5 text-gray-300">Route frequency</div>
            <div className="flex items-center gap-0.5">
                {LEGEND_ITEMS.map((item, i) => (
                    <div key={i} className="flex flex-col items-center">
                        <div
                            className="rounded-sm"
                            style={{
                                width: 28,
                                height: 6,
                                background: item.color,
                                boxShadow: `0 0 6px ${item.color}`,
                            }}
                        />
                        <span className="mt-1 text-[10px] text-gray-400">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
