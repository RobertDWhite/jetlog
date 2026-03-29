import React, { useState } from 'react';

import { Flight } from '../models';
import { Button } from './Elements';

interface ShareableCardProps {
    flight: Flight;
    onClose: () => void;
}

/** Format minutes as "Xh Ym" */
function formatDuration(minutes: number): string {
    if (!minutes) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

/** Format date as "Mon DD, YYYY" */
function formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * Draw the shareable card onto a canvas and trigger a PNG download.
 * Uses the native Canvas API -- no external libraries needed.
 */
function renderCardToCanvas(flight: Flight): Promise<void> {
    return new Promise((resolve) => {
        const W = 1200;
        const H = 630;
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d')!;

        // -- Background gradient: dark blue to teal --
        const grad = ctx.createLinearGradient(0, 0, W, H);
        grad.addColorStop(0, '#0f172a');   // slate-900
        grad.addColorStop(0.5, '#1e3a5f'); // dark navy
        grad.addColorStop(1, '#0d9488');   // teal-600
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // -- Subtle grid pattern overlay --
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 40) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        for (let y = 0; y < H; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
        }

        const originCode = flight.origin.iata || flight.origin.icao || '???';
        const destCode = flight.destination.iata || flight.destination.icao || '???';
        const originCity = flight.origin.municipality || '';
        const destCity = flight.destination.municipality || '';

        // -- Great-circle arc SVG between two abstract points --
        const arcStartX = 200;
        const arcEndX = W - 200;
        const arcY = 260;
        const arcPeakY = 180;

        // Arc path
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.5)'; // primary-400 @ 50%
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(arcStartX, arcY);
        ctx.quadraticCurveTo((arcStartX + arcEndX) / 2, arcPeakY, arcEndX, arcY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dots at origin / destination
        ctx.fillStyle = '#60a5fa'; // primary-400
        ctx.beginPath(); ctx.arc(arcStartX, arcY, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(arcEndX, arcY, 8, 0, Math.PI * 2); ctx.fill();

        // Airplane icon on the arc midpoint
        const midX = (arcStartX + arcEndX) / 2;
        const midY = (arcY + arcPeakY) / 2 - 5;
        ctx.fillStyle = '#ffffff';
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('\u2708', midX, midY + 8);

        // -- Route codes (hero element) --
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 72px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(originCode, arcStartX - 50, arcY + 80);

        ctx.font = 'bold 72px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(destCode, arcEndX + 50, arcY + 80);

        // Arrow between codes
        ctx.textAlign = 'center';
        ctx.font = '48px sans-serif';
        ctx.fillStyle = 'rgba(96, 165, 250, 0.8)';
        ctx.fillText('\u2192', midX, arcY + 76);

        // -- City names below codes --
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '22px Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(originCity, arcStartX - 50, arcY + 112);
        ctx.textAlign = 'right';
        ctx.fillText(destCity, arcEndX + 50, arcY + 112);

        // -- Date at top --
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '24px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(formatDate(flight.date), midX, 60);

        // -- Detail row at bottom --
        const detailY = H - 130;
        const details: string[] = [];
        if (flight.airline?.name) details.push(flight.airline.name);
        if (flight.flightNumber) details.push(flight.flightNumber);
        if (flight.airplane) details.push(flight.airplane);
        if (flight.duration) details.push(formatDuration(flight.duration));
        if (flight.distance) details.push(`${flight.distance.toLocaleString()} km`);

        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '20px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        const detailStr = details.join('  \u00B7  ');
        ctx.fillText(detailStr, midX, detailY);

        // -- Ticket class badge if present --
        if (flight.ticketClass) {
            const badgeY = detailY + 35;
            const badgeText = flight.ticketClass.charAt(0).toUpperCase() + flight.ticketClass.slice(1);
            ctx.font = '16px Inter, system-ui, sans-serif';
            const badgeW = ctx.measureText(badgeText).width + 24;
            const badgeX = midX - badgeW / 2;

            ctx.fillStyle = 'rgba(96, 165, 250, 0.2)';
            // Rounded rect
            const r = 12;
            ctx.beginPath();
            ctx.moveTo(badgeX + r, badgeY - 16);
            ctx.lineTo(badgeX + badgeW - r, badgeY - 16);
            ctx.quadraticCurveTo(badgeX + badgeW, badgeY - 16, badgeX + badgeW, badgeY - 16 + r);
            ctx.lineTo(badgeX + badgeW, badgeY + 8 - r);
            ctx.quadraticCurveTo(badgeX + badgeW, badgeY + 8, badgeX + badgeW - r, badgeY + 8);
            ctx.lineTo(badgeX + r, badgeY + 8);
            ctx.quadraticCurveTo(badgeX, badgeY + 8, badgeX, badgeY + 8 - r);
            ctx.lineTo(badgeX, badgeY - 16 + r);
            ctx.quadraticCurveTo(badgeX, badgeY - 16, badgeX + r, badgeY - 16);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = 'rgba(147, 197, 253, 0.9)';
            ctx.textAlign = 'center';
            ctx.fillText(badgeText, midX, badgeY);
        }

        // -- "Logged with Jetlog" watermark --
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '16px Inter, system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText('Logged with Jetlog', W - 30, H - 20);

        // -- Trigger download --
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const fn = flight.flightNumber || `${originCode}-${destCode}`;
        link.download = `flight-${fn}-${flight.date}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        resolve();
    });
}

export default function ShareableCard({ flight, onClose }: ShareableCardProps) {
    const [saving, setSaving] = useState(false);

    const originCode = flight.origin.iata || flight.origin.icao || '???';
    const destCode = flight.destination.iata || flight.destination.icao || '???';
    const originCity = flight.origin.municipality || '';
    const destCity = flight.destination.municipality || '';

    const details: string[] = [];
    if (flight.airline?.name) details.push(flight.airline.name);
    if (flight.flightNumber) details.push(flight.flightNumber);
    if (flight.airplane) details.push(flight.airplane);
    if (flight.duration) details.push(formatDuration(flight.duration));
    if (flight.distance) details.push(`${flight.distance.toLocaleString()} km`);

    const handleSave = async () => {
        setSaving(true);
        await renderCardToCanvas(flight);
        setSaving(false);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
             onClick={onClose}>
            <div className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
                {/* Preview card */}
                <div className="rounded-xl overflow-hidden shadow-2xl mb-4"
                     style={{
                         background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0d9488 100%)',
                         aspectRatio: '1200 / 630',
                     }}>
                    <div className="relative w-full h-full p-8 flex flex-col justify-between"
                         style={{ minHeight: 300 }}>
                        {/* Grid overlay */}
                        <div className="absolute inset-0 opacity-[0.03]"
                             style={{
                                 backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)',
                                 backgroundSize: '40px 40px',
                             }} />

                        {/* Date */}
                        <div className="text-center relative z-10">
                            <p className="text-white/70 text-sm md:text-base">
                                {formatDate(flight.date)}
                            </p>
                        </div>

                        {/* Route hero */}
                        <div className="flex items-center justify-center gap-4 md:gap-8 relative z-10 my-4">
                            <div className="text-right">
                                <p className="text-white text-3xl md:text-5xl font-bold">{originCode}</p>
                                <p className="text-white/50 text-xs md:text-sm mt-1">{originCity}</p>
                            </div>

                            {/* Arc visualization */}
                            <div className="flex-shrink-0 w-24 md:w-40">
                                <svg viewBox="0 0 160 60" className="w-full">
                                    <path d="M 10 45 Q 80 -10 150 45"
                                          fill="none"
                                          stroke="rgba(96,165,250,0.5)"
                                          strokeWidth="2"
                                          strokeDasharray="6 4" />
                                    <circle cx="10" cy="45" r="4" fill="#60a5fa" />
                                    <circle cx="150" cy="45" r="4" fill="#60a5fa" />
                                    <text x="80" y="22" textAnchor="middle" fill="white" fontSize="16">{'\u2708'}</text>
                                </svg>
                            </div>

                            <div className="text-left">
                                <p className="text-white text-3xl md:text-5xl font-bold">{destCode}</p>
                                <p className="text-white/50 text-xs md:text-sm mt-1">{destCity}</p>
                            </div>
                        </div>

                        {/* Details */}
                        <div className="text-center relative z-10 space-y-2">
                            <p className="text-white/50 text-xs md:text-sm">
                                {details.join('  \u00B7  ')}
                            </p>
                            {flight.ticketClass && (
                                <span className="inline-block text-xs px-3 py-0.5 rounded-full bg-blue-400/20 text-blue-200 capitalize">
                                    {flight.ticketClass}
                                </span>
                            )}
                        </div>

                        {/* Watermark */}
                        <p className="absolute bottom-3 right-4 text-white/20 text-[10px] md:text-xs z-10">
                            Logged with Jetlog
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-center gap-2">
                    <Button text={saving ? 'Saving...' : 'Save as Image'}
                            level="primary"
                            disabled={saving}
                            onClick={handleSave} />
                    <Button text="Close" onClick={onClose} />
                </div>
            </div>
        </div>
    );
}
