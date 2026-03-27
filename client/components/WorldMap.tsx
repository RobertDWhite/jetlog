import React, { useState, useEffect } from 'react';
import { ComposableMap, ZoomableGroup, Geographies, Geography, Marker, Line } from "react-simple-maps";

import API from '../api';
import ConfigStorage from '../storage/configStorage';
import { Coord, Trajectory } from '../models';

interface BoundsInterface {
    south: number;
    north: number;
    west: number;
    east: number;
}
const defaultBounds: BoundsInterface = {
    south: -90,
    north: 90,
    west: -180,
    east: 180
}

interface TooltipData {
    x: number;
    y: number;
    content: React.ReactNode;
}

function MapTooltip({ tooltip, onClose }: { tooltip: TooltipData; onClose: () => void }) {
    return (
        <div className="absolute z-50 bg-gray-900 text-white text-sm rounded shadow-lg px-3 py-2 max-w-xs pointer-events-auto"
             style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%) translateY(-10px)' }}>
            {tooltip.content}
            <button className="absolute top-0 right-1 text-gray-400 hover:text-white text-xs leading-none"
                    onClick={onClose}>
                {'\u2715'}
            </button>
        </div>
    );
}

interface MapGeographiesProps {
    lines: Trajectory[];
    markers: Coord[];
    zoom: number;
    onMarkerClick?: (marker: Coord, event: React.MouseEvent) => void;
    onLineHover?: (line: Trajectory, event: React.MouseEvent) => void;
    onLineLeave?: () => void;
}
function MapFeatures({ lines, markers, zoom, onMarkerClick, onLineHover, onLineLeave }: MapGeographiesProps) {
    const [world, setWorld] = useState<object>();

    useEffect(() => {
        const showVisitedCountries = ConfigStorage.getSetting("showVisitedCountries");
        API.get(`/geography/world?visited=${showVisitedCountries}`)
        .then((data) => setWorld(data));
    }, []);

    if (world === undefined) {
        return;
    }

    const scaleFactor = 1 / Math.sqrt(zoom);

    const maxFrequency = lines.length > 0 ? Math.max(...lines.map(l => l.frequency)) : 1;

    const heatColor = (frequency: number) => {
        if (maxFrequency <= 1) return '#FF5533CC';
        const t = (frequency - 1) / (maxFrequency - 1); // 0 to 1
        // blue → cyan → green → yellow → red
        if (t < 0.25) {
            const s = t / 0.25;
            return `rgba(${Math.round(66 + s * (0 - 66))}, ${Math.round(133 + s * (200 - 133))}, ${Math.round(244 + s * (200 - 244))}, 0.8)`;
        } else if (t < 0.5) {
            const s = (t - 0.25) / 0.25;
            return `rgba(${Math.round(s * 76)}, ${Math.round(200 + s * (175 - 200))}, ${Math.round(200 - s * 120)}, 0.8)`;
        } else if (t < 0.75) {
            const s = (t - 0.5) / 0.25;
            return `rgba(${Math.round(76 + s * (255 - 76))}, ${Math.round(175 + s * (200 - 175))}, ${Math.round(80 - s * 80)}, 0.8)`;
        } else {
            const s = (t - 0.75) / 0.25;
            return `rgba(${255}, ${Math.round(200 - s * 150)}, ${0}, 0.8)`;
        }
    };

    return (
        <>
        <Geographies geography={world}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    stroke="#111"
                    strokeWidth={0.7 * scaleFactor}
                    fill={geo.properties.visited ? "#F25000" : "#333"}
                    />
              ))
            }
        </Geographies>

        { lines.map((line, i) => (
            <Line
                key={i}
                from={[line.first.longitude, line.first.latitude]}
                to={[line.second.longitude, line.second.latitude]}
                stroke={ConfigStorage.getSetting("frequencyBasedLine") === "true" ? heatColor(line.frequency) : "#FF5533CC"}
                strokeWidth={
                        (
                            ConfigStorage.getSetting("frequencyBasedLine") === "true" ?
                            Math.min(1 + Math.floor(line.frequency / 3), 6)
                            : 1
                        ) * scaleFactor
                    }
                strokeLinecap="round"
                style={{ cursor: onLineHover ? 'pointer' : 'default' }}
                onMouseEnter={onLineHover ? (e) => onLineHover(line, e as any) : undefined}
                onMouseLeave={onLineLeave}
            />

        ))}

        { markers.map((marker, i) => (
            <Marker key={i}
                    coordinates={[marker.longitude, marker.latitude]}
                    onClick={onMarkerClick ? (e) => onMarkerClick(marker, e as any) : undefined}
                    style={{ cursor: onMarkerClick ? 'pointer' : 'default' }}>
                <circle r={
                        (
                            ConfigStorage.getSetting("frequencyBasedMarker") === "true" ?
                            Math.min(3 + Math.floor(marker.frequency / 3), 6)
                            : 3
                        ) * scaleFactor
                    }
                    fill={
                        ConfigStorage.getSetting("frequencyBasedMarker") === "true" ?
                        "#FFA50080"
                        : "#FFA500"
                    }
                    stroke="#FFA500"
                    strokeWidth={0.5 * scaleFactor}
                />
            </Marker>
        ))}
        </>
    );
}

export default function WorldMap() {
    const [lines, setLines] = useState<Trajectory[]>([]);
    const [markers, setMarkers] = useState<Coord[]>([]);
    const [initialZoom, setInitialZoom] = useState<number>(1);
    const [zoom, setZoom] = useState<number>(1);
    const [center, setCenter] = useState<[number, number]>([0, 0]);
    const [tooltip, setTooltip] = useState<TooltipData | null>(null);
    const [lineTooltip, setLineTooltip] = useState<TooltipData | null>(null);

    useEffect(() => {
        API.get("/geography/decorations")
        .then((data: [Trajectory[], Coord[]]) => {
            setLines(data[0]);
            setMarkers(data[1]);

            if (data[1] && data[1].length > 1 && ConfigStorage.getSetting("restrictWorldMap") === "true") {
                const latitudes = data[1].map(coord => coord.latitude);
                const longitudes = data[1].map(coord => coord.longitude);

                const south = Math.min(...latitudes);
                const north = Math.max(...latitudes);
                const west = Math.min(...longitudes);
                const east = Math.max(...longitudes);

                const centerLon = (west + east) / 2;
                const centerLat = (south + north) / 2;
                setCenter([centerLon, centerLat]);

                const lonSpan = east - west;
                const latSpan = north - south;
                const maxSpan = Math.max(lonSpan, latSpan);
                const computedZoom = Math.min(150 / maxSpan, 3);
                setInitialZoom(computedZoom);

                if (computedZoom < 1) {
                   setInitialZoom(1);
                   setCenter([0, 0]);
                }
            }
        });
    }, []);

    const handleMarkerClick = (marker: Coord, event: React.MouseEvent) => {
        const rect = (event.currentTarget as Element).closest('svg')?.getBoundingClientRect();
        if (!rect) return;

        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const label = marker.iata || marker.icao || '';
        const content = (
            <div>
                <div className="font-bold">{label}</div>
                {marker.name && <div className="text-gray-300 text-xs">{marker.name}</div>}
                <div className="text-xs mt-1">{marker.frequency} visit{marker.frequency !== 1 ? 's' : ''}</div>
            </div>
        );

        setTooltip({ x, y, content });
        setLineTooltip(null);
    };

    const handleLineHover = (line: Trajectory, event: React.MouseEvent) => {
        const rect = (event.currentTarget as Element).closest('svg')?.getBoundingClientRect();
        if (!rect) return;

        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        const originLabel = line.first.iata || line.originIcao || '';
        const destLabel = line.second.iata || line.destIcao || '';

        const content = (
            <div>
                <div className="font-bold">{originLabel} {'\u2192'} {destLabel}</div>
                <div className="text-xs mt-1">{line.frequency} flight{line.frequency !== 1 ? 's' : ''}</div>
            </div>
        );

        setLineTooltip({ x, y, content });
    };

    const handleBackgroundClick = () => {
        setTooltip(null);
        setLineTooltip(null);
    };

    return (
        <div className="relative" onClick={handleBackgroundClick}>
            <ComposableMap width={1000} height={470}>
                <ZoomableGroup maxZoom={10}
                               translateExtent={[[0, 0], [1000, 470]]}
                               zoom={initialZoom}
                               center={center}
                               onMove={({zoom: newZoom}) => {
                                   if (newZoom != zoom) setZoom(newZoom)
                               }}>

                    <MapFeatures lines={lines} markers={markers} zoom={zoom}
                                 onMarkerClick={handleMarkerClick}
                                 onLineHover={handleLineHover}
                                 onLineLeave={() => setLineTooltip(null)} />

                </ZoomableGroup>
            </ComposableMap>

            {tooltip && <MapTooltip tooltip={tooltip} onClose={() => setTooltip(null)} />}
            {lineTooltip && <MapTooltip tooltip={lineTooltip} onClose={() => setLineTooltip(null)} />}
        </div>
    );
}

interface SingleFlightMapProps {
    flightID: number;
    distance: number;
}
export function SingleFlightMap({ flightID, distance }: SingleFlightMapProps) {
    const [lines, setLines] = useState<Trajectory[]>([]);
    const [markers, setMarkers] = useState<Coord[]>([]);

    useEffect(() => {
        API.get(`/geography/decorations?flight_id=${flightID}`)
        .then((data: [Trajectory[], Coord[]]) => {
            setLines(data[0]);
            setMarkers(data[1]);
        })
    }, [])

    // some trajectory is required for this component
    if (lines.length == 0) {
        return;
    }

    // function that computes midpoint of a trajectory
    // on a sphere, i.e. supporting trajs. that 'clip'
    // around the world projection
    const midpointOnSphere = (p1: Coord, p2: Coord) => {
        // convert degrees to radians
        const toRad = deg => deg * Math.PI / 180;
        const toDeg = rad => rad * 180 / Math.PI;

        const lat1 = toRad(p1.latitude);
        const lon1 = toRad(p1.longitude);
        const lat2 = toRad(p2.latitude);
        const lon2 = toRad(p2.longitude);

        // convert to cartesian
        const x1 = Math.cos(lat1) * Math.cos(lon1);
        const y1 = Math.cos(lat1) * Math.sin(lon1);
        const z1 = Math.sin(lat1);

        const x2 = Math.cos(lat2) * Math.cos(lon2);
        const y2 = Math.cos(lat2) * Math.sin(lon2);
        const z2 = Math.sin(lat2);

        // compute average
        const x = (x1 + x2) / 2;
        const y = (y1 + y2) / 2;
        const z = (z1 + z2) / 2;

        // convert back to lat/lon
        const lon = Math.atan2(y, x);
        const hyp = Math.sqrt(x * x + y * y);
        const lat = Math.atan2(z, hyp);

        return [toDeg(lon), toDeg(lat)];
    };

    // compute center and zoom of map so that it fits the trajectory
    const center = midpointOnSphere(markers[0], markers[1]);
    const zoom = Math.min(20000/distance, 10) * 160;

    return (
        <ComposableMap width={1000}
                       height={470}
                       projectionConfig={{
                           scale: zoom,
                           rotate: [-center[0], -center[1], 0] // rotate world around center of traj.
                       }}>

                {/* the zoom calculation effectively undoes the automatic zoom
                    adjustment from the ComposableMap component */}
                <MapFeatures lines={lines} markers={markers} zoom={1 / Math.sqrt(zoom)}/>

        </ComposableMap>
    );
}
