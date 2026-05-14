// frontend/app/dashboard/student/unit/[id]/components/CourseworkTab.tsx
import { useState, useEffect } from "react";
import Cookies from "js-cookie";

interface StudentAssignment {
    id: string;
    title: string;
    type: string;
    due_date: string;
    is_weighted: boolean;
    weight_percentage: number;
    status: string;
    score: number | null;
    feedback: string | null;
    marking_id: string | null;
    submission_url: string | null;
    appeal_text: string | null;
}

export default function CourseworkTab({ unitId }: { unitId: string }) {
    const [assignments, setAssignments] = useState<StudentAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeAssignment, setActiveAssignment] = useState<StudentAssignment | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [appealText, setAppealText] = useState("");
    const [isAppealing, setIsAppealing] = useState(false);

    useEffect(() => { fetchCoursework(); }, [unitId]);

    const fetchCoursework = async () => {
        setLoading(true);
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/coursework/student/${unitId}`, {
                headers: { "Authorization": `Bearer ${Cookies.get("token")}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAssignments(data);
                // If viewing details, update the active assignment state too
                if (activeAssignment) {
                    const updated = data.find((a: StudentAssignment) => a.id === activeAssignment.id);
                    if (updated) setActiveAssignment(updated);
                }
            }
        } catch (err) {
            console.error("Failed to fetch coursework");
        } finally {
            setLoading(false);
        }
    };

    const handleUploadHomework = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile || !activeAssignment) return;
        
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", uploadFile);

        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/upload/homework/${activeAssignment.id}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${Cookies.get("token")}` },
                body: formData
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.detail || "Upload failed");
            }
            alert("Assignment submitted successfully!");
            setUploadFile(null);
            fetchCoursework(); 
        } catch (err: any) {
            alert(`Failed: ${err.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleAppeal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeAssignment || !activeAssignment.marking_id) return;
        
        setIsAppealing(true);
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/marking/appeal`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Cookies.get("token")}` 
                },
                body: JSON.stringify({
                    marking_id: activeAssignment.marking_id,
                    student_note: appealText
                })
            });

            if (!res.ok) throw new Error("Appeal failed");
            alert("Appeal submitted! The teacher has been notified.");
            setAppealText("");
            fetchCoursework();
        } catch (err) {
            alert("Failed to submit appeal.");
        } finally {
            setIsAppealing(false);
        }
    };

    if (loading && assignments.length === 0) return <div className="text-slate-500 text-center p-8">Loading coursework...</div>;

    if (activeAssignment) {
        return (
            <div className="max-w-3xl mx-auto space-y-6">
                <button onClick={() => setActiveAssignment(null)} className="text-sm bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 font-medium transition">
                    &larr; Back to List
                </button>

                <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">{activeAssignment.title}</h2>
                            <p className="text-slate-500 mt-1">Due: {activeAssignment.due_date ? new Date(activeAssignment.due_date).toLocaleString() : "No Due Date"}</p>
                        </div>
                        <span className={`px-3 py-1 text-xs font-bold uppercase rounded-full tracking-wider ${
                            activeAssignment.status === "Pending" ? "bg-amber-100 text-amber-800" :
                            activeAssignment.status.includes("Graded") ? "bg-green-100 text-green-800" :
                            "bg-blue-100 text-blue-800"
                        }`}>
                            {activeAssignment.status}
                        </span>
                    </div>

                    {/* SHOW SUBMITTED FILE IF IT EXISTS */}
                    {activeAssignment.submission_url && (
                        <div className="mb-8 p-4 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center">
                            <div className="flex items-center">
                                <svg className="w-6 h-6 text-slate-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"></path></svg>
                                <div>
                                    <p className="text-sm font-bold text-slate-700">Your Submission</p>
                                    <p className="text-xs text-slate-500">Uploaded successfully</p>
                                </div>
                            </div>
                            <a href={`http://127.0.0.1:8000/${activeAssignment.submission_url}`} target="_blank" rel="noreferrer" className="text-sm bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded font-medium hover:bg-slate-100 transition">
                                View File
                            </a>
                        </div>
                    )}

                    {activeAssignment.status === "Pending" && (
                        <form onSubmit={handleUploadHomework} className="space-y-6">
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-6 text-center">
                                <h3 className="font-bold text-blue-900 mb-2">Submit Your Work</h3>
                                <p className="text-sm text-blue-700 mb-6">Upload your completed assignment file (PDF or Image) here.</p>
                                
                                <input type="file" id="homework-upload" className="hidden" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
                                <label htmlFor="homework-upload" className="cursor-pointer inline-block bg-white border-2 border-dashed border-blue-300 hover:border-blue-500 transition rounded-xl px-8 py-6 w-full max-w-md">
                                    <span className="block text-blue-600 font-medium">{uploadFile ? uploadFile.name : "Click to select a PDF or Image"}</span>
                                </label>
                            </div>
                            <div className="flex justify-end">
                                <button type="submit" disabled={!uploadFile || isUploading} className="bg-blue-600 text-white px-8 py-3 rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-50">
                                    {isUploading ? "Uploading..." : "Submit Assignment"}
                                </button>
                            </div>
                        </form>
                    )}

                    {activeAssignment.status === "Submitted (Pending AI/Teacher Review)" && (
                        <div className="text-center p-8">
                            <p className="text-slate-500">Your assignment is currently in the queue for AI and Teacher review. Check back later for your grade!</p>
                        </div>
                    )}

                    {activeAssignment.status.includes("Graded") && (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row gap-6">
                                <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center flex-1">
                                    <p className="text-green-800 font-bold text-sm uppercase tracking-wider mb-2">Final Score</p>
                                    <p className="text-5xl font-bold text-green-600">{activeAssignment.score}%</p>
                                </div>
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 flex-[2]">
                                    <p className="text-slate-500 font-bold text-sm uppercase tracking-wider mb-2">Feedback Details</p>
                                    <p className="text-slate-700">{activeAssignment.feedback || "No feedback provided."}</p>
                                </div>
                            </div>

                            <div className="mt-8 pt-8 border-t border-slate-200">
                                {activeAssignment.appeal_text ? (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
                                        <h4 className="font-bold text-amber-900 mb-2">Your Appeal is Under Review</h4>
                                        <p className="text-sm text-amber-800 italic">"{activeAssignment.appeal_text}"</p>
                                    </div>
                                ) : (
                                    <>
                                        <h4 className="font-bold text-slate-900 mb-2">Disagree with this grade?</h4>
                                        <p className="text-sm text-slate-500 mb-4">You can submit one appeal per assignment if you believe the AI or Teacher missed something.</p>
                                        <form onSubmit={handleAppeal} className="space-y-3">
                                            <textarea required rows={3} value={appealText} onChange={(e) => setAppealText(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500" placeholder="Explain exactly which part of your answer was marked incorrectly..." />
                                            <div className="flex justify-end">
                                                <button type="submit" disabled={isAppealing} className="bg-amber-500 text-white px-6 py-2 rounded-md font-medium hover:bg-amber-600 transition disabled:opacity-50">
                                                    {isAppealing ? "Submitting..." : "Submit Appeal"}
                                                </button>
                                            </div>
                                        </form>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                        <th className="p-4 font-bold">Title</th>
                        <th className="p-4 font-bold">Due Date</th>
                        <th className="p-4 font-bold">Weight</th>
                        <th className="p-4 font-bold">Status</th>
                        <th className="p-4 font-bold text-right">Action</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {assignments.length === 0 ? (
                        <tr><td colSpan={5} className="p-8 text-center text-slate-400">No coursework assigned yet.</td></tr>
                    ) : (
                        assignments.map(a => (
                            <tr key={a.id} className="hover:bg-slate-50 transition cursor-pointer" onClick={() => setActiveAssignment(a)}>
                                <td className="p-4 font-medium text-slate-900">{a.title}</td>
                                <td className="p-4 text-slate-600 text-sm">{a.due_date ? new Date(a.due_date).toLocaleDateString() : "No Date"}</td>
                                <td className="p-4 text-slate-600 text-sm">{a.is_weighted ? <span className="text-blue-600 font-medium">{a.weight_percentage}%</span> : "0%"}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-full tracking-wider ${
                                        a.status === "Pending" ? "bg-amber-100 text-amber-800" :
                                        a.status.includes("Graded") ? "bg-green-100 text-green-800" :
                                        "bg-blue-100 text-blue-800"
                                    }`}>
                                        {a.status}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    <button className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline">
                                        {a.status === "Pending" ? "Submit Work" : "View Details"}
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}