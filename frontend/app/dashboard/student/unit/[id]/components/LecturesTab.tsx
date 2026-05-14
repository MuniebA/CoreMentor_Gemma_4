// frontend/app/dashboard/student/unit/[id]/components/LecturesTab.tsx
import { useState, useEffect } from "react";
import Cookies from "js-cookie";

interface TabContent {
    id: string;
    title: string;
    text: string;
    files: { url: string; name: string }[];
}

interface LectureModule {
    week_number: number;
    title: string;
    content_payload: TabContent[];
}

export default function LecturesTab({ unitId }: { unitId: string }) {
    const [modules, setModules] = useState<LectureModule[]>([]);
    const [activeWeek, setActiveWeek] = useState<number>(1);
    const [activeTabId, setActiveTabId] = useState<string>("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLectures = async () => {
            const token = Cookies.get("token");
            const res = await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/lectures`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setModules(data);
                
                // Set initial active week and tab if data exists
                if (data.length > 0) {
                    setActiveWeek(data[0].week_number);
                    if (data[0].content_payload.length > 0) {
                        setActiveTabId(data[0].content_payload[0].id);
                    }
                }
            }
            setLoading(false);
        };
        fetchLectures();
    }, [unitId]);

    if (loading) return <div className="p-8 text-slate-500 text-center">Loading modules...</div>;
    if (modules.length === 0) return <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-xl text-slate-500">No lectures have been published yet.</div>;

    const currentModule = modules.find(m => m.week_number === activeWeek);
    const currentTab = currentModule?.content_payload.find(t => t.id === activeTabId);

    return (
        <div className="flex bg-white rounded-xl border border-slate-200 shadow-sm min-h-[700px] overflow-hidden">
            
            {/* Left Sidebar: Week Selector */}
            <div className="w-56 bg-slate-50 border-r border-slate-200 p-4 flex flex-col overflow-y-auto">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Course Modules</h3>
                <div className="flex flex-col gap-1">
                    {modules.map(m => (
                        <button
                            key={m.week_number}
                            onClick={() => { setActiveWeek(m.week_number); setActiveTabId(m.content_payload[0]?.id || ""); }}
                            className={`text-left px-3 py-2.5 rounded-md text-sm font-medium transition ${
                                activeWeek === m.week_number ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200"
                            }`}
                        >
                            Week {m.week_number}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {currentModule ? (
                    <>
                        <div className="border-b border-slate-200 p-8 pb-0 bg-white z-10 shadow-sm">
                            <h2 className="text-2xl font-bold text-slate-900 mb-6">{currentModule.title}</h2>
                            <div className="flex space-x-1 overflow-x-auto pb-1 scrollbar-hide">
                                {currentModule.content_payload.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTabId(tab.id)}
                                        className={`px-6 py-2.5 border-b-2 text-sm font-medium transition whitespace-nowrap ${
                                            activeTabId === tab.id ? "border-blue-600 text-blue-600 bg-blue-50/50" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                                        }`}
                                    >
                                        {tab.title}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 p-8 bg-slate-50 overflow-y-auto">
                            {currentTab ? (
                                <div className="space-y-8 max-w-4xl">
                                    <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="text-xl font-bold text-slate-900 mb-4">{currentTab.title}</h3>
                                        <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap">
                                            {currentTab.text || <span className="text-slate-400 italic">No text content for this lesson.</span>}
                                        </div>
                                    </div>

                                    {currentTab.files.length > 0 && (
                                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                            <h4 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">Attached Materials</h4>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                                {currentTab.files.map((file, idx) => (
                                                    <a key={idx} href={`http://127.0.0.1:8000/${file.url}`} target="_blank" rel="noreferrer" className="border border-slate-200 rounded-lg p-3 flex flex-col items-center text-center bg-slate-50 hover:bg-blue-50 hover:border-blue-200 transition group cursor-pointer">
                                                        {file.name.match(/\.(jpeg|jpg|gif|png)$/) != null ? (
                                                            <img src={`http://127.0.0.1:8000/${file.url}`} alt={file.name} className="h-32 w-full object-cover rounded-md mb-3 border border-slate-200" />
                                                        ) : (
                                                            <div className="h-32 w-full bg-white border border-slate-200 rounded-md mb-3 flex items-center justify-center text-slate-400 group-hover:text-blue-500 transition">
                                                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                                                            </div>
                                                        )}
                                                        <span className="text-sm text-slate-700 font-medium truncate w-full group-hover:text-blue-700">{file.name}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-slate-500">Select a lesson tab above.</div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-slate-400">Select a week from the sidebar.</div>
                )}
            </div>
        </div>
    );
}