"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, CheckCircle2, Network } from "lucide-react";
import { fetchMetrics, fetchVersions, ModelVersion, EvalRow, AggRow, getModelDownloadUrl, startPolling } from "@/lib/api";

export default function ModelsPage() {
    const [versions, setVersions] = useState<ModelVersion[]>([]);
    const [evalMap, setEvalMap] = useState<Record<string, EvalRow>>({});
    const [aggMap, setAggMap] = useState<Record<string, AggRow>>({});
    const [downloading, setDownloading] = useState<string | null>(null);

    const load = useCallback(async () => {
        const [metrics, vers] = await Promise.all([fetchMetrics(), fetchVersions()]);

        if (metrics) {
            const em: Record<string, EvalRow> = {};
            metrics.evaluations.forEach(e => { em[String(e.version_id)] = e; });
            const am: Record<string, AggRow> = {};
            metrics.aggregations.forEach(a => { am[String(a.version_id)] = a; });
            setEvalMap(em);
            setAggMap(am);
        }

        setVersions(vers);
    }, []);

    useEffect(() => {
        const stop = startPolling(load, 5000);
        return () => stop();
    }, [load]);

    const handleDownload = (versionId: string, versionNum: number) => {
        setDownloading(versionId);
        try {
            const url = getModelDownloadUrl(versionId);
            const a = document.createElement("a");
            a.href = url;
            a.download = `fl_global_model_v${versionNum}.pt`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } finally {
            setTimeout(() => setDownloading(null), 1000); // UI visual bounce
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-10">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Global Model Registry</h2>
                <p className="text-slate-500">
                    Every aggregation round produces a versioned global checkpoint. Download any version as a <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">.pt</code> file.
                </p>
            </div>

            <Card className="bg-white border-slate-200 shadow-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
                <CardHeader className="relative z-10">
                    <CardTitle className="text-lg font-bold text-slate-900">
                        Version History
                        <span className="ml-2 text-sm font-normal text-slate-400">({versions.length} checkpoints)</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="relative z-10">
                    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-xs tracking-wider">
                                <tr>
                                    <th className="px-6 py-4">Version</th>
                                    <th className="px-6 py-4">Method</th>
                                    <th className="px-6 py-4 text-center">Valid / Rejected</th>
                                    <th className="px-6 py-4 text-center">Accuracy</th>
                                    <th className="px-6 py-4 text-center">Loss</th>
                                    <th className="px-6 py-4 text-right">Compiled</th>
                                    <th className="px-6 py-4" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {versions.length > 0 ? versions.map((v, i) => {
                                    // Note: we fall back to version_num if it doesn't match by ID, to handle legacy mock endpoints
                                    const ev = evalMap[v.id] || evalMap[String(v.version_num)];
                                    const ag = aggMap[v.id] || aggMap[String(v.version_num)];
                                    const isCurrent = i === 0;
                                    return (
                                        <tr key={v.id} className={`group transition-colors ${isCurrent ? "bg-blue-50/30 hover:bg-blue-50" : "hover:bg-slate-50"}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {isCurrent
                                                        ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                        : <Network className="w-4 h-4 text-slate-400" />}
                                                    <span className={`font-mono font-medium ${isCurrent ? "text-blue-700 font-bold" : "text-slate-900"}`}>
                                                        v{v.version_num}
                                                    </span>
                                                    {isCurrent && (
                                                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold border border-green-200">LIVE</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border
                                                    ${ag?.method?.includes("DP") || ag?.method?.includes("Trimmed")
                                                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                                        : "bg-slate-100 text-slate-700 border-slate-200"}`}>
                                                    {ag?.method ?? "0"}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center text-slate-700 font-medium">
                                                {ag ? `${ag.total_accepted} / ${ag.total_rejected}` : "0 / 0"}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {ev?.accuracy != null ? (
                                                    <span className="inline-flex items-center justify-center bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-bold border border-green-200">
                                                        {(ev.accuracy * 100).toFixed(2)}%
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center justify-center bg-slate-50 text-slate-500 px-2 py-1 rounded text-xs font-bold border border-slate-200">
                                                        N/A
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-center font-mono text-slate-500 text-xs">
                                                {ev?.loss != null ? ev.loss.toFixed(4) : "0"}
                                            </td>
                                            <td className="px-6 py-4 text-right text-slate-400 text-xs">
                                                {new Date(v.created_at).toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleDownload(v.id, v.version_num)}
                                                    disabled={downloading === v.id}
                                                    className="text-slate-400 hover:text-blue-600 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
                                                    title="Download model weights (.pt)"
                                                >
                                                    <Download className={`w-5 h-5 ${downloading === v.id ? "animate-bounce" : ""}`} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-10 text-center text-slate-500">
                                            No checkpoints yet. Run a simulation or upload a dataset to create the first global model.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
