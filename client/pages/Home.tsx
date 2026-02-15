import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { ShortStats } from '../components/Stats';
import WorldMap from '../components/WorldMap';
import { Button, Spinner } from '../components/Elements';
import { Flight } from '../models';
import API from '../api';

function UpcomingFlights() {
    const [flights, setFlights] = useState<Flight[]>();
    const navigate = useNavigate();

    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        API.get('/flights', { start: today, order: 'ASC', limit: 5 })
        .then((data: Flight[]) => setFlights(data));
    }, []);

    if (!flights || flights.length === 0) return null;

    const daysUntil = (dateStr: string) => {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const target = new Date(dateStr + 'T00:00:00');
        const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Tomorrow';
        return `${diff} days`;
    };

    return (
        <div className="container mb-4">
            <h3 className="text-lg font-semibold mb-3">Upcoming Flights</h3>
            <div className="space-y-2">
                {flights.map(flight => (
                    <div key={flight.id}
                         className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                         onClick={() => navigate(`/flights?id=${flight.id}`)}>
                        <div>
                            <div className="font-semibold dark:text-gray-100">
                                {flight.origin.iata || flight.origin.icao}
                                {' \u2192 '}
                                {flight.destination.iata || flight.destination.icao}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                {flight.date}
                                {flight.departureTime ? ` at ${flight.departureTime}` : ''}
                                {flight.airline?.name ? ` \u00B7 ${flight.airline.name}` : ''}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-lg font-bold text-primary-500">{daysUntil(flight.date)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function RecentFlights() {
    const [flights, setFlights] = useState<Flight[]>();
    const navigate = useNavigate();

    useEffect(() => {
        API.get('/flights?limit=5')
        .then((data: Flight[]) => setFlights(data));
    }, []);

    if (!flights) {
        return <div className="container"><Spinner /></div>;
    }

    if (flights.length === 0) {
        return (
            <div className="container text-center py-6">
                <p className="text-gray-500 dark:text-gray-400 mb-3">No flights logged yet</p>
                <Button text="Add Your First Flight" level="primary" onClick={() => navigate('/new')} />
            </div>
        );
    }

    return (
        <div className="container">
            <h3 className="text-lg font-semibold mb-3">Recent Flights</h3>
            <div className="overflow-x-auto">
                <table className="table-auto w-full text-sm">
                    <thead>
                        <tr>
                            <th className="px-2 py-1 text-left border-b border-gray-300 dark:border-gray-600 font-semibold">Date</th>
                            <th className="px-2 py-1 text-left border-b border-gray-300 dark:border-gray-600 font-semibold">Route</th>
                            <th className="px-2 py-1 text-left border-b border-gray-300 dark:border-gray-600 font-semibold">Airline</th>
                        </tr>
                    </thead>
                    <tbody>
                        {flights.map((flight) => (
                            <tr key={flight.id}
                                className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 duration-75"
                                onClick={() => navigate(`/flights?id=${flight.id}`)}>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                    <span>{flight.date}</span>
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                    <span>
                                        {flight.origin.iata || flight.origin.icao}
                                        {' \u2192 '}
                                        {flight.destination.iata || flight.destination.icao}
                                    </span>
                                </td>
                                <td className="px-2 py-1.5 whitespace-nowrap">
                                    <span>{flight.airline?.name || ''}</span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="mt-3 flex gap-2">
                <Button text="Add Flight" onClick={() => navigate('/new')} />
                <Button text="View All" onClick={() => navigate('/flights')} />
            </div>
        </div>
    );
}

export default function Home() {
    return (
        <>
            <ShortStats />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
                <div className="md:col-span-2">
                    <WorldMap />
                </div>
                <div>
                    <UpcomingFlights />
                    <RecentFlights />
                </div>
            </div>
        </>
    );
}
