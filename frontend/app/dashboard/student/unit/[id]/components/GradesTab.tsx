// frontend/app/dashboard/student/unit/[id]/components/GradesTab.tsx
import { useState, useEffect } from "react";
import Cookies from "js-cookie";

export default function GradesTab({ unitId }: { unitId: string }) {
    const [gradesData, setGradesData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchGrades = async () => {
            try {
                const token = Cookies.get("token");
                const res = await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/students`, {
                    headers: { "Authorization": `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    // Extract just the logged-in student's data
                    const myProfileRes = await fetch("http://127.0.0.1:8000/api/v1/auth/me", {
                        headers: { "Authorization": `Bearer ${token}` }
                    });
                    const myInfo = await myProfileRes.json();
                    const myData = data.students.find((s: any) => s.full_name === myInfo.full_name);
                    
                    setGradesData({ assignments: data.assignments, myData });
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchGrades();
    }, [unitId]);

    if (loading) return <div className="p-8 text-center text-slate-500">Calculating your grades...</div>;
    if (!gradesData || !gradesData.myData) return <div className="p-8 text-center text-slate-500">No grades available yet.</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-8 text-white shadow-md flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold opacity-90 uppercase tracking-wider">Unit Final Grade</h2>
                    <p className="text-sm opacity-75 mt-1">Calculated from weighted coursework</p>
                </div>
                <div className="text-6xl font-bold">{gradesData.myData.final_grade}%</div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                            <th className="p-4 font-bold">Assessment</th>
                            <th className="p-4 font-bold text-center">Weight</th>
                            <th className="p-4 font-bold text-right">Your Score</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {gradesData.assignments.map((a: any) => (
                            <tr key={a.id} className="hover:bg-slate-50">
                                <td className="p-4 font-medium text-slate-900">{a.title}</td>
                                <td className="p-4 text-center text-slate-500 text-sm">{a.weight}%</td>
                                <td className="p-4 text-right font-bold text-blue-600">
                                    {gradesData.myData.grades[a.id] ? `${gradesData.myData.grades[a.id]}%` : "-"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}