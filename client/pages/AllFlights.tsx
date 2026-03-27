import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';

import { Heading, Label, Input, Select, Dialog, Whisper, Button, Spinner } from '../components/Elements';
import UserSelect from '../components/UserSelect';
import SingleFlight from '../components/SingleFlight';
import { Flight } from '../models'

import API from '../api'
import { objectFromForm } from '../utils';
import ConfigStorage from '../storage/configStorage';

interface FlightsFilters {
    limit?: number;
    offset?: number;
    order?: "DESC"|"ASC";
    sort?: "date"|"seat"|"aircraft_side"|"ticket_class"|"duration"|"distance";
    start?: string;
    end?: string;
    username?: string;
}
export default function AllFlights() {
    const [searchParams, setSearchParams] = useSearchParams()
    const [filters, setFilters] = useState<FlightsFilters>(() => {
        try {
            const saved = localStorage.getItem('flightFilters');
            return saved ? JSON.parse(saved) : {};
        } catch { return {}; }
    })

    const flightID = searchParams.get("id");

    const saveFilters = (event) => {
        event.preventDefault();

        const filters = objectFromForm(event);

        if (filters === null) {
            return;
        }

        setFilters(filters);
        localStorage.setItem('flightFilters', JSON.stringify(filters));
    }

    if(flightID) {
        return (
            <SingleFlight flightID={flightID} />
        );
    }
    else {
        return (
            <>
                <Heading text="All Flights" />
                <Dialog title="Filters"
                        onSubmit={saveFilters}
                        formBody={(
                        <>
                            <Label text="Limit" />
                            <Input type="number" name="limit" />
                            <br />
                            <Label text="Offset" />
                            <Input type="number" name="offset" />
                            <br />
                            <Label text="Order" />
                            <Select name="order"
                                    options={[
                                { text: "Any", value: "" },
                                { text: "Descending", value: "DESC" },
                                { text: "Ascending", value: "ASC" }
                            ]}/>
                            <br />
                            <Label text="Sort By" />
                            <Select name="sort"
                                    options={[
                                { text: "Any", value: "" },
                                { text: "Date", value: "date" },
                                { text: "Seat", value: "seat" },
                                { text: "Aircraft Side", value: "aircraft_side" },
                                { text: "Ticket Class", value: "ticket_class" },
                                { text: "Duration", value: "duration" },
                                { text: "Distance", value: "distance" }
                            ]}/>
                            <br />
                            <Label text="Start Date" />
                            <Input type="date" name="start" />
                            <br />
                            <Label text="End Date" />
                            <Input type="date" name="end" />
                            <br />
                            <Label text="User"/>
                            <UserSelect />
                        </>
                        )}/>

                <FlightsView filters={filters} />
            </>
        );
    }
}

function FlightsView({ filters }: { filters: FlightsFilters }) {
    const [view, setView] = useState<'table' | 'timeline'>('table');

    return (
        <>
            <div className="flex gap-2 mb-3">
                <Button text="Table" level={view === 'table' ? 'primary' : 'default'} onClick={() => setView('table')} />
                <Button text="Timeline" level={view === 'timeline' ? 'primary' : 'default'} onClick={() => setView('timeline')} />
            </div>
            {view === 'table' ? (
                <FlightsTable filters={filters} />
            ) : (
                <FlightsTimeline filters={filters} />
            )}
        </>
    );
}

function TableCell({ text, className = '' }: { text: string; className?: string }) {
    return (
        <td className={`px-2 py-1 whitespace-nowrap border border-gray-300 dark:border-gray-600 ${className}`}>
            {text}
        </td>
    );
}

function TableHeading({ text, sortKey, currentSort, currentOrder, onSort, className = '' }: {
    text: string;
    sortKey?: string;
    currentSort?: string;
    currentOrder?: string;
    onSort?: (key: string) => void;
    className?: string;
}) {
    const isActive = sortKey && currentSort === sortKey;
    const arrow = isActive ? (currentOrder === 'ASC' ? ' \u25B2' : ' \u25BC') : '';
    return (
        <th className={`px-2 whitespace-nowrap border border-gray-300 bg-primary-300 font-semibold dark:border-gray-600 dark:bg-primary-700 dark:text-gray-100
                        ${sortKey ? 'cursor-pointer hover:bg-primary-400 dark:hover:bg-primary-600 select-none' : ''} ${className}`}
            onClick={sortKey && onSort ? () => onSort(sortKey) : undefined}>
            {text}{arrow}
        </th>
    );
}

const PAGE_SIZE = 25;

function FlightsTable({ filters }: { filters: FlightsFilters }) {
    const [flights, setFlights] = useState<Flight[]>();
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [page, setPage] = useState(0);
    const [sortCol, setSortCol] = useState(filters.sort || 'date');
    const [sortOrder, setSortOrder] = useState(filters.order || 'DESC');
    const [showBulkEdit, setShowBulkEdit] = useState(false);
    const navigate = useNavigate();
    const metricUnits = ConfigStorage.getSetting("metricUnits");

    const handleSort = (key: string) => {
        if (sortCol === key) {
            setSortOrder(prev => prev === 'DESC' ? 'ASC' : 'DESC');
        } else {
            setSortCol(key);
            setSortOrder('DESC');
        }
        setPage(0);
    };

    useEffect(() => {
        const paginatedFilters = {
            ...filters,
            sort: sortCol,
            order: sortOrder,
            limit: PAGE_SIZE + 1,
            offset: page * PAGE_SIZE,
        };
        API.get(`/flights?metric=${metricUnits}`, paginatedFilters)
        .then((data: Flight[]) => {
            setFlights(data);
            setSelected(new Set());
        });
    }, [filters, page, sortCol, sortOrder]);

    if(flights === undefined) {
        return <Spinner />;
    }
    else if (flights.length === 0) {
        return (
            <p className="m-4">No flights!</p>
        );
    }

    const viewFlight = (flightID: number) => {
        navigate(`/flights?id=${flightID}`);
    }

    const toggleSelect = (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        const display = flights.length > PAGE_SIZE ? flights.slice(0, PAGE_SIZE) : flights;
        if (selected.size === display.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(display.map(f => f.id)));
        }
    };

    const bulkDelete = () => {
        if (selected.size === 0) return;
        if (!confirm(`Delete ${selected.size} flight(s)?`)) return;
        API.post('/flights/bulk-delete', Array.from(selected))
        .then(() => {
            setFlights(prev => prev?.filter(f => !selected.has(f.id)));
            setSelected(new Set());
        });
    };

    const bulkEdit = (e: React.FormEvent) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const data = new FormData(form);
        const payload: any = { ids: Array.from(selected) };
        for (const [key, val] of data.entries()) {
            if (val) payload[key] = val;
        }
        if (Object.keys(payload).length <= 1) return; // only ids, no edits
        API.post('/flights/bulk-edit', payload)
        .then(() => {
            setShowBulkEdit(false);
            setSelected(new Set());
            // Re-fetch to show updated data
            const paginatedFilters = {
                ...filters,
                sort: sortCol,
                order: sortOrder,
                limit: PAGE_SIZE + 1,
                offset: page * PAGE_SIZE,
            };
            API.get(`/flights?metric=${metricUnits}`, paginatedFilters)
            .then((data: Flight[]) => setFlights(data));
        });
    };

    const hasNextPage = flights.length > PAGE_SIZE;
    const displayFlights = hasNextPage ? flights.slice(0, PAGE_SIZE) : flights;

    return (
    <>
        {selected.size > 0 && (
            <div className="mb-2 flex gap-2 items-center flex-wrap">
                <Button text={`Edit ${selected.size} selected`} level="primary" onClick={() => setShowBulkEdit(true)} />
                <Button text={`Delete ${selected.size} selected`} level="danger" onClick={bulkDelete} />
            </div>
        )}
        {showBulkEdit && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBulkEdit(false)}>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
                    <h3 className="text-lg font-semibold mb-4 dark:text-gray-100">Edit {selected.size} flight(s)</h3>
                    <form onSubmit={bulkEdit} className="space-y-3">
                        <div>
                            <Label text="Class" />
                            <Select name="ticket_class" options={[
                                { text: "No change", value: "" },
                                { text: "Private", value: "private" },
                                { text: "First", value: "first" },
                                { text: "Business", value: "business" },
                                { text: "Economy+", value: "economy+" },
                                { text: "Economy", value: "economy" }
                            ]} />
                        </div>
                        <div>
                            <Label text="Purpose" />
                            <Select name="purpose" options={[
                                { text: "No change", value: "" },
                                { text: "Leisure", value: "leisure" },
                                { text: "Business", value: "business" },
                                { text: "Crew", value: "crew" },
                                { text: "Other", value: "other" }
                            ]} />
                        </div>
                        <div>
                            <Label text="Seat" />
                            <Select name="seat" options={[
                                { text: "No change", value: "" },
                                { text: "Aisle", value: "aisle" },
                                { text: "Middle", value: "middle" },
                                { text: "Window", value: "window" }
                            ]} />
                        </div>
                        <div>
                            <Label text="Aircraft Side" />
                            <Select name="aircraft_side" options={[
                                { text: "No change", value: "" },
                                { text: "Left", value: "left" },
                                { text: "Right", value: "right" },
                                { text: "Center", value: "center" }
                            ]} />
                        </div>
                        <div>
                            <Label text="Airline (ICAO code)" />
                            <Input type="text" name="airline" placeholder="e.g. DAL, UAL, AAL" />
                        </div>
                        <div className="flex gap-2 pt-2">
                            <Button text="Apply" level="primary" submit={true} />
                            <Button text="Cancel" onClick={() => setShowBulkEdit(false)} />
                        </div>
                    </form>
                </div>
            </div>
        )}
        <div className="overflow-x-auto">
        <table className="table-auto w-full">
            <tr>
                <th className="px-2 whitespace-nowrap border border-gray-300 bg-primary-300 dark:border-gray-600 dark:bg-primary-700">
                    <input type="checkbox"
                           checked={selected.size === displayFlights.length && displayFlights.length > 0}
                           onChange={toggleSelectAll} />
                </th>
                <TableHeading text="Date" sortKey="date" currentSort={sortCol} currentOrder={sortOrder} onSort={handleSort} />
                <TableHeading text="Origin"/>
                <TableHeading text="Destination"/>
                <TableHeading text="Departure" className="hidden md:table-cell"/>
                <TableHeading text="Arrival" className="hidden md:table-cell"/>
                <TableHeading text="Duration" sortKey="duration" currentSort={sortCol} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell" />
                <TableHeading text="Distance" sortKey="distance" currentSort={sortCol} currentOrder={sortOrder} onSort={handleSort} className="hidden lg:table-cell" />
                <TableHeading text="Seat" sortKey="seat" currentSort={sortCol} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                <TableHeading text="Class" sortKey="ticket_class" currentSort={sortCol} currentOrder={sortOrder} onSort={handleSort} className="hidden md:table-cell" />
                <TableHeading text="Airplane" className="hidden lg:table-cell"/>
                <TableHeading text="Airline"/>
                <TableHeading text=""/>
            </tr>
            { displayFlights.map((flight: Flight) => (
            <tr className={`cursor-pointer even:bg-gray-100 hover:bg-gray-200 dark:even:bg-gray-800 dark:hover:bg-gray-700 duration-75
                            ${selected.has(flight.id) ? 'bg-red-50 dark:bg-red-900/20' : ''}`}
                key={flight.id}
                onClick={() => viewFlight(flight.id)}>
                <td className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600"
                    onClick={(e) => toggleSelect(flight.id, e)}>
                    <input type="checkbox" checked={selected.has(flight.id)} readOnly />
                </td>
                <TableCell text={flight.date}/>
                <TableCell text={flight.origin.municipality + ' (' + (flight.origin.iata || flight.origin.icao) + ')'}/>
                <TableCell text={flight.destination.municipality + ' (' + (flight.destination.iata || flight.destination.icao) + ')'} />
                <TableCell text={flight.departureTime || ""} className="hidden md:table-cell"/>
                <TableCell text={flight.arrivalTime || ""} className="hidden md:table-cell"/>
                <TableCell text={flight.duration ? flight.duration + " min" : ""} className="hidden lg:table-cell"/>
                <TableCell text={flight.distance ? flight.distance.toLocaleString() + (metricUnits === "false" ? " mi" : " km") : ""} className="hidden lg:table-cell"/>
                <TableCell text={flight.seat || ""} className="hidden md:table-cell"/>
                <TableCell text={flight.ticketClass || ""} className="hidden md:table-cell"/>
                <TableCell text={flight.airplane || ""} className="hidden lg:table-cell"/>
                <TableCell text={flight.airline?.name || ""}/>
                <td className="px-2 py-1 text-center border border-gray-300 dark:border-gray-600">
                    {flight.connection ? <span title="Connected flight">{'\u{1F517}'}</span> : ''}
                </td>
            </tr>
            ))}
        </table>
        </div>

        <div className="flex items-center justify-between mt-2">
            <Whisper text={`Page ${page + 1}`} />
            <div className="flex gap-1">
                <Button text="Previous" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} />
                <Button text="Next" onClick={() => setPage(p => p + 1)} disabled={!hasNextPage} />
            </div>
        </div>
    </>
    );
}

function FlightsTimeline({ filters }: { filters: FlightsFilters }) {
    const [flights, setFlights] = useState<Flight[]>();
    const navigate = useNavigate();
    const metricUnits = ConfigStorage.getSetting("metricUnits");

    useEffect(() => {
        API.get(`/flights?metric=${metricUnits}`, { ...filters, order: 'DESC' })
        .then((data: Flight[]) => setFlights(data));
    }, [filters]);

    if (flights === undefined) return <Spinner />;
    if (flights.length === 0) return <p className="m-4">No flights!</p>;

    // Group by month
    const grouped: { [month: string]: Flight[] } = {};
    for (const f of flights) {
        const month = f.date.substring(0, 7); // YYYY-MM
        if (!grouped[month]) grouped[month] = [];
        grouped[month].push(f);
    }

    const formatMonth = (ym: string) => {
        const [y, m] = ym.split('-');
        const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${names[parseInt(m) - 1]} ${y}`;
    };

    return (
        <div className="max-w-2xl mx-auto">
            {Object.entries(grouped).map(([month, monthFlights]) => (
                <div key={month} className="mb-6">
                    <h3 className="text-lg font-bold text-primary-500 mb-3 sticky top-0 bg-white dark:bg-gray-900 py-1 z-10">
                        {formatMonth(month)}
                    </h3>
                    <div className="relative border-l-2 border-primary-300 dark:border-primary-700 ml-3 pl-6 space-y-4">
                        {monthFlights.map(flight => (
                            <div key={flight.id}
                                 className="relative cursor-pointer group"
                                 onClick={() => navigate(`/flights?id=${flight.id}`)}>
                                {/* dot on the line */}
                                <div className="absolute -left-[31px] top-2 w-4 h-4 rounded-full bg-primary-400 border-2 border-white dark:border-gray-900 group-hover:bg-primary-600" />
                                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 shadow-sm group-hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm text-gray-500 dark:text-gray-400">{flight.date}</span>
                                        {flight.airline?.name && (
                                            <span className="text-xs text-gray-400 dark:text-gray-500">{flight.airline.name}</span>
                                        )}
                                    </div>
                                    <div className="text-lg font-semibold dark:text-gray-100">
                                        {flight.origin.iata || flight.origin.icao}
                                        <span className="mx-2 text-primary-400">{'\u2192'}</span>
                                        {flight.destination.iata || flight.destination.icao}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                        {flight.origin.municipality} to {flight.destination.municipality}
                                    </div>
                                    <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-500">
                                        {flight.departureTime && <span>{flight.departureTime}</span>}
                                        {flight.duration ? <span>{flight.duration} min</span> : null}
                                        {flight.distance ? <span>{flight.distance.toLocaleString()} {metricUnits === 'false' ? 'mi' : 'km'}</span> : null}
                                        {flight.airplane && <span>{flight.airplane}</span>}
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
