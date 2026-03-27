import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { Heading, Spinner } from '../components/Elements';
import API, { BASE_URL } from '../api';

interface PhotoFlight {
    id: number;
    date: string;
    origin: string;
    destination: string;
}

export default function Gallery() {
    const [flights, setFlights] = useState<PhotoFlight[]>();
    const navigate = useNavigate();

    useEffect(() => {
        API.get('/flights/photos/all')
        .then((data: PhotoFlight[]) => setFlights(data));
    }, []);

    if (!flights) return <Spinner />;

    if (flights.length === 0) {
        return (
            <div className="text-center py-12">
                <Heading text="Photo Gallery" />
                <p className="text-gray-500 dark:text-gray-400">No photos yet. Add photos to your flights to see them here.</p>
            </div>
        );
    }

    return (
        <>
            <Heading text="Photo Gallery" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
                {flights.map(flight => (
                    <div key={flight.id}
                         className="relative group cursor-pointer rounded-lg overflow-hidden shadow-md hover:shadow-xl transition-shadow"
                         onClick={() => navigate(`/flights?id=${flight.id}`)}>
                        <img src={`${BASE_URL}/api/flights/${flight.id}/photo`}
                             alt={`${flight.origin} to ${flight.destination}`}
                             className="w-full h-48 object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                            <div className="text-white font-semibold text-sm">
                                {flight.origin} {'\u2192'} {flight.destination}
                            </div>
                            <div className="text-white/70 text-xs">{flight.date}</div>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
