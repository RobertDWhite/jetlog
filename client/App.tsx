import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom';

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

import Navbar from './components/Navbar';

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
                <Route element={
                    <>
                        <Navbar />
                        <div className="h-full p-4 overflow-x-auto">
                            <Outlet />
                        </div>
                    </>}>
                    <Route path="/" element={<Home />} />
                    <Route path="/new" element={<New />} />
                    <Route path="/flights" element={<AllFlights />} />
                    <Route path="/statistics" element={<Statistics />} />
                    <Route path="/review" element={<YearInReview />} />
                    <Route path="/gallery" element={<Gallery />} />
                    <Route path="/profile/:username" element={<PublicProfile />} />
                    <Route path="/settings" element={<Settings />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
