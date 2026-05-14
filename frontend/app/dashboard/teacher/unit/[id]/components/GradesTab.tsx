// frontend/app/dashboard/teacher/unit/[id]/components/GradesTab.tsx
import { useState, useEffect } from "react";
import Cookies from "js-cookie";

interface AssignmentWeight {
    id: string;
    title: string;
    weight_percentage: number;
}

export default function GradesTab({ unitId }: { unitId: string }) {
    const [assignments, setAssignments] = useState<AssignmentWeight[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchWeights = async () => {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/coursework/unit/${unitId}`, {
                headers: { "Authorization": `Bearer ${Cookies.get("token")}` }
            });
            if (res.ok) {
                const data = await res.json();
                // Filter only weighted assignments
                setAssignments(data.filter((a: any) => a.is_weighted));
            }
            setIsLoading(false);
        };
        fetchWeights();
    }, [unitId]);

    const handleWeightChange = (id: string, newWeight: number) => {
        setAssignments(assignments.map(a => a.id === id ? { ...a, weight_percentage: newWeight } : a));
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await fetch(`http://127.0.0.1:8000/api/v1/coursework/unit/${unitId}/weights`, {
                method: "PUT",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Cookies.get("token")}`
                },
                body: JSON.stringify({ weights: assignments.map(a => ({ id: a.id, weight_percentage: a.weight_percentage })) })
            });
            alert("Syllabus Weights Saved!");
        } catch (err) {
            alert("Failed to save weights.");
        } finally {
            setIsSaving(false);
        }
    };

    const totalWeight = assignments.reduce((sum, a) => sum + a.weight_percentage, 0);
    const isError = totalWeight !== 100 && assignments.length > 0;

    if (isLoading) return <div className="text-slate-500">Loading configurations...</div>;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Grade Weight Configuration</h2>
            <p className="text-slate-500 mb-8">Adjust the weight of each assessment to calculate the students' final grades. The total must equal 100%.</p>

            {assignments.length === 0 ? (
                <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-500">
                    No weighted coursework found. Go to the Coursework tab to create some!
                </div>
            ) : (
                <div className="space-y-4">
                    {assignments.map(a => (
                        <div key={a.id} className="flex justify-between items-center p-4 border border-slate-200 rounded-lg bg-slate-50">
                            <span className="font-medium text-slate-900">{a.title}</span>
                            <div className="flex items-center space-x-2">
                                <input 
                                    type="number" 
                                    min="0" max="100" 
                                    value={a.weight_percentage} 
                                    onChange={(e) => handleWeightChange(a.id, Number(e.target.value))}
                                    className="w-20 px-3 py-2 border border-slate-300 rounded text-center focus:ring-2 focus:ring-blue-500 font-bold"
                                />
                                <span className="text-slate-500 font-bold">%</span>
                            </div>
                        </div>
                    ))}

                    <div className={`mt-6 p-4 rounded-lg flex justify-between items-center border ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                        <span className="font-bold text-lg">Total Syllabus Weight:</span>
                        <span className="font-bold text-2xl">{totalWeight}%</span>
                    </div>
                    {isError && <p className="text-sm text-red-600 font-medium text-right mt-2">Warning: Total weight should exactly equal 100%.</p>}

                    <div className="flex justify-end mt-8">
                        <button 
                            onClick={handleSave} 
                            disabled={isSaving}
                            className="bg-blue-600 text-white px-8 py-3 rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-50"
                        >
                            {isSaving ? "Saving..." : "Save Weight Configuration"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}