import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Flight } from '../models';
import AirlineLogo from './AirlineLogo';
import ConfigStorage from '../storage/configStorage';

interface TripTimelineProps {
    flights: Flight[];
}

/** Format minutes as "Xh Ym" */
function formatDuration(minutes: number): string {
    if (!minutes || minutes <= 0) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

/**
 * Compute layover in minutes between consecutive flights.
 * Uses arrivalDate+arrivalTime of previous flight and date+departureTime of next flight.
 * Returns null if times are missing.
 */
function computeLayover(prev: Flight, next: Flight): number | null {
    const prevArrDate = prev.arrivalDate || prev.date;
    if (!prev.arrivalTime || !next.departureTime) return null;

    const arrStr = `${prevArrDate}T${prev.arrivalTime}:00`;
    const depStr = `${next.date}T${next.departureTime}:00`;

    const arrTime = new Date(arrStr).getTime();
    const depTime = new Date(depStr).getTime();

    if (isNaN(arrTime) || isNaN(depTime)) return null;

    const diff = Math.round((depTime - arrTime) / 60000);
    return diff >= 0 ? diff : null;
}

function LayoverIndicator({ minutes }: { minutes: number }) {
    return (
        <div className="relative flex items-center ml-[7px] py-1">
            {/* Vertical dashed connector */}
            <div className="absolute left-0 top-0 bottom-0 w-0 border-l-2 border-dashed border-gray-300 dark:border-gray-600"
                 style={{ marginLeft: '-1px' }} />
            <div className="ml-6 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs px-3 py-1.5 rounded-full">
                Layover: {formatDuration(minutes)}
            </div>
        </div>
    );
}

function LegCard({ flight, isFirst, isLast }: { flight: Flight; isFirst: boolean; isLast: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const navigate = useNavigate();
    const metricUnits = ConfigStorage.getSetting('metricUnits');

    const originCode = flight.origin.iata || flight.origin.icao;
    const destCode = flight.destination.iata || flight.destination.icao;

    return (
        <div className="relative flex gap-4">
            {/* Timeline dot and line */}
            <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-4 h-4 rounded-full bg-primary-500 border-2 border-white dark:border-gray-900 z-10" />
                {!isLast && (
                    <div className="w-0.5 flex-grow bg-primary-300 dark:bg-primary-700" />
                )}
            </div>

            {/* Card content */}
            <div className="pb-4 flex-grow min-w-0">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700
                                hover:shadow-md transition-shadow cursor-pointer"
                     onClick={() => setExpanded(!expanded)}>
                    {/* Header row: route + airline */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <p className="text-lg font-semibold dark:text-gray-100 truncate">
                                {originCode}
                                <span className="mx-2 text-primary-400">{'\u2192'}</span>
                                {destCode}
                            </p>
                            {flight.flightNumber && (
                                <span className="text-xs bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300 px-2 py-0.5 rounded-full flex-shrink-0">
                                    {flight.flightNumber}
                                </span>
                            )}
                        </div>
                        {flight.airline && (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                <AirlineLogo iata={flight.airline.iata} icao={flight.airline.icao} size={24} />
                                <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">{flight.airline.name}</span>
                            </div>
                        )}
                    </div>

                    {/* City names */}
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        {flight.origin.municipality} to {flight.destination.municipality}
                    </p>

                    {/* Quick details row */}
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-500">
                        {flight.departureTime && (
                            <span>Dep {flight.departureTime}</span>
                        )}
                        {flight.arrivalTime && (
                            <span>Arr {flight.arrivalTime}</span>
                        )}
                        {flight.duration ? (
                            <span>{formatDuration(flight.duration)}</span>
                        ) : null}
                        {flight.airplane && (
                            <span>{flight.airplane}</span>
                        )}
                        {flight.distance ? (
                            <span>{flight.distance.toLocaleString()} {metricUnits === 'false' ? 'mi' : 'km'}</span>
                        ) : null}
                    </div>

                    {/* Expandable details */}
                    {expanded && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            <p>Date: {flight.date}{flight.arrivalDate && flight.arrivalDate !== flight.date ? ` - ${flight.arrivalDate}` : ''}</p>
                            {flight.seat && <p>Seat: {flight.seat}{flight.seatNumber ? ` (${flight.seatNumber})` : ''}</p>}
                            {flight.ticketClass && <p>Class: <span className="capitalize">{flight.ticketClass}</span></p>}
                            {flight.tailNumber && <p>Tail: {flight.tailNumber}</p>}
                            {flight.notes && <p className="whitespace-pre-line">Notes: {flight.notes}</p>}
                            {flight.rating > 0 && (
                                <p>Rating: {'\u2605'.repeat(flight.rating)}{'\u2606'.repeat(5 - flight.rating)}</p>
                            )}
                            <button
                                className="mt-2 text-primary-500 hover:text-primary-400 text-xs underline"
                                onClick={(e) => { e.stopPropagation(); navigate(`/flights?id=${flight.id}`); }}>
                                View full details
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function TripTimeline({ flights }: TripTimelineProps) {
    if (!flights || flights.length === 0) return null;

    // Sort by date then departure time
    const sorted = [...flights].sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return (a.departureTime || '').localeCompare(b.departureTime || '');
    });

    // Build the full trip route as a summary header
    const airports: string[] = [sorted[0].origin.iata || sorted[0].origin.icao];
    for (const f of sorted) {
        airports.push(f.destination.iata || f.destination.icao);
    }

    const totalDuration = sorted.reduce((sum, f) => sum + (f.duration || 0), 0);

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 md:p-6 shadow-sm">
            {/* Trip summary header */}
            <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center flex-wrap gap-1 text-lg font-bold dark:text-gray-100">
                    {airports.map((code, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <span className="text-primary-400 mx-1">{'\u2192'}</span>}
                            <span>{code}</span>
                        </React.Fragment>
                    ))}
                </div>
                <div className="flex gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span>{sorted.length} leg{sorted.length !== 1 ? 's' : ''}</span>
                    <span>{sorted[0].date}{sorted.length > 1 && sorted[sorted.length - 1].date !== sorted[0].date ? ` - ${sorted[sorted.length - 1].date}` : ''}</span>
                    {totalDuration > 0 && <span>Total: {formatDuration(totalDuration)}</span>}
                </div>
            </div>

            {/* Timeline legs */}
            <div>
                {sorted.map((flight, i) => (
                    <React.Fragment key={flight.id}>
                        <LegCard
                            flight={flight}
                            isFirst={i === 0}
                            isLast={i === sorted.length - 1}
                        />
                        {/* Layover between legs */}
                        {i < sorted.length - 1 && (() => {
                            const layover = computeLayover(flight, sorted[i + 1]);
                            return layover !== null ? (
                                <LayoverIndicator minutes={layover} />
                            ) : null;
                        })()}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}
