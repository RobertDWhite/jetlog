import React from 'react';

function SkeletonBlock({ className = '' }: { className?: string }) {
    return (
        <div className={`rounded bg-gray-200 dark:bg-gray-700 skeleton ${className}`} />
    );
}

export function FlightCardSkeleton() {
    return (
        <div className="container bg-gray-100 dark:bg-gray-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
                <SkeletonBlock className="h-5 w-24" />
                <SkeletonBlock className="h-4 w-16" />
            </div>
            <div className="flex items-center gap-4">
                <div className="text-center space-y-1">
                    <SkeletonBlock className="h-8 w-16 mx-auto" />
                    <SkeletonBlock className="h-3 w-20" />
                </div>
                <div className="flex-1 flex items-center gap-2">
                    <SkeletonBlock className="h-0.5 flex-1" />
                    <SkeletonBlock className="h-5 w-5 rounded-full" />
                    <SkeletonBlock className="h-0.5 flex-1" />
                </div>
                <div className="text-center space-y-1">
                    <SkeletonBlock className="h-8 w-16 mx-auto" />
                    <SkeletonBlock className="h-3 w-20" />
                </div>
            </div>
            <div className="flex items-center justify-between pt-1">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="h-4 w-20" />
            </div>
        </div>
    );
}

export function StatCardSkeleton() {
    return (
        <div className="container bg-gray-100 dark:bg-gray-800 text-center rounded-full p-4">
            <SkeletonBlock className="h-8 w-16 mx-auto mb-2" />
            <SkeletonBlock className="h-3 w-12 mx-auto" />
        </div>
    );
}

export function MapSkeleton() {
    return (
        <div className="w-full h-64 md:h-96 rounded-lg bg-gray-200 dark:bg-gray-800 skeleton relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" />
                </svg>
            </div>
        </div>
    );
}
