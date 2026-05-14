// frontend/app/dashboard/teacher/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import Link from "next/link";
import Cookies from "js-cookie";

interface Unit {
    id: string;
    unit_name: string;
    description: string;
}

export default function TeacherDashboard() {
    const router = useRouter();
    const { fullName, logout } = useAuthStore();
    const [units, setUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchUnits = async () => {
            // Get the token from cookies (set during login)
            const token = Cookies.get("token");
            
            if (!token) {
                router.push("/login");
                return;
            }

            try {
                const res = await fetch("http://127.0.0.1:8000/api/v1/units/", {
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                });

                if (!res.ok) {
                    throw new Error("Failed to fetch units");
                }

                const data = await res.json();
                setUnits(data);
            } catch (err) {
                setError("Could not load units. Please ensure the backend is running.");
            } finally {
                setLoading(false);
            }
        };

        fetchUnits();
    }, [router]);

    const handleLogout = () => {
        Cookies.remove("token");
        Cookies.remove("role");
        logout();
        router.push("/login");
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Minimalist Navbar */}
            <nav className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center">
                <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-md flex items-center justify-center">
                        <span className="text-white font-bold text-sm">CM</span>
                    </div>
                    <span className="text-xl font-bold text-slate-900 tracking-tight">CoreMentor</span>
                </div>
                <div className="flex items-center space-x-6">
                    <span className="text-sm font-medium text-slate-600">
                        Welcome, {fullName || "Teacher"}
                    </span>
                    <button 
                        onClick={handleLogout}
                        className="text-sm text-slate-500 hover:text-blue-600 font-medium transition-colors"
                    >
                        Log out
                    </button>
                </div>
            </nav>

            {/* Main Content Area */}
            <main className="max-w-7xl mx-auto px-8 py-10">
                <div className="mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Your Units</h1>
                        <p className="text-slate-500 mt-2">Manage your classes, coursework, and AI grading.</p>
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-md mb-8">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white h-48 rounded-xl border border-slate-200"></div>
                        ))}
                    </div>
                ) : units.length === 0 ? (
                    <div className="bg-white p-12 text-center rounded-xl border border-slate-200 border-dashed">
                        <h3 className="text-lg font-medium text-slate-900 mb-1">No units assigned</h3>
                        <p className="text-slate-500">Contact your administrator to have units assigned to your account.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {units.map((unit) => (
                            <div 
                                key={unit.id} 
                                className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full"
                            >
                                <div className="flex-grow">
                                    <h2 className="text-xl font-bold text-slate-900 mb-2 line-clamp-1">
                                        {unit.unit_name}
                                    </h2>
                                    <p className="text-slate-500 text-sm line-clamp-3 mb-4">
                                        {unit.description || "No description provided."}
                                    </p>
                                </div>
                                <div className="pt-4 border-t border-slate-100 mt-4">
                                    <Link 
                                        href={`/dashboard/teacher/unit/${unit.id}`}
                                        className="inline-block w-full text-center bg-blue-50 text-blue-700 py-2 rounded-md font-medium hover:bg-blue-600 hover:text-white transition-colors"
                                    >
                                        Manage Unit &rarr;
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}