import React, { useEffect, useState } from 'react';
import { Button, Input, Label, Subheading, Spinner } from './Elements';
import API from '../api';

interface FrequentFlyerData {
    id: number;
    flight_id: number;
    program_name: string;
    member_number: string | null;
    miles_earned: number;
    status_credits: number;
}

interface FrequentFlyerSectionProps {
    flightId: number;
    canEdit: boolean;
}

export default function FrequentFlyerSection({ flightId, canEdit }: FrequentFlyerSectionProps) {
    const [data, setData] = useState<FrequentFlyerData | null>(null);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);

    const [programName, setProgramName] = useState('');
    const [memberNumber, setMemberNumber] = useState('');
    const [milesEarned, setMilesEarned] = useState(0);
    const [statusCredits, setStatusCredits] = useState(0);

    useEffect(() => {
        API.get(`/flights/${flightId}/frequent-flyer`)
        .then((result: FrequentFlyerData | null) => {
            if (result && result.id) {
                setData(result);
                setProgramName(result.program_name);
                setMemberNumber(result.member_number || '');
                setMilesEarned(result.miles_earned);
                setStatusCredits(result.status_credits);
            }
            setLoading(false);
        })
        .catch(() => setLoading(false));
    }, [flightId]);

    const handleSave = async () => {
        try {
            const result = await API.post(`/flights/${flightId}/frequent-flyer`, {
                program_name: programName,
                member_number: memberNumber || null,
                miles_earned: milesEarned,
                status_credits: statusCredits,
            });
            setData(result);
            setEditing(false);
        } catch (err) {
            // error handled by API class
        }
    };

    const handleDelete = async () => {
        if (!confirm('Remove frequent flyer entry?')) return;
        try {
            await API.delete(`/flights/${flightId}/frequent-flyer`);
            setData(null);
            setProgramName('');
            setMemberNumber('');
            setMilesEarned(0);
            setStatusCredits(0);
            setEditing(false);
        } catch (err) {
            // error handled by API class
        }
    };

    if (loading) return <Spinner />;

    return (
        <div>
            <Subheading text="Frequent Flyer" />
            {editing ? (
                <div className="space-y-2">
                    <div>
                        <Label text="Program Name" required />
                        <input
                            type="text"
                            className="w-full px-1 mb-2 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                            value={programName}
                            onChange={e => setProgramName(e.target.value)}
                            placeholder="United MileagePlus"
                        />
                    </div>
                    <div>
                        <Label text="Member Number" />
                        <input
                            type="text"
                            className="w-full px-1 mb-2 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                            value={memberNumber}
                            onChange={e => setMemberNumber(e.target.value)}
                            placeholder="AB123456"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Label text="Miles Earned" />
                            <input
                                type="number"
                                className="w-full px-1 mb-2 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                                value={milesEarned}
                                onChange={e => setMilesEarned(parseInt(e.target.value) || 0)}
                                min={0}
                            />
                        </div>
                        <div>
                            <Label text="Status Credits" />
                            <input
                                type="number"
                                className="w-full px-1 mb-2 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                                value={statusCredits}
                                onChange={e => setStatusCredits(parseInt(e.target.value) || 0)}
                                min={0}
                            />
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button text="Save" level="success" onClick={handleSave} />
                        <Button text="Cancel" onClick={() => {
                            setEditing(false);
                            if (data) {
                                setProgramName(data.program_name);
                                setMemberNumber(data.member_number || '');
                                setMilesEarned(data.miles_earned);
                                setStatusCredits(data.status_credits);
                            }
                        }} />
                        {data && <Button text="Remove" level="danger" onClick={handleDelete} />}
                    </div>
                </div>
            ) : data ? (
                <div>
                    <p>Program: <span className="font-semibold">{data.program_name}</span></p>
                    {data.member_number && <p>Member #: <span>{data.member_number}</span></p>}
                    <p>Miles Earned: <span>{data.miles_earned.toLocaleString()}</span></p>
                    {data.status_credits > 0 && <p>Status Credits: <span>{data.status_credits.toLocaleString()}</span></p>}
                    {canEdit && <Button text="Edit" onClick={() => setEditing(true)} />}
                </div>
            ) : (
                <div>
                    <p className="text-gray-500 dark:text-gray-400">No frequent flyer entry</p>
                    {canEdit && <Button text="Add" onClick={() => setEditing(true)} />}
                </div>
            )}
        </div>
    );
}
