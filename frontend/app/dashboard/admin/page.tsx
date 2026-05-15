// frontend/app/dashboard/admin/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import Cookies from "js-cookie";

export default function AdminDashboard() {
    const router = useRouter();
    const { fullName, logout } = useAuthStore();
    
    const [activeTab, setActiveTab] = useState("Academic Operations");
    const [loading, setLoading] = useState(true);
    
    // Data State
    const [usersData, setUsersData] = useState<any>({ all_users: [], teachers: [], students: [], parents: [] });
    const [units, setUnits] = useState<any[]>([]);
    const [systemStatus, setSystemStatus] = useState<any>(null);

    // Form State for Operations
    const [newUnitName, setNewUnitName] = useState("");
    const [selectedTeacherId, setSelectedTeacherId] = useState("");
    
    const [enrollUnitId, setEnrollUnitId] = useState("");
    const [enrollStudentId, setEnrollStudentId] = useState("");
    
    const [linkParentId, setLinkParentId] = useState("");
    const [linkStudentId, setLinkStudentId] = useState("");

    useEffect(() => {
        fetchAdminData();
    }, []);

    const fetchAdminData = async () => {
        const token = Cookies.get("token");
        if (!token) return router.push("/login");

        try {
            const [usersRes, unitsRes, sysRes] = await Promise.all([
                fetch("http://127.0.0.1:8000/api/v1/admin/users", { headers: { "Authorization": `Bearer ${token}` } }),
                fetch("http://127.0.0.1:8000/api/v1/admin/units", { headers: { "Authorization": `Bearer ${token}` } }),
                fetch("http://127.0.0.1:8000/api/v1/admin/system/status", { headers: { "Authorization": `Bearer ${token}` } })
            ]);

            if (usersRes.ok) setUsersData(await usersRes.json());
            if (unitsRes.ok) setUnits(await unitsRes.json());
            if (sysRes.ok) setSystemStatus(await sysRes.json());
        } catch (err) {
            console.error("Failed to load admin data");
        } finally {
            setLoading(false);
        }
    };

    // --- Action Handlers ---
    const handleCreateUnit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/admin/units", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Cookies.get("token")}` },
                body: JSON.stringify({ unit_name: newUnitName, teacher_id: selectedTeacherId })
            });
            if (res.ok) {
                alert("Unit Created!");
                setNewUnitName("");
                fetchAdminData();
            } else {
                alert("Error creating unit");
            }
        } catch (err) { alert("Server error"); }
    };

    const handleEnrollStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/admin/enrollments", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Cookies.get("token")}` },
                body: JSON.stringify({ unit_id: enrollUnitId, student_id: enrollStudentId })
            });
            const data = await res.json();
            if (res.ok) {
                alert("Student Enrolled!");
                setEnrollStudentId("");
            } else {
                alert(data.detail || "Error enrolling student");
            }
        } catch (err) { alert("Server error"); }
    };

    const handleLinkParent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/admin/parent-links", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Cookies.get("token")}` },
                body: JSON.stringify({ parent_id: linkParentId, student_id: linkStudentId })
            });
            const data = await res.json();
            if (res.ok) {
                alert("Parent linked to child successfully!");
            } else {
                alert(data.detail || "Error linking parent");
            }
        } catch (err) { alert("Server error"); }
    };

    const handleCleanup = async () => {
        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/admin/cleanup", {
                method: "POST",
                headers: { "Authorization": `Bearer ${Cookies.get("token")}` }
            });
            const data = await res.json();
            alert(data.message);
        } catch (err) { alert("Server error"); }
    };

    const handleLogout = () => {
        Cookies.remove("token");
        Cookies.remove("role");
        logout();
        router.push("/login");
    };

    if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading Admin Console...</div>;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            {/* Navbar */}
            <nav className="bg-slate-900 border-b border-slate-800 px-8 py-4 flex justify-between items-center z-10 shadow-sm text-white">
                <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                        <span className="text-white font-bold text-sm">CM</span>
                    </div>
                    <span className="text-xl font-bold tracking-tight">CoreMentor Admin</span>
                </div>
                <div className="flex items-center space-x-6">
                    <span className="text-sm font-medium opacity-80">Welcome, {fullName}</span>
                    <button onClick={handleLogout} className="text-sm text-blue-300 hover:text-white font-medium transition-colors">Log out</button>
                </div>
            </nav>

            {/* Tab Menu */}
            <div className="bg-white border-b border-slate-200 px-8">
                <div className="flex space-x-8 overflow-x-auto max-w-6xl mx-auto">
                    {["Academic Operations", "System Monitor", "User Directory"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-4 px-1 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                                activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <main className="flex-grow max-w-6xl mx-auto w-full p-8">
                
                {/* --- TAB: ACADEMIC OPERATIONS --- */}
                {activeTab === "Academic Operations" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        
                        {/* 1. Create Unit */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mb-4">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Create New Unit</h3>
                            <form onSubmit={handleCreateUnit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assign Teacher</label>
                                    <select required value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500">
                                        <option value="">Select a Teacher...</option>
                                        {usersData.teachers.map((t: any) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Unit Name</label>
                                    <input type="text" required value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Advanced Physics 101" />
                                </div>
                                <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded font-medium hover:bg-indigo-700 transition">Create Unit</button>
                            </form>
                        </div>

                        {/* 2. Enroll Student */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <div className="w-10 h-10 bg-green-100 text-green-600 rounded-lg flex items-center justify-center mb-4">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Enroll Student</h3>
                            <form onSubmit={handleEnrollStudent} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Unit</label>
                                    <select required value={enrollUnitId} onChange={(e) => setEnrollUnitId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-green-500">
                                        <option value="">Select a Unit...</option>
                                        {units.map((u: any) => <option key={u.id} value={u.id}>{u.unit_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Student</label>
                                    <select required value={enrollStudentId} onChange={(e) => setEnrollStudentId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-green-500">
                                        <option value="">Select a Student...</option>
                                        {usersData.students.map((s: any) => <option key={s.profile_id} value={s.profile_id}>{s.full_name}</option>)}
                                    </select>
                                </div>
                                <button type="submit" className="w-full bg-green-600 text-white py-2 rounded font-medium hover:bg-green-700 transition">Enroll Student</button>
                            </form>
                        </div>

                        {/* 3. Link Parent */}
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                            <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center mb-4">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                            </div>
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Link Parent to Child</h3>
                            <form onSubmit={handleLinkParent} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Parent</label>
                                    <select required value={linkParentId} onChange={(e) => setLinkParentId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500">
                                        <option value="">Select a Parent...</option>
                                        {usersData.parents.map((p: any) => <option key={p.profile_id} value={p.profile_id}>{p.full_name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Student</label>
                                    <select required value={linkStudentId} onChange={(e) => setLinkStudentId(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded focus:ring-2 focus:ring-amber-500">
                                        <option value="">Select a Student...</option>
                                        {usersData.students.map((s: any) => <option key={s.profile_id} value={s.profile_id}>{s.full_name}</option>)}
                                    </select>
                                </div>
                                <button type="submit" className="w-full bg-amber-500 text-white py-2 rounded font-medium hover:bg-amber-600 transition">Link Family</button>
                            </form>
                        </div>

                    </div>
                )}

                {/* --- TAB: SYSTEM MONITOR --- */}
                {activeTab === "System Monitor" && systemStatus && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="bg-slate-900 text-white p-6 rounded-xl shadow-sm border border-slate-800">
                                <p className="text-slate-400 text-xs uppercase font-bold tracking-wider mb-2">API Status</p>
                                <p className="text-2xl font-bold text-green-400 flex items-center">
                                    <span className="w-3 h-3 bg-green-400 rounded-full mr-3 animate-pulse"></span> {systemStatus.status}
                                </p>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <p className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-2">GPU Mutex Lock</p>
                                <p className="text-xl font-bold text-slate-900">{systemStatus.gpu_lock}</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <p className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-2">Text Engine</p>
                                <p className="text-xl font-bold text-slate-900">{systemStatus.active_llm}</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <p className="text-slate-500 text-xs uppercase font-bold tracking-wider mb-2">Vision Engine</p>
                                <p className="text-xl font-bold text-slate-900">{systemStatus.vision_engine}</p>
                            </div>
                        </div>

                        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Storage Management</h3>
                                <p className="text-sm text-slate-500 mt-1">Clear temporary file uploads and orphaned images from the server.</p>
                            </div>
                            <button onClick={handleCleanup} className="bg-slate-800 text-white px-6 py-2.5 rounded-md font-medium hover:bg-slate-900 transition">
                                Run Storage Cleanup
                            </button>
                        </div>
                    </div>
                )}

                {/* --- TAB: USER DIRECTORY --- */}
                {activeTab === "User Directory" && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                                    <th className="p-4 font-bold">Full Name</th>
                                    <th className="p-4 font-bold">Email</th>
                                    <th className="p-4 font-bold">Role</th>
                                    <th className="p-4 font-bold text-right">System ID</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {usersData.all_users.map((u: any) => (
                                    <tr key={u.id} className="hover:bg-slate-50 transition">
                                        <td className="p-4 font-medium text-slate-900">{u.full_name}</td>
                                        <td className="p-4 text-slate-600 text-sm">{u.email}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-full tracking-wider ${
                                                u.role === "Admin" ? "bg-purple-100 text-purple-800" :
                                                u.role === "Teacher" ? "bg-blue-100 text-blue-800" :
                                                u.role === "Parent" ? "bg-amber-100 text-amber-800" :
                                                "bg-green-100 text-green-800"
                                            }`}>
                                                {u.role}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right text-xs font-mono text-slate-400">{u.id}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

            </main>
        </div>
    );
}