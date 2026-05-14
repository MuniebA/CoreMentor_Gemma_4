// frontend/app/dashboard/student/page.tsx
"use client";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { useAuthStore } from "@/lib/store";

export default function StudentDashboard() {
    const router = useRouter();
    
    // We grab the logout function from the store you created earlier
    const logoutStore = useAuthStore((state) => state.logout); 

    const handleLogout = () => {
        // 1. Clear the cookies so the middleware lets us leave
        Cookies.remove("token");
        Cookies.remove("role");

        // 2. Clear any other auth storage you might have in lib/auth
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        localStorage.removeItem("name");

        // 3. Clear the global Zustand state
        logoutStore();

        // 4. Redirect back to login
        router.push("/login");
    };

    return (
        <div className="min-h-screen bg-slate-50 p-8">
            <div className="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-slate-200">
                
                <div className="flex justify-between items-center mb-8 border-b border-slate-100 pb-4">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Student Dashboard</h1>
                        <p className="text-slate-500 mt-1">Welcome back to CoreMentor.</p>
                    </div>
                    
                    {/* The magical Logout Button */}
                    <button
                        onClick={handleLogout}
                        className="bg-white border border-slate-300 text-slate-700 py-2 px-4 rounded-md font-medium hover:bg-slate-50 transition duration-200"
                    >
                        Log Out
                    </button>
                </div>

                <div className="p-6 bg-blue-50 border border-blue-100 rounded-lg text-blue-800">
                    <p>Your security middleware is working perfectly! You can now log out to test the Teacher and Parent signups.</p>
                </div>
                
            </div>
        </div>
    );
}