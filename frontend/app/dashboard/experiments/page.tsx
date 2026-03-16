"use client";
import React, { useEffect, useState } from "react";
import { FlaskConical, RefreshCw, TrendingUp, User, Database, Hash } from "lucide-react";

const FL_BASE = "http://localhost:8000/fl";

interface Experiment {
    run_id: string | null;
    contributor: string;
    dataset: string;
    round: string | number;
    method: string;
    accuracy: number | null;
    loss: number | null;
    val_accuracy: number | null;
    timestamp: string;
}

function AccBadge({ val }: { val: number | null | undefined }) {
    if (val == null) return <span className="text-slate-300">—</span>;
    const pct = (val * 100).toFixed(1);
    const color = val >= 0.9 ? "bg-green-100 text-green-700" : val >= 0.7 ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";
    return <span className={`px-2 py-0.5 rounded text-xs font-bold ${color}`}>{pct}%</span>;
}

export default function ExperimentsPage() {
    const [experiments, setExperiments] = useState<Experiment[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        try {
            const res = await fetch(`${FL_BASE}/experiments?limit=30`);
            if (res.ok) {
                const json = await res.json();
                setExperiments(json.experiments || []);
            }
        } catch (e) {
            console.error("Failed to load experiments", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => { setRefreshing(true); load(); };

    useEffect(() => { load(); }, []);

    return (
        <div className="flex flex-col gap-8 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                        <FlaskConical className="w-8 h-8 text-purple-500" />
                        Experiment History
                    </h2>
                    <p className="text-slate-500 text-sm">All FL training rounds tracked via MLflow.</p>
                </div>
                <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold transition-all"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: "Total Runs", value: experiments.length, icon: FlaskConical, color: "text-purple-600 bg-purple-50" },
                    {
                        label: "Avg Accuracy",
                        value: experiments.length > 0
                            ? `${(experiments.filter(e => e.accuracy != null).reduce((s, e) => s + (e.accuracy ?? 0), 0) / Math.max(experiments.filter(e => e.accuracy != null).length, 1) * 100).toFixed(1)}%`
                            : "—",
                        icon: TrendingUp, color: "text-green-600 bg-green-50"
                    },
                    {
                        label: "Unique Contributors",
                        value: new Set(experiments.map(e => e.contributor).filter(Boolean)).size,
                        icon: User, color: "text-blue-600 bg-blue-50"
                    },
                ].map((s, i) => (
                    <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-4 shadow-sm">
                        <div className={`p-2 rounded-lg ${s.color}`}>
                            <s.icon className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs text-slate-500 font-medium">{s.label}</p>
                            <p className="text-2xl font-extrabold text-slate-900">{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs">
                        <tr>
                            <th className="px-5 py-4 font-semibold">Round</th>
                            <th className="px-5 py-4 font-semibold">Contributor</th>
                            <th className="px-5 py-4 font-semibold">Dataset</th>
                            <th className="px-5 py-4 font-semibold">Method</th>
                            <th className="px-5 py-4 font-semibold">Train Acc</th>
                            <th className="px-5 py-4 font-semibold">Val Acc</th>
                            <th className="px-5 py-4 font-semibold">Loss</th>
                            <th className="px-5 py-4 font-semibold">Time</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            [...Array(6)].map((_, i) => (
                                <tr key={i}>
                                    {[...Array(8)].map((_, j) => (
                                        <td key={j} className="px-5 py-3">
                                            <div className="h-3.5 bg-slate-100 rounded animate-pulse w-20" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : experiments.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-6 py-16 text-center text-slate-400">
                                    <FlaskConical className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                                    <p className="font-medium">No experiments recorded yet.</p>
                                    <p className="text-xs mt-1">Run a federated learning round to start tracking.</p>
                                </td>
                            </tr>
                        ) : (
                            experiments.map((exp, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-5 py-3">
                                        <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-xs font-bold">
                                            #{exp.round || "—"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 font-medium text-slate-800">
                                        <div className="flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 text-slate-400" />
                                            {exp.contributor || "—"}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-slate-500">
                                        <div className="flex items-center gap-1.5">
                                            <Database className="w-3.5 h-3.5 text-slate-300" />
                                            <span className="font-mono text-xs">{exp.dataset || "—"}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-xs">{exp.method || "FedAvg"}</span>
                                    </td>
                                    <td className="px-5 py-3"><AccBadge val={exp.accuracy} /></td>
                                    <td className="px-5 py-3"><AccBadge val={exp.val_accuracy} /></td>
                                    <td className="px-5 py-3 text-slate-500 font-mono text-xs">
                                        {exp.loss != null ? exp.loss.toFixed(4) : "—"}
                                    </td>
                                    <td className="px-5 py-3 text-slate-400 text-xs tabular-nums">
                                        {exp.timestamp ? new Date(exp.timestamp).toLocaleTimeString() : "—"}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
