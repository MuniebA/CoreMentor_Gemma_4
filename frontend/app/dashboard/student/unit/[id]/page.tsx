// frontend/app/dashboard/student/unit/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import Link from "next/link";

// Import our read-only components
import HomeTab from "./components/HomeTab";
import AnnouncementsTab from "./components/AnnouncementsTab";
import SyllabusTab from "./components/SyllabusTab";
import LecturesTab from "./components/LecturesTab";
import CourseworkTab from "./components/CourseworkTab";
import GradesTab from "./components/GradesTab";
import ClassmatesTab from "./components/ClassmatesTab";

const TABS = ["Home", "Syllabus", "Announcements", "Lectures", "Coursework", "Grades", "Classmates"];

export default function StudentUnitWorkspace() {
    const params = useParams();
    const router = useRouter();
    const unitId = params.id as string;

    const [activeTab, setActiveTab] = useState("Home");
    const [loading, setLoading] = useState(true);
    const [unitData, setUnitData] = useState<any>(null);

    useEffect(() => {
        const fetchUnitData = async () => {
            const token = Cookies.get("token");
            if (!token) return router.push("/login");

            try {
                const res = await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/home`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) {
                    setUnitData(await res.json());
                }
            } catch (err) {
                console.error("Failed to fetch unit details");
            } finally {
                setLoading(false);
            }
        };

        fetchUnitData();
    }, [unitId, router]);

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading classroom...</div>;
    if (!unitData) return <div className="min-h-screen bg-slate-50 p-8 text-red-500">Classroom not found.</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Top Navigation */}
            <div className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center">
                <div>
                    <Link href="/dashboard/student" className="text-sm text-blue-600 hover:underline mb-1 inline-block">
                        &larr; Back to Learning Path
                    </Link>
                    <h1 className="text-2xl font-bold text-slate-900">{unitData.unit_name}</h1>
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
                {activeTab === "Home" && <HomeTab unitData={unitData} />}
                {activeTab === "Syllabus" && <SyllabusTab unitData={unitData} />}
                {activeTab === "Announcements" && <AnnouncementsTab announcements={unitData.announcements} />}
                {activeTab === "Lectures" && <LecturesTab unitId={unitId} />}
                {activeTab === "Coursework" && <CourseworkTab unitId={unitId} />}
                {activeTab === "Grades" && <GradesTab unitId={unitId} />}
                {activeTab === "Classmates" && <ClassmatesTab unitId={unitId} />}
                {/* Placeholders for future tabs */}
                {!["Home", "Syllabus", "Announcements"].includes(activeTab) && (
                    <div className="bg-white p-12 text-center rounded-xl border border-slate-200 border-dashed">
                        {/* <div className="w-16 h-16 bg-blue-50 text-blue-300 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-1">{activeTab} Workspace</h3>
                        <p className="text-slate-500 max-w-md mx-auto">This interactive area is currently being prepared. Check back soon!</p> */}
                    </div>
                )}
            </main>
        </div>
    );
}