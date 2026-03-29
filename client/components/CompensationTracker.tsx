import React, { useState, useEffect } from 'react';
import { Spinner, Whisper } from './Elements';
import API from '../api';

interface EligibleFlight {
    flightId: number;
    date: string;
    origin: string;
    destination: string;
    originCity: string;
    destinationCity: string;
    originCountry: string;
    destinationCountry: string;
    flightNumber: string | null;
    airline: string | null;
    distance: number;
    compensationEur: number;
    originInEu: boolean;
    destinationInEu: boolean;
    claimDeadline: string;
    daysUntilDeadline: number;
}

interface CompensationData {
    eligibleFlights: EligibleFlight[];
    totalPotentialCompensation: number;
    note: string;
}

function urgencyColor(days: number): string {
    if (days <= 90) return 'text-red-600 dark:text-red-400';
    if (days <= 180) return 'text-amber-600 dark:text-amber-400';
    return 'text-green-600 dark:text-green-400';
}

function urgencyBg(days: number): string {
    if (days <= 90) return 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800';
    if (days <= 180) return 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800';
    return 'bg-white border-gray-200 dark:bg-gray-800 dark:border-gray-700';
}

function tierBadgeColor(tier: number): string {
    if (tier === 600) return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300';
    if (tier === 400) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

function formatDeadline(days: number): string {
    if (days <= 0) return 'Expired';
    if (days === 1) return '1 day left';
    if (days < 30) return `${days} days left`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months > 1 ? 's' : ''} left`;
    const years = (days / 365).toFixed(1);
    return `${years} years left`;
}

function AirHelpLink({ flight }: { flight: EligibleFlight }) {
    const url = `https://www.airhelp.com/en/`;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 underline"
        >
            Check with AirHelp
        </a>
    );
}

function FlightrightLink({ flight }: { flight: EligibleFlight }) {
    const url = `https://www.flightright.com/`;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 underline"
        >
            Check with Flightright
        </a>
    );
}

function InfoTooltip() {
    const [show, setShow] = useState(false);

    return (
        <span className="relative inline-block">
            <button
                className="ml-1 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs font-bold hover:bg-gray-300 dark:hover:bg-gray-500 cursor-pointer"
                onClick={() => setShow(!show)}
                onBlur={() => setShow(false)}
                type="button"
            >
                ?
            </button>
            {show && (
                <div className="absolute z-50 left-6 top-0 w-72 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg text-sm text-gray-700 dark:text-gray-300">
                    <p className="font-semibold mb-1">EU261/2004 Regulation</p>
                    <p className="mb-1">
                        Passengers on flights departing from EU airports, or arriving at EU airports on EU carriers,
                        are entitled to compensation for delays of 3+ hours, cancellations, or denied boarding.
                    </p>
                    <p>
                        <strong>Exclusions:</strong> Weather, strikes, air traffic control restrictions, security threats,
                        and other extraordinary circumstances.
                    </p>
                </div>
            )}
        </span>
    );
}

export default function CompensationTracker() {
    const [data, setData] = useState<CompensationData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        API.get('/compensation/eligible')
            .then((result: CompensationData) => {
                setData(result);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, []);

    if (loading) return <Spinner />;

    if (!data || data.eligibleFlights.length === 0) {
        return (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="text-lg mb-2">No eligible flights found</p>
                <p className="text-sm">
                    EU261 compensation applies to flights departing from or arriving at EU/EEA airports
                    that were delayed 3+ hours, cancelled, or where boarding was denied.
                </p>
            </div>
        );
    }

    const expiring = data.eligibleFlights.filter(f => f.daysUntilDeadline <= 90 && f.daysUntilDeadline > 0);

    // Group by tier
    const tier600 = data.eligibleFlights.filter(f => f.compensationEur === 600);
    const tier400 = data.eligibleFlights.filter(f => f.compensationEur === 400);
    const tier250 = data.eligibleFlights.filter(f => f.compensationEur === 250);

    const tiers = [
        { amount: 600, label: 'Long-haul (>3,500 km)', flights: tier600 },
        { amount: 400, label: 'Medium-haul (1,501-3,500 km)', flights: tier400 },
        { amount: 250, label: 'Short-haul (<=1,500 km)', flights: tier250 },
    ].filter(t => t.flights.length > 0);

    return (
        <div className="space-y-6">
            {/* Summary card */}
            <div className="bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-700 dark:to-primary-800 rounded-xl p-6 text-white shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <p className="text-3xl font-bold">
                            {'\u20AC'}{data.totalPotentialCompensation.toLocaleString()}
                        </p>
                        <p className="text-primary-100 text-sm mt-1">
                            potential compensation across {data.eligibleFlights.length} flight{data.eligibleFlights.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <InfoTooltip />
                </div>
            </div>

            {/* Expiring warning */}
            {expiring.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                            {'\u26A0'} {expiring.length} claim{expiring.length !== 1 ? 's' : ''} expiring within 90 days
                        </span>
                    </div>
                    <p className="text-sm text-red-600/80 dark:text-red-400/80 mt-1">
                        Act soon to avoid losing your right to compensation.
                    </p>
                </div>
            )}

            {/* Disclaimer */}
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    {data.note}
                </p>
            </div>

            {/* Grouped by tier */}
            {tiers.map(tier => (
                <div key={tier.amount}>
                    <div className="flex items-center gap-2 mb-3">
                        <span className={`inline-block text-sm font-semibold px-3 py-1 rounded-full ${tierBadgeColor(tier.amount)}`}>
                            {'\u20AC'}{tier.amount}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            {tier.label} &mdash; {tier.flights.length} flight{tier.flights.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    <div className="space-y-2">
                        {tier.flights.map(flight => (
                            <div
                                key={flight.flightId}
                                className={`rounded-lg border p-4 transition-shadow hover:shadow-md ${urgencyBg(flight.daysUntilDeadline)}`}
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold dark:text-gray-100">
                                                {flight.origin} {'\u2192'} {flight.destination}
                                            </span>
                                            {flight.flightNumber && (
                                                <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                                                    {flight.flightNumber}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                            {flight.originCity || flight.originCountry}
                                            {' to '}
                                            {flight.destinationCity || flight.destinationCountry}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                                            <span>{flight.date}</span>
                                            {flight.airline && <span>{flight.airline}</span>}
                                            {flight.distance > 0 && <span>{flight.distance.toLocaleString()} km</span>}
                                            <span className="flex items-center gap-0.5">
                                                {flight.originInEu ? 'EU' : ''}{flight.originInEu && flight.destinationInEu ? '/' : ''}{flight.destinationInEu ? 'EU' : ''}
                                                {!flight.originInEu && !flight.destinationInEu ? '' : ' route'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <span className="font-bold text-lg dark:text-gray-100">
                                            {'\u20AC'}{flight.compensationEur}
                                        </span>
                                        <span className={`text-xs font-medium ${urgencyColor(flight.daysUntilDeadline)}`}>
                                            {formatDeadline(flight.daysUntilDeadline)}
                                        </span>
                                        <Whisper text={`Deadline: ${flight.claimDeadline}`} />
                                        <div className="flex gap-2 mt-1">
                                            <AirHelpLink flight={flight} />
                                            <FlightrightLink flight={flight} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
