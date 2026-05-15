"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getToken, getRole, getName, logout, authHeaders } from "../../../lib/auth";

const API_BASE = "http://127.0.0.1:8000/api/v1";

type Mark = {
    draft_id: string;
    assignment_id: string;
    score: number;
    feedback: string;
    status: string;
};

type Unit = {
    id: string;
    unit_name: string;
    description: string;
};

type Assignment = {
    id: string;
    title: string;
    type: string;
    due_date: string;
    is_weighted: boolean;
    weight_percentage: number;
};

type HWBlock = { name: string; minutes: number; purpose: string };
type HWPlan = {
    id: string;
    homework_recipe: {
        agent?: string;
        planned_for_date?: string;
        total_minutes?: number;
        blocks?: HWBlock[];
        homework_recipe?: Record<string, { minutes: number; focus: string }>;
        completion_signal?: string;
    };
    is_completed: boolean;
    planned_for_date: string | null;
};

type CareerLens = {
    original_title: string;
    themed_title: string;
    themed_instructions: string;
    career_context: string;
};

type ShadowMentor = {
    career_goal: string;
    root_cause_diagnosis: string | null;
    mentor_notes: string | null;
    ai_status: string;
};

type StudentStats = {
    level: number;
    xp: number;
    rank: string;
    next_level: number;
};

const subscribeToAuthStorage = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("storage", onStoreChange);
    return () => window.removeEventListener("storage", onStoreChange);
};

export default function StudentDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("quest");
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState("");

    const [marks, setMarks] = useState<Mark[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [hwPlan, setHwPlan] = useState<HWPlan | null>(null);
    const [stats, setStats] = useState<StudentStats | null>(null);
    const [mentor, setMentor] = useState<ShadowMentor | null>(null);
    const [careerLens, setCareerLens] = useState<CareerLens | null>(null);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [selectedUnitId, setSelectedUnitId] = useState("");
    const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
    const [appealNote, setAppealNote] = useState("");

    const name = useSyncExternalStore(subscribeToAuthStorage, getName, () => null);

    const fetchAll = async () => {
        setLoading(true);
        await Promise.all([fetchMarks(), fetchUnits(), fetchHWPlan(), fetchStats()]);
        setLoading(false);
    };

    const fetchMarks = async () => {
        try {
            const res = await fetch(`${API_BASE}/marking/my-marks`, { headers: authHeaders() });
            const data = await res.json();
            setMarks(Array.isArray(data.data) ? data.data : []);
        } catch { /* handled */ }
    };

    const fetchUnits = async () => {
        try {
            const res = await fetch(`${API_BASE}/units/`, { headers: authHeaders() });
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            setUnits(list);
            if (list.length > 0 && !selectedUnitId) setSelectedUnitId(list[0].id);
        } catch { /* handled */ }
    };

    const fetchHWPlan = async () => {
        try {
            const res = await fetch(`${API_BASE}/insights/hw-plan`, { headers: authHeaders() });
            const data = await res.json();
            if (data.id) setHwPlan(data);
        } catch { /* handled */ }
    };

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_BASE}/gamification/student/stats`, { headers: authHeaders() });
            const data = await res.json();
            setStats(data);
        } catch { /* handled */ }
    };

    const fetchMentor = async (studentId: string) => {
        try {
            const res = await fetch(`${API_BASE}/insights/shadow-mentor/${studentId}`, { headers: authHeaders() });
            const data = await res.json();
            setMentor(data);
        } catch { /* handled */ }
    };

    const fetchAssignments = async (unitId: string) => {
        try {
            const res = await fetch(`${API_BASE}/coursework/unit/${unitId}`, { headers: authHeaders() });
            const data = await res.json();
            setAssignments(Array.isArray(data) ? data : []);
        } catch { /* handled */ }
    };

    const fetchCareerLens = async (assignmentId: string) => {
        try {
            const res = await fetch(`${API_BASE}/gamification/career/lens/${assignmentId}`, { headers: authHeaders() });
            const data = await res.json();
            setCareerLens(data);
        } catch { /* handled */ }
    };

    const submitAppeal = async (markingId: string) => {
        if (!appealNote.trim()) return;
        const res = await fetch(`${API_BASE}/marking/appeal`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ marking_id: markingId, student_note: appealNote }),
        });
        if (res.ok) {
            setMessage("Appeal submitted successfully.");
            setAppealNote("");
        } else {
            const err = await res.json();
            setMessage(err.detail || "Appeal failed.");
        }
    };

    const uploadHomework = async (assignmentId: string, file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`${API_BASE}/upload/homework/${assignmentId}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getToken()}` },
            body: formData,
        });
        if (res.ok) {
            setMessage("Homework submitted!");
            fetchMarks();
        } else {
            const err = await res.json();
            setMessage(err.detail || "Upload failed.");
        }
    };

    useEffect(() => {
        const role = getRole();
        if (!getToken() || role !== "Student") { router.push("/"); return; }
        const timer = window.setTimeout(() => {
            fetchAll();
        }, 0);
        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!selectedUnitId) return;
        const timer = window.setTimeout(() => {
            fetchAssignments(selectedUnitId);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [selectedUnitId]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <p className="text-gray-500 text-lg">Loading dashboard...</p>
        </div>
    );

    const recipe = hwPlan?.homework_recipe;
    const blocks: HWBlock[] = recipe?.blocks || [];
    const recipeMap = recipe?.homework_recipe || {};

    return (
        <div className="min-h-screen bg-gray-50">
            <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
                <h1 className="text-xl font-bold text-blue-600">CoreMentor</h1>
                <div className="flex items-center gap-4">
                    <span className="text-gray-600 text-sm">Welcome, {name}</span>
                    {stats && (
                        <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full font-medium">
                            {stats.rank} &middot; Lv.{stats.level} &middot; {stats.xp} XP
                        </span>
                    )}
                    <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full font-medium">Student</span>
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
                        { key: "quest", label: "Daily Quest" },
                        { key: "coursework", label: "Coursework" },
                        { key: "marks", label: "My Marks" },
                        { key: "mentor", label: "Shadow Mentor" },
                        { key: "career", label: "Career Lens" },
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

                {/* ── Daily Quest (Load Balancer output) ── */}
                {activeTab === "quest" && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-gray-800">Today&apos;s Homework Plan</h2>
                        {!hwPlan ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                No plan generated yet. Complete more work for the AI to build your daily quest.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <p className="text-sm text-gray-500">
                                            Planned for {hwPlan.planned_for_date ? new Date(hwPlan.planned_for_date).toLocaleDateString() : "Today"}
                                        </p>
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                            hwPlan.is_completed ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                        }`}>
                                            {hwPlan.is_completed ? "Completed" : "In Progress"}
                                        </span>
                                    </div>

                                    {recipe?.total_minutes && (
                                        <p className="text-2xl font-bold text-blue-600 mb-4">{recipe.total_minutes} min total</p>
                                    )}

                                    {blocks.length > 0 && (
                                        <div className="space-y-3">
                                            {blocks.map((block, i) => (
                                                <div key={i} className="flex items-start gap-4 bg-gray-50 rounded-lg p-4">
                                                    <div className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mt-0.5">
                                                        {block.minutes}m
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-800">{block.name}</p>
                                                        <p className="text-sm text-gray-500">{block.purpose}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {Object.keys(recipeMap).length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                                            {Object.entries(recipeMap).map(([key, val]) => (
                                                <div key={key} className="border border-gray-200 rounded-lg p-3">
                                                    <p className="text-sm font-medium text-gray-700 capitalize">{key.replace(/_/g, " ")}</p>
                                                    <p className="text-xs text-gray-500">{val.minutes} min &middot; {val.focus}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {recipe?.completion_signal && (
                                        <p className="text-xs text-gray-400 mt-4 italic">Done when: {recipe.completion_signal}</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Coursework & Submissions ── */}
                {activeTab === "coursework" && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-gray-800">My Coursework</h2>

                        <div className="bg-white rounded-xl shadow-sm p-5">
                            <label className="text-xs text-gray-500 mb-1 block">Select Unit</label>
                            <select
                                value={selectedUnitId}
                                onChange={(e) => setSelectedUnitId(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {units.map(u => (
                                    <option key={u.id} value={u.id}>{u.unit_name}</option>
                                ))}
                            </select>
                        </div>

                        {assignments.length === 0 ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                No assignments for this unit yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {assignments.map(a => (
                                    <div key={a.id} className="bg-white rounded-xl shadow-sm p-5">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="font-medium text-gray-800">{a.title}</p>
                                                <p className="text-xs text-gray-500">{a.type} {a.is_weighted ? `(${a.weight_percentage}% weighted)` : ""}</p>
                                            </div>
                                            {a.due_date && (
                                                <span className="text-xs text-gray-400">
                                                    Due: {new Date(a.due_date).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-xs text-gray-500 mb-1 block">Upload Homework</label>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) uploadHomework(a.id, file);
                                                }}
                                                className="text-sm text-gray-600"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── My Marks & Appeals ── */}
                {activeTab === "marks" && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-gray-800">Approved Marks ({marks.length})</h2>
                        {marks.length === 0 ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                No approved marks yet. Marks appear after teacher review.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {marks.map(m => (
                                    <div key={m.draft_id} className="bg-white rounded-xl shadow-sm p-5">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-sm text-gray-500">Assignment</p>
                                                <p className="text-xs font-mono text-gray-700">{m.assignment_id.slice(0, 8)}...</p>
                                            </div>
                                            <p className="text-2xl font-bold text-blue-600">{m.score}%</p>
                                        </div>
                                        <div className="mb-3">
                                            <p className="text-sm text-gray-500 mb-1">Feedback</p>
                                            <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{m.feedback}</p>
                                        </div>
                                        <div className="border-t border-gray-100 pt-3">
                                            <p className="text-xs text-gray-500 mb-2">Disagree? Submit an appeal:</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Explain why you disagree..."
                                                    value={appealNote}
                                                    onChange={(e) => setAppealNote(e.target.value)}
                                                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                                <button
                                                    onClick={() => submitAppeal(m.draft_id)}
                                                    className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition"
                                                >
                                                    Appeal
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Shadow Mentor ── */}
                {activeTab === "mentor" && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-semibold text-gray-800">Shadow Mentor Analysis</h2>
                            <button
                                onClick={async () => {
                                    const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
                                    const me = await res.json();
                                    if (me.user_id) {
                                        const profileRes = await fetch(`${API_BASE}/gamification/student/stats`, { headers: authHeaders() });
                                        if (profileRes.ok) {
                                            const stRes = await fetch(`${API_BASE}/insights/shadow-mentor/${me.user_id}`, { headers: authHeaders() });
                                            if (!stRes.ok) {
                                                const meRes = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
                                                const meData = await meRes.json();
                                                void meData;
                                            }
                                        }
                                    }
                                    fetchStats();
                                    const meRes2 = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
                                    const me2 = await meRes2.json();
                                    if (me2.user_id) fetchMentor(me2.user_id);
                                }}
                                className="bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 transition"
                            >
                                Refresh
                            </button>
                        </div>
                        {!mentor ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                <p className="mb-4">Click Refresh to load your learning analysis.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <p className="text-sm text-gray-500">Career Goal</p>
                                            <p className="text-lg font-bold text-blue-600">{mentor.career_goal}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">AI Status</p>
                                            <p className="text-sm text-gray-600">{mentor.ai_status}</p>
                                        </div>
                                    </div>
                                    {mentor.root_cause_diagnosis && (
                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500 mb-1">Root Cause Diagnosis</p>
                                            <p className="text-sm text-gray-700 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                                {mentor.root_cause_diagnosis}
                                            </p>
                                        </div>
                                    )}
                                    {mentor.mentor_notes && (
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">Mentor Notes</p>
                                            <div className="bg-gray-50 p-3 rounded-lg space-y-1">
                                                {mentor.mentor_notes.split("\n").map((note, i) => (
                                                    <p key={i} className="text-sm text-gray-700">{note}</p>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Career Lens (Career Architect) ── */}
                {activeTab === "career" && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-gray-800">Career Architect</h2>
                        <p className="text-sm text-gray-500">
                            Select an assignment to see how it connects to your career goal.
                        </p>

                        <div className="bg-white rounded-xl shadow-sm p-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">Unit</label>
                                    <select
                                        value={selectedUnitId}
                                        onChange={(e) => setSelectedUnitId(e.target.value)}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {units.map(u => (
                                            <option key={u.id} value={u.id}>{u.unit_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">Assignment</label>
                                    <select
                                        value={selectedAssignmentId}
                                        onChange={(e) => {
                                            setSelectedAssignmentId(e.target.value);
                                            if (e.target.value) fetchCareerLens(e.target.value);
                                        }}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">Choose an assignment...</option>
                                        {assignments.map(a => (
                                            <option key={a.id} value={a.id}>{a.title}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {careerLens && (
                            <div className="bg-white rounded-xl shadow-sm p-6">
                                <div className="mb-4">
                                    <p className="text-sm text-gray-500">Original Assignment</p>
                                    <p className="font-medium text-gray-700">{careerLens.original_title}</p>
                                </div>
                                <div className="mb-4">
                                    <p className="text-sm text-gray-500">Career-Themed Version</p>
                                    <p className="font-medium text-blue-700">{careerLens.themed_title}</p>
                                </div>
                                <div className="mb-4">
                                    <p className="text-sm text-gray-500 mb-1">Why This Matters</p>
                                    <p className="text-sm text-gray-700 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                        {careerLens.career_context}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-500 mb-1">Instructions</p>
                                    <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                                        {careerLens.themed_instructions}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
