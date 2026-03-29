import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { Airport, Airline, Flight } from '../models';

const RECENT_SEARCHES_KEY = 'jetlog_recent_searches';
const MAX_RECENT = 5;
const DEBOUNCE_MS = 300;

interface SearchResult {
    id: string;
    category: 'flight' | 'airport' | 'airline' | 'recent';
    label: string;
    sublabel: string;
    action: () => void;
}

function getRecentSearches(): string[] {
    try {
        const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function addRecentSearch(query: string) {
    if (!query.trim()) return;
    const recent = getRecentSearches().filter(s => s !== query);
    recent.unshift(query);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [recentVersion, setRecentVersion] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const navigate = useNavigate();
    const resultsRef = useRef<HTMLDivElement>(null);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setResults([]);
            setSelectedIndex(0);
            setRecentVersion(v => v + 1);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    // Scroll selected item into view
    useEffect(() => {
        if (!resultsRef.current) return;
        const items = resultsRef.current.querySelectorAll('[data-result-item]');
        if (items[selectedIndex]) {
            items[selectedIndex].scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex]);

    const performSearch = useCallback(async (searchQuery: string) => {
        if (searchQuery.length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const searchResults: SearchResult[] = [];

        try {
            const [flightsOrigin, flightsDest, airports, airlines] = await Promise.allSettled([
                API.get('/flights', { limit: 5, origin: searchQuery }),
                API.get('/flights', { limit: 5, destination: searchQuery }),
                API.get(`/airports?q=${searchQuery}`),
                API.get(`/airlines?q=${searchQuery}`),
            ]);

            // Deduplicate flights by id
            const flightMap = new Map<number, Flight>();
            if (flightsOrigin.status === 'fulfilled' && Array.isArray(flightsOrigin.value)) {
                flightsOrigin.value.forEach((f: Flight) => flightMap.set(f.id, f));
            }
            if (flightsDest.status === 'fulfilled' && Array.isArray(flightsDest.value)) {
                flightsDest.value.forEach((f: Flight) => flightMap.set(f.id, f));
            }

            const allFlights = Array.from(flightMap.values());

            allFlights.slice(0, 5).forEach((flight: Flight) => {
                const origin = flight.origin;
                const dest = flight.destination;
                const originCode = origin?.iata || origin?.icao || '???';
                const destCode = dest?.iata || dest?.icao || '???';
                searchResults.push({
                    id: `flight-${flight.id}`,
                    category: 'flight',
                    label: `${originCode} \u2192 ${destCode}`,
                    sublabel: `${flight.date}${flight.flightNumber ? ' \u00b7 ' + flight.flightNumber : ''}${flight.airline?.name ? ' \u00b7 ' + flight.airline.name : ''}`,
                    action: () => navigate(`/flights?id=${flight.id}`),
                });
            });

            if (airports.status === 'fulfilled' && Array.isArray(airports.value)) {
                airports.value.slice(0, 5).forEach((airport: Airport) => {
                    const code = airport.iata || airport.icao;
                    searchResults.push({
                        id: `airport-${airport.icao}`,
                        category: 'airport',
                        label: `${code} - ${airport.name}`,
                        sublabel: `${airport.municipality || ''}${airport.municipality && airport.country ? ', ' : ''}${airport.country || ''}`,
                        action: () => navigate(`/airport/${airport.icao}`),
                    });
                });
            }

            if (airlines.status === 'fulfilled' && Array.isArray(airlines.value)) {
                airlines.value.slice(0, 5).forEach((airline: Airline) => {
                    const code = airline.iata || airline.icao;
                    searchResults.push({
                        id: `airline-${airline.icao}`,
                        category: 'airline',
                        label: `${code} - ${airline.name}`,
                        sublabel: 'Airline',
                        action: () => navigate(`/flights?airline=${airline.icao}`),
                    });
                });
            }
        } catch {
            // Silently fail; partial results are fine
        }

        setResults(searchResults);
        setSelectedIndex(0);
        setLoading(false);
    }, [navigate]);

    const handleInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }

        if (value.length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        debounceRef.current = setTimeout(() => {
            performSearch(value);
        }, DEBOUNCE_MS);
    }, [performSearch]);

    // Build the display items list, used by both rendering and keyboard navigation
    const recentSearches = getRecentSearches();
    const showRecent = query.length === 0 && recentSearches.length > 0;

    const { grouped, allItems } = useMemo(() => {
        const groups: { category: string; items: SearchResult[] }[] = [];

        if (showRecent) {
            const recentItems: SearchResult[] = recentSearches.map((s, i) => ({
                id: `recent-${i}`,
                category: 'recent' as const,
                label: s,
                sublabel: 'Recent search',
                action: () => {
                    setQuery(s);
                    performSearch(s);
                },
            }));
            groups.push({ category: 'recent', items: recentItems });
        } else {
            const categories: SearchResult['category'][] = ['flight', 'airport', 'airline'];
            for (const cat of categories) {
                const items = results.filter(r => r.category === cat);
                if (items.length > 0) {
                    groups.push({ category: cat, items });
                }
            }
        }

        return { grouped: groups, allItems: groups.flatMap(g => g.items) };
    }, [showRecent, recentSearches, results, performSearch, recentVersion]);

    // Keyboard handler that uses the current allItems list
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, allItems.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && allItems.length > 0) {
            e.preventDefault();
            const item = allItems[selectedIndex];
            if (item) {
                if (item.category === 'recent') {
                    item.action();
                } else {
                    addRecentSearch(query);
                    item.action();
                    onClose();
                }
            }
        }
    }, [allItems, selectedIndex, query, onClose]);

    if (!isOpen) return null;

    const categoryIcon = (cat: string) => {
        switch (cat) {
            case 'flight': return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 19l-7-7 7-7m0 14l7-7-7-7" />
                </svg>
            );
            case 'airport': return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            );
            case 'airline': return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
            );
            case 'recent': return (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
            default: return null;
        }
    };

    const categoryLabel = (cat: string) => {
        switch (cat) {
            case 'flight': return 'Flights';
            case 'airport': return 'Airports';
            case 'airline': return 'Airlines';
            case 'recent': return 'Recent Searches';
            default: return '';
        }
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] command-palette-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="w-full max-w-xl mx-4 command-palette-modal">
                <div className="glass-card bg-white/95 dark:bg-gray-800/95 shadow-2xl overflow-hidden">
                    {/* Search input */}
                    <div className="flex items-center px-4 py-3 border-b border-gray-200/50 dark:border-gray-700/50">
                        <svg className="w-5 h-5 text-gray-400 dark:text-gray-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={handleInput}
                            onKeyDown={handleKeyDown}
                            placeholder="Search flights, airports, airlines..."
                            className="w-full bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-base font-sans"
                        />
                        {loading && (
                            <div className="w-4 h-4 border-2 border-gray-300 border-t-primary-400 rounded-full animate-spin ml-2 flex-shrink-0"></div>
                        )}
                        <kbd className="ml-2 hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 flex-shrink-0">
                            ESC
                        </kbd>
                    </div>

                    {/* Results */}
                    <div ref={resultsRef} className="max-h-80 overflow-y-auto">
                        {grouped.map((group) => (
                            <div key={group.category}>
                                <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider bg-gray-50/50 dark:bg-gray-900/30">
                                    {categoryLabel(group.category)}
                                </div>
                                {group.items.map((item) => {
                                    const itemIndex = allItems.indexOf(item);
                                    const isSelected = itemIndex === selectedIndex;
                                    return (
                                        <div
                                            key={item.id}
                                            data-result-item
                                            className={`flex items-center px-4 py-2.5 cursor-pointer transition-colors duration-100
                                                ${isSelected
                                                    ? 'bg-primary-500/10 dark:bg-primary-500/20'
                                                    : 'hover:bg-gray-100/50 dark:hover:bg-gray-700/30'
                                                }`}
                                            onClick={() => {
                                                if (item.category === 'recent') {
                                                    setQuery(item.label);
                                                    performSearch(item.label);
                                                } else {
                                                    addRecentSearch(query);
                                                    item.action();
                                                    onClose();
                                                }
                                            }}
                                            onMouseEnter={() => setSelectedIndex(itemIndex)}
                                        >
                                            <div className={`mr-3 flex-shrink-0 ${isSelected ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'}`}>
                                                {categoryIcon(item.category)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className={`text-sm font-medium truncate ${isSelected ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                                    {item.label}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                    {item.sublabel}
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <kbd className="ml-2 hidden sm:inline-flex items-center px-1.5 py-0.5 text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 flex-shrink-0">
                                                    Enter
                                                </kbd>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}

                        {/* Empty state */}
                        {query.length >= 2 && !loading && results.length === 0 && (
                            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                <svg className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                          d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-sm">No results for "{query}"</p>
                            </div>
                        )}

                        {/* Initial state with no recent searches */}
                        {query.length === 0 && recentSearches.length === 0 && (
                            <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                                <p className="text-sm">Search for flights, airports, or airlines</p>
                            </div>
                        )}
                    </div>

                    {/* Footer with keyboard hints */}
                    <div className="flex items-center justify-between px-4 py-2 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-200/50 dark:border-gray-700/50 bg-gray-50/30 dark:bg-gray-900/20">
                        <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 font-mono">
                                    <span className="text-[10px]">&#8593;&#8595;</span>
                                </kbd>
                                navigate
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 font-mono">
                                    <span className="text-[10px]">&#9166;</span>
                                </kbd>
                                select
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 font-mono">esc</kbd>
                                close
                            </span>
                        </div>
                        <div className="flex items-center gap-2 max-sm:hidden">
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 font-mono">N</kbd>
                                new
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 font-mono">H</kbd>
                                home
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 font-mono">F</kbd>
                                flights
                            </span>
                            <span className="flex items-center gap-1">
                                <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 font-mono">S</kbd>
                                stats
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
