// frontend/app/dashboard/student/unit/[id]/components/HomeTab.tsx
export default function HomeTab({ unitData }: { unitData: any }) {
    return (
        <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
            <div className="mb-6 border-b border-slate-100 pb-4">
                <h2 className="text-xl font-bold text-slate-900">Unit Overview</h2>
                <p className="text-sm text-slate-500 mt-1">Instructor: {unitData.teacher_name}</p>
            </div>
            <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap">
                {unitData.description || "No description provided by the instructor."}
            </div>
        </div>
    );
}