import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Heading, Subheading, Label, Input, Select, TextArea, Button, Spinner } from '../components/Elements';
import { CompanionProfile as Profile } from '../models';
import API from '../api';
import ConfigStorage from '../storage/configStorage';

function StatCard({ value, label }: { value: string | number; label: string }) {
    return (
        <div className="container text-center">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</div>
        </div>
    );
}

export default function CompanionProfile() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [profile, setProfile] = useState<Profile>();
    const [notFound, setNotFound] = useState(false);
    const [editing, setEditing] = useState(false);

    const [name, setName] = useState('');
    const [relation, setRelation] = useState('');
    const [notes, setNotes] = useState('');

    const metric = ConfigStorage.getSetting("metricUnits") !== "false";
    const distanceUnit = metric ? 'km' : 'mi';

    const load = () => {
        API.get(`/companions/${id}`, { metric })
        .then((data: Profile) => {
            setProfile(data);
            setName(data.name);
            setRelation(data.relation || '');
            setNotes(data.notes || '');
        })
        .catch(() => setNotFound(true));
    };

    useEffect(load, [id]);

    const handleSave = async () => {
        try {
            await API.patch(`/companions/${id}`, {
                name: name.trim(),
                relation: relation || null,
                notes: notes || null,
            });
            setEditing(false);
            load();
        } catch (err) {
            // handled by API class
        }
    };

    const handleDelete = async () => {
        if (!confirm(`Remove ${profile?.name}? This unlinks them from all flights but does not delete the flights.`)) return;
        try {
            await API.delete(`/companions/${id}`);
            navigate('/family');
        } catch (err) {
            // handled by API class
        }
    };

    if (notFound) {
        return (
            <div className="text-center py-16">
                <h1 className="text-6xl font-bold text-gray-300 dark:text-gray-600 mb-4">404</h1>
                <p className="text-lg text-gray-500 dark:text-gray-400 mb-6">Companion not found</p>
                <Button text="Back to Family" onClick={() => navigate('/family')} />
            </div>
        );
    }

    if (!profile) return <Spinner />;

    const hours = profile.totalDuration ? (profile.totalDuration / 60).toFixed(0) : '0';

    return (
        <>
            <Link to="/family" className="text-sm text-primary-400 hover:underline">&larr; Family</Link>

            {editing ? (
                <div className="container max-w-lg my-3">
                    <Subheading text="Edit Companion" />
                    <Label text="Name" required />
                    <Input type="text" value={name} onChange={e => setName(e.target.value)} />
                    <Label text="Relationship" />
                    <Select value={relation}
                            onChange={e => setRelation(e.target.value)}
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
                    <Label text="Notes" />
                    <TextArea defaultValue={notes} onChange={e => setNotes(e.target.value)} maxLength={300} />
                    <div className="mt-2">
                        <Button text="Save" level="success" onClick={handleSave} />
                        <Button text="Cancel" onClick={() => { setEditing(false); setName(profile.name); setRelation(profile.relation || ''); setNotes(profile.notes || ''); }} />
                    </div>
                </div>
            ) : (
                <div className="flex items-center justify-between flex-wrap gap-2 my-2">
                    <div>
                        <Heading text={profile.name} />
                        {profile.relation && <p className="-mt-3 text-gray-500 dark:text-gray-400 capitalize">{profile.relation}</p>}
                    </div>
                    <div>
                        <Button text="Edit" onClick={() => setEditing(true)} />
                        <Button text="Delete" level="danger" onClick={handleDelete} />
                    </div>
                </div>
            )}

            {profile.notes && !editing && (
                <p className="mb-3 whitespace-pre-line text-gray-600 dark:text-gray-300">{profile.notes}</p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
                <StatCard value={profile.flightCount} label="Flights together" />
                <StatCard value={profile.totalDistance.toLocaleString()} label={distanceUnit} />
                <StatCard value={hours} label="Hours" />
                <StatCard value={profile.uniqueAirports} label="Airports" />
                <StatCard value={profile.uniqueCountries} label="Countries" />
                <StatCard value={profile.flights.length > 0 ? `${profile.firstFlight?.slice(0, 4) || ''}` : '—'} label="Since" />
            </div>

            {profile.topDestinations.length > 0 && (
                <div className="container mb-4">
                    <Subheading text="Top Destinations Together" />
                    <div className="flex flex-wrap gap-2">
                        {profile.topDestinations.map(d => (
                            <span key={d.country}
                                  className="px-2 py-1 rounded-md text-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-100">
                                {d.country} <span className="text-gray-400">×{d.count}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <Subheading text="Flights Together" />
            {profile.flights.length === 0 ? (
                <div className="container text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">No shared flights yet.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {profile.flights.map(f => (
                        <Link key={f.id} to={`/flights?id=${f.id}`}
                              className="container flex items-center justify-between hover:border-primary-400 transition-colors">
                            <div>
                                <span className="font-semibold">
                                    {f.originIata || f.origin} {'→'} {f.destinationIata || f.destination}
                                </span>
                                <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{f.date}</span>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 text-right">
                                {f.distance ? `${f.distance.toLocaleString()} ${distanceUnit}` : ''}
                                {f.duration ? ` · ${Math.floor(f.duration / 60)}h ${f.duration % 60}m` : ''}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </>
    );
}
