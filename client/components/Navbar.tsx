import { NavLink } from 'react-router-dom';
import React, {useState} from 'react';
import ConfigStorage from '../storage/configStorage';

interface NavItemProps {
    to: string;
    text: string;
    right?: boolean;
}

function NavItem({ to, text, right = false }: NavItemProps) {
    return (
        <NavLink to={to}>
            { ({ isActive }) =>
                <li className={`p-4 border-b-2 transition-all duration-200
                                ${ isActive
                                    ? "text-primary-400 border-primary-400 bg-white/5"
                                    : "text-gray-300 border-transparent hover:text-white hover:border-primary-400/50 hover:bg-white/5" }
                                ${ right ? "justify-self-end" : "" }`}>
                {text}
                </li>
            }
        </NavLink>
    );
}

function DarkModeToggle() {
    const [dark, setDark] = useState(ConfigStorage.getSetting("darkMode") === "true");

    const toggle = () => {
        const newValue = !dark;
        setDark(newValue);
        ConfigStorage.setSetting("darkMode", newValue.toString());
        if (newValue) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    };

    return (
        <li className="p-4 text-gray-300 cursor-pointer hover:text-primary-400 select-none transition-colors duration-200"
            onClick={toggle}>
            {dark ? '\u2600' : '\u263E'}
        </li>
    );
}

function NavMenu({ items, darkToggle }) {
    const [open, setOpen] = useState<boolean>(false);

    const toggleOpen = () => {
        setOpen(!open);
    }

    return (
        <div>
            <p className="p-4 text-white cursor-pointer float-right" onClick={toggleOpen}>
                {open ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                )}
            </p>
            <div className={`overflow-hidden transition-all duration-300 ease-in-out
                            ${open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                            bg-gray-800/95 backdrop-blur-md absolute top-[3.5em] right-0 z-50 rounded-bl-lg shadow-xl border-l border-b border-gray-700/50`}
                 onClick={toggleOpen}>
                {[items.home, items.new, items.flights, items.statistics, items.review, items.settings, darkToggle]}
            </div>
        </div>
    );
}

export default function Navbar() {
    const items = {
        'home': <NavItem key="home" to="/" text="Home" />,
        'new': <NavItem key="new" to="/new" text="New" />,
        'flights': <NavItem key="all flights" to="/flights" text="All Flights" />,
        'statistics': <NavItem key="statistics" to="/statistics" text="Statistics" />,
        'review': <NavItem key="review" to="/review" text="Review" />,
        'settings': <NavItem key="settings" to="/settings" text="Settings" right />
    };

    const darkToggle = <DarkModeToggle key="darkmode" />;

    return(
        <nav className="bg-gradient-to-r from-gray-800 via-gray-800 to-gray-900 backdrop-blur-md border-b border-gray-700/50 list-none sticky top-0 z-50 shadow-lg">
            <div className="flex justify-between max-md:hidden">
                <div className="flex">
                {[items.home, items.new, items.flights, items.statistics, items.review]}
                </div>

                <div className="flex">
                {[darkToggle, items.settings]}
                </div>
            </div>

            <div className="flex justify-between md:hidden">
                <div className="flex">
                {[items.home, items.new]}
                </div>

                <NavMenu items={items} darkToggle={darkToggle} />
            </div>
        </nav>
    );
}
