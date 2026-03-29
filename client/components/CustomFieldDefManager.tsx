import React, { useEffect, useState } from 'react';
import { Button, Label, Subheading, Spinner } from './Elements';
import API from '../api';

interface FieldDef {
    id: number;
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
    options: string[] | null;
    sortOrder: number;
}

const FIELD_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'rating', label: 'Rating (1-5 stars)' },
    { value: 'select', label: 'Select (dropdown)' },
];

export default function CustomFieldDefManager() {
    const [fields, setFields] = useState<FieldDef[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    const [newFieldName, setNewFieldName] = useState('');
    const [newFieldLabel, setNewFieldLabel] = useState('');
    const [newFieldType, setNewFieldType] = useState('text');
    const [newOptions, setNewOptions] = useState('');
    const [creating, setCreating] = useState(false);

    const loadFields = () => {
        API.get('/custom-fields/definitions')
        .then((data: FieldDef[]) => {
            setFields(data);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    useEffect(() => {
        loadFields();
    }, []);

    const handleCreate = async () => {
        if (!newFieldName.trim() || !newFieldLabel.trim()) return;

        setCreating(true);
        try {
            const body: any = {
                fieldName: newFieldName.trim().toLowerCase().replace(/\s+/g, '_'),
                fieldLabel: newFieldLabel.trim(),
                fieldType: newFieldType,
                sortOrder: fields.length,
            };

            if (newFieldType === 'select' && newOptions.trim()) {
                body.options = newOptions.split(',').map(o => o.trim()).filter(o => o);
            }

            await API.post('/custom-fields/definitions', body);
            setNewFieldName('');
            setNewFieldLabel('');
            setNewFieldType('text');
            setNewOptions('');
            setShowForm(false);
            loadFields();
        } catch (err) {
            // handled by API class
        }
        setCreating(false);
    };

    const handleDelete = async (id: number, label: string) => {
        if (!confirm(`Delete custom field "${label}"? All saved values for this field will be removed.`)) return;
        try {
            await API.delete(`/custom-fields/definitions/${id}`);
            loadFields();
        } catch (err) {
            // handled by API class
        }
    };

    if (loading) return <Spinner />;

    return (
        <div>
            <Subheading text="Custom Fields" />
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                Define custom fields that appear on every flight.
            </p>

            {fields.length > 0 ? (
                <div className="space-y-2 mb-4">
                    {fields.map(fd => (
                        <div key={fd.id} className="flex items-center justify-between p-2 border border-gray-300 dark:border-gray-600 rounded-md">
                            <div>
                                <span className="font-semibold">{fd.fieldLabel}</span>
                                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                    ({fd.fieldType}{fd.options ? `: ${fd.options.join(', ')}` : ''})
                                </span>
                            </div>
                            <Button text="Delete" level="danger" onClick={() => handleDelete(fd.id, fd.fieldLabel)} />
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500 dark:text-gray-400 mb-4">No custom fields defined yet.</p>
            )}

            {showForm ? (
                <div className="border border-gray-300 dark:border-gray-600 rounded-md p-3 space-y-2">
                    <div>
                        <Label text="Field Label" required />
                        <input
                            type="text"
                            className="w-full px-1 mb-1 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                            value={newFieldLabel}
                            onChange={e => {
                                setNewFieldLabel(e.target.value);
                                setNewFieldName(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
                            }}
                            placeholder="WiFi Quality"
                        />
                    </div>
                    <div>
                        <Label text="Internal Name" />
                        <input
                            type="text"
                            className="w-full px-1 mb-1 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600 text-gray-500"
                            value={newFieldName}
                            onChange={e => setNewFieldName(e.target.value)}
                            placeholder="wifi_quality"
                        />
                    </div>
                    <div>
                        <Label text="Field Type" required />
                        <select
                            className="px-1 py-0.5 mb-1 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                            value={newFieldType}
                            onChange={e => setNewFieldType(e.target.value)}
                        >
                            {FIELD_TYPES.map(ft => (
                                <option key={ft.value} value={ft.value}>{ft.label}</option>
                            ))}
                        </select>
                    </div>
                    {newFieldType === 'select' && (
                        <div>
                            <Label text="Options (comma-separated)" required />
                            <input
                                type="text"
                                className="w-full px-1 mb-1 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                                value={newOptions}
                                onChange={e => setNewOptions(e.target.value)}
                                placeholder="Good, Bad, None"
                            />
                        </div>
                    )}
                    <div className="flex gap-2">
                        <Button text={creating ? 'Creating...' : 'Add Field'} level="success" disabled={creating || !newFieldLabel.trim()} onClick={handleCreate} />
                        <Button text="Cancel" onClick={() => setShowForm(false)} />
                    </div>
                </div>
            ) : (
                <Button text="Add Custom Field" level="success" onClick={() => setShowForm(true)} />
            )}
        </div>
    );
}
