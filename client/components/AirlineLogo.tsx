import React, { useState } from 'react';

interface AirlineLogoProps {
    iata?: string;
    icao?: string;
    size?: number;
    className?: string;
}

export default function AirlineLogo({ iata, icao, size = 32, className = '' }: AirlineLogoProps) {
    const [imgError, setImgError] = useState(false);
    const code = iata || icao || '';

    if (!code) {
        return null;
    }

    if (imgError || !iata) {
        // Fallback: colored circle with first 2 letters
        const colors = [
            'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-red-500',
            'bg-amber-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500',
            'bg-cyan-500', 'bg-emerald-500', 'bg-orange-500', 'bg-rose-500',
        ];
        const hash = code.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colorClass = colors[hash % colors.length];
        const displayText = code.substring(0, 2).toUpperCase();

        return (
            <div
                className={`inline-flex items-center justify-center rounded-full text-white font-bold flex-shrink-0 ${colorClass} ${className}`}
                style={{ width: size, height: size, fontSize: size * 0.4 }}
                title={code}
            >
                {displayText}
            </div>
        );
    }

    return (
        <img
            src={`https://images.kiwi.com/airlines/64/${iata}.png`}
            alt={code}
            className={`inline-block rounded flex-shrink-0 ${className}`}
            style={{ width: size, height: size }}
            onError={() => setImgError(true)}
        />
    );
}
