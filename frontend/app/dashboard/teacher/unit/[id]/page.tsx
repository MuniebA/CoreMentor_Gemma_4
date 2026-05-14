// frontend/app/dashboard/teacher/unit/[id]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import Link from "next/link";

// Import your new components
import HomeTab from "./components/HomeTab";
import AnnouncementsTab from "./components/AnnouncementsTab";
import SyllabusTab from "./components/SyllabusTab";
import LecturesTab from "./components/LecturesTab";
import CourseworkTab from "./components/CourseworkTab";
import GradesTab from "./components/GradesTab";
import StudentsTab from "./components/StudentsTab";

const TABS = ["Home", "Syllabus", "Announcements", "Lectures", "Coursework", "Grades", "Students"];

export default function UnitWorkspace() {
    const params = useParams();
    const router = useRouter();
    const unitId = params.id as string;

    const [activeTab, setActiveTab] = useState("Home");
    const [loading, setLoading] = useState(true);
    const [unitData, setUnitData] = useState<any>(null);

    const fetchUnitData = async () => {
        const token = Cookies.get("token");
        if (!token) return router.push("/login");

        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/home`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) setUnitData(await res.json());
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUnitData();
    }, [unitId]);

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Loading workspace...</div>;
    if (!unitData) return <div className="min-h-screen bg-slate-50 p-8 text-red-500">Unit not found.</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Top Navigation */}
            <div className="bg-white border-b border-slate-200 px-8 py-4">
                <Link href="/dashboard/teacher" className="text-sm text-blue-600 hover:underline mb-1 inline-block">&larr; Back to Dashboard</Link>
                <h1 className="text-2xl font-bold text-slate-900">{unitData.unit_name}</h1>
            </div>

            {/* Tab Menu */}
            <div className="bg-white border-b border-slate-200 px-8">
                <div className="flex space-x-8 overflow-x-auto">
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-4 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                                activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Component Renderer */}
            <main className="flex-grow max-w-6xl mx-auto w-full p-8">
                {activeTab === "Home" && <HomeTab unitId={unitId} unitData={unitData} onRefresh={fetchUnitData} />}
                {activeTab === "Syllabus" && <SyllabusTab unitId={unitId} unitData={unitData} onRefresh={fetchUnitData} />}
                {activeTab === "Announcements" && <AnnouncementsTab unitId={unitId} announcements={unitData.announcements} onRefresh={fetchUnitData} />}
                {activeTab === "Lectures" && <LecturesTab unitId={unitId} />}
                {activeTab === "Coursework" && <CourseworkTab unitId={unitId} />}
                {activeTab === "Grades" && <GradesTab unitId={unitId} />}
                {activeTab === "Students" && <StudentsTab unitId={unitId} />}
                {/* Placeholders for future tabs */}
                {!["Home", "Syllabus", "Announcements"].includes(activeTab) && (
                    <div className="bg-white p-12 text-center rounded-xl border border-slate-200 border-dashed">
                        {/* <h3 className="text-lg font-medium text-slate-900 mb-1">{activeTab}</h3>
                        <p className="text-slate-500">Component pending.</p> */}
                    </div>
                )}
            </main>
        </div>
    );
}