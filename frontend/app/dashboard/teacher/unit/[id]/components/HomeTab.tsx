// frontend/app/dashboard/teacher/unit/[id]/components/HomeTab.tsx
import { useState } from "react";
import Cookies from "js-cookie";

export default function HomeTab({ unitId, unitData, onRefresh }: any) {
    const [isEditing, setIsEditing] = useState(false);
    const [editDescription, setEditDescription] = useState(unitData.description || "");
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}`, {
                method: "PUT",
                headers: { 
                    "Content-Type": "application/json", 
                    "Authorization": `Bearer ${Cookies.get("token")}` 
                },
                body: JSON.stringify({ description: editDescription })
            });
            setIsEditing(false);
            onRefresh(); // Tell parent to reload data
        } catch (err) {
            alert("Failed to save changes.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">Unit Overview</h2>
                    <p className="text-sm text-slate-500 mt-1">Instructor: {unitData.teacher_name}</p>
                </div>
                {!isEditing ? (
                    <button onClick={() => setIsEditing(true)} className="text-sm bg-slate-100 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-200 font-medium transition">Edit Details</button>
                ) : (
                    <div className="flex space-x-2">
                        <button onClick={() => { setIsEditing(false); setEditDescription(unitData.description || ""); }} className="text-sm text-slate-500 px-4 py-2 hover:text-slate-700 transition">Cancel</button>
                        <button onClick={handleSave} disabled={isSaving} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-70 font-medium">
                            {isSaving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                )}
            </div>
            {isEditing ? (
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={6} className="w-full px-4 py-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-900" placeholder="Write an introduction..." />
            ) : (
                <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap">{unitData.description || "No description provided yet."}</div>
            )}
        </div>
    );
}