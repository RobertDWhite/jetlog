import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { Heading, Spinner, Whisper } from '../components/Elements';
import AirlineLogo from '../components/AirlineLogo';
import { Flight, Airport } from '../models';
import API from '../api';
import ConfigStorage from '../storage/configStorage';

function countryCodeToFlag(countryCode: string): string {
    if (!countryCode || countryCode.length !== 2) return '';
    const codePoints = countryCode
        .toUpperCase()
        .split('')
        .map(char => 0x1F1E6 - 65 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
}

function getCountryCodeFromIcao(icao: string): string {
    if (!icao) return '';
    const prefix = icao.substring(0, 2).toUpperCase();
    const icaoToCountry: { [key: string]: string } = {
        'EG': 'GB', 'LF': 'FR', 'ED': 'DE', 'LI': 'IT', 'LE': 'ES',
        'EH': 'NL', 'EB': 'BE', 'LP': 'PT', 'LO': 'AT', 'LS': 'CH',
        'EK': 'DK', 'EN': 'NO', 'ES': 'SE', 'EF': 'FI', 'EI': 'IE',
        'EP': 'PL', 'LK': 'CZ', 'LH': 'HU', 'LR': 'RO', 'LB': 'BG',
        'LG': 'GR', 'LT': 'TR', 'LL': 'IL', 'OJ': 'JO', 'OE': 'SA',
        'OM': 'AE', 'OI': 'IR', 'OB': 'BH', 'OK': 'KW', 'OO': 'QA',
        'OP': 'PK', 'VI': 'IN', 'VE': 'IN', 'VA': 'IN', 'VO': 'IN',
        'VT': 'TH', 'WS': 'SG', 'WM': 'MY', 'WI': 'ID', 'WA': 'ID',
        'RP': 'PH', 'VV': 'VN', 'RJ': 'JP', 'RK': 'KR', 'ZB': 'CN',
        'ZS': 'CN', 'ZG': 'CN', 'ZP': 'CN', 'ZW': 'CN', 'ZU': 'CN',
        'ZH': 'CN', 'ZL': 'CN', 'ZJ': 'CN', 'RC': 'TW', 'VH': 'HK',
        'VM': 'MO', 'YB': 'AU', 'YM': 'AU', 'YS': 'AU', 'YP': 'AU',
        'NZ': 'NZ', 'FA': 'ZA', 'DN': 'NG', 'FK': 'KE', 'HC': 'SO',
        'HK': 'KE', 'HA': 'ET', 'HU': 'UG', 'HR': 'RW', 'FV': 'ZW',
        'DA': 'DZ', 'DT': 'TN', 'GM': 'MA', 'HE': 'EG', 'HL': 'LY',
        'CY': 'CA', 'CZ': 'CA', 'CU': 'CA',
        'K': 'US', 'PA': 'US', 'PH': 'US', 'PF': 'US', 'TJ': 'PR',
        'MM': 'MX', 'MU': 'CU', 'MK': 'JM', 'TF': 'FR',
        'SA': 'AR', 'SB': 'BR', 'SC': 'CO', 'SE': 'EC', 'SP': 'PE',
        'SK': 'CO', 'SV': 'VE', 'SL': 'CL', 'SU': 'UY',
        'UA': 'UA', 'UU': 'RU', 'UR': 'RU', 'UL': 'RU', 'UN': 'RU',
        'UE': 'RU', 'UH': 'RU', 'UI': 'RU', 'UW': 'RU', 'US': 'RU',
    };

    if (icaoToCountry[prefix]) return icaoToCountry[prefix];
    if (icao.startsWith('K') && icao.length === 4) return 'US';
    return '';
}

export default function AirportDetail() {
    const { icao } = useParams<{ icao: string }>();
    const navigate = useNavigate();
    const metricUnits = ConfigStorage.getSetting("metricUnits");

    const [airport, setAirport] = useState<Airport | null>(null);
    const [flights, setFlights] = useState<Flight[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!icao) return;
        setLoading(true);

        Promise.all([
            API.get(`/airports/${icao}`).catch(() => null),
            API.get(`/flights?metric=${metricUnits}`, { limit: 500 }).catch(() => []),
        ]).then(([airportData, allFlights]) => {
            if (airportData) {
                setAirport(airportData);
            }

            const relevantFlights = (allFlights as Flight[]).filter(
                (f) => f.origin.icao === icao || f.destination.icao === icao
            );
            setFlights(relevantFlights);

            if (!airportData && relevantFlights.length > 0) {
                const sample = relevantFlights[0];
                const ap = sample.origin.icao === icao ? sample.origin : sample.destination;
                setAirport(ap);
            }

            if (!airportData && relevantFlights.length === 0) {
                setError(true);
            }

            setLoading(false);
        });
    }, [icao, metricUnits]);

    if (loading) return <Spinner />;

    if (error || !airport) {
        return (
            <div className="text-center py-16">
                <h1 className="text-6xl font-bold text-gray-300 dark:text-gray-600 mb-4">404</h1>
                <p className="text-lg text-gray-500 dark:text-gray-400 mb-6">Airport not found</p>
                <button
                    className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
                    onClick={() => navigate('/')}
                >
                    Go Home
                </button>
            </div>
        );
    }

    const countryCode = getCountryCodeFromIcao(airport.icao);
    const flag = countryCodeToFlag(countryCode);

    const sortedFlights = [...flights].sort((a, b) => b.date.localeCompare(a.date));
    const firstVisit = flights.length > 0 ? [...flights].sort((a, b) => a.date.localeCompare(b.date))[0].date : 'N/A';
    const lastVisit = flights.length > 0 ? sortedFlights[0].date : 'N/A';

    // Airlines used at this airport
    const airlineMap = new Map<string, { name: string; iata: string; icao: string; count: number }>();
    flights.forEach(f => {
        if (f.airline?.name) {
            const key = f.airline.icao || f.airline.name;
            const existing = airlineMap.get(key);
            if (existing) {
                existing.count++;
            } else {
                airlineMap.set(key, { name: f.airline.name, iata: f.airline.iata, icao: f.airline.icao, count: 1 });
            }
        }
    });
    const airlines = Array.from(airlineMap.values()).sort((a, b) => b.count - a.count);

    // Most common routes from this airport
    const routeMap = new Map<string, number>();
    flights.forEach(f => {
        const other = f.origin.icao === icao
            ? (f.destination.iata || f.destination.icao)
            : (f.origin.iata || f.origin.icao);
        const key = `${airport.iata || airport.icao} - ${other}`;
        routeMap.set(key, (routeMap.get(key) || 0) + 1);
    });
    const topRoutes = Array.from(routeMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const departures = flights.filter(f => f.origin.icao === icao).length;
    const arrivals = flights.filter(f => f.destination.icao === icao).length;

    return (
        <div className="max-w-5xl mx-auto">
            {/* Airport header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                    {flag && <span className="text-4xl" style={{ fontFamily: 'initial' }}>{flag}</span>}
                    <div>
                        <h1 className="text-3xl font-bold">{airport.name}</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 px-2 py-0.5 rounded text-sm font-bold">
                                {airport.icao}
                            </span>
                            {airport.iata && (
                                <span className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded text-sm font-bold">
                                    {airport.iata}
                                </span>
                            )}
                            {airport.type && (
                                <span className="text-sm text-gray-500 dark:text-gray-400 capitalize">{airport.type.replace('_', ' ')}</span>
                            )}
                        </div>
                    </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    {[airport.municipality, airport.region, airport.country].filter(Boolean).join(', ')}
                    {airport.continent ? ` (${airport.continent})` : ''}
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {/* Stats overview */}
                <div className="bg-gradient-to-br from-primary-500 to-primary-700 text-white rounded-xl p-5 shadow-lg">
                    <div className="text-4xl font-bold tabular-nums">{flights.length}</div>
                    <div className="text-sm opacity-90 mb-3">Total Flights</div>
                    <div className="flex gap-4 text-sm">
                        <div>
                            <div className="font-semibold">{departures}</div>
                            <div className="opacity-75">Departures</div>
                        </div>
                        <div>
                            <div className="font-semibold">{arrivals}</div>
                            <div className="opacity-75">Arrivals</div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Visit History</h3>
                    <div className="space-y-2">
                        <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">First visit</span>
                            <span className="font-medium">{firstVisit}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">Last visit</span>
                            <span className="font-medium">{lastVisit}</span>
                        </div>
                        {airport.timezone && (
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Timezone</span>
                                <span className="font-medium text-xs">{airport.timezone}</span>
                            </div>
                        )}
                    </div>
                </div>

                {airport.latitude && airport.longitude && (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Location</h3>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Latitude</span>
                                <span className="font-mono">{airport.latitude.toFixed(4)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Longitude</span>
                                <span className="font-mono">{airport.longitude.toFixed(4)}</span>
                            </div>
                        </div>
                        <a
                            href={`https://www.openstreetmap.org/?mlat=${airport.latitude}&mlon=${airport.longitude}#map=12/${airport.latitude}/${airport.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-3 text-xs text-primary-500 hover:text-primary-600 underline"
                        >
                            View on OpenStreetMap
                        </a>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Airlines at this airport */}
                {airlines.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold mb-3">Airlines</h3>
                        <div className="space-y-2">
                            {airlines.map(al => (
                                <div key={al.icao || al.name} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <AirlineLogo iata={al.iata} icao={al.icao} size={24} />
                                        <span className="text-sm font-medium">{al.name}</span>
                                    </div>
                                    <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">{al.count} flight{al.count !== 1 ? 's' : ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Top routes */}
                {topRoutes.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold mb-3">Top Routes</h3>
                        <div className="space-y-2">
                            {topRoutes.map(([route, count]) => (
                                <div key={route} className="flex justify-between items-center">
                                    <span className="text-sm font-medium">{route}</span>
                                    <span className="text-sm text-gray-500 dark:text-gray-400 tabular-nums">{count}x</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Flights table */}
            {sortedFlights.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <h3 className="text-lg font-semibold p-5 pb-3">All Flights</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Date</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Route</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Airline</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 hidden md:table-cell">Aircraft</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 hidden md:table-cell">Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedFlights.map(flight => (
                                    <tr
                                        key={flight.id}
                                        className="border-b border-gray-100 dark:border-gray-700/50 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                                        onClick={() => navigate(`/flights?id=${flight.id}`)}
                                    >
                                        <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{flight.date}</td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">
                                            <span className="font-semibold">{flight.origin.iata || flight.origin.icao}</span>
                                            <span className="mx-1 text-gray-400">{'\u2192'}</span>
                                            <span className="font-semibold">{flight.destination.iata || flight.destination.icao}</span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {flight.airline ? (
                                                <div className="flex items-center gap-2">
                                                    <AirlineLogo iata={flight.airline.iata} icao={flight.airline.icao} size={20} />
                                                    <span>{flight.airline.name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 hidden md:table-cell">{flight.airplane || '-'}</td>
                                        <td className="px-4 py-2.5 hidden md:table-cell tabular-nums">{flight.duration ? `${flight.duration} min` : '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
