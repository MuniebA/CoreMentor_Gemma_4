// frontend/app/dashboard/teacher/unit/[id]/components/LecturesTab.tsx
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
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        fetchLectures();
    }, [unitId]);

    const fetchLectures = async () => {
        const token = Cookies.get("token");
        const res = await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/lectures`, {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            setModules(data);
            if (data.length > 0 && !activeTabId && data[0].content_payload.length > 0) {
                setActiveTabId(data[0].content_payload[0].id);
            }
        }
    };

    // --- Dynamic Week Calculation ---
    // Find the highest week saved in the DB, or the currently active week, defaulting to at least 1.
    const maxSavedWeek = modules.length > 0 ? Math.max(...modules.map(m => m.week_number)) : 0;
    const highestVisibleWeek = Math.max(activeWeek, maxSavedWeek, 1);
    const visibleWeeks = Array.from({ length: highestVisibleWeek }, (_, i) => i + 1);

    const handleAddNewWeek = () => {
        setActiveWeek(highestVisibleWeek + 1);
        setActiveTabId("");
    };
    // --------------------------------

    // Get current module or create an empty scaffold
    const currentModule = modules.find(m => m.week_number === activeWeek) || {
        week_number: activeWeek,
        title: `Week ${activeWeek} Module`,
        content_payload: []
    };

    const currentTab = currentModule.content_payload.find(t => t.id === activeTabId);

    const handleAddTab = () => {
        const newTabId = Math.random().toString(36).substr(2, 9);
        const updatedModule = {
            ...currentModule,
            content_payload: [...currentModule.content_payload, { id: newTabId, title: "New Page", text: "", files: [] }]
        };
        updateLocalModules(updatedModule);
        setActiveTabId(newTabId);
    };

    const updateLocalModules = (updatedModule: LectureModule) => {
        setModules(prev => {
            const exists = prev.find(m => m.week_number === updatedModule.week_number);
            if (exists) return prev.map(m => m.week_number === updatedModule.week_number ? updatedModule : m);
            return [...prev, updatedModule];
        });
    };

    const handleUpdateTab = (field: keyof TabContent, value: any) => {
        if (!currentTab) return;
        const updatedTabs = currentModule.content_payload.map(t => 
            t.id === activeTabId ? { ...t, [field]: value } : t
        );
        updateLocalModules({ ...currentModule, content_payload: updatedTabs });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentTab) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`http://127.0.0.1:8000/api/v1/upload/lecture-file`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${Cookies.get("token")}` },
                body: formData
            });
            const data = await res.json();
            
            const updatedFiles = [...currentTab.files, { url: data.url, name: data.filename }];
            handleUpdateTab("files", updatedFiles);
        } catch (err) {
            alert("File upload failed");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveModule = async () => {
        setIsSaving(true);
        try {
            await fetch(`http://127.0.0.1:8000/api/v1/units/${unitId}/lectures`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Cookies.get("token")}` 
                },
                body: JSON.stringify(currentModule)
            });
            // Update local state so the dynamic week calculator registers it as "saved"
            setModules(prev => {
                const exists = prev.find(m => m.week_number === currentModule.week_number);
                if (exists) return prev.map(m => m.week_number === currentModule.week_number ? currentModule : m);
                return [...prev, currentModule];
            });
            alert("Module saved successfully!");
        } catch (err) {
            alert("Failed to save module.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="flex bg-white rounded-xl border border-slate-200 shadow-sm h-[700px] overflow-hidden">
            
            {/* Left Sidebar: Dynamic Week Selector */}
            <div className="w-56 bg-slate-50 border-r border-slate-200 p-4 flex flex-col overflow-y-auto">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">Course Modules</h3>
                <div className="flex flex-col gap-1 flex-grow">
                    {visibleWeeks.map(week => (
                        <button
                            key={week}
                            onClick={() => { setActiveWeek(week); setActiveTabId(""); }}
                            className={`text-left px-3 py-2.5 rounded-md text-sm font-medium transition ${
                                activeWeek === week ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-200"
                            }`}
                        >
                            Week {week}
                        </button>
                    ))}
                </div>
                {/* The new dynamic expansion button */}
                <div className="pt-4 mt-2 border-t border-slate-200">
                    <button 
                        onClick={handleAddNewWeek}
                        className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-blue-600 hover:bg-blue-50 transition border border-dashed border-blue-200"
                    >
                        + Add Week
                    </button>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Header & Sub-tabs */}
                <div className="border-b border-slate-200 p-6 pb-0 bg-white z-10 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <input 
                            type="text" 
                            value={currentModule.title}
                            onChange={(e) => updateLocalModules({ ...currentModule, title: e.target.value })}
                            className="text-2xl font-bold text-slate-900 border-none focus:ring-0 p-0 bg-transparent w-2/3"
                            placeholder="Enter Module Title..."
                        />
                        <button 
                            onClick={handleSaveModule} 
                            disabled={isSaving}
                            className="bg-green-600 text-white px-5 py-2.5 rounded-md font-medium hover:bg-green-700 transition disabled:opacity-70 shadow-sm"
                        >
                            {isSaving ? "Saving..." : "Save Week Data"}
                        </button>
                    </div>

                    <div className="flex space-x-1 overflow-x-auto pb-1 scrollbar-hide">
                        {currentModule.content_payload.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTabId(tab.id)}
                                className={`px-5 py-2.5 border-b-2 text-sm font-medium transition whitespace-nowrap ${
                                    activeTabId === tab.id ? "border-blue-600 text-blue-600 bg-blue-50/50" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                                }`}
                            >
                                {tab.title}
                            </button>
                        ))}
                        <button onClick={handleAddTab} className="px-4 py-2.5 text-sm font-medium text-slate-400 hover:text-blue-600 transition whitespace-nowrap">
                            + Add Page
                        </button>
                    </div>
                </div>

                {/* Tab Workspace */}
                <div className="flex-1 p-8 bg-slate-50 overflow-y-auto">
                    {currentTab ? (
                        <div className="space-y-8 max-w-4xl">
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Page Title</label>
                                <input 
                                    type="text" 
                                    value={currentTab.title} 
                                    onChange={(e) => handleUpdateTab("title", e.target.value)}
                                    className="w-full px-4 py-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 text-slate-900"
                                />
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Lesson Content</label>
                                <textarea 
                                    value={currentTab.text} 
                                    onChange={(e) => handleUpdateTab("text", e.target.value)}
                                    rows={10}
                                    className="w-full px-4 py-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 whitespace-pre-wrap text-slate-700"
                                    placeholder="Write your lesson text here. You can format it and add links as needed."
                                />
                            </div>

                            {/* File Management */}
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Attached Files & Images</label>
                                
                                {currentTab.files.length > 0 && (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                        {currentTab.files.map((file, idx) => (
                                            <div key={idx} className="border border-slate-200 rounded-lg p-3 flex flex-col items-center text-center bg-slate-50 hover:bg-white transition hover:shadow-sm">
                                                {file.name.match(/\.(jpeg|jpg|gif|png)$/) != null ? (
                                                    <img src={`http://127.0.0.1:8000/${file.url}`} alt={file.name} className="h-24 w-full object-cover rounded-md mb-3 border border-slate-200" />
                                                ) : (
                                                    <div className="h-24 w-full bg-blue-50 border border-blue-100 rounded-md mb-3 flex items-center justify-center text-blue-600">
                                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                                                    </div>
                                                )}
                                                <a href={`http://127.0.0.1:8000/${file.url}`} target="_blank" className="text-xs text-blue-600 hover:text-blue-800 font-medium truncate w-full hover:underline">{file.name}</a>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:bg-slate-50 transition">
                                    <input 
                                        type="file" 
                                        id="file-upload" 
                                        className="hidden" 
                                        onChange={handleFileUpload}
                                    />
                                    <label 
                                        htmlFor="file-upload" 
                                        className="cursor-pointer inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-100 transition"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                                        <span>{isUploading ? "Uploading to Server..." : "Attach New File"}</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            </div>
                            <p className="text-lg font-medium text-slate-600">No content selected</p>
                            <p className="text-sm mt-1">Select a page above or click "+ Add Page" to start building this module.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}