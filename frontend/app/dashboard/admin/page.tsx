"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getToken, getRole, getName, logout, authHeaders } from "../../../lib/auth";

const API_BASE = "http://127.0.0.1:8000/api/v1";

type SystemUser = {
    id: string;
    full_name: string;
    email: string;
    role: string;
};

type TeacherOption = {
    id: string;
    full_name: string;
};

type ProfileOption = {
    user_id: string;
    profile_id: string;
    full_name: string;
};

type UnitOption = {
    id: string;
    unit_name: string;
};

type SystemStatus = {
    status: string;
    gpu_lock: string;
    active_llm: string;
    vision_engine: string;
};

type OrchestrationHealth = {
    status?: string;
    coordinator?: string;
    graph?: string[];
    single_inference_lock?: boolean;
    audit_log_table?: string;
    runtime?: {
        agent_mode?: string;
        ollama?: { base_url?: string; chat_model?: string; embedding_model?: string };
        chroma?: { persist_dir?: string; student_patterns_collection?: string; career_data_collection?: string };
        adapters?: Record<string, { configured: boolean; available: boolean; detail: string }>;
    };
};

const subscribeToAuthStorage = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("storage", onStoreChange);
    return () => window.removeEventListener("storage", onStoreChange);
};

export default function AdminDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("academic");
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");

    const [users, setUsers] = useState<SystemUser[]>([]);
    const [teachers, setTeachers] = useState<TeacherOption[]>([]);
    const [students, setStudents] = useState<ProfileOption[]>([]);
    const [parents, setParents] = useState<ProfileOption[]>([]);
    const [units, setUnits] = useState<UnitOption[]>([]);
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [agentHealth, setAgentHealth] = useState<OrchestrationHealth | null>(null);

    const [editingUser, setEditingUser] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editRole, setEditRole] = useState("");
    const [newUnitName, setNewUnitName] = useState("");
    const [selectedTeacherId, setSelectedTeacherId] = useState("");
    const [enrollUnitId, setEnrollUnitId] = useState("");
    const [enrollStudentId, setEnrollStudentId] = useState("");
    const [linkParentId, setLinkParentId] = useState("");
    const [linkStudentId, setLinkStudentId] = useState("");

    const name = useSyncExternalStore(subscribeToAuthStorage, getName, () => null);

    const fetchAll = async () => {
        setLoading(true);
        await Promise.all([fetchUsers(), fetchUnits(), fetchSystemStatus(), fetchAgentHealth()]);
        setLoading(false);
    };

    const fetchUsers = async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders() });
            const data = await res.json();
            setUsers(Array.isArray(data) ? data : Array.isArray(data.all_users) ? data.all_users : []);
            setTeachers(Array.isArray(data.teachers) ? data.teachers : []);
            setStudents(Array.isArray(data.students) ? data.students : []);
            setParents(Array.isArray(data.parents) ? data.parents : []);
        } catch { /* handled */ }
    };

    const fetchUnits = async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/units`, { headers: authHeaders() });
            const data = await res.json();
            setUnits(Array.isArray(data) ? data : []);
        } catch { /* handled */ }
    };

    const fetchSystemStatus = async () => {
        try {
            const res = await fetch(`${API_BASE}/admin/system/status`, { headers: authHeaders() });
            setSystemStatus(await res.json());
        } catch { /* handled */ }
    };

    const fetchAgentHealth = async () => {
        try {
            const res = await fetch(`${API_BASE}/orchestration/health`, { headers: authHeaders() });
            setAgentHealth(await res.json());
        } catch { /* handled */ }
    };

    const updateUser = async (userId: string) => {
        const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({ full_name: editName, role: editRole }),
        });
        if (res.ok) {
            setMessage("User updated.");
            setEditingUser(null);
            fetchUsers();
        }
    };

    const createUnit = async (event: React.FormEvent) => {
        event.preventDefault();
        const res = await fetch(`${API_BASE}/admin/units`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ unit_name: newUnitName, teacher_id: selectedTeacherId }),
        });
        const data = await res.json();
        if (res.ok) {
            setMessage("Unit created.");
            setNewUnitName("");
            setSelectedTeacherId("");
            fetchUnits();
        } else {
            setMessage(data.detail || "Could not create unit.");
        }
    };

    const enrollStudent = async (event: React.FormEvent) => {
        event.preventDefault();
        const res = await fetch(`${API_BASE}/admin/enrollments`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ unit_id: enrollUnitId, student_id: enrollStudentId }),
        });
        const data = await res.json();
        setMessage(res.ok ? "Student enrolled." : data.detail || "Could not enroll student.");
        if (res.ok) setEnrollStudentId("");
    };

    const linkParent = async (event: React.FormEvent) => {
        event.preventDefault();
        const res = await fetch(`${API_BASE}/admin/parent-links`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ parent_id: linkParentId, student_id: linkStudentId }),
        });
        const data = await res.json();
        setMessage(res.ok ? "Parent linked to student." : data.detail || "Could not link parent.");
    };

    const runCleanup = async () => {
        const res = await fetch(`${API_BASE}/admin/cleanup`, {
            method: "DELETE",
            headers: authHeaders(),
        });
        const data = await res.json();
        setMessage(data.message || "Cleanup done.");
    };

    const initializeChroma = async () => {
        try {
            const res = await fetch(`${API_BASE}/orchestration/chroma/init`, {
                method: "POST",
                headers: authHeaders(),
            });
            const data = await res.json();
            if (res.ok) {
                setMessage("ChromaDB collections initialized.");
                fetchAgentHealth();
            } else {
                setMessage(data.detail || "Chroma init failed.");
            }
        } catch { setMessage("Could not reach orchestration endpoint."); }
    };

    useEffect(() => {
        const role = getRole();
        if (!getToken() || role !== "Admin") { router.push("/"); return; }
        const timer = window.setTimeout(() => {
            fetchAll();
        }, 0);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <p className="text-gray-500 text-lg">Loading dashboard...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
                <h1 className="text-xl font-bold text-blue-600">CoreMentor</h1>
                <div className="flex items-center gap-4">
                    <span className="text-gray-600 text-sm">Welcome, {name}</span>
                    <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full font-medium">Admin</span>
                    <button onClick={logout} className="text-sm text-red-500 hover:underline">Logout</button>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-8">
                {message && (
                    <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">
                        {message}
                        <button onClick={() => setMessage("")} className="ml-4 text-green-500 hover:underline">Dismiss</button>
                    </div>
                )}

                <div className="flex gap-2 mb-6 border-b border-gray-200">
                    {[
                        { key: "academic", label: "Academic Operations" },
                        { key: "users", label: "User Management" },
                        { key: "system", label: "System Status" },
                        { key: "agents", label: "Agent Health" },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                                activeTab === tab.key
                                    ? "border-blue-600 text-blue-600"
                                    : "border-transparent text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Academic Operations */}
                {activeTab === "academic" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <form onSubmit={createUnit} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
                            <h2 className="text-lg font-semibold text-gray-800">Create Unit</h2>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Teacher</label>
                                <select required value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="">Select teacher...</option>
                                    {teachers.map(teacher => (
                                        <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Unit Name</label>
                                <input required value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Advanced Physics 101" />
                            </div>
                            <button type="submit" className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">Create Unit</button>
                        </form>

                        <form onSubmit={enrollStudent} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
                            <h2 className="text-lg font-semibold text-gray-800">Enroll Student</h2>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Unit</label>
                                <select required value={enrollUnitId} onChange={(e) => setEnrollUnitId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="">Select unit...</option>
                                    {units.map(unit => (
                                        <option key={unit.id} value={unit.id}>{unit.unit_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Student</label>
                                <select required value={enrollStudentId} onChange={(e) => setEnrollStudentId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="">Select student...</option>
                                    {students.map(student => (
                                        <option key={student.profile_id} value={student.profile_id}>{student.full_name}</option>
                                    ))}
                                </select>
                            </div>
                            <button type="submit" className="w-full bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition">Enroll Student</button>
                        </form>

                        <form onSubmit={linkParent} className="bg-white rounded-xl shadow-sm p-5 space-y-4">
                            <h2 className="text-lg font-semibold text-gray-800">Link Parent</h2>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Parent</label>
                                <select required value={linkParentId} onChange={(e) => setLinkParentId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="">Select parent...</option>
                                    {parents.map(parent => (
                                        <option key={parent.profile_id} value={parent.profile_id}>{parent.full_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs text-gray-500 mb-1 block">Student</label>
                                <select required value={linkStudentId} onChange={(e) => setLinkStudentId(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                                    <option value="">Select student...</option>
                                    {students.map(student => (
                                        <option key={student.profile_id} value={student.profile_id}>{student.full_name}</option>
                                    ))}
                                </select>
                            </div>
                            <button type="submit" className="w-full bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 transition">Link Family</button>
                        </form>
                    </div>
                )}

                {/* ── User Management ── */}
                {activeTab === "users" && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">All Users ({users.length})</h2>
                        <div className="overflow-x-auto bg-white rounded-xl shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
                                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Email</th>
                                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Role</th>
                                        <th className="text-left px-4 py-3 text-gray-500 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {users.map(user => (
                                        <tr key={user.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-gray-700">
                                                {editingUser === user.id ? (
                                                    <input
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
                                                    />
                                                ) : user.full_name}
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs">{user.email}</td>
                                            <td className="px-4 py-3">
                                                {editingUser === user.id ? (
                                                    <select
                                                        value={editRole}
                                                        onChange={(e) => setEditRole(e.target.value)}
                                                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                                                    >
                                                        {["Admin", "Teacher", "Student", "Parent"].map(r => (
                                                            <option key={r} value={r}>{r}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                                        user.role === "Admin" ? "bg-red-100 text-red-700" :
                                                        user.role === "Teacher" ? "bg-blue-100 text-blue-700" :
                                                        user.role === "Student" ? "bg-green-100 text-green-700" :
                                                        "bg-amber-100 text-amber-700"
                                                    }`}>
                                                        {user.role}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {editingUser === user.id ? (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => updateUser(user.id)} className="text-green-600 hover:underline text-xs">Save</button>
                                                        <button onClick={() => setEditingUser(null)} className="text-gray-500 hover:underline text-xs">Cancel</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => { setEditingUser(user.id); setEditName(user.full_name); setEditRole(user.role); }}
                                                        className="text-blue-600 hover:underline text-xs"
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ── System Status ── */}
                {activeTab === "system" && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-800">System Status</h2>
                            <div className="flex gap-2">
                                <button onClick={fetchSystemStatus} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 transition">
                                    Refresh
                                </button>
                                <button onClick={runCleanup} className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition">
                                    Purge Temp Files
                                </button>
                            </div>
                        </div>

                        {systemStatus && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white rounded-xl shadow-sm p-5 text-center">
                                    <p className="text-sm text-gray-500">Status</p>
                                    <p className={`text-lg font-bold ${systemStatus.status === "Healthy" ? "text-green-600" : "text-red-600"}`}>
                                        {systemStatus.status}
                                    </p>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm p-5 text-center">
                                    <p className="text-sm text-gray-500">GPU Lock</p>
                                    <p className="text-lg font-bold text-gray-800">{systemStatus.gpu_lock}</p>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm p-5 text-center">
                                    <p className="text-sm text-gray-500">Active LLM</p>
                                    <p className="text-lg font-bold text-blue-600">{systemStatus.active_llm}</p>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm p-5 text-center">
                                    <p className="text-sm text-gray-500">Vision Engine</p>
                                    <p className="text-lg font-bold text-purple-600">{systemStatus.vision_engine}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Agent Health ── */}
                {activeTab === "agents" && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-800">Agent Orchestration Health</h2>
                            <div className="flex gap-2">
                                <button onClick={fetchAgentHealth} className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 transition">
                                    Refresh
                                </button>
                                <button onClick={initializeChroma} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition">
                                    Init ChromaDB
                                </button>
                            </div>
                        </div>

                        {agentHealth && (
                            <div className="space-y-4">
                                {/* Graph Pipeline */}
                                <div className="bg-white rounded-xl shadow-sm p-5">
                                    <h3 className="font-semibold text-gray-800 mb-3">LangGraph Pipeline</h3>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        {(agentHealth.graph || []).map((node, i) => (
                                            <div key={node} className="flex items-center gap-2">
                                                <span className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full font-medium">
                                                    {node.replace(/_/g, " ")}
                                                </span>
                                                {i < (agentHealth.graph?.length || 0) - 1 && (
                                                    <span className="text-gray-300">&rarr;</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-3 text-xs text-gray-500">
                                        <p>Coordinator: {agentHealth.coordinator} &middot; Inference lock: {agentHealth.single_inference_lock ? "Active" : "Off"} &middot; Audit table: {agentHealth.audit_log_table}</p>
                                    </div>
                                </div>

                                {/* Runtime Adapters */}
                                <div className="bg-white rounded-xl shadow-sm p-5">
                                    <h3 className="font-semibold text-gray-800 mb-3">Runtime Adapters</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                        {Object.entries(agentHealth.runtime?.adapters || {}).map(([adapterName, adapter]) => (
                                            <div key={adapterName} className="border border-gray-200 rounded-lg p-3">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-sm font-medium text-gray-700 capitalize">{adapterName}</p>
                                                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                                        adapter.available ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                                                    }`}>
                                                        {adapter.available ? "Ready" : "Missing"}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500 break-words">{adapter.detail}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Config Details */}
                                <div className="bg-white rounded-xl shadow-sm p-5">
                                    <h3 className="font-semibold text-gray-800 mb-3">Configuration</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                        <div className="bg-gray-50 rounded-lg p-3">
                                            <p className="text-gray-500 mb-1">Agent Mode</p>
                                            <p className="font-medium text-gray-800">{agentHealth.runtime?.agent_mode}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-3">
                                            <p className="text-gray-500 mb-1">Chat Model</p>
                                            <p className="font-medium text-gray-800">{agentHealth.runtime?.ollama?.chat_model}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-3">
                                            <p className="text-gray-500 mb-1">Embedding Model</p>
                                            <p className="font-medium text-gray-800">{agentHealth.runtime?.ollama?.embedding_model}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-3">
                                            <p className="text-gray-500 mb-1">Ollama URL</p>
                                            <p className="font-medium text-gray-800">{agentHealth.runtime?.ollama?.base_url}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-3">
                                            <p className="text-gray-500 mb-1">ChromaDB Path</p>
                                            <p className="font-medium text-gray-800">{agentHealth.runtime?.chroma?.persist_dir}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-3">
                                            <p className="text-gray-500 mb-1">Collections</p>
                                            <p className="font-medium text-gray-800">
                                                {agentHealth.runtime?.chroma?.student_patterns_collection}, {agentHealth.runtime?.chroma?.career_data_collection}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
