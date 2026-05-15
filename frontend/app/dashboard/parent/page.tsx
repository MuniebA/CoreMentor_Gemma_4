"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getToken, getRole, getName, logout, authHeaders } from "../../../lib/auth";

const API_BASE = "http://127.0.0.1:8000/api/v1";

type Child = {
    student_id: string;
    full_name: string;
    level: number;
    rank: string;
};

type ShadowMentor = {
    career_goal: string;
    root_cause_diagnosis: string | null;
    mentor_notes: string | null;
    ai_status: string;
};

type GradeData = Record<string, { total_weighted_score: number; total_weight: number }>;

const subscribeToAuthStorage = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("storage", onStoreChange);
    return () => window.removeEventListener("storage", onStoreChange);
};

export default function ParentDashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [children, setChildren] = useState<Child[]>([]);
    const [selectedChild, setSelectedChild] = useState<Child | null>(null);
    const [mentor, setMentor] = useState<ShadowMentor | null>(null);
    const [grades, setGrades] = useState<GradeData>({});

    const name = useSyncExternalStore(subscribeToAuthStorage, getName, () => null);

    const fetchChildren = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/insights/children`, { headers: authHeaders() });
            const data = await res.json();
            const list = Array.isArray(data) ? data : [];
            setChildren(list);
            if (list.length > 0) {
                setSelectedChild(list[0]);
                await loadChildData(list[0].student_id);
            }
        } catch { /* handled */ }
        setLoading(false);
    };

    const loadChildData = async (studentId: string) => {
        await Promise.all([fetchMentor(studentId), fetchGrades(studentId)]);
    };

    const fetchMentor = async (studentId: string) => {
        try {
            const res = await fetch(`${API_BASE}/insights/shadow-mentor/${studentId}`, { headers: authHeaders() });
            const data = await res.json();
            setMentor(data);
        } catch { setMentor(null); }
    };

    const fetchGrades = async (studentId: string) => {
        try {
            const res = await fetch(`${API_BASE}/insights/grades/${studentId}`, { headers: authHeaders() });
            const data = await res.json();
            setGrades(data || {});
        } catch { setGrades({}); }
    };

    useEffect(() => {
        const role = getRole();
        if (!getToken() || role !== "Parent") { router.push("/"); return; }
        const timer = window.setTimeout(() => {
            fetchChildren();
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
                    <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full font-medium">Parent</span>
                    <button onClick={logout} className="text-sm text-red-500 hover:underline">Logout</button>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Child Selector */}
                <div className="bg-white rounded-xl shadow-sm p-5 mb-6">
                    <label className="text-xs text-gray-500 mb-1 block">Select Child</label>
                    <select
                        value={selectedChild?.student_id || ""}
                        onChange={async (e) => {
                            const child = children.find(c => c.student_id === e.target.value);
                            if (child) {
                                setSelectedChild(child);
                                await loadChildData(child.student_id);
                            }
                        }}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        {children.map(c => (
                            <option key={c.student_id} value={c.student_id}>{c.full_name}</option>
                        ))}
                    </select>
                </div>

                {selectedChild && (
                    <div className="space-y-6">
                        {/* Child Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white rounded-xl shadow-sm p-5 text-center">
                                <p className="text-sm text-gray-500">Student</p>
                                <p className="text-lg font-bold text-gray-800">{selectedChild.full_name}</p>
                            </div>
                            <div className="bg-white rounded-xl shadow-sm p-5 text-center">
                                <p className="text-sm text-gray-500">Level</p>
                                <p className="text-2xl font-bold text-blue-600">{selectedChild.level}</p>
                            </div>
                            <div className="bg-white rounded-xl shadow-sm p-5 text-center">
                                <p className="text-sm text-gray-500">Rank</p>
                                <p className="text-lg font-bold text-purple-600">{selectedChild.rank}</p>
                            </div>
                        </div>

                        {/* Shadow Mentor Summary */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-lg font-semibold text-gray-800 mb-4">Shadow Mentor Summary</h2>
                            {mentor ? (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm text-gray-500">Career Goal</p>
                                            <p className="font-medium text-blue-600">{mentor.career_goal}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500">Analysis Status</p>
                                            <p className="text-sm text-gray-600">{mentor.ai_status}</p>
                                        </div>
                                    </div>
                                    {mentor.root_cause_diagnosis && (
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">Learning Diagnosis</p>
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
                            ) : (
                                <p className="text-sm text-gray-400">No mentor analysis available yet for this student.</p>
                            )}
                        </div>

                        {/* Grades */}
                        <div className="bg-white rounded-xl shadow-sm p-6">
                            <h2 className="text-lg font-semibold text-gray-800 mb-4">Weighted Grades</h2>
                            {Object.keys(grades).length === 0 ? (
                                <p className="text-sm text-gray-400">No graded assignments yet.</p>
                            ) : (
                                <div className="space-y-3">
                                    {Object.entries(grades).map(([unitId, data]) => {
                                        const pct = data.total_weight > 0
                                            ? Math.round(data.total_weighted_score / (data.total_weight / 100))
                                            : 0;
                                        return (
                                            <div key={unitId} className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                                                <div>
                                                    <p className="text-sm font-medium text-gray-700">Unit {unitId.slice(0, 8)}...</p>
                                                    <p className="text-xs text-gray-500">Weight assessed: {data.total_weight}%</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-2xl font-bold text-blue-600">{pct}%</p>
                                                    <p className="text-xs text-gray-500">weighted avg</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
