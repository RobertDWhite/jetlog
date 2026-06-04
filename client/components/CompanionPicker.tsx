import React, { useEffect, useRef, useState } from 'react';
import API from '../api';
import { Companion } from '../models';

interface CompanionPickerProps {
    value: string[];
    onChange: (names: string[]) => void;
    placeholder?: string;
}

// A tag-style input for attaching family members / travel companions to a flight.
// Existing companions are suggested as you type; typing a brand-new name and
// confirming it will auto-generate a profile when the flight is saved.
export default function CompanionPicker({ value, onChange, placeholder }: CompanionPickerProps) {
    const [known, setKnown] = useState<Companion[]>([]);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        API.get('/companions')
        .then((data: Companion[]) => setKnown(data || []))
        .catch(() => {});
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const alreadyAdded = (name: string) =>
        value.some(v => v.toLowerCase() === name.trim().toLowerCase());

    const addName = (name: string) => {
        const trimmed = name.trim();
        if (!trimmed || alreadyAdded(trimmed)) {
            setQuery('');
            return;
        }
        onChange([...value, trimmed]);
        setQuery('');
    };

    const removeName = (name: string) => {
        onChange(value.filter(v => v !== name));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addName(query);
        } else if (e.key === 'Backspace' && !query && value.length > 0) {
            removeName(value[value.length - 1]);
        }
    };

    const suggestions = known.filter(c =>
        !alreadyAdded(c.name) &&
        c.name.toLowerCase().includes(query.trim().toLowerCase())
    ).slice(0, 6);

    const showCreate = query.trim().length > 0 &&
        !alreadyAdded(query) &&
        !known.some(c => c.name.toLowerCase() === query.trim().toLowerCase());

    return (
        <div className="relative" ref={wrapperRef}>
            <div className="flex flex-wrap items-center gap-1.5 px-1 py-1 bg-white rounded-none box-border
                            border-b-2 border-gray-200 focus-within:border-primary-400
                            dark:bg-gray-800 dark:border-gray-600">
                {value.map(name => (
                    <span key={name}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm
                                     bg-primary-100 text-primary-700
                                     dark:bg-primary-500/20 dark:text-primary-200">
                        {name}
                        <button type="button"
                                className="text-primary-500 hover:text-primary-700 dark:hover:text-white font-bold leading-none"
                                onClick={() => removeName(name)}>
                            {'×'}
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    className="flex-1 min-w-[8rem] px-1 bg-transparent outline-none font-mono
                               dark:text-gray-100 placeholder:italic dark:placeholder:text-gray-500"
                    value={query}
                    placeholder={value.length === 0 ? (placeholder || 'Add a family member...') : ''}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                />
            </div>

            {open && (suggestions.length > 0 || showCreate) && (
                <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md shadow-lg
                               bg-white border border-gray-200 dark:bg-gray-800 dark:border-gray-600">
                    {suggestions.map(c => (
                        <li key={c.id}>
                            <button type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700
                                               dark:text-gray-100 flex justify-between items-center"
                                    onClick={() => addName(c.name)}>
                                <span>{c.name}{c.relation ? <span className="text-gray-400 text-sm"> &middot; {c.relation}</span> : ''}</span>
                                {c.flightCount > 0 && (
                                    <span className="text-xs text-gray-400">{c.flightCount} flight{c.flightCount === 1 ? '' : 's'}</span>
                                )}
                            </button>
                        </li>
                    ))}
                    {showCreate && (
                        <li>
                            <button type="button"
                                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-100"
                                    onClick={() => addName(query)}>
                                Add new companion <span className="font-semibold">&ldquo;{query.trim()}&rdquo;</span>
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
