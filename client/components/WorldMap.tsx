import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MapGL, { Source, Layer, MapRef, useControl, NavigationControl } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ArcLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';

import API from '../api';
import ConfigStorage from '../storage/configStorage';
import { Coord, Trajectory } from '../models';
import MapLegend from './MapLegend';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// deck.gl overlay hook for react-map-gl
function DeckGLOverlay(props: any) {
    const overlay = useControl(() => new MapboxOverlay(props));
    overlay.setProps(props);
    return null;
}

interface TooltipState {
    x: number;
    y: number;
    content: React.ReactNode;
}

export default function WorldMap() {
    const [lines, setLines] = useState<Trajectory[]>([]);
    const [markers, setMarkers] = useState<Coord[]>([]);
    const [worldGeoJSON, setWorldGeoJSON] = useState<any>(null);
    const [tooltip, setTooltip] = useState<TooltipState | null>(null);
    const [viewState, setViewState] = useState({
        longitude: 0,
        latitude: 20,
        zoom: 1.5,
        pitch: 0,
        bearing: 0,
    });
    const [dataLoaded, setDataLoaded] = useState(false);
    const mapRef = useRef<MapRef>(null);

    const frequencyBasedLine = ConfigStorage.getSetting('frequencyBasedLine') === 'true';
    const frequencyBasedMarker = ConfigStorage.getSetting('frequencyBasedMarker') === 'true';
    const showVisitedCountries = ConfigStorage.getSetting('showVisitedCountries');
    const restrictWorldMap = ConfigStorage.getSetting('restrictWorldMap') === 'true';

    useEffect(() => {
        API.get('/geography/decorations')
            .then((data: [Trajectory[], Coord[]]) => {
                setLines(data[0]);
                setMarkers(data[1]);

                if (data[1] && data[1].length > 1 && restrictWorldMap) {
                    const latitudes = data[1].map(c => c.latitude);
                    const longitudes = data[1].map(c => c.longitude);

                    const south = Math.min(...latitudes);
                    const north = Math.max(...latitudes);
                    const west = Math.min(...longitudes);
                    const east = Math.max(...longitudes);

                    const lonSpan = east - west;
                    const latSpan = north - south;
                    const maxSpan = Math.max(lonSpan, latSpan);

                    if (maxSpan > 0) {
                        const centerLon = (west + east) / 2;
                        const centerLat = (south + north) / 2;
                        // Approximate zoom from span (log2-based for Mercator)
                        const computedZoom = Math.max(
                            Math.min(Math.log2(360 / maxSpan) - 0.5, 8),
                            1.5
                        );

                        setViewState(prev => ({
                            ...prev,
                            longitude: centerLon,
                            latitude: centerLat,
                            zoom: computedZoom,
                        }));
                    }
                }

                setDataLoaded(true);
            });

        API.get(`/geography/world?visited=${showVisitedCountries}`)
            .then((data: any) => setWorldGeoJSON(data));
    }, []);

    const maxFrequency = useMemo(
        () => (lines.length > 0 ? Math.max(...lines.map(l => l.frequency)) : 1),
        [lines]
    );

    const getArcWidth = useCallback(
        (d: Trajectory) => {
            if (!frequencyBasedLine) return 2;
            const f = d.frequency;
            if (f <= 1) return 1;
            if (f <= 3) return 2;
            if (f <= 6) return 3;
            if (f <= 10) return 4;
            return 6;
        },
        [frequencyBasedLine, maxFrequency]
    );

    const getArcColor = useCallback(
        (d: Trajectory): [number, number, number, number] => {
            if (!frequencyBasedLine) return [65, 182, 230, 200];
            const f = d.frequency;
            if (f <= 1) return [100, 149, 237, 150];
            if (f <= 3) return [0, 200, 200, 180];
            if (f <= 6) return [50, 205, 50, 200];
            if (f <= 10) return [255, 215, 0, 220];
            return [255, 69, 0, 240];
        },
        [frequencyBasedLine]
    );

    const getMarkerRadius = useCallback(
        (d: Coord) => {
            if (!frequencyBasedMarker) return 6000;
            return Math.min(4000 + d.frequency * 1500, 20000);
        },
        [frequencyBasedMarker]
    );

    const handleHover = useCallback((info: PickingInfo) => {
        if (!info.picked || !info.object) {
            setTooltip(null);
            return;
        }

        const { x, y, layer } = info;

        if (layer?.id === 'flight-arcs') {
            const arc = info.object as Trajectory;
            const originLabel = arc.first.iata || arc.originIcao || '';
            const destLabel = arc.second.iata || arc.destIcao || '';
            setTooltip({
                x,
                y,
                content: (
                    <div>
                        <div className="font-bold">{originLabel} {'\u2192'} {destLabel}</div>
                        <div className="text-xs mt-1 text-gray-300">
                            {arc.frequency} flight{arc.frequency !== 1 ? 's' : ''}
                        </div>
                    </div>
                ),
            });
        } else if (layer?.id === 'airport-markers') {
            const marker = info.object as Coord;
            const label = marker.iata || marker.icao || '';
            setTooltip({
                x,
                y,
                content: (
                    <div>
                        <div className="font-bold">{label}</div>
                        {marker.name && <div className="text-gray-300 text-xs">{marker.name}</div>}
                        <div className="text-xs mt-1 text-gray-300">
                            {marker.frequency} visit{marker.frequency !== 1 ? 's' : ''}
                        </div>
                    </div>
                ),
            });
        }
    }, []);

    const layers = useMemo(() => {
        const result: any[] = [];

        // Glow layer: wider, more transparent arcs underneath for neon effect
        if (frequencyBasedLine) {
            result.push(
                new ArcLayer<Trajectory>({
                    id: 'flight-arcs-glow',
                    data: lines,
                    getSourcePosition: (d: Trajectory) => [d.first.longitude, d.first.latitude],
                    getTargetPosition: (d: Trajectory) => [d.second.longitude, d.second.latitude],
                    getSourceColor: (d: Trajectory) => {
                        const c = getArcColor(d);
                        return [c[0], c[1], c[2], Math.round(c[3] * 0.3)] as [number, number, number, number];
                    },
                    getTargetColor: (d: Trajectory) => {
                        const c = getArcColor(d);
                        return [c[0], c[1], c[2], Math.round(c[3] * 0.3)] as [number, number, number, number];
                    },
                    getWidth: (d: Trajectory) => getArcWidth(d) * 3,
                    greatCircle: true,
                    getHeight: 0.3,
                    pickable: false,
                    widthMinPixels: 3,
                    widthMaxPixels: 24,
                })
            );
        }

        // Main arc layer
        result.push(
            new ArcLayer<Trajectory>({
                id: 'flight-arcs',
                data: lines,
                getSourcePosition: (d: Trajectory) => [d.first.longitude, d.first.latitude],
                getTargetPosition: (d: Trajectory) => [d.second.longitude, d.second.latitude],
                getSourceColor: frequencyBasedLine
                    ? ((d: Trajectory) => getArcColor(d))
                    : [65, 182, 230, 200],
                getTargetColor: frequencyBasedLine
                    ? ((d: Trajectory) => getArcColor(d))
                    : [255, 140, 0, 200],
                getWidth: getArcWidth,
                greatCircle: true,
                getHeight: 0.3,
                pickable: true,
                autoHighlight: true,
                highlightColor: [255, 255, 255, 100],
                widthMinPixels: 1,
                widthMaxPixels: 8,
            })
        );

        // Airport markers
        result.push(
            new ScatterplotLayer<Coord>({
                id: 'airport-markers',
                data: markers,
                getPosition: (d: Coord) => [d.longitude, d.latitude],
                getRadius: getMarkerRadius,
                getFillColor: [255, 140, 0, 220],
                getLineColor: [255, 255, 255, 180],
                stroked: true,
                lineWidthMinPixels: 1,
                radiusMinPixels: 3,
                radiusMaxPixels: 12,
                pickable: true,
                autoHighlight: true,
                highlightColor: [255, 200, 80, 255],
            })
        );

        return result;
    }, [lines, markers, getArcWidth, getArcColor, getMarkerRadius, frequencyBasedLine]);

    const onMapLoad = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        // Globe atmosphere effect
        map.setFog({
            color: 'rgb(20, 20, 30)',
            'high-color': 'rgb(30, 40, 70)',
            'horizon-blend': 0.08,
            'space-color': 'rgb(8, 10, 16)',
            'star-intensity': 0.5,
        });
    }, []);

    // Visited countries fill layer style
    const visitedFillLayer: any = {
        id: 'visited-fill',
        type: 'fill',
        paint: {
            'fill-color': [
                'case',
                ['==', ['get', 'visited'], true],
                'rgba(255, 140, 0, 0.15)',
                'rgba(0, 0, 0, 0)',
            ],
            'fill-outline-color': [
                'case',
                ['==', ['get', 'visited'], true],
                'rgba(255, 140, 0, 0.4)',
                'rgba(60, 60, 60, 0.5)',
            ],
        },
    };

    return (
        <div className="relative w-full" style={{ height: 470 }}>
            <MapGL
                ref={mapRef}
                {...viewState}
                onMove={evt => setViewState(evt.viewState)}
                mapStyle={DARK_STYLE}
                mapLib={maplibregl}
                projection={{ type: 'globe' }}
                onLoad={onMapLoad}
                attributionControl={false}
                style={{ width: '100%', height: '100%', borderRadius: '0.5rem' }}
            >
                <NavigationControl position="top-right" showCompass={false} />

                {worldGeoJSON && (
                    <Source id="world-countries" type="geojson" data={worldGeoJSON}>
                        <Layer {...visitedFillLayer} />
                    </Source>
                )}

                <DeckGLOverlay
                    layers={layers}
                    onHover={handleHover}
                    getTooltip={null}
                />
            </MapGL>

            {frequencyBasedLine && <MapLegend />}

            {tooltip && (
                <div
                    className="absolute z-50 bg-gray-900 text-white text-sm rounded shadow-lg px-3 py-2 max-w-xs pointer-events-none"
                    style={{
                        left: tooltip.x,
                        top: tooltip.y,
                        transform: 'translate(-50%, -100%) translateY(-10px)',
                    }}
                >
                    {tooltip.content}
                </div>
            )}
        </div>
    );
}

// --- SingleFlightMap ---

interface SingleFlightMapProps {
    flightID: number;
    distance: number;
}

function greatCircleGeoJSON(
    lon1: number, lat1: number,
    lon2: number, lat2: number,
    numPoints: number = 100
): GeoJSON.Feature<GeoJSON.LineString> {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;

    const phi1 = toRad(lat1);
    const lam1 = toRad(lon1);
    const phi2 = toRad(lat2);
    const lam2 = toRad(lon2);

    const d = 2 * Math.asin(
        Math.sqrt(
            Math.pow(Math.sin((phi2 - phi1) / 2), 2) +
            Math.cos(phi1) * Math.cos(phi2) * Math.pow(Math.sin((lam2 - lam1) / 2), 2)
        )
    );

    const coords: [number, number][] = [];
    for (let i = 0; i <= numPoints; i++) {
        const f = i / numPoints;
        const A = Math.sin((1 - f) * d) / Math.sin(d);
        const B = Math.sin(f * d) / Math.sin(d);
        const x = A * Math.cos(phi1) * Math.cos(lam1) + B * Math.cos(phi2) * Math.cos(lam2);
        const y = A * Math.cos(phi1) * Math.sin(lam1) + B * Math.cos(phi2) * Math.sin(lam2);
        const z = A * Math.sin(phi1) + B * Math.sin(phi2);
        const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
        const lon = toDeg(Math.atan2(y, x));
        coords.push([lon, lat]);
    }

    return {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'LineString',
            coordinates: coords,
        },
    };
}

export function SingleFlightMap({ flightID, distance }: SingleFlightMapProps) {
    const [lines, setLines] = useState<Trajectory[]>([]);
    const [markers, setMarkers] = useState<Coord[]>([]);
    const mapRef = useRef<MapRef>(null);

    useEffect(() => {
        API.get(`/geography/decorations?flight_id=${flightID}`)
            .then((data: [Trajectory[], Coord[]]) => {
                setLines(data[0]);
                setMarkers(data[1]);
            });
    }, [flightID]);

    const onMapLoad = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map || markers.length < 2) return;

        const lons = markers.map(m => m.longitude);
        const lats = markers.map(m => m.latitude);

        map.fitBounds(
            [
                [Math.min(...lons), Math.min(...lats)],
                [Math.max(...lons), Math.max(...lats)],
            ],
            { padding: 80, maxZoom: 8, duration: 0 }
        );
    }, [markers]);

    // Wait for data
    if (lines.length === 0 || markers.length < 2) {
        return null;
    }

    const origin = markers[0];
    const dest = markers[1];

    const routeGeoJSON = greatCircleGeoJSON(
        origin.longitude, origin.latitude,
        dest.longitude, dest.latitude
    );

    const airportsGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: markers.map(m => ({
            type: 'Feature' as const,
            properties: { icao: m.icao || '', iata: m.iata || '', name: m.name || '' },
            geometry: {
                type: 'Point' as const,
                coordinates: [m.longitude, m.latitude],
            },
        })),
    };

    // Compute initial center for best view
    const centerLon = (origin.longitude + dest.longitude) / 2;
    const centerLat = (origin.latitude + dest.latitude) / 2;
    const lonSpan = Math.abs(origin.longitude - dest.longitude);
    const latSpan = Math.abs(origin.latitude - dest.latitude);
    const maxSpan = Math.max(lonSpan, latSpan);
    const initZoom = maxSpan > 0 ? Math.max(Math.min(Math.log2(360 / maxSpan) - 0.5, 8), 1) : 4;

    return (
        <div className="w-full" style={{ height: 350 }}>
            <MapGL
                ref={mapRef}
                initialViewState={{
                    longitude: centerLon,
                    latitude: centerLat,
                    zoom: initZoom,
                }}
                mapStyle={DARK_STYLE}
                mapLib={maplibregl}
                onLoad={onMapLoad}
                attributionControl={false}
                interactive={true}
                style={{ width: '100%', height: '100%', borderRadius: '0.5rem' }}
            >
                <Source id="route" type="geojson" data={routeGeoJSON}>
                    <Layer
                        id="route-line"
                        type="line"
                        paint={{
                            'line-color': '#41b6e6',
                            'line-width': 3,
                            'line-opacity': 0.85,
                        }}
                        layout={{
                            'line-cap': 'round',
                            'line-join': 'round',
                        }}
                    />
                </Source>

                <Source id="airports" type="geojson" data={airportsGeoJSON}>
                    <Layer
                        id="airport-dots"
                        type="circle"
                        paint={{
                            'circle-radius': 7,
                            'circle-color': '#FF8C00',
                            'circle-stroke-color': '#FFFFFF',
                            'circle-stroke-width': 2,
                        }}
                    />
                    <Layer
                        id="airport-labels"
                        type="symbol"
                        layout={{
                            'text-field': ['coalesce', ['get', 'iata'], ['get', 'icao']],
                            'text-size': 12,
                            'text-offset': [0, 1.5],
                            'text-anchor': 'top',
                            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                        }}
                        paint={{
                            'text-color': '#FFFFFF',
                            'text-halo-color': 'rgba(0, 0, 0, 0.7)',
                            'text-halo-width': 1,
                        }}
                    />
                </Source>
            </MapGL>
        </div>
    );
}
