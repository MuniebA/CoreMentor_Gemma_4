// frontend/app/dashboard/teacher/unit/[id]/components/AnnouncementsTab.tsx
import { useState } from "react";
import Cookies from "js-cookie";

export default function AnnouncementsTab({ unitId, announcements, onRefresh }: any) {
    const [title, setTitle] = useState("");
    const [content, setContent] = useState("");
    const [isPosting, setIsPosting] = useState(false);

    const handlePost = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsPosting(true);
        try {
            await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/announcements`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    "Authorization": `Bearer ${Cookies.get("token")}` 
                },
                body: JSON.stringify({ title, content })
            });
            setTitle("");
            setContent("");
            onRefresh();
        } catch (err) {
            alert("Failed to post announcement.");
        } finally {
            setIsPosting(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                <h2 className="text-xl font-bold text-slate-900 mb-4">Post Announcement</h2>
                <form onSubmit={handlePost} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                        <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" placeholder="e.g., Week 1 Reading Material" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                        <textarea required rows={3} value={content} onChange={(e) => setContent(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900" placeholder="Write your announcement..." />
                    </div>
                    <button type="submit" disabled={isPosting} className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50 font-medium">
                        {isPosting ? "Posting..." : "Post to Class"}
                    </button>
                </form>
            </div>

            <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4">Previous Announcements</h3>
                {announcements && announcements.length > 0 ? (
                    <div className="space-y-4">
                        {[...announcements].reverse().map((ann: any, idx: number) => (
                            <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="font-bold text-slate-900 text-lg">{ann.title}</h4>
                                <p className="text-slate-600 mt-2 whitespace-pre-wrap">{ann.content}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-white p-8 text-center rounded-xl border border-slate-200 border-dashed"><p className="text-slate-500">No announcements posted yet.</p></div>
                )}
            </div>
        </div>
    );
}