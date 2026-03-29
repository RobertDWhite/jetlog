import React, { useEffect, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Outlet, useNavigate } from 'react-router-dom';

import { BASE_URL } from './api';
import ConfigStorage from './storage/configStorage';

import Login from './pages/Login';
import New from './pages/New';
import Home from './pages/Home'
import AllFlights from './pages/AllFlights'
import Statistics from './pages/Statistics';
import Settings from './pages/Settings';
import YearInReview from './pages/YearInReview';
import PublicProfile from './pages/PublicProfile';
import Gallery from './pages/Gallery';
import AirportDetail from './pages/AirportDetail';
import Compensation from './pages/Compensation';

import Navbar from './components/Navbar';
import CommandPalette from './components/CommandPalette';

function useKeyboardShortcuts(onSearchOpen: () => void) {
    const navigate = useNavigate();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd+K / Ctrl+K — open search
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                onSearchOpen();
                return;
            }

            // Skip single-key shortcuts when user is typing in an input
            const target = e.target as HTMLElement;
            const tag = target.tagName.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
                return;
            }

            // Also skip if any modifier is held (allow normal browser shortcuts)
            if (e.metaKey || e.ctrlKey || e.altKey) {
                return;
            }

            switch (e.key.toLowerCase()) {
                case 'n':
                    navigate('/new');
                    break;
                case 'h':
                    navigate('/');
                    break;
                case 'f':
                    navigate('/flights');
                    break;
                case 's':
                    navigate('/statistics');
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [navigate, onSearchOpen]);
}

function AppLayout() {
    const [searchOpen, setSearchOpen] = useState(false);

    const openSearch = useCallback(() => setSearchOpen(true), []);
    const closeSearch = useCallback(() => setSearchOpen(false), []);

    useKeyboardShortcuts(openSearch);

    return (
        <>
            <Navbar onSearchOpen={openSearch} />
            <div className="h-full p-4 overflow-x-auto">
                <Outlet />
            </div>
            <CommandPalette isOpen={searchOpen} onClose={closeSearch} />
        </>
    );
}

export function App() {
    useEffect(() => {
        if (ConfigStorage.getSetting("darkMode") === "true") {
            document.documentElement.classList.add('dark');
        }
    }, []);

    return (
        <BrowserRouter basename={BASE_URL}>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<AppLayout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/new" element={<New />} />
                    <Route path="/flights" element={<AllFlights />} />
                    <Route path="/statistics" element={<Statistics />} />
                    <Route path="/review" element={<YearInReview />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/airport/:icao" element={<AirportDetail />} />
                    <Route path="/profile/:username" element={<PublicProfile />} />
                    <Route path="/compensation" element={<Compensation />} />
                    <Route path="/settings" element={<Settings />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
