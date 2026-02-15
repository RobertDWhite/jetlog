import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Heading, Input, Select, Subheading, TextArea, Spinner } from '../components/Elements'
import { Airline, Airport, Flight, User } from '../models';
import SearchInput from './SearchInput';
import API, { BASE_URL } from '../api';
import ConfigStorage from '../storage/configStorage';
import TokenStorage from '../storage/tokenStorage';
import { objectFromForm } from '../utils';
import { SingleFlightMap } from './WorldMap';
import FetchConnection from './FetchConnection';

function FlightPhoto({ flightId, canEdit }: { flightId: number; canEdit: boolean }) {
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${BASE_URL}/api/flights/${flightId}/photo`)
        .then(res => {
            if (res.ok) {
                setPhotoUrl(`${BASE_URL}/api/flights/${flightId}/photo?t=${Date.now()}`);
            }
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, [flightId]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        const token = TokenStorage.getToken();
        const res = await fetch(`${BASE_URL}/api/flights/${flightId}/photo`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        if (res.ok) {
            setPhotoUrl(`${BASE_URL}/api/flights/${flightId}/photo?t=${Date.now()}`);
        } else {
            const err = await res.json();
            alert(err.detail || 'Upload failed');
        }
    };

    const handleDelete = async () => {
        const token = TokenStorage.getToken();
        await fetch(`${BASE_URL}/api/flights/${flightId}/photo`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        setPhotoUrl(null);
    };

    if (loading) return <Spinner />;

    return (
        <div>
            {photoUrl ? (
                <div>
                    <img src={photoUrl} alt="Flight photo" className="rounded-lg max-h-64 w-auto mb-2" />
                    {canEdit && (
                        <div className="flex gap-2">
                            <label className="py-1 px-2 rounded-md cursor-pointer bg-white text-black border border-gray-300 hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-500 text-sm">
                                Replace
                                <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                            </label>
                            <Button text="Remove" level="danger" onClick={handleDelete} />
                        </div>
                    )}
                </div>
            ) : canEdit ? (
                <label className="block border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 transition-colors">
                    <span className="text-gray-500 dark:text-gray-400">Click to add a photo</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
                </label>
            ) : (
                <p className="text-gray-500 dark:text-gray-400">No photo</p>
            )}
        </div>
    );
}

function StarRatingInput({ value, name }: { value: number | null; name: string }) {
    const [rating, setRating] = useState(value || 0);
    const [hover, setHover] = useState(0);

    return (
        <span className="inline-flex gap-0.5">
            <input type="hidden" name={name} value={rating || ''} />
            {[1, 2, 3, 4, 5].map(star => (
                <span key={star}
                      className={`cursor-pointer text-xl ${(hover || rating) >= star ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
                      onMouseEnter={() => setHover(star)}
                      onMouseLeave={() => setHover(0)}
                      onClick={() => setRating(rating === star ? 0 : star)}>
                    {'\u2605'}
                </span>
            ))}
        </span>
    );
}

export default function SingleFlight({ flightID }) {
    const [flight, setFlight] = useState<Flight>();
    const [selfUsername, setSelfUsername] = useState<string>();
    const [editMode, setEditMode] = useState<Boolean>(false);
    const [notFound, setNotFound] = useState(false);

    const navigate = useNavigate();
    const metricUnits = ConfigStorage.getSetting("metricUnits");
    const localAirportTime = ConfigStorage.getSetting("localAirportTime");

    useEffect(() => {
        API.get(`/flights?id=${flightID}&metric=${metricUnits}`)
        .then((data: Flight) => {
            setFlight(data);
        })
        .catch(() => {
            setNotFound(true);
        });

        API.get("/users/me")
        .then((data: User) => {
            setSelfUsername(data.username);
        });
    }, []);

    if (notFound) {
        return (
            <div className="text-center py-16">
                <h1 className="text-6xl font-bold text-gray-300 dark:text-gray-600 mb-4">404</h1>
                <p className="text-lg text-gray-500 dark:text-gray-400 mb-6">Flight not found</p>
                <Button text="Go Home" onClick={() => navigate('/')} />
            </div>
        );
    }

    if(flight === undefined) {
        return <Spinner />;
    }

    const toggleEditMode = (event) => {
        event.preventDefault();
        setEditMode(!editMode);
    }

    const deleteFlight = (event) => {
        event.preventDefault();
        if(confirm("Are you sure?")) {
            API.delete(`/flights?id=${flight.id}`)
            .then(() => navigate("/"));
        }
    }

    const updateFlight = (event) => {
        event.preventDefault();

        const flightPatchData = objectFromForm(event);

        if (flightPatchData === null) {
            this.toggleEditMode();
            return;
        }

        API.patch(`flights?id=${flight.id}&timezones=${localAirportTime}`, flightPatchData)
        .then(() => window.location.reload());
    }

    return (
        <>
            <Heading text={`${flight.origin.iata || flight.origin.icao } to ${flight.destination.iata || flight.destination.icao}`} />
            <h2 className="-mt-4 mb-4 text-xl">{flight.username} on {flight.date}</h2>
           
            <form onSubmit={updateFlight}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                <div className="container">
                    <Subheading text="Timings" />
                    { editMode ? 
                    <>
                        <p>Date: <Input type="date" name="date" defaultValue={flight.date} /></p>
                        <p>Departure Time: <Input type="time" name="departureTime" defaultValue={flight.departureTime} /></p>
                        <p>Arrival Time: <Input type="time" name="arrivalTime" defaultValue={flight.arrivalTime} /></p>
                        <p>Arrival Date: <Input type="date" name="arrivalDate" defaultValue={flight.arrivalDate}/></p>
                        <p>Duration: <Input type="number" name="duration" placeholder={flight.duration?.toString()}/></p>
                    </>
                    :
                    <>
                        <p>Date: <span>{flight.date}</span></p>
                        <p>Departure Time: <span>{flight.departureTime || "N/A"}</span></p>
                        <p>Arrival Time: <span>{flight.arrivalTime || "N/A"}</span></p>
                        <p>Arrival Date: <span>{flight.arrivalDate || "N/A"}</span></p>
                        <p>Duration: <span>{flight.duration ? flight.duration + " min" : "N/A"}</span></p>
                    </>
                    }
                </div>

                <div className="container">
                    <Subheading text="Airports" />
                    { editMode ?
                    <>
                        <p>Origin: <SearchInput name="origin"
                                                type="airports"
                                                value={flight.origin}
                                                onSelect={(airport: Airport) => setFlight(prev => ({...prev!, origin: airport}))}/></p>
                        <p>Destination: <SearchInput name="destination" 
                                                     type="airports" 
                                                     value={flight.destination}
                                                     onSelect={(airport: Airport) => setFlight(prev => ({...prev!, destination: airport}))}/></p>
                        <p>Distance (km): <Input type="number" name="distance" placeholder={flight.distance?.toString()}/></p>
                    </>
                    :
                    <>
                        <p className="mb-2">Distance: <span>{flight.distance ? flight.distance + (metricUnits === "false" ? " mi" : " km") : "N/A"}</span></p>
                        <p className="font-bold">Origin</p> 
                        <ul className="mb-2">
                            <li>ICAO/IATA: <span>{flight.origin.icao}/{flight.origin.iata}</span></li>
                            <li>Type: <span>{flight.origin.type}</span></li>
                            <li>Name: <span>{flight.origin.name}</span></li>
                            <li>Location: <span>{flight.origin.continent}, {flight.origin.country}, {flight.origin.region}, {flight.origin.municipality}</span></li>
                            <li>Timezone: <span>{flight.origin.timezone}</span></li>
                        </ul>

                        <p className="font-bold">Destination</p> 
                        <ul>
                            <li>ICAO/IATA: <span>{flight.destination.icao}/{flight.destination.iata}</span></li>
                            <li>Type: <span>{flight.destination.type}</span></li>
                            <li>Name: <span>{flight.destination.name}</span></li>
                            <li>Location: <span>{flight.destination.continent}, {flight.destination.country}, {flight.destination.region}, {flight.destination.municipality}</span></li>
                            <li>Timezone: <span>{flight.destination.timezone}</span></li>
                        </ul>
                    </>
                    }
                </div>

                <div className="container">
                    <Subheading text="Other" />
                    { editMode ?
                    <>
                        <p>Seat #: <Input type="text" name="seatNumber" placeholder={flight.seatNumber || "14A"} /></p>
                        <p>Seat: <Select name="seat" options={[
                            { text: flight.seat, value: "" },
                            { text: "Aisle", value: "aisle" },
                            { text: "Middle", value: "middle" },
                            { text: "Window", value: "window" }
                        ]} /></p>
                        <p>Aircraft Side: <Select name="aircraftSide" options={[
                            { text: flight.aircraftSide, value: "" },
                            { text: "Left", value: "left" },
                            { text: "Right", value: "right" },
                            { text: "Center", value: "center" }
                        ]} /></p>
                        <p>Class: <Select name="ticketClass" options={[
                            { text: flight.ticketClass, value: "" },
                            { text: "Private", value: "private" },
                            { text: "First", value: "first" },
                            { text: "Business", value: "business" },
                            { text: "Economy+", value: "economy+" },
                            { text: "Economy", value: "economy" }
                        ]} /></p>
                        <p>Purpose: <Select name="purpose" options={[
                            { text: flight.purpose, value: "" },
                            { text: "Leisure", value: "leisure" },
                            { text: "Business", value: "business" },
                            { text: "Crew", value: "crew" },
                            { text: "Other", value: "other" }
                        ]} /></p>
                        <p>Airplane: <Input type="text" name="airplane" placeholder={flight.airplane} /></p>
                        <p>Airline: <SearchInput name="airline" 
                                                 type="airlines" 
                                                 value={flight.airline}
                                                 onSelect={(airline: Airline) => setFlight(prev => ({...prev!, airline: airline}))}/></p>
                        <p>Tail Number: <Input type="text" name="tailNumber" placeholder={flight.tailNumber} /></p>
                        <p>Flight Number: <Input type="text" name="flightNumber" placeholder={flight.flightNumber} /></p>
                        <p>Connection: <FetchConnection name="connection" 
                                                        date={flight.date} 
                                                        origin={flight.origin.icao}
                                                        destination={flight.destination.icao}
                                                        value={flight.connection}
                                                        onFetched={(c: number) => setFlight(prev => ({...prev!, connection: c}))} /></p>
                        <p>Cost: <Input type="number" name="cost" placeholder={flight.cost?.toString() || "0.00"} /></p>
                        <p>Currency: <Input type="text" name="currency" placeholder={flight.currency || "USD"} /></p>
                        <p>Rating: <StarRatingInput value={flight.rating} name="rating" /></p>
                        <p>Notes</p>
                        <TextArea name="notes" defaultValue={flight.notes}/>
                    </>
                    :
                    <>
                        <p>Seat: <span>{flight.seat || "N/A"}{flight.seatNumber ? ` (${flight.seatNumber})` : ''}</span></p>
                        <p>Aircraft Side: <span>{flight.aircraftSide || "N/A"}</span></p>
                        <p>Class: <span>{flight.ticketClass || "N/A"}</span></p>
                        <p>Purpose: <span>{flight.purpose || "N/A"}</span></p>
                        <p>Airplane: <span>{flight.airplane || "N/A"}</span></p>
                        <p>Airline: <span>{flight.airline ? flight.airline.icao + " - " + flight.airline.name : "N/A"}</span></p>
                        <p>Tail Number: <span>{flight.tailNumber || "N/A"}</span></p>
                        <p>Flight Number: <span>{flight.flightNumber || "N/A"}</span></p>
                        <p>Connection: <span>{flight.connection ? <a href={`/flights?id=${flight.connection}`} className="underline">link</a> : "N/A"}</span></p>
                        <p>Cost: <span>{flight.cost ? `${flight.cost} ${flight.currency || ''}` : "N/A"}</span></p>
                        <p>Rating: <span>{flight.rating ? '\u2605'.repeat(flight.rating) + '\u2606'.repeat(5 - flight.rating) : 'N/A'}</span></p>
                        <p>Notes: {flight.notes ?  <p className="whitespace-pre-line inline">{flight.notes}</p> : "N/A"}</p>
                    </>}
                </div>

                <div className="container">
                    <SingleFlightMap flightID={flightID} distance={flight.distance} />
                </div>

                <div className="container">
                    <Subheading text="Photo" />
                    <FlightPhoto flightId={flight.id} canEdit={selfUsername === flight.username} />
                </div>
            </div>

            { editMode &&
                <Button text="Save" 
                        level="success" 
                        submit/>
            }
            { selfUsername === flight.username &&
                <>
                <Button text={editMode ? "Cancel" : "Edit" } level="default" onClick={toggleEditMode} />
                <Button text="Delete" level="danger" onClick={deleteFlight} />
                <Button text="Fly Again" onClick={() => {
                    const params = new URLSearchParams();
                    if (flight.origin.icao) params.set('origin', flight.origin.icao);
                    if (flight.destination.icao) params.set('destination', flight.destination.icao);
                    if (flight.airline?.icao) params.set('airline', flight.airline.icao);
                    if (flight.airplane) params.set('airplane', flight.airplane);
                    if (flight.seat) params.set('seat', flight.seat);
                    if (flight.aircraftSide) params.set('aircraftSide', flight.aircraftSide);
                    if (flight.ticketClass) params.set('ticketClass', flight.ticketClass);
                    if (flight.purpose) params.set('purpose', flight.purpose);
                    navigate(`/new?${params.toString()}`);
                }} />
                </>
            }
            </form>
        </>
    );
}
