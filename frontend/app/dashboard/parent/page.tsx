// frontend/app/dashboard/parent/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import Cookies from "js-cookie";
import Link from "next/link";

interface ChildSnapshot {
    student_id: string;
    full_name: string;
    level: number;
    rank: string;
    xp: number;
    career_goal: string | null;
    root_cause_diagnosis: string | null;
}

export default function ParentDashboard() {
    const router = useRouter();
    const { fullName, logout } = useAuthStore();
    
    const [children, setChildren] = useState<ChildSnapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetchChildren();
    }, []);

    const fetchChildren = async () => {
        const token = Cookies.get("token");
        if (!token) return router.push("/login");

        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/insights/children", {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (!res.ok) throw new Error("Failed to load children data");
            
            const data = await res.json();
            setChildren(data);
        } catch (err) {
            setError("Could not connect to the server to fetch your family's data.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        Cookies.remove("token");
        Cookies.remove("role");
        logout();
        router.push("/login");
    };

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading your family dashboard...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Minimalist Navbar */}
            <nav className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center z-10 shadow-sm">
                <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center">
                        <span className="text-white font-bold text-sm">CM</span>
                    </div>
                    <span className="text-xl font-bold text-slate-900 tracking-tight">CoreMentor Parent</span>
                </div>
                <div className="flex items-center space-x-6">
                    <span className="text-sm font-medium text-slate-600">
                        Welcome, {fullName || "Parent"}
                    </span>
                    <button onClick={handleLogout} className="text-sm text-slate-500 hover:text-blue-600 font-medium transition-colors">
                        Log out
                    </button>
                </div>
            </nav>

            <main className="flex-grow max-w-7xl mx-auto w-full p-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-slate-900">Your Children</h1>
                    <p className="text-slate-500 mt-2">Select a child to view their detailed academic progress and AI Mentor insights.</p>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-md mb-8">
                        {error}
                    </div>
                )}

                {children.length === 0 ? (
                    <div className="bg-white p-12 text-center rounded-xl border border-slate-200 border-dashed">
                        <div className="w-16 h-16 bg-blue-50 text-blue-300 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        </div>
                        <h3 className="text-lg font-medium text-slate-900 mb-1">No children linked to your account</h3>
                        <p className="text-slate-500">Please contact your school administrator to link your child's account to your profile.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {children.map((child) => (
                            <Link href={`/dashboard/parent/child/${child.student_id}`} key={child.student_id} className="group block">
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col h-full overflow-hidden">
                                    
                                    {/* Card Header */}
                                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-start justify-between">
                                        <div className="flex items-center space-x-4">
                                            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xl">
                                                {child.full_name.charAt(0)}
                                            </div>
                                            <div>
                                                <h2 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                                                    {child.full_name}
                                                </h2>
                                                <p className="text-xs font-bold text-amber-600 tracking-wide uppercase mt-1">
                                                    🏆 {child.rank} • Lvl {child.level}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card Body - Insights */}
                                    <div className="p-6 flex-grow space-y-4">
                                        <div>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Career Goal</p>
                                            <p className="text-sm font-medium text-slate-700">
                                                {child.career_goal ? child.career_goal : <span className="italic text-slate-400">Not set yet</span>}
                                            </p>
                                        </div>

                                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
                                            <p className="text-xs font-bold text-blue-800 flex items-center mb-1">
                                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                                                AI Shadow Mentor Status
                                            </p>
                                            <p className="text-xs text-blue-900 font-medium line-clamp-2">
                                                {child.root_cause_diagnosis || "Monitoring student progress to generate learning patterns..."}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Card Footer */}
                                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">View Grades & Activity</span>
                                        <svg className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}