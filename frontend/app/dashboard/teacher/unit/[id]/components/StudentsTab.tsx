// frontend/app/dashboard/teacher/unit/[id]/components/StudentsTab.tsx
import { useState, useEffect } from "react";
import Cookies from "js-cookie";

interface StudentData {
    student_id: string;
    full_name: string;
    rank_title: string;
    total_xp: number;
    career_goal: string;
    teacher_notes: string;
    grades: Record<string, number>;
    final_grade: number;
}

export default function StudentsTab({ unitId }: { unitId: string }) {
    const [roster, setRoster] = useState<{ assignments: any[], students: StudentData[] }>({ assignments: [], students: [] });
    const [isLoading, setIsLoading] = useState(true);
    
    // Modal State
    const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
    const [teacherNotes, setTeacherNotes] = useState("");
    const [isSavingNotes, setIsSavingNotes] = useState(false);

    useEffect(() => {
        fetchRoster();
    }, [unitId]);

    const fetchRoster = async () => {
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/students`, {
                headers: { "Authorization": `Bearer ${Cookies.get("token")}` }
            });
            if (res.ok) setRoster(await res.json());
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveNotes = async () => {
        if (!selectedStudent) return;
        setIsSavingNotes(true);
        try {
            await fetch(`http://127.0.0.1:8000/api/v1/units/student/${selectedStudent.student_id}/notes`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Cookies.get("token")}` },
                body: JSON.stringify({ teacher_notes: teacherNotes })
            });
            // Update local state
            setRoster(prev => ({
                ...prev,
                students: prev.students.map(s => s.student_id === selectedStudent.student_id ? { ...s, teacher_notes: teacherNotes } : s)
            }));
            setSelectedStudent(null);
        } catch (err) {
            alert("Failed to save notes.");
        } finally {
            setIsSavingNotes(false);
        }
    };

    if (isLoading) return <div className="text-slate-500">Loading student roster and gradebook...</div>;

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden relative">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
                <h2 className="text-xl font-bold text-slate-900">Student Roster & Gradebook</h2>
                <p className="text-sm text-slate-500 mt-1">Click on any student row to view their gamification profile and add personalized Shadow Mentor notes.</p>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead>
                        <tr className="bg-slate-100 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-600">
                            <th className="p-4 font-bold">Student Name</th>
                            {roster.assignments.map(a => (
                                <th key={a.id} className="p-4 font-bold text-center">
                                    <div className="truncate w-24 mx-auto" title={a.title}>{a.title}</div>
                                    <div className="text-[10px] text-slate-400 mt-1">{a.weight}% Weight</div>
                                </th>
                            ))}
                            <th className="p-4 font-bold text-right text-blue-800 bg-blue-50">Final Grade</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {roster.students.length === 0 ? (
                            <tr><td colSpan={roster.assignments.length + 2} className="p-8 text-center text-slate-400">No students enrolled.</td></tr>
                        ) : (
                            roster.students.map(student => (
                                <tr 
                                    key={student.student_id} 
                                    onClick={() => { setSelectedStudent(student); setTeacherNotes(student.teacher_notes); }}
                                    className="hover:bg-blue-50 transition cursor-pointer"
                                >
                                    <td className="p-4 font-medium text-slate-900">{student.full_name}</td>
                                    {roster.assignments.map(a => (
                                        <td key={a.id} className="p-4 text-center text-slate-600 font-mono text-sm">
                                            {student.grades[a.id] ? `${student.grades[a.id]}%` : "-"}
                                        </td>
                                    ))}
                                    <td className="p-4 text-right font-bold text-blue-700 bg-blue-50/30 text-lg">
                                        {student.final_grade}%
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* --- MODAL FOR STUDENT PROFILE --- */}
            {selectedStudent && (
                <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-start">
                            <div>
                                <h3 className="text-2xl font-bold text-slate-900">{selectedStudent.full_name}</h3>
                                <p className="text-slate-500 mt-1 flex items-center space-x-3">
                                    <span className="font-bold text-amber-600">🏆 {selectedStudent.rank_title}</span>
                                    <span>•</span>
                                    <span className="font-mono text-xs">{selectedStudent.total_xp} XP</span>
                                </p>
                            </div>
                            <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                                <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-1">Declared Career Pathway</h4>
                                <p className="text-blue-900 font-medium">{selectedStudent.career_goal || "Student has not set a career goal yet."}</p>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-slate-900 mb-2 flex items-center">
                                    <svg className="w-5 h-5 mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                    Shadow Mentor Input
                                </h4>
                                <p className="text-xs text-slate-500 mb-2">Notes written here will be securely read by the AI Shadow Mentor to help personalize the student's future hints and homework balancing.</p>
                                <textarea 
                                    rows={5}
                                    value={teacherNotes}
                                    onChange={(e) => setTeacherNotes(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-slate-700"
                                    placeholder="e.g., Struggles with word problems. Needs more visual examples. Excellent at abstract equations."
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end space-x-3">
                            <button onClick={() => setSelectedStudent(null)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-md transition">Cancel</button>
                            <button onClick={handleSaveNotes} disabled={isSavingNotes} className="bg-indigo-600 text-white px-6 py-2 rounded-md font-medium hover:bg-indigo-700 transition disabled:opacity-50">
                                {isSavingNotes ? "Saving to AI..." : "Save Mentor Notes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}