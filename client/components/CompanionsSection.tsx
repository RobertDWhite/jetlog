import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Subheading, Spinner } from './Elements';
import CompanionPicker from './CompanionPicker';
import { Companion } from '../models';
import API from '../api';

interface CompanionsSectionProps {
    flightId: number;
    canEdit: boolean;
}

export default function CompanionsSection({ flightId, canEdit }: CompanionsSectionProps) {
    const [companions, setCompanions] = useState<Companion[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [names, setNames] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        API.get(`/flights/${flightId}/companions`)
        .then((data: Companion[]) => {
            setCompanions(data || []);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, [flightId]);

    const startEditing = () => {
        setNames(companions.map(c => c.name));
        setEditing(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const result = await API.post(`/flights/${flightId}/companions`, { names });
            setCompanions(result);
            setEditing(false);
        } catch (err) {
            // handled by API class
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Spinner />;

    return (
        <div>
            <Subheading text="Flew With" />
            {editing ? (
                <div className="space-y-2">
                    <CompanionPicker value={names} onChange={setNames} />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        New names create a profile automatically.
                    </p>
                    <div className="flex gap-2">
                        <Button text={saving ? 'Saving...' : 'Save'} level="success" onClick={handleSave} disabled={saving} />
                        <Button text="Cancel" onClick={() => setEditing(false)} />
                    </div>
                </div>
            ) : companions.length > 0 ? (
                <div>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {companions.map(c => (
                            <Link key={c.id} to={`/family/${c.id}`}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm
                                             bg-primary-100 text-primary-700 hover:bg-primary-200
                                             dark:bg-primary-500/20 dark:text-primary-200 dark:hover:bg-primary-500/30">
                                {c.name}
                            </Link>
                        ))}
                    </div>
                    {canEdit && <Button text="Edit" onClick={startEditing} />}
                </div>
            ) : (
                <div>
                    <p className="text-gray-500 dark:text-gray-400">No companions</p>
                    {canEdit && <Button text="Add" onClick={startEditing} />}
                </div>
            )}
        </div>
    );
}
