// frontend/app/dashboard/parent/child/[id]/unit/[unit_id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import Link from "next/link";

const TABS = ["Overview", "Syllabus", "Announcements", "Lectures", "Coursework Log"];

export default function ParentUnitViewer() {
    const params = useParams();
    const router = useRouter();
    const studentId = params.id as string;
    const unitId = params.unit_id as string;

    const [activeTab, setActiveTab] = useState("Overview");
    const [loading, setLoading] = useState(true);
    
    const [unitHome, setUnitHome] = useState<any>(null);
    const [lectures, setLectures] = useState<any[]>([]);
    const [coursework, setCoursework] = useState<any[]>([]);
    
    // For navigating lectures
    const [activeWeek, setActiveWeek] = useState<number>(1);
    const [activeTabId, setActiveTabId] = useState<string>("");

    useEffect(() => {
        fetchUnitData();
    }, [unitId, studentId]);

    const fetchUnitData = async () => {
        const token = Cookies.get("token");
        if (!token) return router.push("/login");

        try {
            // Fetch Home, Lectures, and the Student's specific coursework status
            const [homeRes, lecRes, hwRes] = await Promise.all([
                fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/home`, { headers: { "Authorization": `Bearer ${token}` } }),
                fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/lectures`, { headers: { "Authorization": `Bearer ${token}` } }),
                // We use the student coursework endpoint, but the backend verifies the parent-child link (via auth payload)
                // Note: Ensure your backend allows Parents to call this route for their children if it currently strictly checks for "Student" role.
                fetch(`http://127.0.0.1:8000/api/v1/coursework/student/${unitId}`, { headers: { "Authorization": `Bearer ${token}` } })
            ]);

            if (homeRes.ok) setUnitHome(await homeRes.json());
            if (lecRes.ok) {
                const lecData = await lecRes.json();
                setLectures(lecData);
                if (lecData.length > 0) {
                    setActiveWeek(lecData[0].week_number);
                    if (lecData[0].content_payload.length > 0) {
                        setActiveTabId(lecData[0].content_payload[0].id);
                    }
                }
            }
            // For now, if the API strictly blocks parents, this might fail, but we'll build the UI to expect it.
            if (hwRes.ok) setCoursework(await hwRes.json());

        } catch (err) {
            console.error("Failed to fetch unit data");
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading classroom data...</div>;
    if (!unitHome) return <div className="min-h-screen bg-slate-50 p-8 text-red-500">Classroom not found.</div>;

    const currentModule = lectures.find(m => m.week_number === activeWeek);
    const currentLecTab = currentModule?.content_payload.find((t: any) => t.id === activeTabId);

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Top Navigation */}
            <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center">
                <div>
                    <Link href={`/dashboard/parent/child/${studentId}`} className="text-sm text-blue-600 hover:underline mb-1 inline-block">
                        &larr; Back to Child Profile
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900">{unitHome.unit_name}</h1>
                </div>
                <div className="hidden md:block text-right">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Read-Only Access</p>
                    <p className="text-sm font-medium text-slate-600">Parent Observer Mode</p>
                </div>
            </div>

            {/* Tab Menu */}
            <div className="bg-white border-b border-slate-200 px-8">
                <div className="flex space-x-8 overflow-x-auto">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-4 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                                activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50/50"
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Component Renderer */}
            <main className="flex-grow max-w-6xl mx-auto w-full p-8">
                
                {/* --- TAB: OVERVIEW --- */}
                {activeTab === "Overview" && (
                    <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                        <div className="mb-6 border-b border-slate-100 pb-4">
                            <h2 className="text-xl font-bold text-slate-900">Unit Overview</h2>
                            <p className="text-sm text-slate-500 mt-1">Instructor: {unitHome.teacher_name}</p>
                        </div>
                        <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap">
                            {unitHome.description || "No description provided by the instructor."}
                        </div>
                    </div>
                )}

                {/* --- TAB: SYLLABUS --- */}
                {activeTab === "Syllabus" && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm h-fit">
                            <h2 className="text-lg font-bold text-slate-900 mb-6 border-b border-slate-100 pb-4">Course Objectives & Policies</h2>
                            <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap">
                                {unitHome.syllabus_content || "No syllabus text provided."}
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[600px] flex flex-col">
                            <h2 className="text-lg font-bold text-slate-900 mb-4">Syllabus Document</h2>
                            {unitHome.syllabus_url ? (
                                <iframe src={`http://127.0.0.1:8000/${unitHome.syllabus_url}`} className="w-full flex-grow rounded-lg border border-slate-200" title="Syllabus Preview"/>
                            ) : (
                                <div className="flex-grow flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 text-slate-400 text-sm">
                                    No document uploaded by instructor.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- TAB: ANNOUNCEMENTS --- */}
                {activeTab === "Announcements" && (
                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-slate-900 mb-4 px-2">Class Announcements</h2>
                        {unitHome.announcements && unitHome.announcements.length > 0 ? (
                            <div className="space-y-4">
                                {[...unitHome.announcements].reverse().map((ann: any, idx: number) => (
                                    <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                        <h4 className="font-bold text-slate-900 text-lg">{ann.title}</h4>
                                        <p className="text-slate-600 mt-2 whitespace-pre-wrap">{ann.content}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="bg-white p-8 text-center rounded-xl border border-slate-200 border-dashed">
                                <p className="text-slate-500">No announcements posted yet.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: LECTURES (READ ONLY) --- */}
                {activeTab === "Lectures" && (
                    <div className="flex bg-white rounded-xl border border-slate-200 shadow-sm min-h-[600px] overflow-hidden">
                        <div className="w-56 bg-slate-50 border-r border-slate-200 p-4 flex flex-col overflow-y-auto">
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Course Modules</h3>
                            {lectures.map(m => (
                                <button
                                    key={m.week_number}
                                    onClick={() => { setActiveWeek(m.week_number); setActiveTabId(m.content_payload[0]?.id || ""); }}
                                    className={`text-left px-3 py-2.5 rounded-md text-sm font-medium transition ${
                                        activeWeek === m.week_number ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200"
                                    }`}
                                >
                                    Week {m.week_number}
                                </button>
                            ))}
                            {lectures.length === 0 && <p className="text-sm text-slate-400 px-2">No modules found.</p>}
                        </div>
                        <div className="flex-1 flex flex-col overflow-hidden">
                            {currentModule ? (
                                <>
                                    <div className="border-b border-slate-200 p-8 pb-0 bg-white shadow-sm">
                                        <h2 className="text-2xl font-bold text-slate-900 mb-6">{currentModule.title}</h2>
                                        <div className="flex space-x-1 overflow-x-auto pb-1 scrollbar-hide">
                                            {currentModule.content_payload.map((tab: any) => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setActiveTabId(tab.id)}
                                                    className={`px-6 py-2.5 border-b-2 text-sm font-medium transition whitespace-nowrap ${
                                                        activeTabId === tab.id ? "border-blue-600 text-blue-600 bg-blue-50/50" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                                                    }`}
                                                >
                                                    {tab.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex-1 p-8 bg-slate-50 overflow-y-auto">
                                        {currentLecTab ? (
                                            <div className="space-y-8 max-w-4xl">
                                                <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                                                    <h3 className="text-xl font-bold text-slate-900 mb-4">{currentLecTab.title}</h3>
                                                    <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap">{currentLecTab.text}</div>
                                                </div>
                                                {currentLecTab.files.length > 0 && (
                                                    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                                        <h4 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Attached Materials</h4>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                            {currentLecTab.files.map((file: any, idx: number) => (
                                                                <a key={idx} href={`http://127.0.0.1:8000/${file.url}`} target="_blank" rel="noreferrer" className="border border-slate-200 rounded-lg p-3 flex flex-col items-center text-center bg-slate-50 hover:bg-blue-50 transition cursor-pointer">
                                                                    <span className="text-sm text-blue-600 font-medium truncate w-full hover:underline">{file.name}</span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ) : ( <div className="p-8 text-center text-slate-500">Select a lesson tab above.</div> )}
                                    </div>
                                </>
                            ) : ( <div className="flex-1 flex items-center justify-center text-slate-400">Select a week from the sidebar.</div> )}
                        </div>
                    </div>
                )}

                {/* --- TAB: COURSEWORK LOG --- */}
                {activeTab === "Coursework Log" && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                                    <th className="p-4 font-bold">Title</th>
                                    <th className="p-4 font-bold">Type</th>
                                    <th className="p-4 font-bold">Due Date</th>
                                    <th className="p-4 font-bold">Child's Status</th>
                                    <th className="p-4 font-bold text-right">Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {coursework.length === 0 ? (
                                    <tr><td colSpan={5} className="p-8 text-center text-slate-400">No coursework assigned yet.</td></tr>
                                ) : (
                                    coursework.map(a => (
                                        <tr key={a.id} className="hover:bg-slate-50 transition">
                                            <td className="p-4 font-medium text-slate-900">{a.title}</td>
                                            <td className="p-4"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium">{a.type}</span></td>
                                            <td className="p-4 text-slate-600 text-sm">{a.due_date ? new Date(a.due_date).toLocaleDateString() : "No Date"}</td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-full tracking-wider ${
                                                    a.status === "Pending" ? "bg-amber-100 text-amber-800" :
                                                    a.status.includes("Graded") ? "bg-green-100 text-green-800" :
                                                    "bg-blue-100 text-blue-800"
                                                }`}>
                                                    {a.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-bold text-slate-900">
                                                {a.score !== null ? `${a.score}%` : "-"}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}