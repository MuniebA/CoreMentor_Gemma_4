// frontend/app/dashboard/student/unit/[id]/components/SyllabusTab.tsx
export default function SyllabusTab({ unitData }: { unitData: any }) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column: Text Content */}
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm h-fit">
                <h2 className="text-lg font-bold text-slate-900 mb-6 border-b border-slate-100 pb-4">Course Objectives & Policies</h2>
                <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap">
                    {unitData.syllabus_content || "No syllabus text provided."}
                </div>
            </div>

            {/* Right Column: File Viewer */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-[600px] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold text-slate-900">Syllabus Document</h2>
                    {unitData.syllabus_url && (
                        <a 
                            href={`http://127.0.0.1:8000/${unitData.syllabus_url}`} 
                            target="_blank" 
                            className="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded font-medium hover:bg-blue-100 transition"
                        >
                            Open in New Tab
                        </a>
                    )}
                </div>
                
                {unitData.syllabus_url ? (
                    <iframe 
                        src={`http://127.0.0.1:8000/${unitData.syllabus_url}`} 
                        className="w-full flex-grow rounded-lg border border-slate-200"
                        title="Syllabus Preview"
                    />
                ) : (
                    <div className="flex-grow flex items-center justify-center border-2 border-dashed border-slate-200 rounded-lg bg-slate-50 text-slate-400 text-sm">
                        No document uploaded by instructor.
                    </div>
                )}
            </div>
        </div>
    );
}