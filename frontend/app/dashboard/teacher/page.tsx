"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
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

type Unit = {
    id: string;
    unit_name: string;
    description?: string | null;
};

type OrchestrationResult = {
    run_id: string;
    workflow: string;
    status: string;
    selected_agents: string[];
    artifacts: Record<string, Record<string, unknown>>;
    persistence: Record<string, unknown>;
    audit_log: string[];
    errors: string[];
};

type AgentAudit = {
    student_id: string;
    agent_runs: { id: string; workflow: string; status: string; selected_agents: string[]; started_at: string | null; finished_at: string | null }[];
    agent_interactions: { id: string; agent_name: string; message_payload: Record<string, unknown>; timestamp: string | null }[];
    daily_homework_plans: { id: string; homework_recipe: Record<string, unknown>; is_completed: boolean; planned_for_date: string | null }[];
    marking_drafts: { id: string; submission_id: string; initial_score: number; status: string; confidence_score: number; agent_log: string }[];
};

type InsightChatSource = {
    id: string;
    kind: "postgres" | "chroma";
    title: string;
    summary: string;
};

type InsightChatResponse = {
    student_id: string;
    answer: string;
    confidence: "low" | "medium" | "high";
    recommended_next_steps: string[];
    source_ids_used: string[];
    sources: InsightChatSource[];
    limitations: string[];
    retrieval: Record<string, unknown>;
};

type InsightChatMessage = {
    role: "teacher" | "assistant";
    content: string;
    response?: InsightChatResponse;
};

const AGENT_META: Record<string, { label: string; color: string; desc: string }> = {
    grader: { label: "The Grader", color: "bg-green-50 border-green-200 text-green-800", desc: "First-pass homework marking with confidence scoring" },
    teacher_review: { label: "Teacher Review Gate", color: "bg-yellow-50 border-yellow-200 text-yellow-800", desc: "Human-in-the-loop approval boundary" },
    shadow_mentor: { label: "The Shadow Mentor", color: "bg-purple-50 border-purple-200 text-purple-800", desc: "Long-term learning pattern diagnosis" },
    load_balancer: { label: "The Load Balancer", color: "bg-blue-50 border-blue-200 text-blue-800", desc: "Daily homework recipe generator" },
    career_architect: { label: "The Career Architect", color: "bg-indigo-50 border-indigo-200 text-indigo-800", desc: "Career-themed task transformation" },
    gamification: { label: "Gamification Coach", color: "bg-pink-50 border-pink-200 text-pink-800", desc: "XP and rank recommendations" },
};

const subscribeToAuthStorage = (onStoreChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("storage", onStoreChange);
    return () => window.removeEventListener("storage", onStoreChange);
};

export default function TeacherDashboard() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState("units");
    const [pendingMarks, setPendingMarks] = useState<PendingMark[]>([]);
    const [appeals, setAppeals] = useState<Appeal[]>([]);
    const [submissions, setSubmissions] = useState<Submission[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [appealCount, setAppealCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [editScore, setEditScore] = useState<Record<string, number>>({});
    const [editFeedback, setEditFeedback] = useState<Record<string, string>>({});
    const [message, setMessage] = useState("");

    const [agentResult, setAgentResult] = useState<OrchestrationResult | null>(null);
    const [agentAudit, setAgentAudit] = useState<AgentAudit | null>(null);
    const [selectedSubmissionId, setSelectedSubmissionId] = useState("");
    const [agentLoading, setAgentLoading] = useState(false);
    const [agentError, setAgentError] = useState("");
    const [chatQuestion, setChatQuestion] = useState("");
    const [chatMessages, setChatMessages] = useState<InsightChatMessage[]>([]);
    const [chatResult, setChatResult] = useState<InsightChatResponse | null>(null);
    const [chatLoading, setChatLoading] = useState(false);
    const [chatError, setChatError] = useState("");

    const name = useSyncExternalStore(subscribeToAuthStorage, getName, () => null);
    const selectedSubmission = submissions.find(s => s.submission_id === selectedSubmissionId) || submissions[0];

    const fetchAll = async () => {
        setLoading(true);
        await Promise.all([fetchUnits(), fetchPendingMarks(), fetchAppeals(), fetchSubmissions()]);
        setLoading(false);
    };

    const fetchUnits = async () => {
        const res = await fetch(`${API_BASE}/units/`, { headers: authHeaders() });
        const data = await res.json();
        setUnits(Array.isArray(data) ? data : []);
    };

    const fetchPendingMarks = async () => {
        const res = await fetch(`${API_BASE}/marking/pending`, { headers: authHeaders() });
        const data = await res.json();
        setPendingMarks(Array.isArray(data.data) ? data.data : []);
    };

    const fetchAppeals = async () => {
        const res = await fetch(`${API_BASE}/marking/appeals/pending`, { headers: authHeaders() });
        const data = await res.json();
        setAppeals(Array.isArray(data.data) ? data.data : []);
        setAppealCount(data.count || 0);
    };

    const fetchSubmissions = async () => {
        const res = await fetch(`${API_BASE}/upload/all-submissions`, { headers: authHeaders() });
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setSubmissions(list);
        setSelectedSubmissionId(current => current || list[0]?.submission_id || "");
    };

    const fetchAgentAudit = async (studentId: string) => {
        if (!studentId) return;
        const res = await fetch(`${API_BASE}/orchestration/audit/${studentId}`, { headers: authHeaders() });
        setAgentAudit(await res.json());
    };

    const runAgentWorkflow = async (workflow: "grade_submission" | "student_support" | "career_lens" | "daily_plan") => {
        if (!selectedSubmission) { setAgentError("Select a submission first."); return; }
        setAgentLoading(true);
        setAgentError("");
        try {
            const payload = {
                workflow,
                submission_id: workflow === "grade_submission" ? selectedSubmission.submission_id : undefined,
                student_id: selectedSubmission.student_id,
                assignment_id: workflow === "career_lens" ? selectedSubmission.assignment_id : undefined,
                persist: true,
                teacher_review_required: true,
            };
            const res = await fetch(`${API_BASE}/orchestration/run`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) { setAgentError(data.detail ? JSON.stringify(data.detail) : "Workflow failed"); return; }
            setAgentResult(data);
            await Promise.all([fetchPendingMarks(), fetchAgentAudit(selectedSubmission.student_id)]);
            setMessage(`Workflow completed: ${data.workflow} (${data.status})`);
        } finally { setAgentLoading(false); }
    };

    const askInsightChat = async () => {
        const question = chatQuestion.trim();
        if (!selectedSubmission) { setChatError("Select a student from a submission first."); return; }
        if (!question) { setChatError("Write a question first."); return; }

        setChatLoading(true);
        setChatError("");
        try {
            const res = await fetch(`${API_BASE}/orchestration/chat/student`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({
                    student_id: selectedSubmission.student_id,
                    question,
                    conversation: chatMessages.slice(-6).map(message => ({
                        role: message.role,
                        content: message.content,
                    })),
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setChatError(data.detail ? JSON.stringify(data.detail) : "Insight chat failed.");
                return;
            }
            const response = data as InsightChatResponse;
            setChatResult(response);
            setChatMessages(current => [
                ...current,
                { role: "teacher", content: question },
                { role: "assistant", content: response.answer, response },
            ]);
            setChatQuestion("");
            if (agentAudit) await fetchAgentAudit(selectedSubmission.student_id);
        } finally {
            setChatLoading(false);
        }
    };

    const approveMark = async (draftId: string) => {
        const res = await fetch(`${API_BASE}/marking/${draftId}/approve`, { method: "PATCH", headers: authHeaders() });
        if (res.ok) { setMessage("Mark approved!"); fetchPendingMarks(); }
    };

    const editAndApprove = async (draftId: string) => {
        const res = await fetch(`${API_BASE}/marking/${draftId}/edit-and-approve`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ new_score: editScore[draftId], feedback_text: editFeedback[draftId] }),
        });
        if (res.ok) { setMessage("Mark edited and approved!"); fetchPendingMarks(); }
    };

    const resolveAppeal = async (appealId: string) => {
        const res = await fetch(`${API_BASE}/marking/appeals/${appealId}/resolve`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ new_score: editScore[appealId] || 0, feedback_text: editFeedback[appealId] || "Appeal reviewed." }),
        });
        if (res.ok) { setMessage("Appeal resolved!"); fetchAppeals(); }
    };

    useEffect(() => {
        if (!getToken() || getRole() !== "Teacher") { router.push("/"); return; }
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
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">Teacher</span>
                    {appealCount > 0 && (
                        <button onClick={() => setActiveTab("appeals")} className="relative bg-red-500 text-white text-xs px-3 py-1 rounded-full font-medium hover:bg-red-600">
                            {appealCount} Appeal{appealCount > 1 ? "s" : ""}
                        </button>
                    )}
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
                        { key: "units", label: "My Units" },
                        { key: "pending", label: "Pending Marks" },
                        { key: "appeals", label: `Appeals ${appealCount > 0 ? `(${appealCount})` : ""}` },
                        { key: "submissions", label: "All Submissions" },
                        { key: "orchestration", label: "Agent Orchestration" },
                        { key: "insight-chat", label: "Insight Chat" },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                                activeTab === tab.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Teacher Units */}
                {activeTab === "units" && (
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-gray-800">Your Units</h2>
                        {units.length === 0 ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                No units assigned yet. An admin can create units and assign them to you.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {units.map(unit => (
                                    <Link href={`/dashboard/teacher/unit/${unit.id}`} key={unit.id} className="bg-white rounded-xl shadow-sm p-5 hover:shadow-md border border-gray-100 transition">
                                        <p className="font-semibold text-gray-800">{unit.unit_name}</p>
                                        <p className="text-sm text-gray-500 mt-2 line-clamp-3">{unit.description || "No description provided."}</p>
                                        <p className="text-xs text-blue-600 mt-4 font-medium">Manage unit &rarr;</p>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Pending Marks ── */}
                {activeTab === "pending" && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Pending Marks ({pendingMarks.length})</h2>
                        {pendingMarks.length === 0 ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">No pending marks. All caught up!</div>
                        ) : (
                            <div className="space-y-4">
                                {pendingMarks.map(mark => (
                                    <div key={mark.draft_id} className="bg-white rounded-xl shadow-sm p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-sm text-gray-500">Draft ID</p>
                                                <p className="text-xs font-mono text-gray-700">{mark.draft_id}</p>
                                            </div>
                                            <span className="bg-yellow-100 text-yellow-700 text-xs px-3 py-1 rounded-full font-medium">{mark.status}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <p className="text-sm text-gray-500">AI Score</p>
                                                <p className="text-2xl font-bold text-blue-600">{mark.initial_score}%</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500">Student</p>
                                                <p className="text-xs font-mono text-gray-700">{mark.student_id?.slice(0, 12)}...</p>
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500 mb-1">AI Feedback</p>
                                            <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{mark.feedback_text}</p>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500 mb-1">Agent Log</p>
                                            <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg font-mono">{mark.agent_log}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">Override Score</label>
                                                <input type="number" min="0" max="100" placeholder={String(mark.initial_score)}
                                                    onChange={e => setEditScore({ ...editScore, [mark.draft_id]: parseFloat(e.target.value) })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">Override Feedback</label>
                                                <input type="text" placeholder="Edit feedback..."
                                                    onChange={e => setEditFeedback({ ...editFeedback, [mark.draft_id]: e.target.value })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <button onClick={() => approveMark(mark.draft_id)} className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600 transition">Approve As Is</button>
                                            <button onClick={() => editAndApprove(mark.draft_id)} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition">Edit & Approve</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Appeals ── */}
                {activeTab === "appeals" && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">Student Appeals ({appeals.length})</h2>
                        {appeals.length === 0 ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">No appeals to review</div>
                        ) : (
                            <div className="space-y-4">
                                {appeals.map(appeal => (
                                    <div key={appeal.appeal_id} className="bg-white rounded-xl shadow-sm p-6">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-sm text-gray-500">Appeal ID</p>
                                                <p className="text-xs font-mono text-gray-700">{appeal.appeal_id}</p>
                                            </div>
                                            <span className="bg-orange-100 text-orange-700 text-xs px-3 py-1 rounded-full font-medium">Needs Review</span>
                                        </div>
                                        <div className="mb-4">
                                            <p className="text-sm text-gray-500 mb-1">Student&apos;s Reasoning</p>
                                            <p className="text-sm text-gray-700 bg-orange-50 p-3 rounded-lg border border-orange-100">{appeal.student_note}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <p className="text-sm text-gray-500">Current Score</p>
                                                <p className="text-2xl font-bold text-blue-600">{appeal.current_score}%</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-gray-500 mb-1">Agent Log</p>
                                                <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg font-mono">{appeal.agent_log}</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 mb-4">
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">Final Score</label>
                                                <input type="number" min="0" max="100" placeholder={String(appeal.current_score)}
                                                    onChange={e => setEditScore({ ...editScore, [appeal.appeal_id]: parseFloat(e.target.value) })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-500 mb-1 block">Final Feedback</label>
                                                <input type="text" placeholder="Write final feedback..."
                                                    onChange={e => setEditFeedback({ ...editFeedback, [appeal.appeal_id]: e.target.value })}
                                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                            </div>
                                        </div>
                                        <button onClick={() => resolveAppeal(appeal.appeal_id)} className="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600 transition">Resolve Appeal</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── All Submissions ── */}
                {activeTab === "submissions" && (
                    <div>
                        <h2 className="text-lg font-semibold text-gray-800 mb-4">All Submissions ({submissions.length})</h2>
                        {submissions.length === 0 ? (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">No submissions yet</div>
                        ) : (
                            <div className="overflow-x-auto bg-white rounded-xl shadow-sm">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Submission</th>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Student</th>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Assignment</th>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Uploaded</th>
                                            <th className="text-left px-4 py-3 text-gray-500 font-medium">Image</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {submissions.map(sub => (
                                            <tr key={sub.submission_id} className="hover:bg-gray-50">
                                                <td className="px-4 py-3 font-mono text-xs text-gray-600">{sub.submission_id?.slice(0, 8)}...</td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-600">{sub.student_id?.slice(0, 8)}...</td>
                                                <td className="px-4 py-3 font-mono text-xs text-gray-600">{sub.assignment_id?.slice(0, 8)}...</td>
                                                <td className="px-4 py-3 text-gray-600">{sub.uploaded_at ? new Date(sub.uploaded_at).toLocaleDateString() : "N/A"}</td>
                                                <td className="px-4 py-3">
                                                    <a href={`http://127.0.0.1:8000/${sub.image_url}`} target="_blank" className="text-blue-500 hover:underline text-xs">View</a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Agent Orchestration ── */}
                {activeTab === "orchestration" && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800 mb-1">Agent Orchestration</h2>
                            <p className="text-sm text-gray-500">
                                Run the LangGraph mesh coordinator against real submissions. Each agent produces a separate artifact.
                            </p>
                        </div>

                        {agentError && (
                            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{agentError}</div>
                        )}

                        {/* Submission Picker + Workflow Buttons */}
                        <div className="bg-white rounded-xl shadow-sm p-5">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                                <div className="lg:col-span-2">
                                    <label className="text-xs text-gray-500 mb-1 block">Target Submission</label>
                                    <select
                                        value={selectedSubmission?.submission_id || ""}
                                        onChange={e => {
                                            const next = submissions.find(s => s.submission_id === e.target.value);
                                            setSelectedSubmissionId(e.target.value);
                                            setAgentAudit(null);
                                            setChatMessages([]);
                                            setChatResult(null);
                                            setChatError("");
                                            if (next) fetchAgentAudit(next.student_id);
                                        }}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {submissions.map(s => (
                                            <option key={s.submission_id} value={s.submission_id}>
                                                {s.submission_id.slice(0, 8)}... / student {s.student_id.slice(0, 8)}... / assignment {s.assignment_id.slice(0, 8)}...
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">Selected Student</label>
                                    <div className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-600">
                                        {selectedSubmission?.student_id || "None"}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <button onClick={() => runAgentWorkflow("grade_submission")} disabled={agentLoading || !selectedSubmission}
                                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
                                    Grade Submission
                                </button>
                                <button onClick={() => runAgentWorkflow("student_support")} disabled={agentLoading || !selectedSubmission}
                                    className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50">
                                    Student Support
                                </button>
                                <button onClick={() => runAgentWorkflow("daily_plan")} disabled={agentLoading || !selectedSubmission}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50">
                                    Daily Plan
                                </button>
                                <button onClick={() => runAgentWorkflow("career_lens")} disabled={agentLoading || !selectedSubmission}
                                    className="bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition disabled:opacity-50">
                                    Career Lens
                                </button>
                            </div>
                        </div>

                        {/* Per-Agent Artifact Cards */}
                        {agentResult && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-800">
                                        Run: {agentResult.workflow}
                                        <span className={`ml-2 text-xs px-2 py-1 rounded-full font-medium ${
                                            agentResult.status === "completed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                                        }`}>
                                            {agentResult.status}
                                        </span>
                                    </h3>
                                    <div className="flex gap-2">
                                        {agentResult.selected_agents.map(agent => (
                                            <span key={agent} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full">{agent}</span>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {Object.entries(agentResult.artifacts).map(([key, artifact]) => {
                                        const meta = AGENT_META[key] || { label: key, color: "bg-gray-50 border-gray-200 text-gray-800", desc: "" };
                                        return (
                                            <div key={key} className={`rounded-xl border p-5 ${meta.color}`}>
                                                <div className="flex items-start justify-between mb-3">
                                                    <div>
                                                        <h4 className="font-semibold text-sm">{meta.label}</h4>
                                                        <p className="text-xs opacity-70">{meta.desc}</p>
                                                    </div>
                                                </div>
                                                <AgentArtifactView agentKey={key} artifact={artifact} />
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Audit Log */}
                                <div className="bg-white rounded-xl shadow-sm p-5">
                                    <h3 className="font-semibold text-gray-800 mb-3">Audit Log</h3>
                                    <div className="space-y-1">
                                        {agentResult.audit_log.map((entry, i) => (
                                            <p key={i} className="text-xs text-gray-600 font-mono bg-gray-50 px-3 py-1 rounded">{entry}</p>
                                        ))}
                                    </div>
                                </div>

                                {agentResult.errors.length > 0 && (
                                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                        <h4 className="text-sm font-semibold text-red-700 mb-2">Errors</h4>
                                        {agentResult.errors.map((err, i) => (
                                            <p key={i} className="text-xs text-red-600">{err}</p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Database Persistence Audit */}
                        {agentAudit && (
                            <div className="bg-white rounded-xl shadow-sm p-5">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h3 className="font-semibold text-gray-800">Persisted Data</h3>
                                        <p className="text-xs text-gray-500">Rows written to agent_runs, agent_interactions, daily_homework_plans, ai_marking_drafts</p>
                                    </div>
                                    <button
                                        onClick={() => selectedSubmission && fetchAgentAudit(selectedSubmission.student_id)}
                                        className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-900 transition"
                                    >
                                        Refresh
                                    </button>
                                </div>
                                <div className="grid grid-cols-4 gap-3 mb-4">
                                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                                        <p className="text-xl font-bold text-blue-600">{agentAudit.agent_runs?.length || 0}</p>
                                        <p className="text-xs text-gray-500">Runs</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                                        <p className="text-xl font-bold text-blue-600">{agentAudit.agent_interactions.length}</p>
                                        <p className="text-xs text-gray-500">Agent Logs</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                                        <p className="text-xl font-bold text-blue-600">{agentAudit.daily_homework_plans.length}</p>
                                        <p className="text-xs text-gray-500">HW Plans</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3 text-center">
                                        <p className="text-xl font-bold text-blue-600">{agentAudit.marking_drafts.length}</p>
                                        <p className="text-xs text-gray-500">Drafts</p>
                                    </div>
                                </div>
                                <pre className="bg-gray-900 text-gray-100 text-xs rounded-lg p-3 overflow-auto max-h-64">
                                    {JSON.stringify(agentAudit, null, 2)}
                                </pre>
                            </div>
                        )}

                        {!agentResult && !agentAudit && (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                Select a submission and run an agent workflow to see per-agent artifacts and database persistence.
                            </div>
                        )}
                    </div>
                )}

                {/* Student Insight Chat */}
                {activeTab === "insight-chat" && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-gray-800 mb-1">Student Insight Chat</h2>
                            <p className="text-sm text-gray-500">
                                Ask questions using the selected student&apos;s Postgres records and Chroma pattern memory.
                            </p>
                        </div>

                        {chatError && (
                            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{chatError}</div>
                        )}

                        <div className="bg-white rounded-xl shadow-sm p-5">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                                <div className="lg:col-span-2">
                                    <label className="text-xs text-gray-500 mb-1 block">Target Student From Submission</label>
                                    <select
                                        value={selectedSubmission?.submission_id || ""}
                                        onChange={e => {
                                            const next = submissions.find(s => s.submission_id === e.target.value);
                                            setSelectedSubmissionId(e.target.value);
                                            setChatMessages([]);
                                            setChatResult(null);
                                            setChatError("");
                                            setAgentAudit(null);
                                            if (next) fetchAgentAudit(next.student_id);
                                        }}
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        {submissions.map(s => (
                                            <option key={s.submission_id} value={s.submission_id}>
                                                student {s.student_id.slice(0, 8)}... / submission {s.submission_id.slice(0, 8)}...
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 mb-1 block">Student ID</label>
                                    <div className="border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-600">
                                        {selectedSubmission?.student_id || "None"}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <textarea
                                    value={chatQuestion}
                                    onChange={e => setChatQuestion(e.target.value)}
                                    placeholder="Ask: What is this student struggling with most, and what should I do next?"
                                    className="w-full min-h-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        "What patterns explain this student's recent performance?",
                                        "Which skills should I review with this student first?",
                                        "What does the RAG memory say about repeated mistakes?",
                                    ].map(prompt => (
                                        <button
                                            key={prompt}
                                            onClick={() => setChatQuestion(prompt)}
                                            className="bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-xs hover:bg-gray-200 transition"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={askInsightChat}
                                    disabled={chatLoading || !selectedSubmission}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                    {chatLoading ? "Thinking..." : "Ask Insight Chat"}
                                </button>
                            </div>
                        </div>

                        {chatMessages.length > 0 && (
                            <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
                                <h3 className="font-semibold text-gray-800">Conversation</h3>
                                {chatMessages.map((chatMessage, index) => (
                                    <div key={index} className={`rounded-lg p-4 ${
                                        chatMessage.role === "teacher" ? "bg-blue-50" : "bg-gray-50"
                                    }`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                                {chatMessage.role === "teacher" ? "Teacher" : "CoreMentor Insight"}
                                            </p>
                                            {chatMessage.response && (
                                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                                    chatMessage.response.confidence === "high" ? "bg-green-100 text-green-700" :
                                                    chatMessage.response.confidence === "medium" ? "bg-yellow-100 text-yellow-700" :
                                                    "bg-gray-200 text-gray-700"
                                                }`}>
                                                    {chatMessage.response.confidence} confidence
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{chatMessage.content}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {chatResult && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="bg-white rounded-xl shadow-sm p-5">
                                    <h3 className="font-semibold text-gray-800 mb-3">Recommended Next Steps</h3>
                                    <div className="space-y-2">
                                        {chatResult.recommended_next_steps.map((step, index) => (
                                            <p key={index} className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{step}</p>
                                        ))}
                                    </div>
                                </div>
                                <div className="bg-white rounded-xl shadow-sm p-5">
                                    <h3 className="font-semibold text-gray-800 mb-3">Retrieved Evidence</h3>
                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                                            <p className="text-lg font-bold text-blue-600">{String(chatResult.retrieval.postgres_source_count || 0)}</p>
                                            <p className="text-xs text-gray-500">Postgres</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                                            <p className="text-lg font-bold text-blue-600">{String(chatResult.retrieval.chroma_memory_count || 0)}</p>
                                            <p className="text-xs text-gray-500">Chroma</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                                            <p className="text-lg font-bold text-blue-600">{chatResult.source_ids_used.length}</p>
                                            <p className="text-xs text-gray-500">Cited</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2 max-h-80 overflow-auto">
                                        {chatResult.sources.map(source => (
                                            <div key={source.id} className={`border rounded-lg p-3 ${
                                                chatResult.source_ids_used.includes(source.id) ? "border-blue-200 bg-blue-50" : "border-gray-200"
                                            }`}>
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-xs font-semibold text-gray-700">{source.title}</p>
                                                    <span className="text-[11px] uppercase text-gray-500">{source.kind}</span>
                                                </div>
                                                <p className="text-xs text-gray-600">{source.summary}</p>
                                                <p className="text-[11px] text-gray-400 mt-1 font-mono">{source.id}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                {chatResult.limitations.length > 0 && (
                                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 lg:col-span-2">
                                        <h3 className="font-semibold text-yellow-800 mb-2">Limitations</h3>
                                        <div className="space-y-1">
                                            {chatResult.limitations.map((item, index) => (
                                                <p key={index} className="text-sm text-yellow-700">{item}</p>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {!chatResult && chatMessages.length === 0 && (
                            <div className="bg-white rounded-xl p-8 text-center text-gray-400 shadow-sm">
                                Select a student and ask a question to retrieve Postgres context plus Chroma pattern memory.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function AgentArtifactView({ agentKey, artifact }: { agentKey: string; artifact: Record<string, unknown> }) {
    if (agentKey === "grader") {
        const agentLog = asRecord(artifact.agent_log);
        const parsedSubmission = asRecord(agentLog.parsed_submission);
        const imageDescriptions = Array.isArray(parsedSubmission.image_descriptions)
            ? parsedSubmission.image_descriptions.map(item => asRecord(item))
            : [];
        const imageErrors = Array.isArray(parsedSubmission.image_errors)
            ? parsedSubmission.image_errors.map(String)
            : [];
        const textDetail = String(parsedSubmission.text_detail || "");
        const textPreview = String(parsedSubmission.text_preview || "");
        const imageDetail = String(parsedSubmission.image_detail || "");
        const visionModel = String(parsedSubmission.vision_model || "");
        return (
            <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-gray-600">Score</span>
                    <span className="font-bold">{String(artifact.initial_score ?? "N/A")}%</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Confidence</span>
                    <span className="font-bold">{String(artifact.confidence_score ?? "N/A")}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Status</span>
                    <span className="font-medium">{String(artifact.status)}</span>
                </div>
                {Array.isArray(artifact.mistake_patterns) && artifact.mistake_patterns.length > 0 && (
                    <div>
                        <p className="text-xs text-gray-500 mb-1">Mistake Patterns</p>
                        <div className="flex flex-wrap gap-1">
                            {(artifact.mistake_patterns as string[]).map((p, i) => (
                                <span key={i} className="bg-white bg-opacity-60 text-xs px-2 py-0.5 rounded-full">{p}</span>
                            ))}
                        </div>
                    </div>
                )}
                {artifact.feedback_text != null && <p className="text-xs opacity-80 italic">{String(artifact.feedback_text)}</p>}
                {(textDetail || imageDetail || imageDescriptions.length > 0) && (
                    <div className="mt-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-600">Parsed Evidence</p>
                        {textDetail && (
                            <div className="bg-white bg-opacity-70 rounded-lg p-2">
                                <p className="text-[11px] font-semibold text-gray-500 mb-1">Docling Text</p>
                                <p className="text-xs text-gray-700">{textDetail}</p>
                                {textPreview && (
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-3">{textPreview}</p>
                                )}
                            </div>
                        )}
                        {imageDetail && (
                            <div className="bg-white bg-opacity-70 rounded-lg p-2">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-[11px] font-semibold text-gray-500">Image Description</p>
                                    {visionModel && (
                                        <span className="text-[10px] text-gray-500">{visionModel}</span>
                                    )}
                                </div>
                                <p className="text-xs text-gray-700">{imageDetail}</p>
                                <div className="space-y-1 mt-2">
                                    {imageDescriptions.map((item, index) => (
                                        <p key={index} className="text-xs text-gray-600">
                                            <span className="font-medium">{String(item.file_name || `Image ${index + 1}`)}:</span> {String(item.description || "")}
                                        </p>
                                    ))}
                                </div>
                                {imageErrors.length > 0 && (
                                    <p className="text-xs text-red-600 mt-2">{imageErrors.join("; ")}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    if (agentKey === "shadow_mentor") {
        return (
            <div className="space-y-2 text-sm">
                {artifact.average_score != null && (
                    <div className="flex justify-between">
                        <span className="text-gray-600">Avg Score</span>
                        <span className="font-bold">{String(artifact.average_score)}</span>
                    </div>
                )}
                <p className="text-xs opacity-80">{String(artifact.root_cause_diagnosis || "")}</p>
                {Array.isArray(artifact.priority_subjects) && (
                    <div className="space-y-1">
                        {(artifact.priority_subjects as { subject: string; skill: string; priority: string }[]).map((s, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    s.priority === "high" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"
                                }`}>
                                    {s.priority}
                                </span>
                                <span className="text-xs">{s.subject}: {s.skill}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (agentKey === "load_balancer") {
        const blocks = (artifact.blocks || []) as { name: string; minutes: number; purpose: string }[];
        return (
            <div className="space-y-2 text-sm">
                {artifact.total_minutes != null && (
                    <div className="flex justify-between">
                        <span className="text-gray-600">Total Time</span>
                        <span className="font-bold">{String(artifact.total_minutes)} min</span>
                    </div>
                )}
                {blocks.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <span className="bg-white bg-opacity-60 text-xs font-bold px-2 py-0.5 rounded-full">{b.minutes}m</span>
                        <span className="text-xs"><strong>{b.name}:</strong> {b.purpose}</span>
                    </div>
                ))}
            </div>
        );
    }

    if (agentKey === "career_architect") {
        return (
            <div className="space-y-2 text-sm">
                <p className="font-medium">{String(artifact.themed_title || "")}</p>
                <p className="text-xs opacity-80">{String(artifact.career_context || "")}</p>
                {Array.isArray(artifact.themed_instructions) && (
                    <ol className="list-decimal list-inside space-y-1">
                        {(artifact.themed_instructions as string[]).map((inst, i) => (
                            <li key={i} className="text-xs">{inst}</li>
                        ))}
                    </ol>
                )}
            </div>
        );
    }

    if (agentKey === "gamification") {
        return (
            <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-gray-600">Current XP</span>
                    <span className="font-bold">{String(artifact.current_xp)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Rank</span>
                    <span className="font-bold">{String(artifact.rank_title)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-600">Recommended Award</span>
                    <span className="font-bold text-green-700">+{String(artifact.recommended_xp_award)} XP</span>
                </div>
                <p className="text-xs opacity-80 italic">{String(artifact.reason || "")}</p>
            </div>
        );
    }

    if (agentKey === "teacher_review") {
        return (
            <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                    <span className="text-gray-600">Requires Review</span>
                    <span className="font-bold">{artifact.requires_teacher_review ? "Yes" : "No"}</span>
                </div>
                <p className="text-xs opacity-80 italic">{String(artifact.message || "")}</p>
            </div>
        );
    }

    return (
        <pre className="text-xs overflow-auto max-h-32 bg-white bg-opacity-40 rounded p-2">
            {JSON.stringify(artifact, null, 2)}
        </pre>
    );
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}
