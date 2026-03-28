import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Heading, Spinner, Select } from '../components/Elements';
import AirlineLogo from '../components/AirlineLogo';
import { Statistics } from '../models';
import API from '../api';
import ConfigStorage from '../storage/configStorage';

interface ReviewData {
    year: number;
    stats: Statistics;
}

function StatCard({ value, label, icon }: { value: string | number; label: string; icon: string }) {
    return (
        <div className="bg-gradient-to-br from-primary-400 to-primary-600 text-white rounded-xl p-6 text-center shadow-lg">
            <div className="text-3xl mb-2">{icon}</div>
            <div className="text-4xl font-bold mb-1">{value}</div>
            <div className="text-sm opacity-90">{label}</div>
        </div>
    );
}

function ComparisonStat({ value, unit, comparison }: { value: string; unit: string; comparison: string }) {
    return (
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-primary-500">{value}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">{unit}</div>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">{comparison}</div>
        </div>
    );
}

export default function YearInReview() {
    const [searchParams] = useSearchParams();
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(parseInt(searchParams.get('year') || String(currentYear)));
    const [stats, setStats] = useState<Statistics>();
    const [loading, setLoading] = useState(true);
    const metricUnits = ConfigStorage.getSetting('metricUnits');

    useEffect(() => {
        setLoading(true);
        API.get(`/statistics?metric=${metricUnits}`, {
            start: `${year}-01-01`,
            end: `${year}-12-31`
        }).then((data: Statistics) => {
            setStats(data);
            setLoading(false);
        });
    }, [year]);

    if (loading || !stats) return <Spinner />;

    const distUnit = metricUnits === 'false' ? 'miles' : 'km';
    const hours = Math.round(stats.totalDuration / 60);
    const topAirport = Object.keys(stats.mostVisitedAirports || {})[0] || 'N/A';
    const topAirline = Object.keys(stats.mostCommonAirlines || {})[0] || 'N/A';
    const topRoute = stats.topRoutes?.[0];
    const continentsVisited = stats.continentCompletion?.filter(c => c.visited > 0).length || 0;

    // CO2 calculation
    const computeCo2 = () => {
        if (stats.totalCo2Kg > 0) return stats.totalCo2Kg;
        if (stats.totalDistance <= 0) return 0;
        const distKm = metricUnits === 'false' ? stats.totalDistance * 1.60934 : stats.totalDistance;
        if (distKm < 1500) return distKm * 0.255;
        if (distKm < 3000) return distKm * 0.188;
        return distKm * 0.152;
    };
    const co2 = computeCo2();

    const yearOptions = [];
    for (let y = currentYear; y >= currentYear - 10; y--) {
        yearOptions.push({ text: String(y), value: String(y) });
    }

    return (
        <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
                <Heading text={`${year} Year in Review`} />
                <Select
                    options={yearOptions}
                    defaultValue={String(year)}
                    onChange={(e) => setYear(parseInt(e.target.value))}
                />
            </div>

            {stats.totalFlights === 0 ? (
                <p className="text-center text-gray-500 text-lg">No flights logged in {year}</p>
            ) : (
            <>
                {/* Hero stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <StatCard value={stats.totalFlights} label="Flights" icon={'\u2708\uFE0F'} />
                    <StatCard value={stats.totalDistance.toLocaleString()} label={distUnit} icon={'\u{1F30D}'} />
                    <StatCard value={hours} label="Hours in air" icon={'\u23F0'} />
                    <StatCard value={stats.visitedCountries} label="Countries" icon={'\u{1F3F3}\uFE0F'} />
                </div>

                {/* Fun comparisons */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
                    <ComparisonStat
                        value={(stats.totalDistance / 40000).toFixed(1)}
                        unit="times around Earth"
                        comparison={`${stats.totalDistance.toLocaleString()} ${distUnit}`}
                    />
                    <ComparisonStat
                        value={String(stats.totalUniqueAirports)}
                        unit="unique airports"
                        comparison={`across ${continentsVisited} continents`}
                    />
                    <ComparisonStat
                        value={co2 >= 1000
                            ? (co2 / 1000).toFixed(1) + 't'
                            : Math.round(co2) + 'kg'}
                        unit={`CO\u2082 emissions`}
                        comparison="estimated footprint"
                    />
                </div>

                {/* Favorites */}
                <div className="container mb-6">
                    <h3 className="text-lg font-semibold mb-4">Your {year} Favorites</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Top Airport</p>
                            <p className="text-xl font-bold text-primary-500">{topAirport}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Top Airline</p>
                            <div className="flex items-center gap-2 mt-1">
                                <AirlineLogo icao={topAirline} size={28} />
                                <p className="text-xl font-bold text-primary-500">{topAirline}</p>
                            </div>
                        </div>
                        {topRoute && (
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Most Flown Route</p>
                            <p className="text-xl font-bold text-primary-500">
                                {topRoute.origin} {'\u2192'} {topRoute.destination}
                                <span className="text-sm font-normal text-gray-500 ml-1">({topRoute.count}x)</span>
                            </p>
                        </div>
                        )}
                    </div>
                </div>

                {/* CO2 Detail for the year */}
                {co2 > 0 && (
                <div className="container mb-6">
                    <h3 className="text-lg font-semibold mb-4">{year} Carbon Footprint</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                            <div className="text-3xl font-bold text-orange-500">
                                {co2 >= 1000
                                    ? (co2 / 1000).toFixed(1) + 't'
                                    : Math.round(co2) + ' kg'}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                CO{'\u2082'} emissions
                            </div>
                        </div>
                        <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                            <div className="text-3xl font-bold text-green-500">
                                {Math.ceil(co2 / 22).toLocaleString()}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                trees to offset/yr
                            </div>
                        </div>
                    </div>
                </div>
                )}

                {/* Records */}
                {stats.records && Object.keys(stats.records).length > 0 && (
                <div className="container mb-6">
                    <h3 className="text-lg font-semibold mb-4">{year} Records</h3>
                    <div className="space-y-2">
                        {stats.records.longestDistance && (
                            <p>Longest flight: <span className="font-medium">
                                {stats.records.longestDistance.origin} {'\u2192'} {stats.records.longestDistance.destination}
                            </span> ({stats.records.longestDistance.distance.toLocaleString()} {distUnit})</p>
                        )}
                        {stats.records.shortestDistance && (
                            <p>Shortest flight: <span className="font-medium">
                                {stats.records.shortestDistance.origin} {'\u2192'} {stats.records.shortestDistance.destination}
                            </span> ({stats.records.shortestDistance.distance.toLocaleString()} {distUnit})</p>
                        )}
                        {stats.records.busiestMonth && (
                            <p>Busiest month: <span className="font-medium">{stats.records.busiestMonth.month}</span> ({stats.records.busiestMonth.count} flights)</p>
                        )}
                    </div>
                </div>
                )}
            </>
            )}
        </div>
    );
}
