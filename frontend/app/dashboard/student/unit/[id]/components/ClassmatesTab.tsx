// frontend/app/dashboard/student/unit/[id]/components/ClassmatesTab.tsx
import { useState, useEffect } from "react";
import Cookies from "js-cookie";

export default function ClassmatesTab({ unitId }: { unitId: string }) {
    const [classmates, setClassmates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchClassmates = async () => {
            try {
                // Using the leaderboard logic you defined in gamification_router
                const res = await fetch(`http://127.0.0.1:8000/api/v1/gamification/leaderboard/${unitId}`, {
                    headers: { "Authorization": `Bearer ${Cookies.get("token")}` }
                });
                if (res.ok) setClassmates(await res.json());
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchClassmates();
    }, [unitId]);

    if (loading) return <div className="p-8 text-center text-slate-500">Loading roster...</div>;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm max-w-3xl mx-auto overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
                <h2 className="text-xl font-bold text-slate-900">Class Roster</h2>
                <p className="text-sm text-slate-500 mt-1">Students enrolled in this unit. Connect and collaborate!</p>
            </div>
            <ul className="divide-y divide-slate-100">
                {classmates.map((c, idx) => (
                    <li key={idx} className="p-4 flex items-center space-x-4 hover:bg-slate-50 transition">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                            {c.name.charAt(0)}
                        </div>
                        <div>
                            <p className="font-bold text-slate-900">{c.name}</p>
                            <p className="text-xs font-mono text-slate-400">{c.xp} XP</p>
                        </div>
                    </li>
                ))}
                {classmates.length === 0 && <li className="p-8 text-center text-slate-500">No other students enrolled yet.</li>}
            </ul>
        </div>
    );
}