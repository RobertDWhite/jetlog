import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { Heading, Spinner } from '../components/Elements';
import { Statistics, Coord, Trajectory } from '../models';
import MapGL, { Source, Layer, MapRef, useControl } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ArcLayer, ScatterplotLayer } from '@deck.gl/layers';
import API from '../api';

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

function DeckGLOverlay(props: any) {
    const overlay = useControl(() => new MapboxOverlay(props));
    overlay.setProps(props);
    return null;
}

interface PublicProfileData {
    username: string;
    memberSince: string;
    stats: Statistics;
    decorations: [Trajectory[], Coord[]];
}

function ProfileMap({ lines, markers }: { lines: Trajectory[]; markers: Coord[] }) {
    const [world, setWorld] = useState<any>(null);
    const mapRef = useRef<MapRef>(null);

    useEffect(() => {
        API.get('/geography/world?visited=false')
        .then((data) => setWorld(data))
        .catch(() => {});
    }, []);

    const layers = useMemo(() => [
        new ArcLayer<Trajectory>({
            id: 'profile-arcs',
            data: lines,
            getSourcePosition: (d: Trajectory) => [d.first.longitude, d.first.latitude],
            getTargetPosition: (d: Trajectory) => [d.second.longitude, d.second.latitude],
            getSourceColor: [255, 85, 51, 200],
            getTargetColor: [255, 85, 51, 200],
            getWidth: 2,
            greatCircle: true,
            getHeight: 0.3,
            widthMinPixels: 1,
            widthMaxPixels: 4,
        }),
        new ScatterplotLayer<Coord>({
            id: 'profile-markers',
            data: markers,
            getPosition: (d: Coord) => [d.longitude, d.latitude],
            getRadius: 6000,
            getFillColor: [255, 165, 0, 255],
            getLineColor: [255, 165, 0, 255],
            stroked: true,
            lineWidthMinPixels: 1,
            radiusMinPixels: 3,
            radiusMaxPixels: 8,
        }),
    ], [lines, markers]);

    const onMapLoad = useCallback(() => {
        const map = mapRef.current?.getMap();
        if (!map) return;

        map.setFog({
            color: 'rgb(20, 20, 30)',
            'high-color': 'rgb(30, 40, 70)',
            'horizon-blend': 0.08,
            'space-color': 'rgb(8, 10, 16)',
            'star-intensity': 0.5,
        });
    }, []);

    const countryFillLayer: any = {
        id: 'country-fill',
        type: 'fill',
        paint: {
            'fill-color': 'rgba(0, 0, 0, 0)',
            'fill-outline-color': 'rgba(60, 60, 60, 0.5)',
        },
    };

    return (
        <div className="w-full" style={{ height: 470 }}>
            <MapGL
                ref={mapRef}
                initialViewState={{
                    longitude: 0,
                    latitude: 20,
                    zoom: 1.5,
                }}
                mapStyle={DARK_STYLE}
                mapLib={maplibregl}
                projection={{ type: 'globe' }}
                onLoad={onMapLoad}
                attributionControl={false}
                style={{ width: '100%', height: '100%', borderRadius: '0.5rem' }}
            >
                {world && (
                    <Source id="world-countries" type="geojson" data={world}>
                        <Layer {...countryFillLayer} />
                    </Source>
                )}

                <DeckGLOverlay layers={layers} />
            </MapGL>
        </div>
    );
}

export default function PublicProfile() {
    const { username } = useParams<{ username: string }>();
    const [profile, setProfile] = useState<PublicProfileData>();
    const [error, setError] = useState(false);

    useEffect(() => {
        API.get(`/users/public/${username}`)
        .then((data: PublicProfileData) => setProfile(data))
        .catch(() => setError(true));
    }, [username]);

    if (error) {
        return (
            <div className="text-center py-16">
                <h1 className="text-6xl font-bold text-gray-300 dark:text-gray-600 mb-4">404</h1>
                <p className="text-lg text-gray-500 dark:text-gray-400">Profile not found or not public</p>
            </div>
        );
    }

    if (!profile) return <Spinner />;

    const stats = profile.stats;
    const hours = Math.round(stats.totalDuration / 60);

    return (
        <div className="max-w-4xl mx-auto">
            <div className="text-center mb-6">
                <Heading text={`${profile.username}'s Flight Log`} />
                <p className="text-gray-500 dark:text-gray-400">
                    Member since {new Date(profile.memberSince).toLocaleDateString()}
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gradient-to-br from-primary-400 to-primary-600 text-white rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{stats.totalFlights}</div>
                    <div className="text-sm opacity-90">Flights</div>
                </div>
                <div className="bg-gradient-to-br from-primary-400 to-primary-600 text-white rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{stats.totalDistance.toLocaleString()}</div>
                    <div className="text-sm opacity-90">km</div>
                </div>
                <div className="bg-gradient-to-br from-primary-400 to-primary-600 text-white rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{hours}</div>
                    <div className="text-sm opacity-90">Hours</div>
                </div>
                <div className="bg-gradient-to-br from-primary-400 to-primary-600 text-white rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold">{stats.visitedCountries}</div>
                    <div className="text-sm opacity-90">Countries</div>
                </div>
            </div>

            <div className="container mb-6">
                <ProfileMap
                    lines={profile.decorations[0] || []}
                    markers={profile.decorations[1] || []}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {stats.mostVisitedAirports && Object.keys(stats.mostVisitedAirports).length > 0 && (
                    <div className="container">
                        <h3 className="text-lg font-semibold mb-2">Top Airports</h3>
                        {Object.entries(stats.mostVisitedAirports).slice(0, 5).map(([airport, count]) => (
                            <div key={airport} className="flex justify-between py-1">
                                <span>{airport}</span>
                                <span className="text-primary-500 font-medium">{count as number}</span>
                            </div>
                        ))}
                    </div>
                )}
                {stats.mostCommonAirlines && Object.keys(stats.mostCommonAirlines).length > 0 && (
                    <div className="container">
                        <h3 className="text-lg font-semibold mb-2">Top Airlines</h3>
                        {Object.entries(stats.mostCommonAirlines).slice(0, 5).map(([airline, count]) => (
                            <div key={airline} className="flex justify-between py-1">
                                <span>{airline}</span>
                                <span className="text-primary-500 font-medium">{count as number}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <p className="text-center text-sm text-gray-400 mt-8 mb-4">
                Powered by JetLog
            </p>
        </div>
    );
}
