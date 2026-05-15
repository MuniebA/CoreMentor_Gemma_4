// frontend/src/app/page.tsx
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
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.detail || "Login failed");
                return;
            }

            saveToken(data.access_token);
            saveRole(data.role);
            saveName(data.full_name);

            // Redirect based on role
            if (data.role === "Teacher") router.push("/dashboard/teacher");
            else if (data.role === "Student") router.push("/dashboard/student");
            else if (data.role === "Parent") router.push("/dashboard/parent");
            else if (data.role === "Admin") router.push("/dashboard/admin");

        } catch {
            setError("Could not connect to server");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-700 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md">
                <h1 className="text-3xl font-bold text-center text-blue-600 mb-2">
                    CoreMentor
                </h1>
                <p className="text-center text-gray-500 mb-8">
                    AI-Powered Learning Platform
                </p>

                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">
                        {error}
                    </div>
                )}

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                    </label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                        placeholder="Enter your email"
                    />
                </div>

                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Password
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 text-gray-800"
                        placeholder="Enter your password"
                    />
                </div>

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition disabled:opacity-50"
                >
                    {loading ? "Logging in..." : "Login"}
                </button>

                <p className="text-center text-sm text-gray-500 mt-4">
                    Don&apos;t have an account?{" "}
                    <Link href="/signup" className="text-blue-600 hover:underline">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    );
}
