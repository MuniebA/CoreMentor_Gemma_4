// frontend/app/dashboard/student/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import Cookies from "js-cookie";
import Link from "next/link";

interface Unit {
    id: string;
    unit_name: string;
    description: string;
    teacher_name: string;
}

interface StudentProfile {
    rank_title: string;
    total_xp: number;
    level: number;
    career_goal: string | null;
}

export default function StudentDashboard() {
    const router = useRouter();
    const { fullName, logout } = useAuthStore();
    
    const [units, setUnits] = useState<Unit[]>([]);
    const [profile, setProfile] = useState<StudentProfile | null>(null);
    const [loading, setLoading] = useState(true);
    
    // Career Goal Setup State
    const [isSettingCareer, setIsSettingCareer] = useState(false);
    const [newCareerGoal, setNewCareerGoal] = useState("");

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        const token = Cookies.get("token");
        if (!token) return router.push("/login");

        try {
            // Fetch both Units and Profile concurrently
            const [unitsRes, profileRes] = await Promise.all([
                fetch("http://127.0.0.1:8000/api/v1/units/", { headers: { "Authorization": `Bearer ${token}` } }),
                fetch("http://127.0.0.1:8000/api/v1/gamification/profile", { headers: { "Authorization": `Bearer ${token}` } })
            ]);

            if (unitsRes.ok) setUnits(await unitsRes.json());
            if (profileRes.ok) setProfile(await profileRes.json());
            
        } catch (err) {
            console.error("Failed to fetch dashboard data");
        } finally {
            setLoading(false);
        }
    };

    const handleSaveCareerGoal = async () => {
        const token = Cookies.get("token");
        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/gamification/career-goal", {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ career_goal: newCareerGoal })
            });
            if (res.ok) {
                const data = await res.json();
                setProfile(prev => prev ? { ...prev, career_goal: data.career_goal } : null);
                setIsSettingCareer(false);
            }
        } catch (err) {
            alert("Failed to save career goal.");
        }
    };

    const handleLogout = () => {
        Cookies.remove("token");
        Cookies.remove("role");
        logout();
        router.push("/login");
    };

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">Loading your learning path...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Minimalist Navbar */}
            <nav className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center z-10 shadow-sm">
                <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center">
                        <span className="text-white font-bold text-sm">CM</span>
                    </div>
                    <span className="text-xl font-bold text-slate-900 tracking-tight">CoreMentor</span>
                </div>
                <div className="flex items-center space-x-6">
                    {profile && (
                        <div className="hidden md:flex items-center space-x-4 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-200">
                            <span className="text-sm font-bold text-slate-700">Level {profile.level}</span>
                            <span className="text-amber-600 font-bold text-sm flex items-center">
                                🏆 {profile.rank_title}
                            </span>
                            <span className="text-sm font-mono text-blue-600 font-bold">{profile.total_xp} XP</span>
                        </div>
                    )}
                    <span className="text-sm font-medium text-slate-600">
                        {fullName || "Student"}
                    </span>
                    <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-blue-600 font-medium transition-colors">
                        Log out
                    </button>
                </div>
            </nav>

            <main className="flex-grow max-w-7xl mx-auto w-full p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* --- LEFT COLUMN: ENROLLED UNITS --- */}
                <div className="lg:col-span-2 space-y-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Your Learning Path</h1>
                        <p className="text-slate-500 mt-2">Select a unit to view lectures, complete coursework, and earn XP.</p>
                    </div>

                    {/* Career Goal Banner - Required for AI Career Lens */}
                    {profile && !profile.career_goal && !isSettingCareer && (
                        <div className="bg-indigo-50 border border-indigo-200 p-6 rounded-xl flex justify-between items-center shadow-sm">
                            <div>
                                <h3 className="font-bold text-indigo-900 text-lg">Define Your Career Path</h3>
                                <p className="text-indigo-700 text-sm mt-1 max-w-md">Tell the Career Architect AI what you want to be when you grow up, and it will theme your math and science questions around your dream job!</p>
                            </div>
                            <button onClick={() => setIsSettingCareer(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition">
                                Set Career Goal
                            </button>
                        </div>
                    )}

                    {isSettingCareer && (
                        <div className="bg-white border border-indigo-200 p-6 rounded-xl shadow-sm">
                            <h3 className="font-bold text-slate-900 mb-2">What is your dream career?</h3>
                            <div className="flex space-x-3">
                                <input 
                                    type="text" 
                                    value={newCareerGoal}
                                    onChange={(e) => setNewCareerGoal(e.target.value)}
                                    placeholder="e.g., Software Engineer, Doctor, Pilot, Artist..."
                                    className="flex-1 px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-slate-900"
                                />
                                <button onClick={handleSaveCareerGoal} className="bg-indigo-600 text-white px-5 py-2 rounded-md font-medium hover:bg-indigo-700 transition">Save Path</button>
                                <button onClick={() => setIsSettingCareer(false)} className="text-slate-500 hover:text-slate-700 px-3">Cancel</button>
                            </div>
                        </div>
                    )}

                    {/* Enrolled Units Grid */}
                    {units.length === 0 ? (
                        <div className="bg-white p-12 text-center rounded-xl border border-slate-200 border-dashed">
                            <h3 className="text-lg font-medium text-slate-900 mb-1">Not enrolled in any units</h3>
                            <p className="text-slate-500">You will see your classes here once your teacher adds you to a roster.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {units.map((unit) => (
                                <Link href={`/dashboard/student/unit/${unit.id}`} key={unit.id} className="group block">
                                    <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col h-full">
                                        <div className="flex-grow">
                                            <h2 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">
                                                {unit.unit_name}
                                            </h2>
                                            <p className="text-slate-500 text-sm line-clamp-2">
                                                {unit.description || "No description provided."}
                                            </p>
                                        </div>
                                        <div className="pt-4 mt-4 border-t border-slate-100 flex justify-between items-center">
                                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Enter Classroom</span>
                                            <svg className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* --- RIGHT COLUMN: WIDGETS --- */}
                <div className="space-y-6">
                    
                    {/* Career Lens Status */}
                    {profile?.career_goal && (
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -z-0"></div>
                            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 relative z-10">AI Career Lens: Active</h3>
                            <p className="font-bold text-slate-900 text-xl relative z-10">{profile.career_goal}</p>
                            <p className="text-xs text-slate-500 mt-2 relative z-10">Coursework will be themed around this profession.</p>
                        </div>
                    )}

                    {/* AI Daily Quest Widget Placeholder */}
                    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 rounded-xl shadow-md text-white">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="font-bold text-lg flex items-center">
                                <svg className="w-5 h-5 mr-2 text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                Daily AI Quest
                            </h3>
                            <span className="bg-white/20 text-white text-xs px-2 py-1 rounded font-medium">Load Balancer</span>
                        </div>
                        <p className="text-sm text-blue-100 mb-6">The Shadow Mentor is analyzing your grades and calculating the optimal mix of subjects for you to focus on today.</p>
                        
                        <div className="space-y-3">
                            <div className="bg-white/10 rounded-lg p-3 flex justify-between items-center border border-white/20">
                                <div>
                                    <p className="text-sm font-bold">Algebra Practice</p>
                                    <p className="text-xs text-blue-200">Recommended • +50 XP</p>
                                </div>
                                <button className="bg-white text-blue-700 text-xs font-bold px-3 py-1.5 rounded hover:bg-blue-50 transition">Start</button>
                            </div>
                            <div className="bg-white/10 rounded-lg p-3 flex justify-between items-center border border-white/20">
                                <div>
                                    <p className="text-sm font-bold">Read Physics Ch. 3</p>
                                    <p className="text-xs text-blue-200">Review • +30 XP</p>
                                </div>
                                <button className="bg-white text-blue-700 text-xs font-bold px-3 py-1.5 rounded hover:bg-blue-50 transition">Start</button>
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}