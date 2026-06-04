import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Heading, Subheading, Label, Input, Select, Button, Spinner } from '../components/Elements';
import { Companion } from '../models';
import API from '../api';
import ConfigStorage from '../storage/configStorage';

function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function CompanionCard({ companion, metric }: { companion: Companion; metric: boolean }) {
    return (
        <Link to={`/family/${companion.id}`}
              className="container flex items-center gap-4 hover:border-primary-400 transition-colors">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary-500 text-white
                            flex items-center justify-center font-bold text-lg">
                {initials(companion.name)}
            </div>
            <div className="min-w-0">
                <p className="font-semibold truncate">{companion.name}</p>
                {companion.relation && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{companion.relation}</p>
                )}
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {companion.flightCount} flight{companion.flightCount === 1 ? '' : 's'} together
                    {companion.totalDistance > 0 &&
                        ` · ${companion.totalDistance.toLocaleString()} ${metric ? 'km' : 'mi'}`}
                </p>
                {companion.lastFlight && (
                    <p className="text-xs text-gray-400">Last flew {companion.lastFlight}</p>
                )}
            </div>
        </Link>
    );
}

export default function Family() {
    const [companions, setCompanions] = useState<Companion[]>();
    const [adding, setAdding] = useState(false);
    const [newName, setNewName] = useState('');
    const [newRelation, setNewRelation] = useState('');

    const metric = ConfigStorage.getSetting("metricUnits") !== "false";

    const load = () => {
        API.get('/companions', { metric })
        .then((data: Companion[]) => setCompanions(data || []))
        .catch(() => setCompanions([]));
    };

    useEffect(load, []);

    const handleAdd = async () => {
        if (!newName.trim()) return;
        try {
            await API.post('/companions', { name: newName.trim(), relation: newRelation || null });
            setNewName('');
            setNewRelation('');
            setAdding(false);
            load();
        } catch (err) {
            // handled by API class
        }
    };

    if (companions === undefined) return <Spinner />;

    return (
        <>
            <div className="flex items-center justify-between flex-wrap gap-2">
                <Heading text="Family & Companions" />
                <Button text={adding ? 'Cancel' : '+ Add Companion'} onClick={() => setAdding(!adding)} />
            </div>

            {adding && (
                <div className="container mb-4 max-w-lg">
                    <Subheading text="New Companion" />
                    <Label text="Name" required />
                    <Input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jane Doe" />
                    <Label text="Relationship" />
                    <Select value={newRelation}
                            onChange={e => setNewRelation(e.target.value)}
                            options={[
                                { text: "Choose", value: "" },
                                { text: "Partner", value: "partner" },
                                { text: "Spouse", value: "spouse" },
                                { text: "Child", value: "child" },
                                { text: "Parent", value: "parent" },
                                { text: "Sibling", value: "sibling" },
                                { text: "Friend", value: "friend" },
                                { text: "Other", value: "other" },
                            ]} />
                    <div>
                        <Button text="Add" level="success" onClick={handleAdd} />
                    </div>
                </div>
            )}

            {companions.length === 0 ? (
                <div className="container text-center py-10">
                    <p className="text-gray-500 dark:text-gray-400 mb-2">No companions yet.</p>
                    <p className="text-sm text-gray-400">
                        Add family members to a flight (or use the button above) and their
                        profiles will show up here.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {companions.map(c => (
                        <CompanionCard key={c.id} companion={c} metric={metric} />
                    ))}
                </div>
            )}
        </>
    );
}
