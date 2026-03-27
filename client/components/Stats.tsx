import React, {useState, useEffect} from 'react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import { Whisper, Spinner } from './Elements';
import { Statistics } from '../models';
import ConfigStorage from '../storage/configStorage';
import API from '../api';

function StatBox({stat, description}) {
    return (
        <div className="container bg-gray-100 dark:bg-gray-800 text-center rounded-full">
            <span className="text-3xl block">{stat}</span>
            {description}
        </div>
    );
}

export function ShortStats() {
    const [statistics, setStatistics] = useState<Statistics>()
    const metricUnits = ConfigStorage.getSetting("metricUnits");

    useEffect(() => {
        API.get(`/statistics?metric=${metricUnits}`)
        .then((data: Statistics) => {
            setStatistics(data);
        });
    }, []);

    if (statistics === undefined) {
        return <Spinner />;
    }

    return (
        <div className="flex mb-4 whitespace-nowrap overflow-x-auto ">
            <StatBox stat={statistics.totalFlights}
                     description="flights"/>

            <StatBox stat={statistics.totalUniqueAirports}
                     description="airports"/>

            <StatBox stat={(statistics.totalDuration / 60).toFixed(0)}
                     description="hours"/>

            <StatBox stat={statistics.totalDistance.toLocaleString()}
                     description={metricUnits === "false" ? "miles" : "kilometers"}/>

            <StatBox stat={statistics.visitedCountries}
                     description="countries visited"/>
        </div>
    );
}

function StatFrequency({ object, measure }) {
    if (Object.keys(object).length === 0) {
        return <p>No records found</p>
    };

    return (
        <ol className="list-decimal ml-5">
        { Object.keys(object).map((key => {
            return (
                <li>
                    <div className="flex flex-wrap justify-between">
                        <span>{key}</span>
                        <div className="inline">
                            <Whisper text={`${object[key]} ${measure}`} />
                        </div>
                    </div>
                </li>
            )
        }))}
        </ol>
    )
}

function FlightsByMonthChart({ data }: { data: { month: string; count: number }[] }) {
    if (!data || data.length === 0) return <p>No data</p>;

    return (
        <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#EAB308" name="Flights" />
            </BarChart>
        </ResponsiveContainer>
    );
}

function DistanceByMonthChart({ data, unit }: { data: { month: string; distance: number }[], unit: string }) {
    if (!data || data.length === 0) return <p>No data</p>;

    return (
        <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => [value.toLocaleString() + ' ' + unit, 'Distance']} />
                <Area type="monotone" dataKey="distance" stroke="#F97316" fill="#FB923C80" name="Distance" />
            </AreaChart>
        </ResponsiveContainer>
    );
}

function TopRoutesTable({ data }: { data: { origin: string; destination: string; count: number }[] }) {
    if (!data || data.length === 0) return <p>No records found</p>;

    return (
        <ol className="list-decimal ml-5">
            {data.map((route, i) => (
                <li key={i}>
                    <div className="flex flex-wrap justify-between">
                        <span>{route.origin} {'\u2192'} {route.destination}</span>
                        <Whisper text={`${route.count} flights`} />
                    </div>
                </li>
            ))}
        </ol>
    );
}

function TopAircraftTable({ data }: { data: { airplane: string; count: number }[] }) {
    if (!data || data.length === 0) return <p>No records found</p>;

    return (
        <ol className="list-decimal ml-5">
            {data.map((ac, i) => (
                <li key={i}>
                    <div className="flex flex-wrap justify-between">
                        <span>{ac.airplane}</span>
                        <Whisper text={`${ac.count} flights`} />
                    </div>
                </li>
            ))}
        </ol>
    );
}

function RecordsSection({ records, unit }: { records: Statistics['records'], unit: string }) {
    if (!records || Object.keys(records).length === 0) return <p>No records yet</p>;

    return (
        <div className="space-y-2">
            {records.longestDistance && (
                <p>
                    Longest flight: <span>{records.longestDistance.origin} {'\u2192'} {records.longestDistance.destination}</span>
                    <Whisper text={`${records.longestDistance.distance.toLocaleString()} ${unit} on ${records.longestDistance.date}`} />
                </p>
            )}
            {records.shortestDistance && (
                <p>
                    Shortest flight: <span>{records.shortestDistance.origin} {'\u2192'} {records.shortestDistance.destination}</span>
                    <Whisper text={`${records.shortestDistance.distance.toLocaleString()} ${unit} on ${records.shortestDistance.date}`} />
                </p>
            )}
            {records.longestDuration && (
                <p>
                    Longest duration: <span>{records.longestDuration.origin} {'\u2192'} {records.longestDuration.destination}</span>
                    <Whisper text={`${records.longestDuration.duration} min on ${records.longestDuration.date}`} />
                </p>
            )}
            {records.mostFlightsInDay && (
                <p>
                    Most flights in a day: <span>{records.mostFlightsInDay.count} flights</span>
                    <Whisper text={`on ${records.mostFlightsInDay.date}`} />
                </p>
            )}
            {records.busiestMonth && (
                <p>
                    Busiest month: <span>{records.busiestMonth.month}</span>
                    <Whisper text={`${records.busiestMonth.count} flights`} />
                </p>
            )}
        </div>
    );
}

function CalendarHeatmap({ data }: { data: { date: string; count: number }[] }) {
    if (!data || data.length === 0) return <p>No flight data</p>;

    const countMap: { [date: string]: number } = {};
    data.forEach(d => { countMap[d.date] = d.count; });

    // Build last 52 weeks
    const today = new Date();
    const weeks: { date: Date; count: number }[][] = [];
    const start = new Date(today);
    start.setDate(start.getDate() - (52 * 7) - start.getDay());

    let currentWeek: { date: Date; count: number }[] = [];
    for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().substring(0, 10);
        currentWeek.push({ date: new Date(d), count: countMap[dateStr] || 0 });
        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);

    const getColor = (count: number) => {
        if (count === 0) return 'bg-gray-100 dark:bg-gray-700';
        if (count === 1) return 'bg-green-200 dark:bg-green-900';
        if (count === 2) return 'bg-green-400 dark:bg-green-700';
        return 'bg-green-600 dark:bg-green-500';
    };

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    return (
        <div className="overflow-x-auto">
            <div className="flex gap-[2px]">
                {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-[2px]">
                        {week.map((day, di) => (
                            <div key={di}
                                 className={`w-[10px] h-[10px] rounded-[2px] ${getColor(day.count)}`}
                                 title={`${day.date.toISOString().substring(0, 10)}: ${day.count} flight(s)`} />
                        ))}
                    </div>
                ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
                {months.map(m => <span key={m}>{m}</span>)}
            </div>
        </div>
    );
}

function AchievementBadge({ earned, label, detail }: { earned: boolean; label: string; detail: string }) {
    return (
        <div className={`p-3 rounded-lg border text-center ${
            earned
                ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-600'
                : 'border-gray-200 bg-gray-50 opacity-40 dark:bg-gray-800 dark:border-gray-700'
        }`}>
            <div className="text-2xl mb-1">{earned ? '\u{1F3C6}' : '\u{1F512}'}</div>
            <div className="font-semibold text-sm">{label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{detail}</div>
        </div>
    );
}

function Achievements({ stats }: { stats: Statistics }) {
    const uniqueAirlines = Object.keys(stats.mostCommonAirlines || {}).length;
    const uniqueAircraft = stats.topAircraft?.length || 0;
    const continentsVisited = stats.continentCompletion?.filter(c => c.visited > 0).length || 0;

    const badges = [
        // Flight milestones
        { earned: stats.totalFlights >= 1, label: "First Flight", detail: "Log your first flight" },
        { earned: stats.totalFlights >= 10, label: "Frequent Flyer", detail: "10 flights" },
        { earned: stats.totalFlights >= 50, label: "Jet Setter", detail: "50 flights" },
        { earned: stats.totalFlights >= 100, label: "Century Club", detail: "100 flights" },
        { earned: stats.totalFlights >= 500, label: "Sky Veteran", detail: "500 flights" },
        // Airport milestones
        { earned: stats.totalUniqueAirports >= 5, label: "Explorer", detail: "Visit 5 airports" },
        { earned: stats.totalUniqueAirports >= 25, label: "Globe Trotter", detail: "Visit 25 airports" },
        { earned: stats.totalUniqueAirports >= 50, label: "Airport Collector", detail: "Visit 50 airports" },
        // Country milestones
        { earned: stats.visitedCountries >= 5, label: "Passport Stamper", detail: "Visit 5 countries" },
        { earned: stats.visitedCountries >= 10, label: "World Traveler", detail: "Visit 10 countries" },
        { earned: stats.visitedCountries >= 25, label: "Worldwide", detail: "Visit 25 countries" },
        { earned: stats.visitedCountries >= 50, label: "Cartographer", detail: "Visit 50 countries" },
        // Continent milestones
        { earned: continentsVisited >= 3, label: "Continental", detail: "Visit 3 continents" },
        { earned: continentsVisited >= 6, label: "Six Continents", detail: "Visit 6 continents" },
        // Time milestones
        { earned: (stats.totalDuration / 60) >= 24, label: "Full Day Aloft", detail: "24 hours in the air" },
        { earned: (stats.totalDuration / 60) >= 168, label: "Week in the Sky", detail: "168 hours flying" },
        { earned: (stats.totalDuration / 60) >= 720, label: "Month Airborne", detail: "720 hours flying" },
        // Distance milestones
        { earned: stats.totalDistance >= 40000, label: "Around the World", detail: "Fly 40,000 km" },
        { earned: stats.totalDistance >= 100000, label: "100K Club", detail: "Fly 100,000 km" },
        { earned: stats.totalDistance >= 500000, label: "Half Million", detail: "Fly 500,000 km" },
        { earned: stats.totalDistance >= 1000000, label: "Million Miler", detail: "Fly 1,000,000 km" },
        // Variety
        { earned: uniqueAirlines >= 5, label: "Airline Sampler", detail: "Fly 5 airlines" },
        { earned: uniqueAirlines >= 10, label: "Airline Connoisseur", detail: "Fly 10 airlines" },
        { earned: uniqueAircraft >= 3, label: "Plane Spotter", detail: "Fly 3 aircraft types" },
        { earned: uniqueAircraft >= 5, label: "Fleet Reviewer", detail: "Fly 5 aircraft types" },
        // Time zones
        { earned: stats.uniqueTimezones >= 5, label: "Jet Lag", detail: "Visit 5 time zones" },
        { earned: stats.uniqueTimezones >= 15, label: "Time Traveler", detail: "Visit 15 time zones" },
        // Red-eye
        { earned: stats.redeyeCount >= 1, label: "Red-Eye", detail: "Take a red-eye flight" },
        { earned: stats.redeyeCount >= 5, label: "Night Owl", detail: "5 red-eye flights" },
        { earned: stats.redeyeCount >= 20, label: "Creature of the Night", detail: "20 red-eye flights" },
    ];

    const earnedCount = badges.filter(b => b.earned).length;

    return (
        <div>
            <Whisper text={`${earnedCount}/${badges.length} earned`} />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
                {badges.map((badge, i) => (
                    <AchievementBadge key={i} {...badge} />
                ))}
            </div>
        </div>
    );
}

export function AllStats({ filters }) {
    const [statistics, setStatistics] = useState<Statistics>();
    const [durationUnitIndex, setDurationUnitIndex] = useState(0);
    const [distanceUnitIndex, setDistanceUnitIndex] = useState(0);
    const metricUnits = ConfigStorage.getSetting('metricUnits');

    useEffect(() => {
        API.get(`/statistics?metric=${metricUnits}`, filters).then((data: Statistics) => {
        setStatistics(data);
        });
    }, [filters, metricUnits]);

    if (!statistics) {
        return <Spinner />;
    }

    if (statistics.totalFlights === 0) {
        return (
            <div className="text-center py-12">
                <p className="text-2xl text-gray-400 dark:text-gray-500 mb-2">No flights to show</p>
                <p className="text-gray-500 dark:text-gray-400">Start logging flights to see your statistics</p>
            </div>
        );
    }

    // cycle through duration units
    const durationUnits = [
        { label: "hours", divisor: 60 },
        { label: "days",  divisor: 1440 },
        { label: "weeks", divisor: 10080 },
    ];

    const handleDurationClick = () => {
        setDurationUnitIndex((prev) => (prev + 1) % durationUnits.length);
    };

    // cycle through distance units
    const distanceUnits = [
        { label: metricUnits === 'false' ? 'mi' : 'km', divisor: 1 },
        { label: "times around Earth", divisor: metricUnits === 'false' ? 24900 : 40000 },
        { label: "times to Moon", divisor: metricUnits === 'false' ?  239000 : 385000 },
    ];

    const handleDistanceClick = () => {
        setDistanceUnitIndex((prev) => (prev + 1) % distanceUnits.length);
    };

    const distUnit = metricUnits === 'false' ? 'mi' : 'km';

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Generic</h3>

                <p className="mb-2">
                    Number of flights: <span className="font-medium">{statistics.totalFlights}</span>
                </p>
                <p className="mb-2">
                    Total (registered) time spent flying:{' '}
                    <span className="font-medium cursor-pointer" onClick={handleDurationClick}>
                        {(statistics.totalDuration / durationUnits[durationUnitIndex].divisor).toFixed(1)} {' '}
                        {durationUnits[durationUnitIndex].label}
                    </span>
                </p>
                <p className="mb-2">
                    Total distance travelled:{' '}
                    <span className="font-medium cursor-pointer" onClick={handleDistanceClick}>
                        {(statistics.totalDistance / distanceUnits[distanceUnitIndex].divisor).toFixed(1)} {' '}
                        {distanceUnits[distanceUnitIndex].label}
                    </span>
                </p>
                <p className="mb-2">
                    Total unique airports visited:{' '}
                    <span className="font-medium">{statistics.totalUniqueAirports}</span>
                </p>
                <p className="mb-2">
                    Range of days:{' '}
                    <span className="font-medium">{statistics.daysRange} days</span>
                </p>
                <p className="mb-2">
                    'Visited' countries:{' '}
                    <span className="font-medium">{statistics.visitedCountries}</span>
                </p>
                {statistics.totalCo2Kg > 0 && (
                <p className="mb-2">
                    Est. CO{'\u2082'} emissions:{' '}
                    <span className="font-medium">
                        {statistics.totalCo2Kg >= 1000
                            ? (statistics.totalCo2Kg / 1000).toFixed(1) + ' tonnes'
                            : statistics.totalCo2Kg.toFixed(0) + ' kg'}
                    </span>
                </p>
                )}
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Flights by month</h3>
                <FlightsByMonthChart data={statistics.flightsByMonth} />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Distance by month</h3>
                <DistanceByMonthChart data={statistics.distanceByMonth} unit={distUnit} />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Most visited airports</h3>
                <StatFrequency object={statistics.mostVisitedAirports} measure="visits" />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Most common countries</h3>
                <StatFrequency object={statistics.mostCommonCountries} measure="flights" />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Most flown routes</h3>
                <TopRoutesTable data={statistics.topRoutes} />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Aircraft types</h3>
                <TopAircraftTable data={statistics.topAircraft} />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Most common seat</h3>
                <StatFrequency object={statistics.seatFrequency} measure="flights" />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Most common class</h3>
                <StatFrequency object={statistics.ticketClassFrequency} measure="flights" />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Most common airlines</h3>
                <StatFrequency object={statistics.mostCommonAirlines} measure="flights" />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Records</h3>
                <RecordsSection records={statistics.records} unit={distUnit} />
            </div>

            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Fun Facts</h3>
                <div className="space-y-2">
                    {statistics.avgSpeedKmh > 0 && (
                        <p>Average speed: <span className="font-medium">
                            {metricUnits === 'false'
                                ? Math.round(statistics.avgSpeedKmh * 0.6214) + ' mph'
                                : Math.round(statistics.avgSpeedKmh) + ' km/h'}
                        </span></p>
                    )}
                    {statistics.uniqueTimezones > 0 && (
                        <p>Time zones visited: <span className="font-medium">{statistics.uniqueTimezones}</span></p>
                    )}
                    {statistics.totalDuration > 0 && (
                        <p>Driving time saved: <span className="font-medium">
                            {Math.round((statistics.totalDistance / 80) - (statistics.totalDuration / 60))} hours
                        </span>
                        <Whisper text="vs driving at 80 km/h" />
                        </p>
                    )}
                    {statistics.totalDistance > 0 && (
                        <p>Fuel burned (est.): <span className="font-medium">
                            {Math.round(statistics.totalDistance * 0.03).toLocaleString()} liters
                        </span>
                        <Whisper text="~3L per 100 passenger-km" />
                        </p>
                    )}
                </div>
            </div>

            {statistics.totalCost && Object.keys(statistics.totalCost).length > 0 && (
            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Cost Analytics</h3>
                <p className="font-medium mb-2">Total Spend</p>
                {Object.entries(statistics.totalCost).map(([currency, amount]) => (
                    <p key={currency} className="mb-1 ml-2">
                        <span className="font-medium">{amount.toLocaleString()}</span> {currency}
                    </p>
                ))}
                {statistics.costPerKm && Object.keys(statistics.costPerKm).length > 0 && (
                    <>
                    <p className="font-medium mb-2 mt-3">Cost per {metricUnits === 'false' ? 'mile' : 'km'}</p>
                    {Object.entries(statistics.costPerKm).map(([currency, cpk]) => (
                        <p key={currency} className="mb-1 ml-2">
                            <span className="font-medium">
                                {metricUnits === 'false' ? (cpk / 0.6214).toFixed(2) : cpk.toFixed(2)}
                            </span> {currency}
                        </p>
                    ))}
                    </>
                )}
                {statistics.avgCostByClass && statistics.avgCostByClass.length > 0 && (
                    <>
                    <p className="font-medium mb-2 mt-3">Avg. Ticket by Class</p>
                    {statistics.avgCostByClass.map((item, i) => (
                        <p key={i} className="mb-1 ml-2">
                            {item.class}: <span className="font-medium">{item.avg.toLocaleString()}</span> {item.currency}
                        </p>
                    ))}
                    </>
                )}
            </div>
            )}

            {statistics.continentCompletion && statistics.continentCompletion.length > 0 && (
            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Country Completion</h3>
                <div className="space-y-3">
                    {statistics.continentCompletion.map((c) => (
                        <div key={c.continent}>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium">{c.continent}</span>
                                <span className="text-gray-500 dark:text-gray-400">
                                    {c.visited}/{c.total} ({Math.round(c.visited / c.total * 100)}%)
                                </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                <div className="bg-primary-400 h-2 rounded-full"
                                     style={{ width: `${Math.round(c.visited / c.total * 100)}%` }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            )}

            {statistics.flightsByDay && statistics.flightsByDay.length > 0 && (
            <div className="container md:col-span-2 lg:col-span-3">
                <h3 className="text-lg font-semibold mb-4">Flight Calendar</h3>
                <CalendarHeatmap data={statistics.flightsByDay} />
            </div>
            )}

            {statistics.ratedFlights > 0 && (
            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Ratings</h3>
                <div className="text-center mb-3">
                    <span className="text-3xl font-bold text-yellow-400">{statistics.avgRating}</span>
                    <span className="text-yellow-400 text-xl ml-1">{'\u2605'}</span>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{statistics.ratedFlights} rated flights</p>
                </div>
                {Object.keys(statistics.ratingDistribution).length > 0 && (
                    <div className="space-y-1 mb-4">
                        {[5, 4, 3, 2, 1].map(star => {
                            const count = statistics.ratingDistribution[String(star)] || 0;
                            const pct = statistics.ratedFlights > 0 ? Math.round(count / statistics.ratedFlights * 100) : 0;
                            return (
                                <div key={star} className="flex items-center gap-2 text-sm">
                                    <span className="w-8 text-right">{star}{'\u2605'}</span>
                                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                        <div className="bg-yellow-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="w-8 text-gray-500 dark:text-gray-400">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
                {statistics.ratingByAirline.length > 0 && (
                    <>
                    <h4 className="text-sm font-semibold mb-2">By Airline</h4>
                    <div className="space-y-1">
                        {statistics.ratingByAirline.map(r => (
                            <div key={r.airline} className="flex justify-between text-sm">
                                <span>{r.airline}</span>
                                <span className="text-yellow-400">{r.avg}{'\u2605'} <span className="text-gray-400">({r.count})</span></span>
                            </div>
                        ))}
                    </div>
                    </>
                )}
            </div>
            )}

            {(Object.keys(statistics.seatFrequency || {}).length > 0 || Object.keys(statistics.sideFrequency || {}).length > 0) && (
            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Seat Preferences</h3>
                {Object.keys(statistics.seatFrequency || {}).length > 0 && (() => {
                    const total = Object.values(statistics.seatFrequency).reduce((a: number, b: number) => a + b, 0) as number;
                    return (
                        <div className="mb-4">
                            <h4 className="text-sm font-semibold mb-2">Seat Type</h4>
                            {Object.entries(statistics.seatFrequency).map(([seat, count]) => {
                                const pct = Math.round((count as number) / total * 100);
                                return (
                                    <div key={seat} className="flex items-center gap-2 text-sm mb-1">
                                        <span className="w-16 capitalize">{seat}</span>
                                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                            <div className="bg-primary-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="w-12 text-right text-gray-500 dark:text-gray-400">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
                {Object.keys(statistics.sideFrequency || {}).length > 0 && (() => {
                    const total = Object.values(statistics.sideFrequency).reduce((a: number, b: number) => a + b, 0) as number;
                    return (
                        <div>
                            <h4 className="text-sm font-semibold mb-2">Aircraft Side</h4>
                            {Object.entries(statistics.sideFrequency).map(([side, count]) => {
                                const pct = Math.round((count as number) / total * 100);
                                return (
                                    <div key={side} className="flex items-center gap-2 text-sm mb-1">
                                        <span className="w-16 capitalize">{side}</span>
                                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                            <div className="bg-primary-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="w-12 text-right text-gray-500 dark:text-gray-400">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </div>
            )}

            {statistics.layoverStats && statistics.layoverStats.count > 0 && (
            <div className="container">
                <h3 className="text-lg font-semibold mb-4">Layovers</h3>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Connections</span>
                        <span className="font-semibold dark:text-gray-100">{statistics.layoverStats.count}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Avg layover</span>
                        <span className="font-semibold dark:text-gray-100">{Math.floor(statistics.layoverStats.avgMinutes / 60)}h {statistics.layoverStats.avgMinutes % 60}m</span>
                    </div>
                    {statistics.layoverStats.shortest && (
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Shortest</span>
                            <span className="font-semibold dark:text-gray-100">{Math.floor(statistics.layoverStats.shortest.minutes / 60)}h {statistics.layoverStats.shortest.minutes % 60}m ({statistics.layoverStats.shortest.hub})</span>
                        </div>
                    )}
                    {statistics.layoverStats.longest && (
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Longest</span>
                            <span className="font-semibold dark:text-gray-100">{Math.floor(statistics.layoverStats.longest.minutes / 60)}h {statistics.layoverStats.longest.minutes % 60}m ({statistics.layoverStats.longest.hub})</span>
                        </div>
                    )}
                    {statistics.layoverStats.busiestHub && (
                        <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-gray-400">Busiest hub</span>
                            <span className="font-semibold dark:text-gray-100">{statistics.layoverStats.busiestHub.icao} ({statistics.layoverStats.busiestHub.count}x)</span>
                        </div>
                    )}
                </div>
            </div>
            )}

            <div className="container md:col-span-2 lg:col-span-3">
                <h3 className="text-lg font-semibold mb-4">Achievements</h3>
                <Achievements stats={statistics} />
            </div>
    </div>
  );
}
