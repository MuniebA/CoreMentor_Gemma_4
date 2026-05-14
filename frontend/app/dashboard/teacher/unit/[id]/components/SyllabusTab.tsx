// frontend/app/dashboard/teacher/unit/[id]/components/SyllabusTab.tsx
import { useState } from "react";
import Cookies from "js-cookie";

export default function SyllabusTab({ unitId, unitData, onRefresh }: any) {
    const [textContent, setTextContent] = useState(unitData.syllabus_content || "");
    const [isSavingText, setIsSavingText] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleSaveText = async () => {
        setIsSavingText(true);
        try {
            await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/syllabus-content`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Cookies.get("token")}` },
                body: JSON.stringify({ content: textContent })
            });
            onRefresh();
        } catch (err) {
            alert("Failed to save syllabus text.");
        } finally {
            setIsSavingText(false);
        }
    };

    const handleUploadFile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            await fetch(`http://127.0.0.1:8000/api/v1/upload/syllabus/${unitId}`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${Cookies.get("token")}` },
                body: formData
            });
            setFile(null);
            onRefresh();
        } catch (err) {
            alert("Upload failed.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column: Editors */}
            <div className="space-y-6">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-4">Syllabus Text & Objectives</h2>
                    <textarea 
                        value={textContent} 
                        onChange={(e) => setTextContent(e.target.value)} 
                        rows={8} 
                        className="w-full px-4 py-3 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 mb-3" 
                        placeholder="Write course objectives, grading rules, or policies here..." 
                    />
                    <button onClick={handleSaveText} disabled={isSavingText} className="bg-slate-800 text-white px-4 py-2 rounded-md hover:bg-slate-900 transition disabled:opacity-50 font-medium">
                        {isSavingText ? "Saving..." : "Save Text"}
                    </button>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-900 mb-4">Upload Document</h2>
                    <form onSubmit={handleUploadFile}>
                        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer mb-4" />
                        <button type="submit" disabled={!file || isUploading} className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50 font-medium">
                            {isUploading ? "Uploading..." : "Upload File"}
                        </button>
                    </form>
                </div>
            </div>

            {/* Right Column: File Preview */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[600px] flex flex-col">
                <h2 className="text-lg font-bold text-slate-900 mb-4">Document Preview</h2>
                {unitData.syllabus_url ? (
                    <iframe 
                        src={`http://127.0.0.1:8000/${unitData.syllabus_url}`} 
                        className="w-full flex-grow rounded-lg border border-slate-200"
                        title="Syllabus Preview"
                    />
                ) : (
                    <div className="flex-grow flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 text-slate-400 text-sm">
                        No document uploaded yet.
                    </div>
                )}
            </div>
        </div>
    );
}