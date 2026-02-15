import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

import { Heading, Spinner } from '../components/Elements';
import { Statistics, Coord, Trajectory } from '../models';
import { ComposableMap, ZoomableGroup, Geographies, Geography, Marker, Line } from 'react-simple-maps';
import API from '../api';

interface PublicProfileData {
    username: string;
    memberSince: string;
    stats: Statistics;
    decorations: [Trajectory[], Coord[]];
}

function ProfileMap({ lines, markers }: { lines: Trajectory[]; markers: Coord[] }) {
    const [world, setWorld] = useState<object>();

    useEffect(() => {
        API.get('/geography/world?visited=false')
        .then((data) => setWorld(data))
        .catch(() => {});
    }, []);

    if (!world) return null;

    return (
        <ComposableMap width={1000} height={470}>
            <ZoomableGroup maxZoom={10} translateExtent={[[0, 0], [1000, 470]]}>
                <Geographies geography={world}>
                    {({ geographies }) =>
                        geographies.map((geo) => (
                            <Geography key={geo.rsmKey} geography={geo}
                                       stroke="#111" strokeWidth={0.7} fill="#333" />
                        ))
                    }
                </Geographies>
                {lines.map((line, i) => (
                    <Line key={i}
                          from={[line.first.longitude, line.first.latitude]}
                          to={[line.second.longitude, line.second.latitude]}
                          stroke="#FF5533CC" strokeWidth={1} strokeLinecap="round" />
                ))}
                {markers.map((marker, i) => (
                    <Marker key={i} coordinates={[marker.longitude, marker.latitude]}>
                        <circle r={3} fill="#FFA500" stroke="#FFA500" strokeWidth={0.5} />
                    </Marker>
                ))}
            </ZoomableGroup>
        </ComposableMap>
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
