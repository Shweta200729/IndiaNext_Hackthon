"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TerminalSquare, RefreshCw, Activity, TrendingDown, TrendingUp, ShieldCheck } from "lucide-react";
import { fetchMetrics, fetchClients, startPolling, MetricsResponse, ClientRow } from "@/lib/api";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

interface LogEntry {
    id: string | number;
    timestamp: string;
    type: "INFO" | "WARN" | "ERROR" | "SUCCESS";
    message: string;
    node?: string;
}

export default function LogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadAll = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const [m, clients] = await Promise.all([fetchMetrics(), fetchClients()]);
            setMetrics(m);

            const merged: LogEntry[] = [];

            // Aggregation events → INFO logs
            m?.aggregations?.forEach((agg) => {
                merged.push({
                    id: `agg-${agg.id}`,
                    timestamp: agg.created_at || new Date().toISOString(),
                    type: "INFO",
                    message: `Global model updated → v${agg.version_id} via ${agg.method}. Accepted: ${agg.total_accepted}, Rejected: ${agg.total_rejected}`,
                    node: "Master Node",
                });
            });

            // Evaluation events → SUCCESS logs
            m?.evaluations?.forEach((ev) => {
                merged.push({
                    id: `eval-${ev.id}`,
                    timestamp: ev.created_at || new Date().toISOString(),
                    type: "SUCCESS",
                    message: `Evaluation v${ev.version_id} — Accuracy: ${(ev.accuracy * 100).toFixed(2)}% | Loss: ${ev.loss.toFixed(4)}`,
                    node: "Evaluator",
                });
            });

            // Client update events → SUCCESS / WARN logs
            clients?.forEach((c: ClientRow) => {
                merged.push({
                    id: `client-${c.id}`,
                    timestamp: c.created_at || new Date().toISOString(),
                    type: c.status === "ACCEPT" ? "SUCCESS" : "WARN",
                    message: c.status === "ACCEPT"
                        ? `Update validated. Norm: ${c.norm_value?.toFixed(3) ?? "—"}, Dist: ${c.distance_value?.toFixed(3) ?? "—"}`
                        : `⚠ Byzantine detected: ${c.reason}. Norm: ${c.norm_value?.toFixed(3) ?? "—"}, Dist: ${c.distance_value?.toFixed(3) ?? "—"}`,
                    node: c.client_id,
                });
            });

            // Sort newest first
            merged.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            if (merged.length === 0) {
                merged.push({
                    id: "init",
                    timestamp: new Date().toISOString(),
                    type: "INFO",
                    message: "FL Aggregator Server Initialized. Awaiting client connections...",
                    node: "System",
                });
            }

            setLogs(merged);
        } catch (e) {
            console.error(e);
        } finally {
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        const stop = startPolling(loadAll, 5000);
        return () => stop();
    }, [loadAll]);

    const getLogColor = (type: string) => {
        switch (type) {
            case "INFO": return "text-blue-400";
            case "WARN": return "text-yellow-400";
            case "ERROR": return "text-red-400";
            case "SUCCESS": return "text-green-400";
            default: return "text-slate-300";
        }
    };

    const latestEval = metrics?.evaluations?.[0];
    const prevEval = metrics?.evaluations?.[1];
    const accDelta = latestEval && prevEval ? ((latestEval.accuracy - prevEval.accuracy) * 100) : null;
    const lossDelta = latestEval && prevEval ? (latestEval.loss - prevEval.loss) : null;

    const evalChartData = (metrics?.evaluations ?? [])
        .slice()
        .reverse()
        .map((e) => ({
            version: `v${e.version_id}`,
            accuracy: parseFloat((e.accuracy * 100).toFixed(2)),
            loss: parseFloat(e.loss.toFixed(4)),
        }));

    const totalAccepted = metrics?.aggregations?.reduce((s, a) => s + a.total_accepted, 0) ?? 0;
    const totalRejected = metrics?.aggregations?.reduce((s, a) => s + a.total_rejected, 0) ?? 0;

    return (
        <div className="flex flex-col gap-8 pb-10">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-2">
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Logs & Evaluation</h2>
                    <p className="text-slate-500">Real-time audit trail and global model performance metrics.</p>
                </div>
            </div>

            {/* ── Evaluation KPIs ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    {
                        label: "Latest Accuracy",
                        value: latestEval ? `${(latestEval.accuracy * 100).toFixed(2)}%` : "—",
                        delta: accDelta !== null ? `${accDelta > 0 ? "+" : ""}${accDelta.toFixed(2)}%` : null,
                        positive: (accDelta ?? 0) >= 0,
                        icon: TrendingUp,
                        color: "text-green-600",
                    },
                    {
                        label: "Latest Loss",
                        value: latestEval ? latestEval.loss.toFixed(4) : "—",
                        delta: lossDelta !== null ? `${lossDelta > 0 ? "+" : ""}${lossDelta.toFixed(4)}` : null,
                        positive: (lossDelta ?? 0) <= 0,
                        icon: TrendingDown,
                        color: "text-blue-600",
                    },
                    {
                        label: "Total Accepted",
                        value: totalAccepted,
                        delta: null,
                        positive: true,
                        icon: ShieldCheck,
                        color: "text-green-500",
                    },
                    {
                        label: "Total Rejected",
                        value: totalRejected,
                        delta: null,
                        positive: false,
                        icon: Activity,
                        color: "text-red-500",
                    },
                ].map((kpi, i) => (
                    <Card key={i} className="bg-white border-slate-200 shadow-sm">
                        <CardContent className="p-5">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-slate-500">{kpi.label}</span>
                                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                            </div>
                            <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
                            {kpi.delta && (
                                <div className={`text-xs mt-1 font-medium ${kpi.positive ? "text-green-600" : "text-red-500"}`}>
                                    {kpi.delta} vs previous round
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* ── Evaluation Charts ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-bold text-slate-900">Accuracy per Round</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={evalChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="version" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false}
                                        tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                                    <Tooltip
                                        contentStyle={{ background: "#fff", borderColor: "#e2e8f0", borderRadius: 8 }}
                                        formatter={(v: any) => [`${v}%`, "Accuracy"]}
                                    />
                                    <Line type="monotone" dataKey="accuracy" stroke="#2563eb" strokeWidth={2.5}
                                        dot={{ fill: "#2563eb", r: 3 }} activeDot={{ r: 5 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white border-slate-200 shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-base font-bold text-slate-900">Training Loss per Round</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={evalChartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="version" stroke="#94a3b8" fontSize={11} tickLine={false} />
                                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ background: "#fff", borderColor: "#e2e8f0", borderRadius: 8 }}
                                        formatter={(v: any) => [v, "Loss"]}
                                    />
                                    <Line type="monotone" dataKey="loss" stroke="#ef4444" strokeWidth={2.5}
                                        dot={{ fill: "#ef4444", r: 3 }} activeDot={{ r: 5 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Terminal Log Stream ─────────────────────────────────── */}
            <Card className="bg-slate-950 border-slate-900 shadow-xl overflow-hidden">
                <CardHeader className="border-b border-slate-800 bg-slate-900 py-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-mono text-slate-300 flex items-center gap-2">
                        <TerminalSquare className="w-4 h-4 text-slate-400" />
                        bash — root@fl-master-node
                        <span className="ml-2 text-[10px] text-slate-500">({logs.length} entries)</span>
                    </CardTitle>
                    <button
                        onClick={loadAll}
                        className="text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-800"
                    >
                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    </button>
                </CardHeader>
                <CardContent className="p-0 overflow-y-auto h-[480px] font-mono text-sm bg-[#0C111D]">
                    <div className="p-4 flex flex-col gap-0.5">
                        {logs.map((log) => (
                            <div key={log.id} className="py-1 border-b border-slate-800/40 hover:bg-slate-900/50 flex gap-3 w-full">
                                <span className="text-slate-600 shrink-0 select-none tabular-nums">
                                    {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                                </span>
                                <span className={`font-bold w-16 shrink-0 ${getLogColor(log.type)}`}>
                                    [{log.type}]
                                </span>
                                {log.node && (
                                    <span className="text-indigo-400 shrink-0 w-32 truncate text-xs pt-0.5">
                                        {log.node}
                                    </span>
                                )}
                                <span className="text-slate-300 wrap-break-word grow">
                                    {log.message}
                                </span>
                            </div>
                        ))}
                        <div className="mt-4 flex items-center gap-2 animate-pulse text-slate-500 text-xs">
                            <span className="w-2 h-3.5 bg-slate-400 inline-block" />
                            Listening for incoming connections...
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
