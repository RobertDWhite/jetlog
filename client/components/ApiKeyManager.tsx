import React, { useEffect, useState } from 'react';
import { Button, Input, Label, Subheading, Spinner } from './Elements';
import API from '../api';

interface ApiKeyInfo {
    id: number;
    name: string;
    createdAt: string | null;
    lastUsed: string | null;
    isActive: boolean;
}

interface NewKeyResult {
    id: number;
    name: string;
    key: string;
}

export default function ApiKeyManager() {
    const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [newKeyName, setNewKeyName] = useState('');
    const [createdKey, setCreatedKey] = useState<NewKeyResult | null>(null);
    const [creating, setCreating] = useState(false);
    const [copied, setCopied] = useState(false);

    const loadKeys = () => {
        API.get('/api-keys')
        .then((data: ApiKeyInfo[]) => {
            setKeys(data);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    };

    useEffect(() => {
        loadKeys();
    }, []);

    const handleCreate = async () => {
        if (!newKeyName.trim()) return;
        setCreating(true);
        try {
            const result: NewKeyResult = await API.post('/api-keys', { name: newKeyName.trim() });
            setCreatedKey(result);
            setNewKeyName('');
            loadKeys();
        } catch (err) {
            // handled by API class
        }
        setCreating(false);
    };

    const handleCopy = async () => {
        if (!createdKey) return;
        try {
            await navigator.clipboard.writeText(createdKey.key);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for non-HTTPS
            const textArea = document.createElement('textarea');
            textArea.value = createdKey.key;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleDeactivate = async (keyId: number) => {
        if (!confirm('Deactivate this API key? It will no longer work for authentication.')) return;
        try {
            await API.delete(`/api-keys/${keyId}`);
            loadKeys();
        } catch (err) {
            // handled by API class
        }
    };

    if (loading) return <Spinner />;

    return (
        <div>
            <Subheading text="API Keys" />

            {/* Created key banner (shown only once) */}
            {createdKey && (
                <div className="mb-4 p-3 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700 rounded-md">
                    <p className="font-semibold text-green-800 dark:text-green-200 mb-1">
                        API key created! Copy it now -- it will not be shown again.
                    </p>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 p-2 bg-white dark:bg-gray-800 rounded text-sm font-mono break-all border border-gray-300 dark:border-gray-600">
                            {createdKey.key}
                        </code>
                        <button
                            type="button"
                            className="py-1 px-3 rounded-md bg-green-500 text-white hover:bg-green-400 text-sm whitespace-nowrap"
                            onClick={handleCopy}
                        >
                            {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                    <button
                        type="button"
                        className="mt-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        onClick={() => setCreatedKey(null)}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Existing keys list */}
            {keys.length > 0 ? (
                <div className="space-y-2 mb-4">
                    {keys.map(k => (
                        <div key={k.id} className="flex items-center justify-between p-2 border border-gray-300 dark:border-gray-600 rounded-md">
                            <div>
                                <span className={`font-semibold ${!k.isActive ? 'line-through text-gray-400' : ''}`}>
                                    {k.name}
                                </span>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    Created: {k.createdAt ? k.createdAt.replace('T', ' ').substring(0, 19) : 'N/A'}
                                    {k.lastUsed && <> | Last used: {k.lastUsed.replace('T', ' ').substring(0, 19)}</>}
                                    {!k.isActive && <span className="ml-2 text-red-500">(inactive)</span>}
                                </div>
                            </div>
                            {k.isActive && (
                                <Button text="Revoke" level="danger" onClick={() => handleDeactivate(k.id)} />
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500 dark:text-gray-400 mb-4">No API keys created yet.</p>
            )}

            {/* Create new key */}
            <div className="flex items-end gap-2">
                <div className="flex-1">
                    <Label text="New API Key Name" />
                    <input
                        type="text"
                        className="w-full px-1 bg-white rounded-none outline-none font-mono box-border border-b-2 border-gray-200 focus:border-primary-400 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                        value={newKeyName}
                        onChange={e => setNewKeyName(e.target.value)}
                        placeholder="Home Assistant"
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
                    />
                </div>
                <Button
                    text={creating ? 'Creating...' : 'Create Key'}
                    level="success"
                    disabled={creating || !newKeyName.trim()}
                    onClick={handleCreate}
                />
            </div>

            {/* Usage example */}
            <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-900 rounded-md">
                <p className="text-sm font-semibold mb-1">Usage example:</p>
                <code className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                    curl -H "Authorization: Bearer &lt;key&gt;" {window.location.origin}/api/flights
                </code>
            </div>
        </div>
    );
}
