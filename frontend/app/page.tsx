// frontend/app/page.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveToken, saveRole, saveName } from "@/lib/auth";
import Link from "next/link";

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        setError("");
        try {
            // FIX: Added /api/v1 to correctly route to your FastAPI backend
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.detail || "Login failed. Please check your credentials.");
                return;
            }

            // Save auth details using your existing lib
            saveToken(data.access_token);
            saveRole(data.role);
            saveName(data.full_name);

            // Redirect based on role to the correct dashboard
            const lowerRole = data.role.toLowerCase();
            router.push(`/dashboard/${lowerRole}`);

        } catch (err) {
            setError("Could not connect to the server. Is the backend running?");
        } finally {
            setLoading(false);
        }
    };

    return (
        // UI FIX: Applied the EdTech Minimalist Design Schema
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 w-full max-w-md">
                
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
                        CoreMentor
                    </h1>
                    <p className="text-slate-500 mt-2 text-sm">
                        AI-Powered Learning Platform
                    </p>
                </div>

                {error && (
                    <div className="mb-6 p-3 bg-red-50 border border-red-100 text-red-600 rounded-md text-sm text-center">
                        {error}
                    </div>
                )}

                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-colors"
                            placeholder="student@corementor.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                            className="w-full px-4 py-2.5 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900 transition-colors"
                            placeholder="••••••••"
                        />
                    </div>

                    <button
                        onClick={handleLogin}
                        disabled={loading}
                        className="w-full bg-blue-600 text-white py-2.5 rounded-md font-medium hover:bg-blue-700 transition duration-200 disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                    >
                        {loading ? "Logging in..." : "Sign In"}
                    </button>
                </div>

                <div className="mt-8 text-center border-t border-slate-100 pt-6">
                    <p className="text-sm text-slate-500">
                        Don&apos;t have an account?{" "}
                        <Link href="/signup" className="text-blue-600 hover:text-blue-800 font-medium transition-colors">
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}