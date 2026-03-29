import React, { useEffect, useState } from 'react';
import { Spinner } from './Elements';
import API from '../api';

interface FieldDef {
    id: number;
    fieldName: string;
    fieldLabel: string;
    fieldType: string;
    options: string[] | null;
    sortOrder: number;
}

interface FieldValue {
    id: number;
    flightId: number;
    fieldDefId: number;
    value: string | null;
}

interface CustomFieldsEditorProps {
    flightId: number | null;   // null for new flight (values saved after creation)
    canEdit: boolean;
    onValuesReady?: (values: { fieldDefId: number; value: string | null }[]) => void;
}

function StarRatingField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const [hover, setHover] = useState(0);

    return (
        <span className="inline-flex gap-0.5">
            {[1, 2, 3, 4, 5].map(star => (
                <span
                    key={star}
                    className={`cursor-pointer text-xl ${(hover || value) >= star ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-600'}`}
                    onMouseEnter={() => setHover(star)}
                    onMouseLeave={() => setHover(0)}
                    onClick={() => onChange(value === star ? 0 : star)}
                >
                    {'\u2605'}
                </span>
            ))}
        </span>
    );
}

export default function CustomFieldsEditor({ flightId, canEdit, onValuesReady }: CustomFieldsEditorProps) {
    const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
    const [fieldValues, setFieldValues] = useState<Record<number, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const loadDefs = API.get('/custom-fields/definitions').then((defs: FieldDef[]) => {
            setFieldDefs(defs);
            return defs;
        });

        if (flightId) {
            loadDefs.then((defs) => {
                API.get(`/custom-fields/flights/${flightId}`).then((vals: FieldValue[]) => {
                    const valMap: Record<number, string> = {};
                    for (const v of vals) {
                        valMap[v.fieldDefId] = v.value || '';
                    }
                    setFieldValues(valMap);
                    setLoading(false);
                }).catch(() => setLoading(false));
            });
        } else {
            loadDefs.then(() => setLoading(false));
        }
    }, [flightId]);

    // Notify parent of current values whenever they change (for new flight form)
    useEffect(() => {
        if (onValuesReady && fieldDefs.length > 0) {
            const values = fieldDefs.map(fd => ({
                fieldDefId: fd.id,
                value: fieldValues[fd.id] || null,
            }));
            onValuesReady(values);
        }
    }, [fieldValues, fieldDefs]);

    const handleChange = (defId: number, value: string) => {
        setFieldValues(prev => ({ ...prev, [defId]: value }));
    };

    const handleSave = async () => {
        if (!flightId) return;
        setSaving(true);
        try {
            const payload = fieldDefs.map(fd => ({
                fieldDefId: fd.id,
                value: fieldValues[fd.id] || null,
            }));
            await API.post(`/custom-fields/flights/${flightId}`, payload);
        } catch (err) {
            // handled by API class
        }
        setSaving(false);
    };

    if (loading) return <Spinner />;
    if (fieldDefs.length === 0) return null;

    return (
        <div>
            <h3 className="mb-2 font-bold text-lg">Custom Fields</h3>
            <div className="space-y-2">
                {fieldDefs.map(fd => (
                    <div key={fd.id}>
                        <label className="mb-1 font-semibold block text-sm">{fd.fieldLabel}</label>
                        {!canEdit ? (
                            <p className="text-gray-700 dark:text-gray-300">
                                {fd.fieldType === 'rating'
                                    ? (fieldValues[fd.id]
                                        ? '\u2605'.repeat(parseInt(fieldValues[fd.id])) + '\u2606'.repeat(5 - parseInt(fieldValues[fd.id]))
                                        : 'N/A')
                                    : fieldValues[fd.id] || 'N/A'}
                            </p>
                        ) : fd.fieldType === 'text' ? (
                            <input
                                type="text"
                                className="w-full px-1 mb-1 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                                value={fieldValues[fd.id] || ''}
                                onChange={e => handleChange(fd.id, e.target.value)}
                            />
                        ) : fd.fieldType === 'number' ? (
                            <input
                                type="number"
                                className="w-24 px-1 mb-1 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                                value={fieldValues[fd.id] || ''}
                                onChange={e => handleChange(fd.id, e.target.value)}
                            />
                        ) : fd.fieldType === 'rating' ? (
                            <StarRatingField
                                value={parseInt(fieldValues[fd.id]) || 0}
                                onChange={v => handleChange(fd.id, v.toString())}
                            />
                        ) : fd.fieldType === 'select' && fd.options ? (
                            <select
                                className="px-1 py-0.5 mb-1 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                                value={fieldValues[fd.id] || ''}
                                onChange={e => handleChange(fd.id, e.target.value)}
                            >
                                <option value="">-- Select --</option>
                                {fd.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        ) : null}
                    </div>
                ))}
            </div>
            {canEdit && flightId && (
                <button
                    type="button"
                    className="mt-2 py-1 px-2 rounded-md cursor-pointer bg-green-500 text-white hover:bg-green-400 text-sm"
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? 'Saving...' : 'Save Custom Fields'}
                </button>
            )}
        </div>
    );
}
