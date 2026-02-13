import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import API, { BASE_URL, ENABLE_EXTERNAL_APIS, FR24_CONFIGURED } from '../api';
import { Heading, Label, Input, Checkbox, Subheading, Button, Dialog, Select } from '../components/Elements'
import ConfigStorage, { ConfigInterface } from '../storage/configStorage';
import { User } from '../models';
import TokenStorage from '../storage/tokenStorage';

interface UserInfoProps {
    user: User;
    isSelf?: boolean;
}
function UserInfo({user, isSelf = false} : UserInfoProps) {
    const editUser = async (event) => {
        let userPatchData = Object.fromEntries(new FormData(event.currentTarget));
        userPatchData = Object.fromEntries(Object.entries(userPatchData).filter(([_, v]) => v != ""));

        // if admin status not updated, dont include it in the patch data
        if ("isAdmin" in userPatchData && userPatchData["isAdmin"] === user.isAdmin.toString()) {
            delete userPatchData["isAdmin"];
        }

        if (Object.keys(userPatchData).length === 0) {
            return;
        }

        await API.patch(`/users/${user.username}`, userPatchData);

        window.location.reload();
    }

    const logout = () => {
        TokenStorage.clearToken();
        window.location.href = "/login";
    }

    const deleteUser = async () => {
        if (confirm("Are you sure? All flights associated with this user will also be removed.")) {
            await API.delete(`/users/${user.username}`);
            window.location.reload();
        }
    }

    return (
        <>
            <p>Username: <span>{user.username}</span></p>
            <p>Admin: <span>{user.isAdmin.toString()}</span></p>
            <p>Last login: <span>{user.lastLogin}</span></p>
            <p>Created on: <span>{user.createdOn}</span></p>

            <Dialog title="Edit User"
                    formBody={(
                    <>
                        <Label text="New Username"/>
                        <Input type="text" name="username" placeholder={user.username}/>
                        { isSelf ?
                            <></>
                            :
                            <>
                            <br />
                            <Label text="New Admin Status"/>
                            <Select name="isAdmin" options={[
                                {
                                    text: user.isAdmin.toString(),
                                    value: user.isAdmin.toString()
                                },
                                {
                                    text: (!user.isAdmin).toString(),
                                    value: (!user.isAdmin).toString()
                                }
                            ]} />
                            </>
                        }
                        <br />
                        <Label text="New Password"/>
                        <Input type="password" name="password"/>
                    </>
                    )}
                    onSubmit={editUser}/>

            { isSelf ?
                <Button text="Logout" level="danger" onClick={logout}/>
                :
                <Button text="Delete" level="danger" onClick={deleteUser}/>
            }
        </>
    )
}

export default function Settings() {
    const [options, setOptions] = useState<ConfigInterface>(ConfigStorage.getAllSettings())
    const [user, setUser] = useState<User>();
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [runningUtility, setRunningUtility] = useState<string | null>(null);
    const [utilityLog, setUtilityLog] = useState<string[]>([]);
    const [utilityProgress, setUtilityProgress] = useState<{current: number, total: number} | null>(null);
    const utilityLogEndRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    useEffect(() => {
        API.get("/users/me")
        .then((data: User) => {
            setUser(data);

            if (data.isAdmin) {
                API.get("/users")
                .then((users: string[]) => {
                    for (let u of users) {
                        if (u === data.username) continue; // skip self

                        API.get(`/users/${u}/details`)
                        .then((user) => {
                            setAllUsers(prevAllUsers => {
                                return [...prevAllUsers, user];
                            });
                        });
                    }
                });
            }
        });
    }, []);

    const handleImportSubmit = (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        for(const pair of formData.entries()) {
            const file = pair[1];

            if(file instanceof Blob && file.size > 0) {
                var sendFormData = new FormData();
                sendFormData.append('file', file);
                API.post(`/importing?csv_type=${pair[0]}`, sendFormData)
                .then(() => navigate("/"));
            }
        }
    }

    const [syncingFR24, setSyncingFR24] = useState(false);
    const [fr24Log, setFR24Log] = useState<string[]>([]);
    const [fr24Progress, setFR24Progress] = useState<{current: number, total: number} | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [fr24Log]);

    useEffect(() => {
        utilityLogEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [utilityLog]);

    const syncToFR24 = async () => {
        setSyncingFR24(true);
        setFR24Log([]);
        setFR24Progress(null);

        try {
            const token = TokenStorage.getToken();
            const res = await fetch(BASE_URL + "/api/fr24/sync", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: "{}"
            });

            if (!res.ok) {
                const err = await res.json();
                setFR24Log(prev => [...prev, `Error: ${err.detail || res.statusText}`]);
                setSyncingFR24(false);
                return;
            }

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = JSON.parse(line.slice(6));

                    if (data.type === "start") {
                        setFR24Progress({ current: 0, total: data.total });
                        setFR24Log(prev => [...prev, `Starting sync of ${data.total} flights...`]);
                    } else if (data.type === "login") {
                        setFR24Log(prev => [...prev, data.message]);
                    } else if (data.type === "progress") {
                        setFR24Progress({ current: data.current, total: data.total });
                        const icon = data.status === "ok" ? "+" : "!";
                        const msg = `[${icon}] (${data.current}/${data.total}) ${data.flight}` +
                                    (data.error ? ` — ${data.error}` : "");
                        setFR24Log(prev => [...prev, msg]);
                    } else if (data.type === "done") {
                        setFR24Log(prev => [...prev, `Done: ${data.synced} synced, ${data.failed} failed`]);
                        setFR24Progress(null);
                    } else if (data.type === "error") {
                        setFR24Log(prev => [...prev, `Error: ${data.message}`]);
                    }
                }
            }
        } catch (err) {
            setFR24Log(prev => [...prev, `Connection error: ${err}`]);
        } finally {
            setSyncingFR24(false);
        }
    }

    const handleExportClick = (exportType: string) => {
        if(exportType === "csv") {
            API.post("/exporting/csv", {}, true);
        } else if(exportType === "ical") {
            API.post("/exporting/ical", {}, true);
        } else if(exportType === "myflightradar24") {
            API.post("/exporting/myflightradar24", {}, true);
        }
    }

    const changeOption = (event) => {
        const key = event.target.name;
        const value = event.target.checked.toString();

        setOptions({...options, [key]: value})
        ConfigStorage.setSetting(key, value);
    }

    const createUser = async (event) => {
        let userData = Object.fromEntries(new FormData(event.currentTarget));
        await API.post("/users", userData);

        window.location.reload();
    }

    const runUtility = async (endpoint: string, label: string) => {
        setRunningUtility(label);
        setUtilityLog([]);
        setUtilityProgress(null);

        try {
            const token = TokenStorage.getToken();
            const res = await fetch(BASE_URL + "/api" + endpoint, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: "{}"
            });

            if (!res.ok) {
                const err = await res.json();
                setUtilityLog(prev => [...prev, `Error: ${err.detail || res.statusText}`]);
                setRunningUtility(null);
                return;
            }

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = JSON.parse(line.slice(6));

                    if (data.type === "start") {
                        setUtilityProgress({ current: 0, total: data.total });
                        setUtilityLog(prev => [...prev, `Starting ${label} (${data.total} items)...`]);
                    } else if (data.type === "progress") {
                        setUtilityProgress({ current: data.current, total: data.total });
                        const icon = data.status === "ok" ? "+" : "!";
                        const msg = `[${icon}] (${data.current}/${data.total}) ${data.item}` +
                                    (data.error ? ` — ${data.error}` : "");
                        setUtilityLog(prev => [...prev, msg]);
                    } else if (data.type === "done") {
                        setUtilityLog(prev => [...prev, `Done: ${data.updated} updated, ${data.skipped} skipped`]);
                        setUtilityProgress(null);
                    }
                }
            }
        } catch (err) {
            setUtilityLog(prev => [...prev, `Connection error: ${err}`]);
        } finally {
            setRunningUtility(null);
        }
    }

    return (
    <>
        <Heading text="Settings" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            <div className="container">
                <Subheading text="Import"/>

                <form onSubmit={handleImportSubmit}>
                    <Label text="MyFlightRadar24" />
                    <Input type="file" name="myflightradar24" />

                    <Label text="Flighty" />
                    <Input type="file" name="flighty" />

                    <Label text="Custom CSV" />
                    <Input type="file" name="custom" />

                    <br />
                    <Button text="Import" level="success" submit/>
                </form>
            </div>
            
            <div className="container">
                <Subheading text="Export"/>

                <Button text="Export to CSV" onClick={() => handleExportClick("csv")}/>
                <br />
                <Button text="Export to iCal" onClick={() => handleExportClick("ical")}/>
                <br />
                <Button text="Export for MyFlightRadar24" onClick={() => handleExportClick("myflightradar24")}/>
                { FR24_CONFIGURED &&
                    <>
                        <br />
                        <Button text={syncingFR24 ? "Syncing..." : "Sync to MyFlightRadar24"} disabled={syncingFR24} onClick={syncToFR24}/>
                        { fr24Progress &&
                            <div className="w-full bg-gray-700 rounded mt-2 h-3">
                                <div className="bg-blue-500 h-3 rounded transition-all"
                                     style={{ width: `${(fr24Progress.current / fr24Progress.total) * 100}%` }} />
                            </div>
                        }
                        { fr24Log.length > 0 &&
                            <div className="mt-2 bg-gray-900 text-gray-200 text-xs font-mono p-2 rounded max-h-48 overflow-y-auto">
                                {fr24Log.map((line, i) => (
                                    <div key={i} className={line.startsWith("[!]") ? "text-red-400" : ""}>{line}</div>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                        }
                    </>
                }
            </div>

            <div className="container">
                <Subheading text="Customization" />

                <div className="flex justify-between">
                    <Label text="Frequency based marker size" />
                    <Checkbox name="frequencyBasedMarker" 
                                checked={options.frequencyBasedMarker === "true"} 
                                onChange={changeOption} />
                </div>

                <div className="flex justify-between">
                    <Label text="Frequency based line size" />
                    <Checkbox name="frequencyBasedLine" 
                                checked={options.frequencyBasedLine === "true"} 
                                onChange={changeOption} />
                </div>

                <div className="flex justify-between">
                    <Label text="Show visited countries" />
                    <Checkbox name="showVisitedCountries" 
                                checked={options.showVisitedCountries === "true"} 
                                onChange={changeOption} />
                </div>

                <div className="flex justify-between">
                    <Label text="Use metric units" />
                    <Checkbox name="metricUnits" 
                                checked={options.metricUnits === "true"} 
                                onChange={changeOption} />
                </div>

                <div className="flex justify-between">
                    <Label text="Use airport timezones for duration" />
                    <Checkbox name="localAirportTime" 
                                checked={options.localAirportTime === "true"} 
                                onChange={changeOption} />
                </div>

                <div className="flex justify-between">
                    <Label text="Restrict world map to visited areas" />
                    <Checkbox name="restrictWorldMap"
                                checked={options.restrictWorldMap === "true"}
                                onChange={changeOption} />

                </div>

                <hr />

                <Subheading text="Utilities" />

                <div className="flex justify-between">
                    <Label text="Compute flight connections" />
                    <Button text={runningUtility === "Compute connections" ? "Running..." : "Run"}
                            disabled={runningUtility !== null}
                            onClick={() => runUtility("/flights/connections", "Compute connections")} />
                </div>

                { ENABLE_EXTERNAL_APIS &&
                    <div className="flex justify-between">
                        <Label text="Fetch missing airlines" />
                        <Button text={runningUtility === "Fetch airlines" ? "Running..." : "Run"}
                                disabled={runningUtility !== null}
                                onClick={() => runUtility("/flights/airlines_from_callsigns", "Fetch airlines")} />
                    </div>
                }

                { ENABLE_EXTERNAL_APIS &&
                    <div className="flex justify-between">
                        <Label text="Enrich flight details" />
                        <Button text={runningUtility === "Enrich flights" ? "Running..." : "Run"}
                                disabled={runningUtility !== null}
                                onClick={() => runUtility("/flights/enrich", "Enrich flights")} />
                    </div>
                }

                { utilityProgress &&
                    <div className="w-full bg-gray-700 rounded mt-2 h-3">
                        <div className="bg-blue-500 h-3 rounded transition-all"
                             style={{ width: `${(utilityProgress.current / utilityProgress.total) * 100}%` }} />
                    </div>
                }
                { utilityLog.length > 0 &&
                    <div className="mt-2 bg-gray-900 text-gray-200 text-xs font-mono p-2 rounded max-h-48 overflow-y-auto">
                        {utilityLog.map((line, i) => (
                            <div key={i} className={line.startsWith("[!]") ? "text-red-400" : ""}>{line}</div>
                        ))}
                        <div ref={utilityLogEndRef} />
                    </div>
                }
            </div>


            <div className="container">
                <Subheading text="You"/>
                { user === undefined ?
                    <p>Loading...</p>
                    :
                    <UserInfo user={user} isSelf/>
                }
            </div>

            { user === undefined || !user.isAdmin ?
                <></>
                :
                allUsers === undefined ?
                    <p>Loading...</p>
                    :
                    <>
                        <div className="container w-full">
                            <Subheading text="User Management"/>
                            <div className="grid gap-3">
                                {allUsers.map((u) => (
                                    <div className="border-gray-500 border p-2">
                                        <UserInfo user={u}/>
                                    </div> 
                                ))}
                            </div>
                            <Dialog 
                                title="Create User" 
                                buttonLevel="success" 
                                onSubmit={createUser} 
                                formBody={(
                                    <>
                                        <Label text="Username" required/>
                                        <Input type="text" name="username" required/>
                                        <br />
                                        <Label text="Admin Status" required/>
                                        <Select name="isAdmin" options={[
                                            { text: "false", value: "false" },
                                            { text: "true", value: "true" }
                                        ]} />
                                        <br />
                                        <Label text="Password" required/>
                                        <Input type="text" name="password" required/>
                                    </>
                                )}
                            />
                        </div>
                    </>
            }
        </div>
    </>
    );
}
