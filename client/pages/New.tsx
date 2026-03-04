import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { Heading, Label, Button, Input, Select, TextArea } from '../components/Elements';
import SearchInput from '../components/SearchInput'
import API, { ENABLE_EXTERNAL_APIS } from '../api';
import { objectFromForm } from '../utils';
import { Airline, Airport, User } from '../models';
import ConfigStorage from '../storage/configStorage';
import FetchConnection from '../components/FetchConnection';

interface LegData {
    origin?: Airport;
    destination?: Airport;
    date: string;
    departureTime: string;
    arrivalTime: string;
    arrivalDate: string;
    airplane: string;
    tailNumber: string;
    airline?: Airline;
    flightNumber: string;
    seat: string;
    seatNumber: string;
    aircraftSide: string;
    ticketClass: string;
    purpose: string;
    notes: string;
    cost: string;
    currency: string;
    rating: string;
}

function defaultLeg(): LegData {
    return {
        date: (new Date()).toISOString().substring(0, 10),
        departureTime: '',
        arrivalTime: '',
        arrivalDate: '',
        airplane: '',
        tailNumber: '',
        flightNumber: '',
        seat: '',
        seatNumber: '',
        aircraftSide: '',
        ticketClass: '',
        purpose: '',
        notes: '',
        cost: '',
        currency: 'USD',
        rating: '',
    };
}

function TravelerFields({ username }: { username: string }) {
    return (
        <>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
            <div>
                <Label text="Seat Type" />
                <Select
                    name={`seat__${username}`}
                    options={[
                        { text: "Choose", value: "" },
                        { text: "Aisle", value: "aisle" },
                        { text: "Middle", value: "middle" },
                        { text: "Window", value: "window" }
                    ]}
                />
            </div>
            <div>
                <Label text="Seat #" />
                <Input type="text" name={`seatNumber__${username}`} placeholder="14A" maxLength={5} />
            </div>
            <div>
                <Label text="Aircraft Side" />
                <Select
                    name={`aircraftSide__${username}`}
                    options={[
                        { text: "Choose", value: "" },
                        { text: "Left", value: "left" },
                        { text: "Right", value: "right" },
                        { text: "Center", value: "center" }
                    ]}
                />
            </div>
            <div>
                <Label text="Class" />
                <Select
                    name={`ticketClass__${username}`}
                    options={[
                        { text: "Choose", value: "" },
                        { text: "Private", value: "private" },
                        { text: "First", value: "first" },
                        { text: "Business", value: "business" },
                        { text: "Economy+", value: "economy+" },
                        { text: "Economy", value: "economy" }
                    ]}
                />
            </div>
            <div>
                <Label text="Purpose" />
                <Select
                    name={`purpose__${username}`}
                    options={[
                        { text: "Choose", value: "" },
                        { text: "Leisure", value: "leisure" },
                        { text: "Business", value: "business" },
                        { text: "Crew", value: "crew" },
                        { text: "Other", value: "other" }
                    ]}
                />
            </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-2">
            <div>
                <Label text="Cost" />
                <Input type="number" name={`cost__${username}`} placeholder="0.00" />
            </div>
            <div>
                <Label text="Currency" />
                <Select name={`currency__${username}`}
                        options={[
                            { text: "USD", value: "USD" },
                            { text: "EUR", value: "EUR" },
                            { text: "GBP", value: "GBP" },
                            { text: "CAD", value: "CAD" },
                            { text: "AUD", value: "AUD" },
                            { text: "JPY", value: "JPY" },
                            { text: "CHF", value: "CHF" },
                            { text: "Other", value: "OTHER" },
                        ]} />
            </div>
        </div>
        <div className="mt-2">
            <Label text="Rating" />
            <StarRating name={`rating__${username}`} />
        </div>
        <div>
            <Label text="Notes"/>
            <TextArea
                name={`notes__${username}`}
                placeholder="Type here..."
                maxLength={150}
            />
        </div>
        </>
    );
}

function StarRating({ name, defaultValue = 0 }: { name: string; defaultValue?: number }) {
    const [rating, setRating] = useState(defaultValue);
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

export default function New() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [legs, setLegs] = useState<LegData[]>([defaultLeg()]);
    const [connection, setConnection] = useState<number>();

    // delegation (admin-only for now)
    const [currentUser, setCurrentUser] = useState<User | undefined>();
    const [allUsernames, setAllUsernames] = useState<string[] | undefined>();
    const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);

    const localAirportTime = ConfigStorage.getSetting("localAirportTime");

    useEffect(() => {
        API.get('/users/me').then((me: User) => {
            setCurrentUser(me);
            setSelectedUsernames([me.username]);
            if (me.isAdmin) {
                API.get('/users')
                .then((users: string[]) => {
                    users = users.filter(username => username !== me.username);
                    setAllUsernames(users);
                });
            }
        });

        // Pre-fill from "Fly Again" query params
        const prefillOrigin = searchParams.get('origin');
        const prefillDest = searchParams.get('destination');
        const prefillAirline = searchParams.get('airline');
        const prefillAirplane = searchParams.get('airplane');
        const prefillSeat = searchParams.get('seat');
        const prefillSide = searchParams.get('aircraftSide');
        const prefillClass = searchParams.get('ticketClass');
        const prefillPurpose = searchParams.get('purpose');

        const fetches: Promise<any>[] = [];

        if (prefillOrigin) {
            fetches.push(API.get(`/airports/${prefillOrigin}`).then(a => updateLeg(0, 'origin', a)));
        }
        if (prefillDest) {
            fetches.push(API.get(`/airports/${prefillDest}`).then(a => updateLeg(0, 'destination', a)));
        }
        if (prefillAirline) {
            fetches.push(API.get(`/airlines/${prefillAirline}`).then(a => updateLeg(0, 'airline', a)));
        }
        if (prefillAirplane) updateLeg(0, 'airplane', prefillAirplane);
        if (prefillSeat) updateLeg(0, 'seat', prefillSeat);
        if (prefillSide) updateLeg(0, 'aircraftSide', prefillSide);
        if (prefillClass) updateLeg(0, 'ticketClass', prefillClass);
        if (prefillPurpose) updateLeg(0, 'purpose', prefillPurpose);
    }, []);

    const updateLeg = (index: number, field: string, value: any) => {
        setLegs(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const addLeg = () => {
        const prevLeg = legs[legs.length - 1];
        setLegs([...legs, {
            origin: prevLeg.destination,
            destination: undefined,
            date: prevLeg.arrivalDate || prevLeg.date,
            departureTime: '',
            arrivalTime: '',
            arrivalDate: '',
            airplane: prevLeg.airplane,
            tailNumber: '',
            airline: prevLeg.airline,
            flightNumber: '',
            seat: prevLeg.seat,
            aircraftSide: prevLeg.aircraftSide,
            ticketClass: prevLeg.ticketClass,
            purpose: prevLeg.purpose,
            notes: '',
        }]);
    };

    const removeLeg = (index: number) => {
        setLegs(prev => prev.filter((_, i) => i !== index));
    };

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string>('');

    const postFlight = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        setSubmitError('');

        const rawFormData = objectFromForm(event);
        const isMultiLeg = legs.length > 1;

        const buildPayload = (leg: LegData, username: string) => {
            const flight: any = {
                username,
                origin: leg.origin?.icao,
                destination: leg.destination?.icao,
                date: leg.date,
            };

            if (leg.departureTime) flight.departureTime = leg.departureTime;
            if (leg.arrivalTime) flight.arrivalTime = leg.arrivalTime;
            if (leg.arrivalDate) flight.arrivalDate = leg.arrivalDate;
            if (leg.airline?.icao) flight.airline = leg.airline.icao;
            if (leg.airplane) flight.airplane = leg.airplane;
            if (leg.tailNumber) flight.tailNumber = leg.tailNumber;
            if (leg.flightNumber) flight.flightNumber = leg.flightNumber;

            if (leg.seatNumber) flight.seatNumber = leg.seatNumber;
            if (leg.cost) { flight.cost = parseFloat(leg.cost); flight.currency = leg.currency || 'USD'; }
            if (leg.rating) flight.rating = parseInt(leg.rating as any);

            if (isMultiLeg) {
                if (leg.seat) flight.seat = leg.seat;
                if (leg.aircraftSide) flight.aircraftSide = leg.aircraftSide;
                if (leg.ticketClass) flight.ticketClass = leg.ticketClass;
                if (leg.purpose) flight.purpose = leg.purpose;
                if (leg.notes) flight.notes = leg.notes;
            } else {
                if (rawFormData) {
                    for (const [key, value] of Object.entries(rawFormData)) {
                        const parts = key.split("__");
                        if (parts.length === 2 && parts[1] === username) {
                            flight[parts[0]] = value;
                        }
                    }
                }
            }

            return flight;
        };

        try {
            // Check for duplicates
            for (const leg of legs) {
                if (leg.origin?.icao && leg.destination?.icao && leg.date) {
                    const dup = await API.get('/flights/check-duplicate', {
                        date: leg.date, origin: leg.origin.icao, destination: leg.destination.icao
                    });
                    if (dup.duplicate) {
                        if (!confirm(`A flight from ${leg.origin.iata || leg.origin.icao} to ${leg.destination.iata || leg.destination.icao} on ${leg.date} already exists. Add anyway?`)) {
                            setSubmitting(false);
                            return;
                        }
                        break; // Only ask once
                    }
                }
            }

            if (legs.length === 1) {
                let payload = selectedUsernames.map(u => buildPayload(legs[0], u));
                if (connection) {
                    payload = payload.map(p => ({ ...p, connection }));
                }

                if (payload.length === 1) {
                    const flightID = await API.post(`/flights?timezones=${localAirportTime}`, payload[0]);
                    navigate(`/flights?id=${flightID}`);
                } else {
                    const creatorFlightID = await API.post(`/flights/many?timezones=${localAirportTime}`, payload);
                    navigate(`/flights?id=${creatorFlightID}`);
                }
            } else {
                let firstId: number | undefined;
                for (const username of selectedUsernames) {
                    const tripPayload = legs.map(leg => buildPayload(leg, username));
                    const id = await API.post(`/flights/trip?timezones=${localAirportTime}`, tripPayload);
                    if (username === currentUser?.username) firstId = id;
                }
                if (firstId) navigate(`/flights?id=${firstId}`);
            }
        } catch (err: any) {
            setSubmitError(err?.response?.data?.detail || 'Failed to submit flight. Please try again.');
            setSubmitting(false);
        }
    };

    const attemptFetchFlight = async () => {
        if (!ENABLE_EXTERNAL_APIS) {
            return;
        }

        const flightNumber = legs[0].flightNumber;
        API.getRemote(`https://api.adsbdb.com/v0/callsign/${flightNumber}`)
        .then(async (data: Object) => {
            const originICAO = data["response"]["flightroute"]["origin"]["icao_code"];
            const destinationICAO = data["response"]["flightroute"]["destination"]["icao_code"];
            const airlineICAO = data["response"]["flightroute"]["airline"]["icao"];

            const origin = await API.get(`/airports/${originICAO}`);
            const destination= await API.get(`/airports/${destinationICAO}`);
            const airlineData = await API.get(`/airlines/${airlineICAO}`)

            updateLeg(0, 'origin', {...origin});
            updateLeg(0, 'destination', {...destination});
            updateLeg(0, 'airline', { ...airlineData });
        });
    };

    const [collapsedLegs, setCollapsedLegs] = useState<Set<number>>(new Set());
    const toggleCollapse = (index: number) => {
        setCollapsedLegs(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const isMultiLeg = legs.length > 1;

    return (
        <>
            <Heading text="New Flight" />

            <form onSubmit={postFlight}>
                {isMultiLeg ? (
                    /* ===== MULTI-LEG LAYOUT ===== */
                    <div className="p-4 space-y-4">
                        {legs.map((leg, i) => (
                            <div key={i} className="container">
                                <div className="flex justify-between items-center mb-2 cursor-pointer select-none"
                                     onClick={() => toggleCollapse(i)}>
                                    <h3 className="font-bold text-lg">
                                        <span className="mr-2 text-gray-400">{collapsedLegs.has(i) ? '\u25B6' : '\u25BC'}</span>
                                        Leg {i + 1}
                                        {leg.origin && leg.destination && (
                                            <span className="ml-1 text-base">
                                                : {leg.origin.iata || leg.origin.icao} {'\u2192'} {leg.destination.iata || leg.destination.icao}
                                            </span>
                                        )}
                                        {collapsedLegs.has(i) && leg.date && (
                                            <span className="ml-2 text-sm font-normal text-gray-500">{leg.date}</span>
                                        )}
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        {i > 0 && (
                                            <button type="button"
                                                    className="text-red-500 hover:text-red-700 font-bold text-xl leading-none"
                                                    onClick={(e) => { e.stopPropagation(); removeLeg(i); }}>
                                                {'\u2715'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {!collapsedLegs.has(i) && <>
                                {/* Route */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <Label text="Origin" required />
                                        <SearchInput name={`origin_${i}`}
                                                     type="airports"
                                                     value={leg.origin}
                                                     onSelect={(airport: Airport) => updateLeg(i, 'origin', airport)} />
                                    </div>
                                    <div>
                                        <Label text="Destination" required />
                                        <SearchInput name={`destination_${i}`}
                                                     type="airports"
                                                     value={leg.destination}
                                                     onSelect={(airport: Airport) => updateLeg(i, 'destination', airport)} />
                                    </div>
                                </div>

                                {/* Date & Times */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                                    <div>
                                        <Label text="Date" required />
                                        <Input type="date" name={`date_${i}`}
                                               defaultValue={leg.date}
                                               onChange={(e) => updateLeg(i, 'date', e.target.value)}
                                               required />
                                    </div>
                                    <div>
                                        <Label text="Departure" />
                                        <Input type="time" name={`dep_${i}`}
                                               onChange={(e) => updateLeg(i, 'departureTime', e.target.value)} />
                                    </div>
                                    <div>
                                        <Label text="Arrival" />
                                        <Input type="time" name={`arr_${i}`}
                                               onChange={(e) => updateLeg(i, 'arrivalTime', e.target.value)} />
                                    </div>
                                    <div>
                                        <Label text="Arrival Date" />
                                        <Input type="date" name={`arrDate_${i}`}
                                               onChange={(e) => updateLeg(i, 'arrivalDate', e.target.value)} />
                                    </div>
                                </div>

                                {/* Aircraft & Flight */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                                    <div>
                                        <Label text="Airplane" />
                                        <Input type="text" name={`airplane_${i}`} placeholder="B738" maxLength={16}
                                               defaultValue={leg.airplane}
                                               onChange={(e) => updateLeg(i, 'airplane', e.target.value)} />
                                    </div>
                                    <div>
                                        <Label text="Tail Number" />
                                        <Input type="text" name={`tailNumber_${i}`} placeholder="EI-DCL" maxLength={16}
                                               defaultValue={leg.tailNumber}
                                               onChange={(e) => updateLeg(i, 'tailNumber', e.target.value)} />
                                    </div>
                                    <div>
                                        <Label text="Airline" />
                                        <SearchInput name={`airline_${i}`}
                                                     type="airlines"
                                                     value={leg.airline}
                                                     onSelect={(a: Airline) => updateLeg(i, 'airline', a)} />
                                    </div>
                                    <div>
                                        <Label text="Flight Number" />
                                        <Input type="text" name={`flightNumber_${i}`} placeholder="FR2460" maxLength={7}
                                               defaultValue={leg.flightNumber}
                                               onChange={(e) => updateLeg(i, 'flightNumber', e.target.value)} />
                                    </div>
                                </div>

                                {/* Traveler Details */}
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
                                    <div>
                                        <Label text="Seat Type" />
                                        <Select
                                            name={`seat_${i}`}
                                            defaultValue={leg.seat}
                                            onChange={(e) => updateLeg(i, 'seat', e.target.value)}
                                            options={[
                                                { text: "Choose", value: "" },
                                                { text: "Aisle", value: "aisle" },
                                                { text: "Middle", value: "middle" },
                                                { text: "Window", value: "window" }
                                            ]}
                                        />
                                    </div>
                                    <div>
                                        <Label text="Seat #" />
                                        <Input type="text" name={`seatNumber_${i}`} placeholder="14A" maxLength={5}
                                               defaultValue={leg.seatNumber}
                                               onChange={(e) => updateLeg(i, 'seatNumber', e.target.value)} />
                                    </div>
                                    <div>
                                        <Label text="Aircraft Side" />
                                        <Select
                                            name={`side_${i}`}
                                            defaultValue={leg.aircraftSide}
                                            onChange={(e) => updateLeg(i, 'aircraftSide', e.target.value)}
                                            options={[
                                                { text: "Choose", value: "" },
                                                { text: "Left", value: "left" },
                                                { text: "Right", value: "right" },
                                                { text: "Center", value: "center" }
                                            ]}
                                        />
                                    </div>
                                    <div>
                                        <Label text="Class" />
                                        <Select
                                            name={`class_${i}`}
                                            defaultValue={leg.ticketClass}
                                            onChange={(e) => updateLeg(i, 'ticketClass', e.target.value)}
                                            options={[
                                                { text: "Choose", value: "" },
                                                { text: "Private", value: "private" },
                                                { text: "First", value: "first" },
                                                { text: "Business", value: "business" },
                                                { text: "Economy+", value: "economy+" },
                                                { text: "Economy", value: "economy" }
                                            ]}
                                        />
                                    </div>
                                    <div>
                                        <Label text="Purpose" />
                                        <Select
                                            name={`purpose_${i}`}
                                            defaultValue={leg.purpose}
                                            onChange={(e) => updateLeg(i, 'purpose', e.target.value)}
                                            options={[
                                                { text: "Choose", value: "" },
                                                { text: "Leisure", value: "leisure" },
                                                { text: "Business", value: "business" },
                                                { text: "Crew", value: "crew" },
                                                { text: "Other", value: "other" }
                                            ]}
                                        />
                                    </div>
                                </div>

                                {/* Cost */}
                                <div className="grid grid-cols-2 gap-3 mt-2">
                                    <div>
                                        <Label text="Cost" />
                                        <Input type="number" name={`cost_${i}`}
                                               placeholder="0.00"
                                               defaultValue={leg.cost}
                                               onChange={(e) => updateLeg(i, 'cost', e.target.value)} />
                                    </div>
                                    <div>
                                        <Label text="Currency" />
                                        <Select name={`currency_${i}`}
                                                defaultValue={leg.currency}
                                                onChange={(e) => updateLeg(i, 'currency', e.target.value)}
                                                options={[
                                                    { text: "USD", value: "USD" },
                                                    { text: "EUR", value: "EUR" },
                                                    { text: "GBP", value: "GBP" },
                                                    { text: "CAD", value: "CAD" },
                                                    { text: "AUD", value: "AUD" },
                                                    { text: "JPY", value: "JPY" },
                                                    { text: "CHF", value: "CHF" },
                                                    { text: "Other", value: "OTHER" },
                                                ]} />
                                    </div>
                                </div>

                                <div>
                                    <Label text="Notes" />
                                    <TextArea
                                        name={`notes_${i}`}
                                        defaultValue={leg.notes}
                                        placeholder="Type here..."
                                        maxLength={150}
                                        onChange={(e) => updateLeg(i, 'notes', e.target.value)}
                                    />
                                </div>
                                </>}
                            </div>
                        ))}
                    </div>
                ) : (
                    /* ===== SINGLE-LEG LAYOUT (original) ===== */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                        <div className="container">
                            <Label text="Origin" required />
                            <SearchInput name="origin_0"
                                         type="airports"
                                         value={legs[0].origin}
                                         onSelect={(airport: Airport) => updateLeg(0, 'origin', airport)} />
                            <br />
                            <Label text="Destination" required />
                            <SearchInput name="destination_0"
                                         type="airports"
                                         value={legs[0].destination}
                                         onSelect={(airport: Airport) => updateLeg(0, 'destination', airport)} />
                            <br />
                            <Label text="Date" required />
                            <Input
                                type="date"
                                name="date_0"
                                defaultValue={legs[0].date}
                                onChange={(e) => updateLeg(0, 'date', e.target.value)}
                                required
                            />
                            <br />
                            <Label text="Departure Time" />
                            <Input
                                type="time"
                                name="departureTime_0"
                                onChange={(e) => updateLeg(0, 'departureTime', e.target.value)}
                            />
                            <br />
                            <Label text="Arrival Time" />
                            <Input
                                type="time"
                                name="arrivalTime_0"
                                onChange={(e) => updateLeg(0, 'arrivalTime', e.target.value)}
                            />
                            <br />
                            <Label text="Arrival Date" />
                            <Input
                                type="date"
                                name="arrivalDate_0"
                                onChange={(e) => updateLeg(0, 'arrivalDate', e.target.value)}
                            />
                        </div>

                        <div className="container">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <Label text="Airplane" />
                                    <Input type="text" name="airplane" placeholder="B738" maxLength={16}
                                           onChange={(e) => updateLeg(0, 'airplane', e.target.value)} />
                                </div>
                                <div>
                                    <Label text="Tail Number" />
                                    <Input type="text" name="tailNumber" placeholder="EI-DCL" maxLength={16}
                                           onChange={(e) => updateLeg(0, 'tailNumber', e.target.value)} />
                                </div>
                            </div>

                            <br />
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                                <div>
                                    <Label text="Airline" />
                                    <SearchInput name="airline"
                                                 type="airlines"
                                                 value={legs[0].airline}
                                                 onSelect={(airline: Airline) => updateLeg(0, 'airline', airline)} />
                                </div>
                                <div className="whitespace-nowrap">
                                    <Label text="Flight Number" />
                                    <Input
                                        type="text"
                                        name="flightNumber"
                                        placeholder="FR2460"
                                        maxLength={7}
                                        onChange={(e) => updateLeg(0, 'flightNumber', e.target.value)}
                                    />
                                </div>
                                { ENABLE_EXTERNAL_APIS &&
                                    <div className="h-10 flex items-center">
                                        <Button text="Fetch" onClick={attemptFetchFlight} disabled={!legs[0].flightNumber} />
                                    </div>
                                }
                            </div>
                            <div>
                                <Label text="Connection" />
                                <FetchConnection name="connection"
                                                 date={legs[0].date}
                                                 origin={legs[0].origin?.icao}
                                                 destination={legs[0].destination?.icao}
                                                 value={connection}
                                                 onFetched={(c: number) => setConnection(c)} />
                            </div>
                        </div>
                    </div>
                )}

                <div className="px-4 pb-2">
                    <Button text="+ Add Leg" onClick={addLeg} />
                </div>

                {isMultiLeg && (
                    <div className="px-4 pb-2">
                        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 flex flex-wrap gap-4 text-sm">
                            <span className="font-medium">{legs.length} legs</span>
                            {legs[0].origin && legs[legs.length - 1].destination && (
                                <span className="text-gray-600 dark:text-gray-400">
                                    {legs[0].origin.iata || legs[0].origin.icao}
                                    {' \u2192 '}
                                    {legs.slice(1, -1).map(l => l.origin?.iata || l.origin?.icao || '?').join(' \u2192 ')}
                                    {legs.length > 2 ? ' \u2192 ' : ''}
                                    {legs[legs.length - 1].destination.iata || legs[legs.length - 1].destination.icao}
                                </span>
                            )}
                            {legs[0].date && legs[legs.length - 1].date && legs[0].date !== legs[legs.length - 1].date && (
                                <span className="text-gray-500 dark:text-gray-400">
                                    {legs[0].date} to {legs[legs.length - 1].date}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Per-user traveler fields (single-leg only) */}
                {!isMultiLeg && currentUser?.isAdmin && allUsernames && (
                    <div className="px-4 pb-2">
                        <Label text="Add flight for users" />
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                            {allUsernames.map((username) => (
                                <label key={username} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedUsernames.includes(username)}
                                        onChange={() => setSelectedUsernames((prev) => {
                                            if (prev.includes(username)) return prev.filter(u => u !== username);
                                            return [...prev, username];
                                        })}
                                    />
                                    <span>{username}</span>
                                </label>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
                            {selectedUsernames.map((selectedUsername) => (
                                <div key={selectedUsername} className="container">
                                    <div className="font-medium mb-2">Traveler: {selectedUsername}</div>
                                    <TravelerFields username={selectedUsername} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!isMultiLeg && !currentUser?.isAdmin && currentUser && (
                    <div className="px-4 pb-2">
                        <div className="container">
                            <TravelerFields username={currentUser.username} />
                        </div>
                    </div>
                )}

                {/* Multi-leg: user delegation checkboxes only */}
                {isMultiLeg && currentUser?.isAdmin && allUsernames && (
                    <div className="px-4 pb-2">
                        <Label text="Add trip for users" />
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                            {allUsernames.map((username) => (
                                <label key={username} className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={selectedUsernames.includes(username)}
                                        onChange={() => setSelectedUsernames((prev) => {
                                            if (prev.includes(username)) return prev.filter(u => u !== username);
                                            return [...prev, username];
                                        })}
                                    />
                                    <span>{username}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                <div className="px-4 pb-4">
                    {submitError && (
                        <p className="text-red-500 mb-2">{submitError}</p>
                    )}
                    <Button
                        text={submitting ? "Submitting..." : (isMultiLeg ? "Submit Trip" : "Done")}
                        submit
                        disabled={submitting}
                    />
                </div>
            </form>
        </>
    );
}
