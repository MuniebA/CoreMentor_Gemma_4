// frontend/app/dashboard/teacher/page.tsx
"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getToken, getRole, getName, logout, authHeaders } from "../../../lib/auth";

const API_BASE = "http://127.0.0.1:8000/api/v1";

type PendingMark = {
    draft_id: string;
    student_id: string | null;
    initial_score: number;
    feedback_text: string;
    agent_log: string;
    status: string;
};

type Appeal = {
    appeal_id: string;
    student_note: string;
    current_score: number | null;
    agent_log: string | null;
};

type Submission = {
    submission_id: string;
    student_id: string;
    assignment_id: string;
    image_url: string | null;
    uploaded_at: string | null;
};

type PendingMarksResponse = {
    data?: PendingMark[];
};

type AppealsResponse = {
    count?: number;
    data?: Appeal[];
};

const subscribeToAuthStorage = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};

    window.addEventListener("storage", onStoreChange);
    return () => window.removeEventListener("storage", onStoreChange);
};

export default function TeacherDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("pending");
    const [pendingMarks, setPendingMarks] = useState<PendingMark[]>([]);
    const [appeals, setAppeals] = useState<Appeal[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [appealCount, setAppealCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [editScore, setEditScore] = useState<{ [key: string]: number }>({});
    const [editFeedback, setEditFeedback] = useState<{ [key: string]: string }>({});
    const [message, setMessage] = useState("");
    const name = useSyncExternalStore(subscribeToAuthStorage, getName, () => null);

    const fetchAll = async () => {
        setLoading(true);
        await Promise.all([
            fetchPendingMarks(),
            fetchAppeals(),
            fetchSubmissions()
        ]);
        setLoading(false);
    };

    const fetchPendingMarks = async () => {
        const res = await fetch(`${API_BASE}/marking/pending`, {
            headers: authHeaders()
        });
        const data: PendingMarksResponse = await res.json();
        setPendingMarks(Array.isArray(data.data) ? data.data : []);
    };

    const fetchAppeals = async () => {
        const res = await fetch(`${API_BASE}/marking/appeals/pending`, {
            headers: authHeaders()
        });
        const data: AppealsResponse = await res.json();
        setAppeals(Array.isArray(data.data) ? data.data : []);
        setAppealCount(data.count || 0);
    };

    const fetchSubmissions = async () => {
        const res = await fetch(`${API_BASE}/upload/all-submissions`, {
            headers: authHeaders()
        });
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : []);
    };

    const approveMark = async (draftId: string) => {
        const res = await fetch(`${API_BASE}/marking/${draftId}/approve`, {
            method: "PATCH",
            headers: authHeaders()
        });
        if (res.ok) {
            setMessage("Mark approved successfully!");
            fetchPendingMarks();
        }
    };

    const editAndApprove = async (draftId: string) => {
        const res = await fetch(`${API_BASE}/marking/${draftId}/edit-and-approve`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({
                new_score: editScore[draftId],
                feedback_text: editFeedback[draftId]
            })
        });
        if (res.ok) {
            setMessage("Mark edited and approved!");
            fetchPendingMarks();
        }
    };

    const resolveAppeal = async (appealId: string) => {
        const res = await fetch(`${API_BASE}/marking/appeals/${appealId}/resolve`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({
                new_score: editScore[appealId] || 0,
                feedback_text: editFeedback[appealId] || "Appeal reviewed by teacher."
            })
        });
        if (res.ok) {
            setMessage("Appeal resolved!");
            fetchAppeals();
        }
    };

    useEffect(() => {
        const role = getRole();
        if (!getToken() || role !== "Teacher") {
            router.push("/");
            return;
        }
        const timer = window.setTimeout(() => {
            fetchAll();
        }, 0);

        return () => window.clearTimeout(timer);
    }, []);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <p className="text-gray-500 text-lg">Loading dashboard...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Top Navigation Bar */}
            <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
                <h1 className="text-xl font-bold text-blue-600">CoreMentor</h1>
                <div className="flex items-center gap-4">
                    <span className="text-gray-600 text-sm">Welcome, {name}</span>
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">
                        Teacher
                    </span>
                    {appealCount > 0 && (
                        <button
                            onClick={() => setActiveTab("appeals")}
                            className="relative bg-red-500 text-white text-xs px-3 py-1 rounded-full font-medium hover:bg-red-600"
                        >
                            🔔 {appealCount} Appeal{appealCount > 1 ? "s" : ""}
                        </button>
                    )}
                    <button
                        onClick={logout}
                        className="text-sm text-red-500 hover:underline"
                    >
                        Logout
                    </button>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-8">
                {/* Success Message */}
                {message && (
                    <div className="bg-green-50 text-green-700 p-3 rounded-lg mb-4 text-sm">
                        {message}
                        <button onClick={() => setMessage("")} className="ml-4 text-green-500 hover:underline">
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Tab Navigation */}
                <div className="flex gap-2 mb-6 border-b border-gray-200">
                    {[
                        { key: "pending", label: "Pending Marks" },
                        { key: "appeals", label: `Appeals ${appealCount > 0 ? `(${appealCount})` : ""}` },
                        { key: "submissions", label: "All Submissions" }
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

                {/* Pending Marks Tab */}
                {activeTab === "pending" && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">
                            Pending Marks ({pendingMarks.length})
                        </h2>
                        {pendingMarks.length === 0 ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                No pending marks. All caught up! ✅
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {pendingMarks.map((mark) => (
                                    <div key={mark.draft_id} className="bg-white rounded-xl shadow-sm p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-sm text-gray-500">Draft ID</p>
                                                <p className="text-xs font-mono text-gray-700">{mark.draft_id}</p>
                                            </div>
                                            <span className="bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full font-medium">
                                                {mark.status}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <p className="text-sm text-gray-500">AI Score</p>
                                                <p className="text-2xl font-bold text-blue-600">{mark.initial_score}%</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Student ID</p>
                                                <p className="text-xs font-mono text-gray-700">{mark.student_id}</p>
                                            </div>
                                        </div>

                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500 mb-1">AI Feedback</p>
                                            <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">
                                                {mark.feedback_text}
                                            </p>
                                        </div>

                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500 mb-1">Agent Log</p>
                                            <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg font-mono">
                                                {mark.agent_log}
                                            </p>
                                        </div>

                                        {/* Edit Score & Feedback */}
                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">
                                                    Override Score (optional)
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    placeholder={String(mark.initial_score)}
                                                    onChange={(e) => setEditScore({
                                                        ...editScore,
                                                        [mark.draft_id]: parseFloat(e.target.value)
                                                    })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">
                                                    Override Feedback (optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Edit feedback..."
                                                    onChange={(e) => setEditFeedback({
                                                        ...editFeedback,
                                                        [mark.draft_id]: e.target.value
                                                    })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => approveMark(mark.draft_id)}
                                                className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600 transition"
                                            >
                                                ✓ Approve As Is
                                            </button>
                                            <button
                                                onClick={() => editAndApprove(mark.draft_id)}
                                                className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition"
                                            >
                                                ✎ Edit & Approve
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Appeals Tab */}
                {activeTab === "appeals" && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">
                            Student Appeals ({appeals.length})
                        </h2>
                        {appeals.length === 0 ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                No appeals to review ✅
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {appeals.map((appeal) => (
                                    <div key={appeal.appeal_id} className="bg-white rounded-xl shadow-sm p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-sm text-gray-500">Appeal ID</p>
                                                <p className="text-xs font-mono text-gray-700">{appeal.appeal_id}</p>
                                            </div>
                                            <span className="bg-orange-100 text-orange-700 text-xs px-3 py-1 rounded-full font-medium">
                                                Needs Review
                                            </span>
                                        </div>

                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500 mb-1">Student&apos;s Reasoning</p>
                                            <p className="text-sm text-gray-700 bg-orange-50 p-3 rounded-lg border border-orange-100">
                                                {appeal.student_note}
                                            </p>
                                        </div>

                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500 mb-1">Current Score</p>
                                            <p className="text-2xl font-bold text-blue-600">
                                                {appeal.current_score}%
                                            </p>
                                        </div>

                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500 mb-1">Agent Log (Why AI gave this mark)</p>
                                            <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg font-mono">
                                                {appeal.agent_log}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">
                                                    Final Score
                                                </label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    placeholder={String(appeal.current_score)}
                                                    onChange={(e) => setEditScore({
                                                        ...editScore,
                                                        [appeal.appeal_id]: parseFloat(e.target.value)
                                                    })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">
                                                    Final Feedback
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Write final feedback..."
                                                    onChange={(e) => setEditFeedback({
                                                        ...editFeedback,
                                                        [appeal.appeal_id]: e.target.value
                                                    })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => resolveAppeal(appeal.appeal_id)}
                                            className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition"
                                        >
                                            ✓ Resolve Appeal
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* All Submissions Tab */}
                {activeTab === "submissions" && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">
                            All Submissions ({submissions.length})
                        </h2>
                        {submissions.length === 0 ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                No submissions yet
                            </div>
                        ) : (
                            <div className="overflow-x-auto bg-white rounded-xl shadow-sm">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Submission ID</th>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Student ID</th>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Assignment ID</th>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Uploaded At</th>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Image</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {submissions.map((sub) => (
                                            <tr key={sub.submission_id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                                                    {sub.submission_id?.slice(0, 8)}...
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                                                    {sub.student_id?.slice(0, 8)}...
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                                                    {sub.assignment_id?.slice(0, 8)}...
                                                </td>
                                                <td className="px-4 py-3 text-gray-600">
                                                    {sub.uploaded_at
                                                        ? new Date(sub.uploaded_at).toLocaleDateString()
                                                        : "N/A"}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <a
                                                        href={`http://127.0.0.1:8000/${sub.image_url}`}
                                                        target="_blank"
                                                        className="text-blue-500 hover:underline text-xs"
                                                    >
                                                        View
                                                    </a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
