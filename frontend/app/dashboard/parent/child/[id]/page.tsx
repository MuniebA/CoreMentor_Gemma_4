// frontend/app/dashboard/parent/child/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import Link from "next/link";

const TABS = ["Learning Path", "Master Gradebook", "AI Insights"];

export default function ChildDashboard() {
    const params = useParams();
    const router = useRouter();
    const studentId = params.id as string;

    const [activeTab, setActiveTab] = useState("Learning Path");
    const [loading, setLoading] = useState(true);
    
    const [studentInfo, setStudentInfo] = useState<any>(null);
    const [enrolledUnits, setEnrolledUnits] = useState<any[]>([]);
    const [gradebook, setGradebook] = useState<any>(null);

    useEffect(() => {
        fetchChildData();
    }, [studentId]);

    const fetchChildData = async () => {
        const token = Cookies.get("token");
        if (!token) return router.push("/login");

        try {
            // Fetch all required data concurrently
            const [infoRes, unitsRes, gradesRes] = await Promise.all([
                fetch(`http://127.0.0.1:8000/api/v1/insights/shadow-mentor/${studentId}`, { headers: { "Authorization": `Bearer ${token}` } }),
                fetch(`http://127.0.0.1:8000/api/v1/units/student/${studentId}/enrolled`, { headers: { "Authorization": `Bearer ${token}` } }),
                fetch(`http://127.0.0.1:8000/api/v1/insights/grades/${studentId}`, { headers: { "Authorization": `Bearer ${token}` } })
            ]);

            if (infoRes.ok) setStudentInfo(await infoRes.json());
            if (unitsRes.ok) setEnrolledUnits(await unitsRes.json());
            if (gradesRes.ok) setGradebook(await gradesRes.json());

        } catch (err) {
            console.error("Failed to load child data", err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading student records...</div>;
    if (!studentInfo) return <div className="min-h-screen bg-slate-50 p-8 text-red-500">Student not found.</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Header & Breadcrumb */}
            <div className="bg-white border-b border-slate-200 px-8 py-6 flex justify-between items-end shadow-sm">
                <div>
                    <Link href="/dashboard/parent" className="text-sm text-blue-600 hover:underline mb-2 inline-block">
                        &larr; Back to Family Dashboard
                    </Link>
                    <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xl">
                            {studentInfo.full_name.charAt(0)}
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">{studentInfo.full_name}</h1>
                            <p className="text-sm font-bold text-amber-600 tracking-wide uppercase mt-1">
                                🏆 {studentInfo.rank_title} • Level {studentInfo.level} • {studentInfo.total_xp} XP
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="bg-white border-b border-slate-200 px-8">
                <div className="flex space-x-8 overflow-x-auto">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-4 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                                activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <main className="flex-grow max-w-6xl mx-auto w-full p-8">
                
                {/* --- TAB 1: LEARNING PATH (UNITS) --- */}
                {activeTab === "Learning Path" && (
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-slate-900 mb-4">Enrolled Classrooms</h2>
                        {enrolledUnits.length === 0 ? (
                            <div className="bg-white p-12 text-center rounded-xl border border-slate-200 border-dashed text-slate-500">
                                This student is not currently enrolled in any units.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {enrolledUnits.map((unit) => (
                                    <Link href={`/dashboard/parent/child/${studentId}/unit/${unit.id}`} key={unit.id} className="group block">
                                        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col h-full">
                                            <div className="flex-grow">
                                                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors mb-1">{unit.unit_name}</h3>
                                                <p className="text-xs text-slate-500 mb-3 uppercase tracking-wider">Instructor: {unit.teacher_name}</p>
                                                <p className="text-slate-600 text-sm line-clamp-3">{unit.description || "No description provided."}</p>
                                            </div>
                                            <div className="pt-4 mt-4 border-t border-slate-100 flex justify-between items-center text-xs font-bold text-blue-600 uppercase tracking-wider">
                                                <span>View Progress</span>
                                                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB 2: MASTER GRADEBOOK --- */}
                {activeTab === "Master Gradebook" && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Overall Academic Performance</h2>
                        <p className="text-sm text-slate-500 mb-8">Calculated based on all weighted coursework completed across all enrolled units.</p>
                        
                        {Object.keys(gradebook || {}).length === 0 ? (
                            <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-lg text-slate-500">
                                No graded coursework available yet to calculate performance.
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {Object.keys(gradebook).map((unitId) => {
                                    const unitStats = gradebook[unitId];
                                    const finalScore = unitStats.total_weight > 0 ? ((unitStats.total_weighted_score / unitStats.total_weight) * 100).toFixed(1) : "0.0";
                                    // Find unit name from enrolled units
                                    const unitName = enrolledUnits.find(u => u.id === unitId)?.unit_name || "Unknown Unit";

                                    return (
                                        <div key={unitId} className="flex items-center justify-between p-6 border border-slate-200 rounded-lg bg-slate-50">
                                            <div>
                                                <h3 className="font-bold text-lg text-slate-900">{unitName}</h3>
                                                <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Based on {unitStats.total_weight}% of syllabus</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-3xl font-bold text-blue-600">{finalScore}%</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB 3: AI INSIGHTS --- */}
                {activeTab === "AI Insights" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-indigo-50 rounded-xl border border-indigo-100 shadow-sm p-8">
                            <div className="flex items-center space-x-3 mb-6">
                                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                </div>
                                <h2 className="text-xl font-bold text-indigo-900">Shadow Mentor Diagnosis</h2>
                            </div>
                            
                            <div className="space-y-4">
                                <p className="text-sm font-bold text-indigo-800 uppercase tracking-wider">Root Cause Analysis</p>
                                <div className="bg-white p-5 rounded-lg border border-indigo-100 text-indigo-900 leading-relaxed shadow-sm">
                                    {studentInfo.root_cause_diagnosis ? (
                                        studentInfo.root_cause_diagnosis 
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-6 opacity-70">
                                            <span className="w-8 h-8 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin mb-3"></span>
                                            <p className="text-sm text-center">The Shadow Mentor is currently collecting more homework data to establish reliable mistake patterns. Check back in a few days.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-8">
                            <div>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Declared Career Path</h3>
                                <p className="text-lg font-medium text-slate-900 border-b border-slate-100 pb-4">
                                    {studentInfo.career_goal || "Student has not selected a path."}
                                </p>
                            </div>
                            
                            <div>
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Teacher's Private Notes</h3>
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 italic text-sm">
                                    {studentInfo.mentor_notes ? `"${studentInfo.mentor_notes}"` : "No notes logged by instructors."}
                                </div>
                                <p className="text-xs text-slate-400 mt-2">These notes are used by the AI to further personalize learning.</p>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}