"use client";
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BACKEND_URL } from "@/lib/api";
import { Database, Search, ExternalLink, Image, FileText, BarChart3, Loader2 } from "lucide-react";

const FL_BASE = `${BACKEND_URL}/fl`;

const TASK_OPTIONS = [
    { label: "Computer Vision", value: "computer vision", icon: Image, color: "bg-blue-50 border-blue-200 text-blue-700" },
    { label: "NLP / Text", value: "nlp", icon: FileText, color: "bg-violet-50 border-violet-200 text-violet-700" },
    { label: "Tabular / Data", value: "tabular", icon: BarChart3, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
];

interface Dataset {
    title: string;
    description: string;
    url: string;
    size: string;
    task: string;
}

export default function DatasetsPage() {
    const [query, setQuery] = useState("tabular");
    const [results, setResults] = useState<Dataset[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const [customQuery, setCustomQuery] = useState("");

    const search = async (q: string) => {
        setLoading(true);
        setSearched(false);
        try {
            const res = await fetch(`${FL_BASE}/datasets/search?q=${encodeURIComponent(q)}&limit=8`);
            if (res.ok) {
                const json = await res.json();
                setResults(json.results || []);
            }
        } catch (e) {
            console.error("Search failed", e);
        } finally {
            setLoading(false);
            setSearched(true);
        }
    };

    const taskColor = (task: string) => {
        if (task.includes("vision") || task.includes("image")) return "bg-blue-50 text-blue-700 border-blue-200";
        if (task.includes("nlp") || task.includes("text")) return "bg-violet-50 text-violet-700 border-violet-200";
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
    };

    return (
        <div className="flex flex-col gap-8 pb-10">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                    <Database className="w-8 h-8 text-emerald-500" />
                    Dataset Discovery
                </h2>
                <p className="text-slate-500 text-sm">
                    Search the Kaggle dataset registry by task type. Use these datasets to train and contribute FL updates.
                </p>
            </div>

            {/* Task Quick-Select */}
            <div className="flex flex-wrap gap-3">
                {TASK_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        onClick={() => { setQuery(opt.value); search(opt.value); }}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border font-semibold text-sm transition-all hover:shadow-sm ${query === opt.value ? opt.color + " shadow-sm ring-2 ring-offset-1 ring-current" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                        <opt.icon className="w-4 h-4" />
                        {opt.label}
                    </button>
                ))}
            </div>

            {/* Custom Search */}
            <div className="flex gap-3">
                <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search datasets... e.g. 'fraud detection', 'image segmentation'"
                        value={customQuery}
                        onChange={(e) => setCustomQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && customQuery) { setQuery(customQuery); search(customQuery); } }}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
                    />
                </div>
                <button
                    onClick={() => { if (customQuery) { setQuery(customQuery); search(customQuery); } }}
                    disabled={loading || !customQuery}
                    className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search
                </button>
            </div>

            {/* Results */}
            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="rounded-xl border border-slate-200 p-5 bg-white animate-pulse">
                            <div className="h-5 bg-slate-100 rounded w-2/3 mb-3" />
                            <div className="h-3.5 bg-slate-100 rounded w-full mb-2" />
                            <div className="h-3.5 bg-slate-100 rounded w-4/5" />
                        </div>
                    ))}
                </div>
            )}

            {!loading && searched && results.length === 0 && (
                <div className="text-center py-16 text-slate-400">
                    <Database className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                    <p className="font-medium">No datasets found.</p>
                    <p className="text-xs mt-1">Try a different search term.</p>
                </div>
            )}

            {!loading && results.length > 0 && (
                <>
                    <p className="text-sm text-slate-500 font-medium">{results.length} datasets found for <span className="text-slate-800 font-bold">"{query}"</span></p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {results.map((ds, i) => (
                            <a
                                key={i}
                                href={ds.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-3"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-bold text-slate-900 text-base group-hover:text-indigo-700 transition-colors">{ds.title}</h3>
                                    <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 shrink-0 mt-0.5 transition-colors" />
                                </div>
                                <p className="text-slate-500 text-sm leading-relaxed line-clamp-2">{ds.description}</p>
                                <div className="flex items-center gap-3 mt-auto pt-1">
                                    <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${taskColor(ds.task || query)}`}>
                                        {ds.task || query}
                                    </span>
                                    {ds.size && ds.size !== "Unknown" && (
                                        <span className="text-xs text-slate-400 font-mono">{ds.size}</span>
                                    )}
                                    <span className="ml-auto text-xs text-indigo-500 font-medium group-hover:underline">View on Kaggle →</span>
                                </div>
                            </a>
                        ))}
                    </div>
                </>
            )}

            {!searched && !loading && (
                <div className="text-center py-16 text-slate-300">
                    <Database className="w-16 h-16 mx-auto mb-4" />
                    <p className="text-slate-500 font-medium">Select a task type or type a custom search above.</p>
                </div>
            )}
        </div>
    );
}
