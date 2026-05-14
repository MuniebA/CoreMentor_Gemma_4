// frontend/app/dashboard/student/unit/[id]/components/AnnouncementsTab.tsx
export default function AnnouncementsTab({ announcements }: { announcements: any[] }) {
    return (
        <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900 mb-4 px-2">Class Announcements</h2>
            {announcements && announcements.length > 0 ? (
                <div className="space-y-4">
                    {[...announcements].reverse().map((ann: any, idx: number) => (
                        <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition">
                            <h4 className="font-bold text-slate-900 text-lg">{ann.title}</h4>
                            <p className="text-slate-600 mt-2 whitespace-pre-wrap">{ann.content}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white p-8 text-center rounded-xl border border-slate-200 border-dashed">
                    <p className="text-slate-500">No announcements posted yet.</p>
                </div>
            )}
        </div>
    );
}