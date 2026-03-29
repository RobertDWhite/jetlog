import React, { useState, useEffect, useRef, useCallback } from 'react';

import { Button, Select, Spinner } from './Elements';
import { Flight } from '../models';
import API from '../api';
import ConfigStorage from '../storage/configStorage';

// --- Types ---

interface AnimatedRouteExportProps {
    isOpen: boolean;
    onClose: () => void;
    year?: number; // optional: animate only flights from a specific year
}

type FormatPreset = 'square' | 'landscape' | 'portrait';
type SpeedPreset = 'slow' | 'normal' | 'fast';

interface FormatDimensions {
    width: number;
    height: number;
    label: string;
}

const FORMAT_MAP: Record<FormatPreset, FormatDimensions> = {
    square:    { width: 1080, height: 1080, label: 'Square (1080x1080)' },
    landscape: { width: 1920, height: 1080, label: 'Landscape (1920x1080)' },
    portrait:  { width: 1080, height: 1920, label: 'Portrait (1080x1920)' },
};

const SPEED_MAP: Record<SpeedPreset, number> = {
    slow:   800,
    normal: 500,
    fast:   250,
};

// --- Great circle interpolation ---

function interpolateGreatCircle(
    lat1: number, lon1: number, lat2: number, lon2: number, steps: number
): [number, number][] {
    const toRad = (d: number) => d * Math.PI / 180;
    const toDeg = (r: number) => r * 180 / Math.PI;
    const phi1 = toRad(lat1), lam1 = toRad(lon1);
    const phi2 = toRad(lat2), lam2 = toRad(lon2);

    // Central angle
    const sinProd = Math.sin(phi1) * Math.sin(phi2);
    const cosProd = Math.cos(phi1) * Math.cos(phi2) * Math.cos(lam2 - lam1);
    const d = Math.acos(Math.min(1, Math.max(-1, sinProd + cosProd)));

    // If the two points are essentially the same, just return them
    if (d < 1e-10) {
        return [[lat1, lon1], [lat2, lon2]];
    }

    const points: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
        const f = i / steps;
        const A = Math.sin((1 - f) * d) / Math.sin(d);
        const B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
        const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
        const z = A * Math.sin(phi1) + B * Math.sin(phi2);
        points.push([toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), toDeg(Math.atan2(y, x))]);
    }
    return points;
}

// --- Equirectangular projection ---

function projectX(lon: number, width: number, padding: number): number {
    return padding + ((lon + 180) / 360) * (width - 2 * padding);
}

function projectY(lat: number, height: number, padding: number): number {
    return padding + ((90 - lat) / 180) * (height - 2 * padding);
}

// --- Haversine distance in km ---

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Canvas drawing helpers ---

function drawWorldOutlines(
    ctx: CanvasRenderingContext2D,
    geoJSON: any,
    width: number,
    height: number,
    padding: number
) {
    if (!geoJSON || !geoJSON.features) return;

    ctx.strokeStyle = 'rgba(60, 70, 90, 0.6)';
    ctx.fillStyle = 'rgba(30, 35, 50, 0.8)';
    ctx.lineWidth = 0.5;

    for (const feature of geoJSON.features) {
        const geom = feature.geometry;
        if (!geom) continue;

        const polygons: number[][][][] =
            geom.type === 'Polygon' ? [geom.coordinates] :
            geom.type === 'MultiPolygon' ? geom.coordinates :
            [];

        for (const polygon of polygons) {
            for (const ring of polygon) {
                if (ring.length < 3) continue;
                ctx.beginPath();
                const [lon0, lat0] = ring[0];
                ctx.moveTo(projectX(lon0, width, padding), projectY(lat0, height, padding));
                for (let i = 1; i < ring.length; i++) {
                    const [lon, lat] = ring[i];
                    ctx.lineTo(projectX(lon, width, padding), projectY(lat, height, padding));
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }
        }
    }
}

function drawArc(
    ctx: CanvasRenderingContext2D,
    points: [number, number][],
    width: number,
    height: number,
    padding: number,
    progress: number, // 0..1
    alpha: number
) {
    const count = Math.max(1, Math.floor(points.length * progress));

    ctx.save();
    ctx.strokeStyle = `rgba(65, 182, 230, ${alpha})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(65, 182, 230, 0.6)';
    ctx.shadowBlur = 6;
    ctx.beginPath();

    const [lat0, lon0] = points[0];
    ctx.moveTo(projectX(lon0, width, padding), projectY(lat0, height, padding));

    for (let i = 1; i < count; i++) {
        const [lat, lon] = points[i];
        ctx.lineTo(projectX(lon, width, padding), projectY(lat, height, padding));
    }
    ctx.stroke();
    ctx.restore();
}

function drawDot(
    ctx: CanvasRenderingContext2D,
    lat: number,
    lon: number,
    width: number,
    height: number,
    padding: number,
    radius: number,
    pulseRadius: number,
    alpha: number
) {
    const cx = projectX(lon, width, padding);
    const cy = projectY(lat, height, padding);

    // Pulse ring
    if (pulseRadius > 0) {
        ctx.save();
        ctx.strokeStyle = `rgba(255, 140, 0, ${alpha * 0.4})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // Solid dot
    ctx.save();
    ctx.fillStyle = `rgba(255, 140, 0, ${alpha})`;
    ctx.shadowColor = 'rgba(255, 140, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    font: string,
    color: string,
    align: CanvasTextAlign = 'left'
) {
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillText(text, x, y);
    ctx.restore();
}

// --- Prepared flight data for animation ---

interface AnimFlight {
    originLat: number;
    originLon: number;
    destLat: number;
    destLon: number;
    originCode: string;
    destCode: string;
    date: string;
    distanceKm: number;
    country1: string;
    country2: string;
    arcPoints: [number, number][];
}

function prepareFlights(flights: Flight[]): AnimFlight[] {
    return flights
        .filter(f => f.origin && f.destination && f.origin.latitude != null && f.destination.latitude != null)
        .map(f => {
            const distKm = haversineKm(
                f.origin.latitude, f.origin.longitude,
                f.destination.latitude, f.destination.longitude
            );
            return {
                originLat: f.origin.latitude,
                originLon: f.origin.longitude,
                destLat: f.destination.latitude,
                destLon: f.destination.longitude,
                originCode: f.origin.iata || f.origin.icao || '???',
                destCode: f.destination.iata || f.destination.icao || '???',
                date: f.date,
                distanceKm: distKm,
                country1: f.origin.country || '',
                country2: f.destination.country || '',
                arcPoints: interpolateGreatCircle(
                    f.origin.latitude, f.origin.longitude,
                    f.destination.latitude, f.destination.longitude,
                    50
                ),
            };
        });
}

// --- Main Component ---

export default function AnimatedRouteExport({ isOpen, onClose, year }: AnimatedRouteExportProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const recorderRef = useRef<MediaRecorder | null>(null);

    const [format, setFormat] = useState<FormatPreset>('landscape');
    const [speed, setSpeed] = useState<SpeedPreset>('normal');
    const [selectedYear, setSelectedYear] = useState<number | undefined>(year);

    const [flights, setFlights] = useState<AnimFlight[]>([]);
    const [worldGeo, setWorldGeo] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [previewing, setPreviewing] = useState(false);
    const [recording, setRecording] = useState(false);
    const [progress, setProgress] = useState(0);

    const metricUnits = ConfigStorage.getSetting('metricUnits');

    // Year options
    const currentYear = new Date().getFullYear();
    const yearOptions = [
        { text: 'All years', value: '' },
        ...Array.from({ length: 11 }, (_, i) => ({
            text: String(currentYear - i),
            value: String(currentYear - i),
        })),
    ];

    // Fetch data
    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);

        const params: Record<string, string> = {
            limit: '9999',
            order: 'ASC',
            sort: 'date',
        };
        if (selectedYear) {
            params.start = `${selectedYear}-01-01`;
            params.end = `${selectedYear}-12-31`;
        }

        Promise.all([
            API.get('/flights', params),
            API.get('/geography/world'),
        ]).then(([flightData, geoData]: [Flight[], any]) => {
            setFlights(prepareFlights(flightData));
            setWorldGeo(geoData);
            setLoading(false);
        }).catch(() => {
            setLoading(false);
        });
    }, [isOpen, selectedYear]);

    // Draw a single static frame (initial state or final state)
    const drawStaticFrame = useCallback((showAll: boolean) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dims = FORMAT_MAP[format];
        canvas.width = dims.width;
        canvas.height = dims.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pad = Math.min(dims.width, dims.height) * 0.04;

        // Background
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(0, 0, dims.width, dims.height);

        // World outlines
        drawWorldOutlines(ctx, worldGeo, dims.width, dims.height, pad);

        if (showAll && flights.length > 0) {
            // Draw all arcs completed
            for (const f of flights) {
                drawArc(ctx, f.arcPoints, dims.width, dims.height, pad, 1, 0.6);
            }
            // Draw all dots
            const dots = new Set<string>();
            for (const f of flights) {
                const originKey = `${f.originLat},${f.originLon}`;
                const destKey = `${f.destLat},${f.destLon}`;
                if (!dots.has(originKey)) {
                    dots.add(originKey);
                    drawDot(ctx, f.originLat, f.originLon, dims.width, dims.height, pad, 3, 0, 0.9);
                }
                if (!dots.has(destKey)) {
                    dots.add(destKey);
                    drawDot(ctx, f.destLat, f.destLon, dims.width, dims.height, pad, 3, 0, 0.9);
                }
            }
        }

        // Watermark
        const wmSize = Math.round(dims.width * 0.014);
        drawText(ctx, 'Jetlog', dims.width - pad, dims.height - pad, `${wmSize}px Inter, system-ui, sans-serif`, 'rgba(255,255,255,0.2)', 'right');

    }, [format, flights, worldGeo]);

    // When data loads, draw initial frame
    useEffect(() => {
        if (!loading && flights.length > 0 && worldGeo) {
            drawStaticFrame(false);
        }
    }, [loading, flights, worldGeo, drawStaticFrame]);

    // Animate
    const runAnimation = useCallback((onFrame?: () => void, onComplete?: () => void) => {
        const canvas = canvasRef.current;
        if (!canvas || flights.length === 0) return;

        const dims = FORMAT_MAP[format];
        canvas.width = dims.width;
        canvas.height = dims.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pad = Math.min(dims.width, dims.height) * 0.04;
        const arcDurationMs = SPEED_MAP[speed];
        const FPS = 30;
        const frameDurationMs = 1000 / FPS;
        const framesPerArc = Math.max(1, Math.ceil(arcDurationMs / frameDurationMs));
        const holdFrames = Math.ceil(2000 / frameDurationMs); // 2s hold at end

        // Track completed arcs and cumulative stats
        let currentFlightIdx = 0;
        let currentArcFrame = 0;
        let totalDistanceKm = 0;
        const countriesVisited = new Set<string>();
        const completedArcs: { flight: AnimFlight; alpha: number }[] = [];

        // Scale font sizes relative to canvas dimensions
        const baseFontSize = Math.round(dims.width * 0.018);
        const dateFontSize = Math.round(dims.width * 0.022);
        const statsFontSize = Math.round(dims.width * 0.015);
        const wmFontSize = Math.round(dims.width * 0.014);
        const routeFontSize = Math.round(dims.width * 0.016);

        let holdCounter = 0;
        let animationDone = false;

        const renderFrame = () => {
            // Clear
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, dims.width, dims.height);

            // World
            drawWorldOutlines(ctx, worldGeo, dims.width, dims.height, pad);

            // Draw all completed arcs with fading
            const drawnDots = new Set<string>();
            for (const entry of completedArcs) {
                drawArc(ctx, entry.flight.arcPoints, dims.width, dims.height, pad, 1, entry.alpha);

                const oKey = `${entry.flight.originLat},${entry.flight.originLon}`;
                const dKey = `${entry.flight.destLat},${entry.flight.destLon}`;
                if (!drawnDots.has(oKey)) {
                    drawnDots.add(oKey);
                    drawDot(ctx, entry.flight.originLat, entry.flight.originLon, dims.width, dims.height, pad, 3, 0, Math.min(entry.alpha + 0.2, 0.9));
                }
                if (!drawnDots.has(dKey)) {
                    drawnDots.add(dKey);
                    drawDot(ctx, entry.flight.destLat, entry.flight.destLon, dims.width, dims.height, pad, 3, 0, Math.min(entry.alpha + 0.2, 0.9));
                }
            }

            // Current animating arc
            if (currentFlightIdx < flights.length) {
                const flight = flights[currentFlightIdx];
                const arcProgress = Math.min(currentArcFrame / framesPerArc, 1);

                // Draw arc with progress
                drawArc(ctx, flight.arcPoints, dims.width, dims.height, pad, arcProgress, 0.9);

                // Origin dot (always visible once arc starts)
                const pulseOrigin = arcProgress < 0.3 ? (arcProgress / 0.3) * 8 : 0;
                drawDot(ctx, flight.originLat, flight.originLon, dims.width, dims.height, pad, 4, pulseOrigin, 1);

                // Destination dot (appears and pulses as arc completes)
                if (arcProgress > 0.7) {
                    const destPulse = ((arcProgress - 0.7) / 0.3) * 10;
                    drawDot(ctx, flight.destLat, flight.destLon, dims.width, dims.height, pad, 4, destPulse, 1);
                }

                // Date counter (top-left)
                drawText(ctx, flight.date, pad + 8, pad + 8, `bold ${dateFontSize}px Inter, system-ui, sans-serif`, 'rgba(255,255,255,0.85)');

                // Route label below date
                drawText(
                    ctx,
                    `${flight.originCode} \u2192 ${flight.destCode}`,
                    pad + 8,
                    pad + 8 + dateFontSize + 6,
                    `${routeFontSize}px Inter, system-ui, sans-serif`,
                    'rgba(65, 182, 230, 0.9)'
                );

                // Advance arc
                currentArcFrame++;
                if (currentArcFrame > framesPerArc) {
                    // Arc complete, add to completed list
                    totalDistanceKm += flight.distanceKm;
                    if (flight.country1) countriesVisited.add(flight.country1);
                    if (flight.country2) countriesVisited.add(flight.country2);

                    completedArcs.push({ flight, alpha: 0.7 });

                    // Gradually fade older arcs slightly
                    for (let i = 0; i < completedArcs.length - 1; i++) {
                        completedArcs[i].alpha = Math.max(0.25, completedArcs[i].alpha - 0.02);
                    }

                    currentFlightIdx++;
                    currentArcFrame = 0;
                    setProgress(Math.round((currentFlightIdx / flights.length) * 100));
                }
            } else {
                // All arcs done -- draw final date
                if (flights.length > 0) {
                    const lastFlight = flights[flights.length - 1];
                    drawText(ctx, lastFlight.date, pad + 8, pad + 8, `bold ${dateFontSize}px Inter, system-ui, sans-serif`, 'rgba(255,255,255,0.85)');
                }
            }

            // Running stats at bottom
            const distDisplay = metricUnits === 'false'
                ? `${Math.round(totalDistanceKm * 0.621371).toLocaleString()} mi`
                : `${Math.round(totalDistanceKm).toLocaleString()} km`;
            const flightsCompleted = Math.min(currentFlightIdx + 1, flights.length);
            const statsText = `Flights: ${flightsCompleted}  |  Distance: ${distDisplay}  |  Countries: ${countriesVisited.size}`;
            const statsY = dims.height - pad - statsFontSize - 4;
            drawText(ctx, statsText, dims.width / 2, statsY, `${statsFontSize}px Inter, system-ui, sans-serif`, 'rgba(255,255,255,0.6)', 'center');

            // Watermark (bottom-right)
            drawText(ctx, 'Jetlog', dims.width - pad, dims.height - pad, `${wmFontSize}px Inter, system-ui, sans-serif`, 'rgba(255,255,255,0.2)', 'right');

            // Frame callback
            if (onFrame) onFrame();

            // Check if we should continue
            if (currentFlightIdx >= flights.length) {
                holdCounter++;
                if (holdCounter >= holdFrames) {
                    animationDone = true;
                    if (onComplete) onComplete();
                    return;
                }
            }

            if (!animationDone) {
                animFrameRef.current = requestAnimationFrame(renderFrame);
            }
        };

        // Start animation
        setProgress(0);
        animFrameRef.current = requestAnimationFrame(renderFrame);

        // Return cleanup
        return () => {
            animationDone = true;
            cancelAnimationFrame(animFrameRef.current);
        };
    }, [flights, worldGeo, format, speed, metricUnits]);

    // Preview handler
    const handlePreview = useCallback(() => {
        if (previewing || recording) return;
        setPreviewing(true);
        const cleanup = runAnimation(undefined, () => {
            setPreviewing(false);
        });
        // Store cleanup for cancel
        return cleanup;
    }, [runAnimation, previewing, recording]);

    // Export handler using MediaRecorder
    const handleExport = useCallback(() => {
        if (recording || previewing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        setRecording(true);

        const dims = FORMAT_MAP[format];
        canvas.width = dims.width;
        canvas.height = dims.height;

        const stream = canvas.captureStream(30);
        const mimeTypes = [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
        ];
        let selectedMime = '';
        for (const mt of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mt)) {
                selectedMime = mt;
                break;
            }
        }

        if (!selectedMime) {
            alert('Video recording is not supported in this browser. Try Chrome or Firefox.');
            setRecording(false);
            return;
        }

        const recorder = new MediaRecorder(stream, {
            mimeType: selectedMime,
            videoBitsPerSecond: 5_000_000,
        });
        recorderRef.current = recorder;
        const chunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunks, { type: selectedMime.split(';')[0] });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const yearSuffix = selectedYear ? `-${selectedYear}` : '';
            link.download = `jetlog-flights${yearSuffix}.webm`;
            link.href = url;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            setRecording(false);
            recorderRef.current = null;
        };

        recorder.start();

        runAnimation(undefined, () => {
            // Small delay to ensure final frames are captured
            setTimeout(() => {
                if (recorder.state === 'recording') {
                    recorder.stop();
                }
            }, 200);
        });
    }, [flights, worldGeo, format, speed, selectedYear, recording, previewing, runAnimation]);

    // Cancel animation
    const handleCancel = useCallback(() => {
        cancelAnimationFrame(animFrameRef.current);
        if (recorderRef.current && recorderRef.current.state === 'recording') {
            recorderRef.current.stop();
        }
        setPreviewing(false);
        setRecording(false);
        setProgress(0);
        drawStaticFrame(false);
    }, [drawStaticFrame]);

    // Close handler
    const handleClose = useCallback(() => {
        handleCancel();
        onClose();
    }, [handleCancel, onClose]);

    // Key handler: Escape to close
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, handleClose]);

    if (!isOpen) return null;

    const dims = FORMAT_MAP[format];
    const isAnimating = previewing || recording;

    return (
        <div className="animated-export-overlay" onClick={handleClose}>
            <div className="animated-export-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">Export Flight Animation</h2>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-white text-2xl leading-none cursor-pointer"
                    >
                        &times;
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)' }}>
                    {loading ? (
                        <Spinner />
                    ) : flights.length === 0 ? (
                        <p className="text-center text-gray-400 text-lg py-8">
                            No flights found{selectedYear ? ` for ${selectedYear}` : ''}. Add some flights first!
                        </p>
                    ) : (
                        <>
                            {/* Controls row */}
                            <div className="flex flex-wrap gap-4 mb-4 items-end">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Format</label>
                                    <Select
                                        options={[
                                            { text: 'Landscape (1920x1080)', value: 'landscape' },
                                            { text: 'Square (1080x1080)', value: 'square' },
                                            { text: 'Portrait (1080x1920)', value: 'portrait' },
                                        ]}
                                        value={format}
                                        onChange={(e) => setFormat(e.target.value as FormatPreset)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Speed</label>
                                    <Select
                                        options={[
                                            { text: 'Slow', value: 'slow' },
                                            { text: 'Normal', value: 'normal' },
                                            { text: 'Fast', value: 'fast' },
                                        ]}
                                        value={speed}
                                        onChange={(e) => setSpeed(e.target.value as SpeedPreset)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Year</label>
                                    <Select
                                        options={yearOptions}
                                        value={selectedYear ? String(selectedYear) : ''}
                                        onChange={(e) => setSelectedYear(e.target.value ? parseInt(e.target.value) : undefined)}
                                    />
                                </div>
                                <div className="text-sm text-gray-500 ml-auto">
                                    {flights.length} flight{flights.length !== 1 ? 's' : ''} to animate
                                </div>
                            </div>

                            {/* Canvas preview */}
                            <div className="flex justify-center mb-4">
                                <div
                                    className="animated-export-canvas-wrapper"
                                    style={{
                                        aspectRatio: `${dims.width} / ${dims.height}`,
                                        maxWidth: '100%',
                                        maxHeight: format === 'portrait' ? '60vh' : '50vh',
                                    }}
                                >
                                    <canvas
                                        ref={canvasRef}
                                        width={dims.width}
                                        height={dims.height}
                                        style={{ width: '100%', height: '100%', borderRadius: '0.5rem' }}
                                    />
                                </div>
                            </div>

                            {/* Progress bar */}
                            {isAnimating && (
                                <div className="animated-export-progress mb-4">
                                    <div
                                        className="animated-export-progress-fill"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex justify-center gap-3">
                                {isAnimating ? (
                                    <Button text="Cancel" level="danger" onClick={handleCancel} />
                                ) : (
                                    <>
                                        <Button text="Preview" onClick={handlePreview} />
                                        <Button text="Export Video (.webm)" level="primary" onClick={handleExport} />
                                    </>
                                )}
                            </div>

                            {recording && (
                                <p className="text-center text-sm text-gray-400 mt-3">
                                    Recording in progress... {progress}%
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
