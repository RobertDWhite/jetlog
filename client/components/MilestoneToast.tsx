import React, { useEffect, useState } from 'react';

interface MilestoneToastProps {
    icon: string;
    title: string;
    onDismiss?: () => void;
}

export default function MilestoneToast({ icon, title, onDismiss }: MilestoneToastProps) {
    const [visible, setVisible] = useState(false);
    const [exiting, setExiting] = useState(false);

    useEffect(() => {
        // Trigger entrance animation after mount
        const enterTimer = setTimeout(() => setVisible(true), 50);

        // Auto-dismiss after 3 seconds
        const dismissTimer = setTimeout(() => {
            setExiting(true);
        }, 3000);

        // Remove from DOM after exit animation
        const removeTimer = setTimeout(() => {
            onDismiss?.();
        }, 3500);

        return () => {
            clearTimeout(enterTimer);
            clearTimeout(dismissTimer);
            clearTimeout(removeTimer);
        };
    }, [onDismiss]);

    return (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
            <div
                className={`
                    pointer-events-auto mt-4 max-w-sm w-full mx-4
                    transition-all duration-500 ease-out
                    ${visible && !exiting
                        ? 'translate-y-0 opacity-100'
                        : '-translate-y-full opacity-0'
                    }
                `}
            >
                <div className="relative overflow-hidden rounded-xl shadow-2xl border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 via-amber-50 to-yellow-50 dark:from-yellow-900/40 dark:via-amber-900/30 dark:to-yellow-900/40 dark:border-yellow-500">
                    {/* Confetti particles - CSS only */}
                    <div className="absolute inset-0 overflow-hidden">
                        <ConfettiParticle color="bg-yellow-400" delay={0} left={10} />
                        <ConfettiParticle color="bg-red-400" delay={100} left={20} />
                        <ConfettiParticle color="bg-blue-400" delay={200} left={30} />
                        <ConfettiParticle color="bg-green-400" delay={50} left={45} />
                        <ConfettiParticle color="bg-purple-400" delay={150} left={55} />
                        <ConfettiParticle color="bg-pink-400" delay={250} left={65} />
                        <ConfettiParticle color="bg-amber-400" delay={100} left={75} />
                        <ConfettiParticle color="bg-cyan-400" delay={180} left={85} />
                        <ConfettiParticle color="bg-orange-400" delay={80} left={92} />
                    </div>

                    <div className="relative flex items-center gap-4 p-4">
                        {/* Achievement icon with glow */}
                        <div className="flex-shrink-0 relative">
                            <div className="absolute inset-0 bg-yellow-400/30 rounded-full blur-md animate-pulse" />
                            <div className="relative text-4xl w-14 h-14 flex items-center justify-center rounded-full bg-gradient-to-br from-yellow-200 to-amber-300 dark:from-yellow-700 dark:to-amber-600 shadow-lg">
                                {icon}
                            </div>
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold uppercase tracking-widest text-yellow-600 dark:text-yellow-400">
                                Achievement Unlocked!
                            </div>
                            <div className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate mt-0.5">
                                {title}
                            </div>
                        </div>

                        {/* Close button */}
                        <button
                            onClick={() => {
                                setExiting(true);
                                setTimeout(() => onDismiss?.(), 500);
                            }}
                            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Inline keyframes for confetti animation */}
            <style>{`
                @keyframes confetti-fall {
                    0% {
                        transform: translateY(-10px) rotate(0deg) scale(1);
                        opacity: 1;
                    }
                    50% {
                        opacity: 1;
                    }
                    100% {
                        transform: translateY(80px) rotate(720deg) scale(0.3);
                        opacity: 0;
                    }
                }
            `}</style>
        </div>
    );
}

function ConfettiParticle({ color, delay, left }: { color: string; delay: number; left: number }) {
    return (
        <div
            className={`absolute w-2 h-2 rounded-sm ${color}`}
            style={{
                left: `${left}%`,
                top: '-8px',
                animation: `confetti-fall 1.5s ease-out ${delay}ms forwards`,
                opacity: 0,
                animationFillMode: 'forwards',
                animationDelay: `${delay}ms`,
            }}
        />
    );
}

// Utility: compare two achievement lists to find newly unlocked ones
export function findNewAchievements(
    oldEarned: Set<string>,
    currentAchievements: { id: string; earned: boolean; icon: string; title: string }[]
): { id: string; icon: string; title: string }[] {
    return currentAchievements
        .filter(a => a.earned && !oldEarned.has(a.id))
        .map(a => ({ id: a.id, icon: a.icon, title: a.title }));
}
