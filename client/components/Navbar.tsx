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
                <li className={`p-4 border-b-4 border-gray-700 hover:border-primary-400
                                ${ isActive ? "text-primary-400" : "text-white" }
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
        <li className="p-4 text-white cursor-pointer hover:text-primary-400 select-none"
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
            <p className="p-4 text-white cursor-pointer float-right" onClick={toggleOpen}>{open ? "x" : "Menu"}</p>
            { open &&
            <div className="bg-gray-700 absolute top-[3.5em] right-0 z-50" onClick={toggleOpen}>
                {[items.home, items.new, items.flights, items.statistics, items.review, items.settings, darkToggle]}
            </div>
            }
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
        <nav className="bg-gray-700 list-none">
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
