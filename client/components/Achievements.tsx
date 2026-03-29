import React, { useMemo } from 'react';
import { Statistics } from '../models';

interface Achievement {
    id: string;
    icon: string;
    title: string;
    description: string;
    category: string;
    current: number;
    target: number;
    earned: boolean;
}

function ProgressBar({ current, target }: { current: number; target: number }) {
    const pct = Math.min(100, Math.round((current / target) * 100));
    return (
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-2">
            <div
                className="h-1.5 rounded-full transition-all duration-500 ease-out bg-primary-400"
                style={{ width: `${pct}%` }}
            />
        </div>
    );
}

function AchievementCard({ achievement }: { achievement: Achievement }) {
    const { icon, title, description, current, target, earned } = achievement;
    const progressText = current >= target
        ? 'Completed!'
        : `${current.toLocaleString()} / ${target.toLocaleString()}`;

    return (
        <div
            className={`relative p-4 rounded-xl border-2 text-center transition-all duration-300 ${
                earned
                    ? 'border-yellow-400 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/20 dark:border-yellow-500 shadow-lg shadow-yellow-200/50 dark:shadow-yellow-900/30'
                    : 'border-gray-200 bg-gray-50 dark:bg-gray-800/60 dark:border-gray-700 opacity-60'
            }`}
        >
            {earned && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center text-xs shadow-md">
                    {'\u2713'}
                </div>
            )}
            <div className={`text-3xl mb-2 ${earned ? '' : 'grayscale'}`}>{icon}</div>
            <div className={`font-semibold text-sm leading-tight ${earned ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
                {title}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                {description}
            </div>
            <div className={`text-xs mt-2 font-mono ${earned ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400 dark:text-gray-500'}`}>
                {progressText}
            </div>
            {!earned && <ProgressBar current={current} target={target} />}
        </div>
    );
}

function CategoryHeader({ name, earned, total }: { name: string; earned: number; total: number }) {
    return (
        <div className="flex items-center justify-between mb-3 mt-6 first:mt-0">
            <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                {name}
            </h4>
            <span className="text-xs font-mono text-gray-400 dark:text-gray-500">
                {earned}/{total}
            </span>
        </div>
    );
}

function computeAchievements(stats: Statistics): Achievement[] {
    // Derived values from the statistics object
    const totalFlights = stats.totalFlights || 0;
    const totalDistanceKm = stats.totalDistance || 0;
    const totalUniqueAirports = stats.totalUniqueAirports || 0;
    const visitedCountries = stats.visitedCountries || 0;
    const totalDurationMinutes = stats.totalDuration || 0;
    const totalDurationHours = totalDurationMinutes / 60;
    const redeyeCount = stats.redeyeCount || 0;
    const uniqueTimezones = stats.uniqueTimezones || 0;

    const continentsVisited = stats.continentCompletion?.filter(c => c.visited > 0).length || 0;

    // Airline counts from mostCommonAirlines (object: name -> count)
    const airlineEntries = Object.entries(stats.mostCommonAirlines || {});
    const uniqueAirlines = airlineEntries.length;
    const maxFlightsOnOneAirline = airlineEntries.length > 0
        ? Math.max(...airlineEntries.map(([, count]) => count as number))
        : 0;

    // Ticket class frequency
    const classEntries = Object.entries(stats.ticketClassFrequency || {});
    const hasFirstClass = classEntries.some(
        ([cls]) => cls?.toLowerCase() === 'first' || cls?.toLowerCase() === 'first class'
    );

    // Seat frequency for window seat warrior
    const seatEntries = Object.entries(stats.seatFrequency || {});
    const totalSeatsRecorded = seatEntries.reduce((sum, [, count]) => sum + (count as number), 0);
    const windowCount = seatEntries
        .filter(([seat]) => seat?.toLowerCase() === 'window')
        .reduce((sum, [, count]) => sum + (count as number), 0);
    const windowPct = totalSeatsRecorded >= 10 ? Math.round((windowCount / totalSeatsRecorded) * 100) : 0;

    // Aircraft types
    const uniqueAircraft = stats.topAircraft?.length || 0;

    // Most flights in a day
    const mostFlightsInDay = stats.records?.mostFlightsInDay?.count || 0;

    // Longest/shortest flight
    const longestDistanceKm = stats.records?.longestDistance?.distance || 0;
    const shortestDistanceKm = stats.records?.shortestDistance?.distance || 0;
    const longestDurationMin = stats.records?.longestDuration?.duration || 0;

    // Year rounder: check if any single year has flights in all 12 months
    const monthsByYear: { [year: string]: Set<string> } = {};
    (stats.flightsByMonth || []).forEach(entry => {
        if (!entry.month) return;
        const parts = entry.month.split('-');
        if (parts.length < 2) return;
        const year = parts[0];
        const month = parts[1];
        if (!monthsByYear[year]) monthsByYear[year] = new Set();
        monthsByYear[year].add(month);
    });
    const bestYearMonths = Math.max(0, ...Object.values(monthsByYear).map(s => s.size));

    // Average rating
    const avgRating = stats.avgRating || 0;
    const ratedFlights = stats.ratedFlights || 0;

    const achievements: Achievement[] = [
        // ===== Flight Count Milestones =====
        {
            id: 'flights-1',
            icon: '\u2708\uFE0F',
            title: 'First Flight',
            description: 'Log your very first flight',
            category: 'Flight Milestones',
            current: Math.min(totalFlights, 1),
            target: 1,
            earned: totalFlights >= 1,
        },
        {
            id: 'flights-10',
            icon: '\u{1F6EB}',
            title: 'Frequent Flyer',
            description: 'Log 10 flights',
            category: 'Flight Milestones',
            current: Math.min(totalFlights, 10),
            target: 10,
            earned: totalFlights >= 10,
        },
        {
            id: 'flights-100',
            icon: '\u{1F4AF}',
            title: 'Centurion',
            description: 'Log 100 flights',
            category: 'Flight Milestones',
            current: Math.min(totalFlights, 100),
            target: 100,
            earned: totalFlights >= 100,
        },
        {
            id: 'flights-250',
            icon: '\u{1F396}\uFE0F',
            title: 'Sky Warrior',
            description: 'Log 250 flights',
            category: 'Flight Milestones',
            current: Math.min(totalFlights, 250),
            target: 250,
            earned: totalFlights >= 250,
        },
        {
            id: 'flights-500',
            icon: '\u{1F3C5}',
            title: 'Mile High Club',
            description: 'Log 500 flights',
            category: 'Flight Milestones',
            current: Math.min(totalFlights, 500),
            target: 500,
            earned: totalFlights >= 500,
        },
        {
            id: 'flights-1000',
            icon: '\u{1F451}',
            title: 'Legend',
            description: 'Log 1,000 flights',
            category: 'Flight Milestones',
            current: Math.min(totalFlights, 1000),
            target: 1000,
            earned: totalFlights >= 1000,
        },

        // ===== Distance Milestones =====
        {
            id: 'dist-world',
            icon: '\u{1F30D}',
            title: 'Around the World',
            description: 'Fly 40,075 km cumulative',
            category: 'Distance Milestones',
            current: Math.min(totalDistanceKm, 40075),
            target: 40075,
            earned: totalDistanceKm >= 40075,
        },
        {
            id: 'dist-100k',
            icon: '\u{1F680}',
            title: '100K Club',
            description: 'Fly 100,000 km total',
            category: 'Distance Milestones',
            current: Math.min(totalDistanceKm, 100000),
            target: 100000,
            earned: totalDistanceKm >= 100000,
        },
        {
            id: 'dist-moon',
            icon: '\u{1F311}',
            title: 'To the Moon',
            description: 'Fly 384,400 km cumulative',
            category: 'Distance Milestones',
            current: Math.min(totalDistanceKm, 384400),
            target: 384400,
            earned: totalDistanceKm >= 384400,
        },
        {
            id: 'dist-500k',
            icon: '\u{1F31F}',
            title: 'Half Million',
            description: 'Fly 500,000 km total',
            category: 'Distance Milestones',
            current: Math.min(totalDistanceKm, 500000),
            target: 500000,
            earned: totalDistanceKm >= 500000,
        },
        {
            id: 'dist-interplanetary',
            icon: '\u{1FA90}',
            title: 'Interplanetary',
            description: 'Fly beyond the Moon (>384,400 km)',
            category: 'Distance Milestones',
            current: Math.min(totalDistanceKm, 500000),
            target: 500000,
            earned: totalDistanceKm >= 500000,
        },
        {
            id: 'dist-million',
            icon: '\u{1F48E}',
            title: 'Million Miler',
            description: 'Fly 1,000,000 km total',
            category: 'Distance Milestones',
            current: Math.min(totalDistanceKm, 1000000),
            target: 1000000,
            earned: totalDistanceKm >= 1000000,
        },

        // ===== Airport Milestones =====
        {
            id: 'airports-10',
            icon: '\u{1F6E9}\uFE0F',
            title: 'Explorer',
            description: 'Visit 10 unique airports',
            category: 'Airport Milestones',
            current: Math.min(totalUniqueAirports, 10),
            target: 10,
            earned: totalUniqueAirports >= 10,
        },
        {
            id: 'airports-25',
            icon: '\u{1F30E}',
            title: 'Globe Trotter',
            description: 'Visit 25 unique airports',
            category: 'Airport Milestones',
            current: Math.min(totalUniqueAirports, 25),
            target: 25,
            earned: totalUniqueAirports >= 25,
        },
        {
            id: 'airports-50',
            icon: '\u{1F5FA}\uFE0F',
            title: 'Airport Collector',
            description: 'Visit 50 unique airports',
            category: 'Airport Milestones',
            current: Math.min(totalUniqueAirports, 50),
            target: 50,
            earned: totalUniqueAirports >= 50,
        },
        {
            id: 'airports-100',
            icon: '\u{1F3DB}\uFE0F',
            title: 'Hub Master',
            description: 'Visit 100 unique airports',
            category: 'Airport Milestones',
            current: Math.min(totalUniqueAirports, 100),
            target: 100,
            earned: totalUniqueAirports >= 100,
        },

        // ===== Country Milestones =====
        {
            id: 'countries-5',
            icon: '\u{1F6C2}',
            title: 'Border Crosser',
            description: 'Visit 5 countries',
            category: 'Country Milestones',
            current: Math.min(visitedCountries, 5),
            target: 5,
            earned: visitedCountries >= 5,
        },
        {
            id: 'countries-10',
            icon: '\u{1F3F3}\uFE0F',
            title: 'Continental',
            description: 'Visit 10 countries',
            category: 'Country Milestones',
            current: Math.min(visitedCountries, 10),
            target: 10,
            earned: visitedCountries >= 10,
        },
        {
            id: 'countries-25',
            icon: '\u{1F30F}',
            title: 'World Citizen',
            description: 'Visit 25 countries',
            category: 'Country Milestones',
            current: Math.min(visitedCountries, 25),
            target: 25,
            earned: visitedCountries >= 25,
        },
        {
            id: 'countries-50',
            icon: '\u{1F9ED}',
            title: 'Global Nomad',
            description: 'Visit 50 countries',
            category: 'Country Milestones',
            current: Math.min(visitedCountries, 50),
            target: 50,
            earned: visitedCountries >= 50,
        },

        // ===== Continent Milestones =====
        {
            id: 'continents-3',
            icon: '\u{1F5FA}\uFE0F',
            title: 'Multi-Continental',
            description: 'Visit 3 continents',
            category: 'Country Milestones',
            current: Math.min(continentsVisited, 3),
            target: 3,
            earned: continentsVisited >= 3,
        },
        {
            id: 'continents-6',
            icon: '\u{1F30D}',
            title: 'Six Continents',
            description: 'Fly to 6 different continents',
            category: 'Country Milestones',
            current: Math.min(continentsVisited, 6),
            target: 6,
            earned: continentsVisited >= 6,
        },
        {
            id: 'continents-7',
            icon: '\u{1F9CA}',
            title: 'All Seven',
            description: 'Fly to all 7 continents (incl. Antarctica)',
            category: 'Country Milestones',
            current: Math.min(continentsVisited, 7),
            target: 7,
            earned: continentsVisited >= 7,
        },

        // ===== Airline Milestones =====
        {
            id: 'airline-loyal-10',
            icon: '\u{1F49B}',
            title: 'Loyal Flyer',
            description: '10 flights on a single airline',
            category: 'Airline Milestones',
            current: Math.min(maxFlightsOnOneAirline, 10),
            target: 10,
            earned: maxFlightsOnOneAirline >= 10,
        },
        {
            id: 'airline-loyal-20',
            icon: '\u{1F48C}',
            title: 'Brand Ambassador',
            description: '20 flights on a single airline',
            category: 'Airline Milestones',
            current: Math.min(maxFlightsOnOneAirline, 20),
            target: 20,
            earned: maxFlightsOnOneAirline >= 20,
        },
        {
            id: 'airline-collector-5',
            icon: '\u{1F3AB}',
            title: 'Airline Sampler',
            description: 'Fly 5 different airlines',
            category: 'Airline Milestones',
            current: Math.min(uniqueAirlines, 5),
            target: 5,
            earned: uniqueAirlines >= 5,
        },
        {
            id: 'airline-collector-10',
            icon: '\u{1F3A8}',
            title: 'Airline Collector',
            description: 'Fly 10 different airlines',
            category: 'Airline Milestones',
            current: Math.min(uniqueAirlines, 10),
            target: 10,
            earned: uniqueAirlines >= 10,
        },

        // ===== Time in Air Milestones =====
        {
            id: 'time-24h',
            icon: '\u{1F553}',
            title: 'Full Day Aloft',
            description: 'Spend 24 hours in the air',
            category: 'Time Milestones',
            current: Math.min(Math.round(totalDurationHours), 24),
            target: 24,
            earned: totalDurationHours >= 24,
        },
        {
            id: 'time-week',
            icon: '\u{1F4C5}',
            title: 'Week in the Sky',
            description: '168 hours flying total',
            category: 'Time Milestones',
            current: Math.min(Math.round(totalDurationHours), 168),
            target: 168,
            earned: totalDurationHours >= 168,
        },
        {
            id: 'time-month',
            icon: '\u{1F4C6}',
            title: 'Month Airborne',
            description: '720 hours flying total',
            category: 'Time Milestones',
            current: Math.min(Math.round(totalDurationHours), 720),
            target: 720,
            earned: totalDurationHours >= 720,
        },

        // ===== Special Achievements =====
        {
            id: 'redeye-5',
            icon: '\u{1F319}',
            title: 'Red Eye Warrior',
            description: '5+ overnight/red-eye flights',
            category: 'Special Achievements',
            current: Math.min(redeyeCount, 5),
            target: 5,
            earned: redeyeCount >= 5,
        },
        {
            id: 'redeye-1',
            icon: '\u{1F303}',
            title: 'Night Owl',
            description: 'Take a red-eye flight',
            category: 'Special Achievements',
            current: Math.min(redeyeCount, 1),
            target: 1,
            earned: redeyeCount >= 1,
        },
        {
            id: 'redeye-20',
            icon: '\u{1F987}',
            title: 'Creature of the Night',
            description: '20 red-eye flights',
            category: 'Special Achievements',
            current: Math.min(redeyeCount, 20),
            target: 20,
            earned: redeyeCount >= 20,
        },
        {
            id: 'first-class',
            icon: '\u{1F947}',
            title: 'First Class',
            description: 'Fly in first class',
            category: 'Special Achievements',
            current: hasFirstClass ? 1 : 0,
            target: 1,
            earned: hasFirstClass,
        },
        {
            id: 'window-warrior',
            icon: '\u{1F305}',
            title: 'Window Seat Warrior',
            description: '80%+ window seats (min 10 flights)',
            category: 'Special Achievements',
            current: totalSeatsRecorded >= 10 ? windowPct : Math.min(totalSeatsRecorded, 10),
            target: totalSeatsRecorded >= 10 ? 80 : 10,
            earned: totalSeatsRecorded >= 10 && windowPct >= 80,
        },
        {
            id: 'antipodal',
            icon: '\u{1F310}',
            title: 'Antipodal',
            description: 'Single flight > 15,000 km',
            category: 'Special Achievements',
            current: Math.min(longestDistanceKm, 15000),
            target: 15000,
            earned: longestDistanceKm >= 15000,
        },
        {
            id: 'speed-demon',
            icon: '\u26A1',
            title: 'Speed Demon',
            description: 'Shortest flight under 1 hour',
            category: 'Special Achievements',
            current: shortestDistanceKm > 0 ? 1 : 0,
            target: 1,
            // We check if there's a shortest flight with short distance (< ~800 km typically < 1hr)
            // Since we have duration data in longestDuration but not shortestDuration,
            // use distance as proxy: flights under ~500 km are typically under 1 hour
            earned: shortestDistanceKm > 0 && shortestDistanceKm < 500,
        },
        {
            id: 'long-hauler',
            icon: '\u{1F6CC}',
            title: 'Long Hauler',
            description: 'Single flight over 12 hours',
            category: 'Special Achievements',
            current: Math.min(longestDurationMin, 720),
            target: 720,
            earned: longestDurationMin >= 720,
        },
        {
            id: 'jet-setter',
            icon: '\u{1F4A8}',
            title: 'Jet Setter',
            description: '3+ flights in a single day',
            category: 'Special Achievements',
            current: Math.min(mostFlightsInDay, 3),
            target: 3,
            earned: mostFlightsInDay >= 3,
        },
        {
            id: 'year-rounder',
            icon: '\u{1F389}',
            title: 'Year Rounder',
            description: 'Flights in all 12 months of a year',
            category: 'Special Achievements',
            current: Math.min(bestYearMonths, 12),
            target: 12,
            earned: bestYearMonths >= 12,
        },

        // ===== Timezone Milestones =====
        {
            id: 'tz-5',
            icon: '\u231A',
            title: 'Jet Lag',
            description: 'Visit 5 different time zones',
            category: 'Special Achievements',
            current: Math.min(uniqueTimezones, 5),
            target: 5,
            earned: uniqueTimezones >= 5,
        },
        {
            id: 'tz-15',
            icon: '\u{1F570}\uFE0F',
            title: 'Time Traveler',
            description: 'Visit 15 different time zones',
            category: 'Special Achievements',
            current: Math.min(uniqueTimezones, 15),
            target: 15,
            earned: uniqueTimezones >= 15,
        },

        // ===== Aircraft Milestones =====
        {
            id: 'aircraft-3',
            icon: '\u{1F6E9}\uFE0F',
            title: 'Plane Spotter',
            description: 'Fly 3 different aircraft types',
            category: 'Variety',
            current: Math.min(uniqueAircraft, 3),
            target: 3,
            earned: uniqueAircraft >= 3,
        },
        {
            id: 'aircraft-5',
            icon: '\u{1F6E9}\uFE0F',
            title: 'Fleet Reviewer',
            description: 'Fly 5 different aircraft types',
            category: 'Variety',
            current: Math.min(uniqueAircraft, 5),
            target: 5,
            earned: uniqueAircraft >= 5,
        },

        // ===== Rating Milestones =====
        {
            id: 'rating-first',
            icon: '\u2B50',
            title: 'Critic',
            description: 'Rate your first flight',
            category: 'Variety',
            current: Math.min(ratedFlights, 1),
            target: 1,
            earned: ratedFlights >= 1,
        },
        {
            id: 'rating-avg-4',
            icon: '\u{1F31F}',
            title: 'High Standards',
            description: 'Average rating of 4+ stars (min 5 rated)',
            category: 'Variety',
            current: ratedFlights >= 5 ? Math.round(avgRating * 10) / 10 : Math.min(ratedFlights, 5),
            target: ratedFlights >= 5 ? 4 : 5,
            earned: ratedFlights >= 5 && avgRating >= 4,
        },
    ];

    return achievements;
}

interface AchievementsProps {
    stats: Statistics;
}

export default function Achievements({ stats }: AchievementsProps) {
    const achievements = useMemo(() => computeAchievements(stats), [stats]);

    const earnedCount = achievements.filter(a => a.earned).length;
    const totalCount = achievements.length;

    // Group by category
    const categories = useMemo(() => {
        const catMap: { [key: string]: Achievement[] } = {};
        achievements.forEach(a => {
            if (!catMap[a.category]) catMap[a.category] = [];
            catMap[a.category].push(a);
        });

        // Sort within each category: earned first (newest/hardest first), then locked (closest to completion first)
        Object.keys(catMap).forEach(cat => {
            catMap[cat].sort((a, b) => {
                if (a.earned && !b.earned) return -1;
                if (!a.earned && b.earned) return 1;
                if (a.earned && b.earned) {
                    // Both earned: higher target first (harder achievement)
                    return b.target - a.target;
                }
                // Both locked: closest to completion first
                const aPct = a.target > 0 ? a.current / a.target : 0;
                const bPct = b.target > 0 ? b.current / b.target : 0;
                return bPct - aPct;
            });
        });

        return catMap;
    }, [achievements]);

    // Define category order
    const categoryOrder = [
        'Flight Milestones',
        'Distance Milestones',
        'Airport Milestones',
        'Country Milestones',
        'Airline Milestones',
        'Time Milestones',
        'Special Achievements',
        'Variety',
    ];

    const overallPct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

    return (
        <div>
            {/* Overall progress */}
            <div className="flex items-center gap-3 mb-2">
                <div className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    {earnedCount}/{totalCount} unlocked ({overallPct}%)
                </div>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-4">
                <div
                    className="h-2.5 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 transition-all duration-700"
                    style={{ width: `${overallPct}%` }}
                />
            </div>

            {/* Categories */}
            {categoryOrder.map(catName => {
                const catAchievements = categories[catName];
                if (!catAchievements || catAchievements.length === 0) return null;

                const catEarned = catAchievements.filter(a => a.earned).length;

                return (
                    <div key={catName}>
                        <CategoryHeader name={catName} earned={catEarned} total={catAchievements.length} />
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {catAchievements.map(achievement => (
                                <AchievementCard key={achievement.id} achievement={achievement} />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// Export for use by MilestoneToast or other components
export { computeAchievements };
export type { Achievement };
