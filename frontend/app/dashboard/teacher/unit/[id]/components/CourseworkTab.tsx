// frontend/app/dashboard/teacher/unit/[id]/components/CourseworkTab.tsx
import { useState, useEffect } from "react";
import Cookies from "js-cookie";

interface Assignment {
    id: string;
    title: string;
    type: string;
    due_date: string;
    is_weighted: boolean;
    weight_percentage: number;
}

interface QuizQuestion {
    id: string;
    type: "MCQ" | "Open-Ended" | "Fill-in-the-Blank";
    question_text: string;
    options: string[];
    correct_answer: string;
}

export default function CourseworkTab({ unitId }: { unitId: string }) {
    const [subTab, setSubTab] = useState("List"); // List, Create New, Submissions, Grading Queue, Appeals
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // --- State for Edit & View ---
    const [editId, setEditId] = useState<string | null>(null);
    const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);

    // --- Core Assignment Form State ---
    const [title, setTitle] = useState("");
    const [type, setType] = useState("Homework");
    const [dueDate, setDueDate] = useState("");
    const [isWeighted, setIsWeighted] = useState(false);
    const [weight, setWeight] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null);
    const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);

    useEffect(() => {
        if (subTab === "List") fetchAssignments();
    }, [subTab, unitId]);

    const fetchAssignments = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/coursework/unit/${unitId}`, {
                headers: { "Authorization": `Bearer ${Cookies.get("token")}` }
            });
            if (res.ok) setAssignments(await res.json());
        } catch (err) {
            console.error("Failed to fetch coursework");
        } finally {
            setIsLoading(false);
        }
    };

    // --- Actions: Delete, Edit, View ---
    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this coursework? This cannot be undone.")) return;
        try {
            await fetch(`http://127.0.0.1:8000/api/v1/coursework/${id}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${Cookies.get("token")}` }
            });
            fetchAssignments();
        } catch (err) {
            alert("Failed to delete coursework.");
        }
    };

    const handleEditSetup = (a: Assignment) => {
        setEditId(a.id);
        setTitle(a.title);
        setType(a.type);
        // Format date for datetime-local input
        const formattedDate = new Date(a.due_date).toISOString().slice(0, 16);
        setDueDate(formattedDate);
        setIsWeighted(a.is_weighted);
        setWeight(a.weight_percentage);
        setSubTab("Create New"); // Open the form tab
    };

    const handleViewSubmissions = (a: Assignment) => {
        setActiveAssignment(a);
        setSubTab("Submissions");
    };

    const resetForm = () => {
        setEditId(null); setTitle(""); setType("Homework"); setDueDate(""); 
        setIsWeighted(false); setWeight(0); setAnswerKeyFile(null); setQuizQuestions([]);
    };

    // --- Quiz Builder Logic ---
    const addQuestion = (qType: "MCQ" | "Open-Ended" | "Fill-in-the-Blank") => {
        setQuizQuestions([...quizQuestions, { id: Math.random().toString(36).substr(2, 9), type: qType, question_text: "", options: qType === "MCQ" ? ["Option 1", "Option 2"] : [], correct_answer: "" }]);
    };
    const updateQuestion = (id: string, field: keyof QuizQuestion, value: any) => {
        setQuizQuestions(quizQuestions.map(q => q.id === id ? { ...q, [field]: value } : q));
    };
    const removeQuestion = (id: string) => {
        setQuizQuestions(quizQuestions.filter(q => q.id !== id));
    };
    const updateMCQOption = (qId: string, optIndex: number, newValue: string) => {
        setQuizQuestions(quizQuestions.map(q => {
            if (q.id === qId) {
                const newOptions = [...q.options];
                newOptions[optIndex] = newValue;
                return { ...q, options: newOptions };
            }
            return q;
        }));
    };
    const addMCQOption = (qId: string) => {
        setQuizQuestions(quizQuestions.map(q => q.id === qId ? { ...q, options: [...q.options, `New Option`] } : q));
    };
    // --------------------------

    const handleSaveAssignment = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const token = Cookies.get("token");

        const payload = {
            unit_id: unitId, title, type, 
            due_date: new Date(dueDate).toISOString(), 
            is_weighted: isWeighted, 
            weight_percentage: isWeighted ? Number(weight) : 0,
            quiz_payload: type === "Quiz" ? quizQuestions : []
        };

        try {
            if (editId) {
                // UPDATE existing
                await fetch(`http://127.0.0.1:8000/api/v1/coursework/${editId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                alert("Coursework updated!");
            } else {
                // CREATE new
                const createRes = await fetch(`http://127.0.0.1:8000/api/v1/coursework/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify(payload)
                });
                
                const createdData = await createRes.json();
                
                if ((type === "Homework" || type === "Exam") && answerKeyFile && createdData.id) {
                    const formData = new FormData();
                    formData.append("file", answerKeyFile);
                    await fetch(`http://127.0.0.1:8000/api/v1/upload/answer-key/${createdData.id}`, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${token}` },
                        body: formData
                    });
                }
                alert("Coursework created!");
            }
            resetForm();
            setSubTab("List");
        } catch (err) {
            alert("Error saving coursework.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex flex-col h-full space-y-6">
            
            {/* Inner Sub-Tab Navigation */}
            <div className="flex space-x-2 border-b border-slate-200 pb-2">
                {["List", "Create New", "Submissions", "Grading Queue", "Appeals"].map(tab => (
                    <button
                        key={tab}
                        onClick={() => {
                            if (tab === "Create New") resetForm();
                            setSubTab(tab);
                        }}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                            subTab === tab ? "bg-blue-600 text-white shadow-sm" : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                        }`}
                    >
                        {tab === "Create New" && editId ? "Edit Assessment" : tab}
                    </button>
                ))}
            </div>

            {/* --- VIEW 1: LIST ASSIGNMENTS --- */}
            {subTab === "List" && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                                <th className="p-4 font-bold">Title</th>
                                <th className="p-4 font-bold">Type</th>
                                <th className="p-4 font-bold">Due Date</th>
                                <th className="p-4 font-bold">Weight</th>
                                <th className="p-4 font-bold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {isLoading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading coursework...</td></tr>
                            ) : assignments.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400">No coursework created yet.</td></tr>
                            ) : (
                                assignments.map(a => (
                                    <tr key={a.id} className="hover:bg-slate-50 transition">
                                        <td className="p-4 font-medium text-slate-900">{a.title}</td>
                                        <td className="p-4"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-medium">{a.type}</span></td>
                                        <td className="p-4 text-slate-600 text-sm">{a.due_date ? new Date(a.due_date).toLocaleDateString() : "No Date"}</td>
                                        <td className="p-4 text-slate-600 text-sm">{a.is_weighted ? <span className="text-blue-600 font-medium">{a.weight_percentage}%</span> : "0% (Practice)"}</td>
                                        <td className="p-4 text-right space-x-3">
                                            <button onClick={() => handleViewSubmissions(a)} className="text-blue-600 hover:underline text-sm font-medium">Submissions</button>
                                            <button onClick={() => handleEditSetup(a)} className="text-amber-600 hover:underline text-sm font-medium">Edit</button>
                                            <button onClick={() => handleDelete(a.id)} className="text-red-600 hover:underline text-sm font-medium">Delete</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* --- VIEW 2: CREATE / EDIT COURSEWORK --- */}
            {subTab === "Create New" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1">
                        <form onSubmit={handleSaveAssignment} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6 sticky top-6">
                            <h2 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">
                                {editId ? "Edit Assessment" : "Assessment Details"}
                            </h2>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500" />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                                <select disabled={!!editId} value={type} onChange={(e) => setType(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-100">
                                    <option value="Homework">Homework (File Upload)</option>
                                    <option value="Exam">Exam (File Upload)</option>
                                    <option value="Quiz">Quiz (Interactive Builder)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Due Date & Time</label>
                                <input type="datetime-local" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500" />
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <label className="flex items-center space-x-3 cursor-pointer">
                                    <input type="checkbox" checked={isWeighted} onChange={(e) => setIsWeighted(e.target.checked)} className="w-4 h-4 text-blue-600 rounded" />
                                    <span className="text-sm font-bold text-slate-900">Count towards Final Grade</span>
                                </label>
                                {isWeighted && (
                                    <div className="mt-3">
                                        <label className="block text-xs font-medium text-slate-700 mb-1">Weight Percentage (%)</label>
                                        <input type="number" min="1" max="100" required={isWeighted} value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="w-full px-4 py-2 border border-slate-300 rounded-md" />
                                    </div>
                                )}
                            </div>

                            <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white py-3 rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-70">
                                {isSubmitting ? "Saving..." : (editId ? "Update Coursework" : `Publish ${type}`)}
                            </button>
                        </form>
                    </div>

                    {/* Right Column: Quiz Builder / Uploader */}
                    <div className="lg:col-span-2">
                        {type === "Quiz" ? (
                            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm min-h-[500px]">
                                <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                                    <h2 className="text-xl font-bold text-slate-900">Interactive Quiz Builder</h2>
                                    <div className="space-x-2">
                                        <button type="button" onClick={() => addQuestion("MCQ")} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded">+ MCQ</button>
                                        <button type="button" onClick={() => addQuestion("Fill-in-the-Blank")} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded">+ Blank</button>
                                        <button type="button" onClick={() => addQuestion("Open-Ended")} className="px-3 py-1.5 bg-blue-50 text-blue-700 text-sm font-medium rounded">+ Open</button>
                                    </div>
                                </div>
                                {quizQuestions.length === 0 ? (
                                    <div className="text-center py-12 text-slate-400"><p>No questions added yet.</p></div>
                                ) : (
                                    <div className="space-y-8">
                                        {quizQuestions.map((q, index) => (
                                            <div key={q.id} className="p-6 border border-slate-200 rounded-lg bg-slate-50 relative group">
                                                <button type="button" onClick={() => removeQuestion(q.id)} className="absolute top-4 right-4 text-red-400 hover:text-red-600 hidden group-hover:block text-sm font-bold">Remove</button>
                                                <span className="inline-block bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded mb-3 uppercase tracking-wider">Q{index + 1} • {q.type}</span>
                                                <textarea rows={2} value={q.question_text} onChange={(e) => updateQuestion(q.id, "question_text", e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 mb-4" placeholder="Enter question..." />
                                                {q.type === "MCQ" && (
                                                    <div className="space-y-2 ml-4 mb-4">
                                                        {q.options.map((opt, oIndex) => (
                                                            <div key={oIndex} className="flex items-center space-x-2">
                                                                <span className="w-6 h-6 flex items-center justify-center bg-white border border-slate-300 rounded-full text-xs font-bold text-slate-500">{String.fromCharCode(65 + oIndex)}</span>
                                                                <input type="text" value={opt} onChange={(e) => updateMCQOption(q.id, oIndex, e.target.value)} className="flex-1 px-3 py-1 border border-slate-300 rounded text-sm" />
                                                            </div>
                                                        ))}
                                                        <button type="button" onClick={() => addMCQOption(q.id)} className="text-xs text-blue-600 font-medium hover:underline mt-2">+ Add another option</button>
                                                    </div>
                                                )}
                                                <div className="border-t border-slate-200 pt-4 mt-2">
                                                    <label className="block text-xs font-bold text-green-600 uppercase mb-1">Correct Answer</label>
                                                    <input type="text" value={q.correct_answer} onChange={(e) => updateQuestion(q.id, "correct_answer", e.target.value)} className="w-full px-4 py-2 border border-green-300 bg-green-50 rounded-md text-sm text-green-900" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="bg-white p-12 rounded-xl border border-slate-200 shadow-sm min-h-[500px] flex flex-col items-center justify-center text-center">
                                <h3 className="text-xl font-bold text-slate-900 mb-2">Upload Answer Key</h3>
                                <input type="file" id="answer-key-upload" className="hidden" onChange={(e) => setAnswerKeyFile(e.target.files?.[0] || null)} />
                                <label htmlFor="answer-key-upload" className="cursor-pointer bg-white border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 rounded-xl px-8 py-6 w-full max-w-md">
                                    <span className="block text-blue-600 font-medium">{answerKeyFile ? answerKeyFile.name : "Click to select a PDF or Image"}</span>
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* --- VIEW 3: STUDENT SUBMISSIONS --- */}
            {subTab === "Submissions" && activeAssignment && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                    <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-900">{activeAssignment.title}</h2>
                            <p className="text-sm text-slate-500 mt-1">
                                {activeAssignment.type} • Due: {new Date(activeAssignment.due_date).toLocaleString()}
                            </p>
                        </div>
                        <button onClick={() => setSubTab("List")} className="text-sm bg-slate-100 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-200 font-medium">
                            &larr; Back to List
                        </button>
                    </div>
                    
                    <div className="bg-slate-50 p-12 text-center rounded-lg border-2 border-dashed border-slate-200">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
                        </div>
                        <h3 className="text-lg font-bold text-slate-700 mb-1">Student Roster Loading...</h3>
                        <p className="text-sm text-slate-500 max-w-md mx-auto">This view will display a list of all students in the unit, showing who has submitted their work and who is missing.</p>
                    </div>
                </div>
            )}

            {/* GRADING & APPEALS PLACEHOLDERS */}
            {subTab === "Grading Queue" && <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">AI Grading UI Placeholder</div>}
            {subTab === "Appeals" && <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">Appeals UI Placeholder</div>}
        </div>
    );
}