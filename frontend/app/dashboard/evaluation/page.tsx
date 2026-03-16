"use client";
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, BarChart, Bar, Area, AreaChart,
} from "recharts";
import {
    TrendingUp, TrendingDown, ShieldCheck, Activity,
    CheckCircle2, AlertTriangle, Zap, Database, FlaskConical,
    Cpu, Target, BarChart2
} from "lucide-react";
import { fetchMetrics, MetricsResponse, startPolling } from "@/lib/api";

const BASE = "http://localhost:8000/fl";

interface TrainPoint {
    label: string;
    round: number;
    epoch: number;
    loss: number | null;
    accuracy: number | null;
    client_id: string;
}

// ── Null-safe helpers ─────────────────────────────────────────────────────────
const safeAcc = (v: number | null | undefined) => v != null ? parseFloat((v * 100).toFixed(2)) : null;
const safeLoss = (v: number | null | undefined) => v != null ? parseFloat(v.toFixed(4)) : null;
const fmtAcc = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(2)}%` : "—";
const fmtLoss = (v: number | null | undefined) => v != null ? v.toFixed(4) : "—";

// ── Custom tooltip ────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label, suffix = "" }: any) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900/95 backdrop-blur border border-slate-700/50 rounded-xl px-3 py-2 shadow-xl text-xs">
            <p className="text-slate-400 mb-1 font-medium">{label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} style={{ color: p.color }} className="font-bold">
                    {p.name}: {p.value != null ? `${p.value}${suffix}` : "—"}
                </p>
            ))}
        </div>
    );
};

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyChart({ label, accent = "#6366f1" }: { label: string; accent?: string }) {
    return (
        <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="relative">
                <div className="w-12 h-12 rounded-full opacity-10 animate-ping absolute inset-0"
                    style={{ background: accent }} />
                <div className="w-12 h-12 rounded-full flex items-center justify-center opacity-20"
                    style={{ background: accent }}>
                    <Zap className="w-5 h-5 text-white" />
                </div>
            </div>
            <p className="text-slate-400 text-xs text-center max-w-[180px] leading-relaxed">{label}</p>
        </div>
    );
}

export default function EvaluationPage() {
    const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
    const [trainData, setTrainData] = useState<TrainPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [pulse, setPulse] = useState(false);

    useEffect(() => {
        const loadAll = async () => {
            const m = await fetchMetrics();
            if (m) { setMetrics(m); setPulse(p => !p); }
            try {
                const res = await fetch(`${BASE}/train-metrics`);
                if (res.ok) { const j = await res.json(); setTrainData(j.data ?? []); }
            } catch { /* ignore */ }
            setLoading(false);
        };
        const stop = startPolling(loadAll, 4000);
        return () => stop();
    }, []);

    const evals = [...(metrics?.evaluations ?? [])].reverse();
    const aggs = [...(metrics?.aggregations ?? [])].reverse();

    const testChartData = evals
        .filter(e => e.accuracy != null || e.loss != null)
        .map(e => ({ round: `v${e.version_id}`, accuracy: safeAcc(e.accuracy), loss: safeLoss(e.loss) }));

    const trainChartData = trainData
        .filter(e => e.accuracy != null || e.loss != null)
        .map(e => ({ label: e.label, accuracy: safeAcc(e.accuracy), loss: safeLoss(e.loss) }));

    const clientAcceptData = aggs.map(a => ({
        round: `v${a.version_id}`, accepted: a.total_accepted, rejected: a.total_rejected,
    }));

    const latestEval = evals.length ? evals[evals.length - 1] : null;
    const prevEval = evals.length >= 2 ? evals[evals.length - 2] : null;
    const latestTrain = trainData.length ? trainData[trainData.length - 1] : null;
    const totalAcc = aggs.reduce((s, a) => s + a.total_accepted, 0);
    const totalRej = aggs.reduce((s, a) => s + a.total_rejected, 0);
    const blockRate = totalAcc + totalRej > 0 ? ((totalRej / (totalAcc + totalRej)) * 100).toFixed(1) : null;

    const hasTest = testChartData.length > 0;
    const hasTrain = trainChartData.length > 0;

    const kpis = [
        {
            label: "Best Test Accuracy",
            value: evals.length ? fmtAcc(Math.max(...evals.map(e => e.accuracy ?? 0))) : "—",
            sub: latestEval && prevEval && latestEval.accuracy != null && prevEval.accuracy != null
                ? `${((latestEval.accuracy - prevEval.accuracy) * 100) >= 0 ? "▲" : "▼"} ${Math.abs((latestEval.accuracy - prevEval.accuracy) * 100).toFixed(2)}% vs prev`
                : "Post-aggregation",
            icon: Target, gradient: "from-emerald-500 to-teal-600", glow: "shadow-emerald-500/20",
            border: "border-emerald-200", bg: "bg-gradient-to-br from-emerald-50 to-teal-50",
        },
        {
            label: "Latest Test Loss",
            value: fmtLoss(latestEval?.loss),
            sub: latestEval && prevEval && latestEval.loss != null && prevEval.loss != null
                ? `${(latestEval.loss - prevEval.loss) <= 0 ? "▼ Improving" : "▲ Rising"} loss`
                : "Validation set",
            icon: TrendingDown, gradient: "from-blue-500 to-indigo-600", glow: "shadow-blue-500/20",
            border: "border-blue-200", bg: "bg-gradient-to-br from-blue-50 to-indigo-50",
        },
        {
            label: "Train Accuracy (latest)",
            value: fmtAcc(latestTrain?.accuracy),
            sub: latestTrain ? `Epoch ${latestTrain.epoch} · ${latestTrain.client_id}` : "Upload CSV to train",
            icon: Cpu, gradient: "from-violet-500 to-purple-600", glow: "shadow-violet-500/20",
            border: "border-violet-200", bg: "bg-gradient-to-br from-violet-50 to-purple-50",
        },
        {
            label: "Threat Block Rate",
            value: blockRate ? `${blockRate}%` : "—",
            sub: `${totalRej} rejected of ${totalAcc + totalRej} total`,
            icon: ShieldCheck, gradient: "from-red-500 to-rose-600", glow: "shadow-red-500/20",
            border: "border-red-200", bg: "bg-gradient-to-br from-red-50 to-rose-50",
        },
    ];

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                <span className="text-slate-400 text-sm">Loading evaluation metrics…</span>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col gap-7 pb-12">

            {/* ── Hero Header ─────────────────────────────────────────────── */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-7 shadow-xl">
                {/* Grid overlay */}
                <div className="absolute inset-0 opacity-[0.07]"
                    style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
                {/* Glow orbs */}
                <div className="absolute -top-16 -right-16 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-16 -left-16 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl" />

                <div className="relative flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-500/30 rounded-full px-3 py-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                <span className="text-indigo-300 text-xs font-semibold tracking-wider uppercase">Live Analytics</span>
                            </div>
                        </div>
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">Model Evaluation</h2>
                        <p className="text-slate-400 text-sm mt-1.5 max-w-lg">
                            Real-time convergence analytics across training epochs and federated aggregation rounds.
                            Training metrics update live; test metrics appear after each aggregation.
                        </p>
                    </div>
                    <div className="hidden md:flex items-center gap-3">
                        <div className="text-right">
                            <div className="text-2xl font-bold text-white">{evals.length}</div>
                            <div className="text-xs text-slate-400">Test Rounds</div>
                        </div>
                        <div className="w-px h-10 bg-slate-700" />
                        <div className="text-right">
                            <div className="text-2xl font-bold text-white">{trainData.length}</div>
                            <div className="text-xs text-slate-400">Train Epochs</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── KPI Cards ────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {kpis.map((k, i) => (
                    <div key={i} className={`relative overflow-hidden rounded-2xl border ${k.border} ${k.bg} p-5 shadow-sm ${k.glow} shadow-lg`}>
                        <div className="flex items-start justify-between mb-4">
                            <span className="text-xs font-bold text-slate-600 uppercase tracking-wider leading-tight">{k.label}</span>
                            <div className={`p-2 rounded-xl bg-gradient-to-br ${k.gradient} shadow-sm`}>
                                <k.icon className="w-3.5 h-3.5 text-white" />
                            </div>
                        </div>
                        <div className="text-2xl font-black text-slate-900 tabular-nums">{k.value}</div>
                        <div className="text-xs text-slate-500 mt-1 font-medium">{k.sub}</div>
                    </div>
                ))}
            </div>

            {/* No-data banner */}
            {!hasTest && !hasTrain && (
                <div className="flex items-start gap-4 bg-amber-50 border border-amber-200 rounded-2xl p-5">
                    <div className="p-2 rounded-xl bg-amber-100">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <p className="font-bold text-amber-900">No evaluation data yet</p>
                        <p className="text-sm text-amber-700 mt-0.5">
                            Upload a CSV dataset from the <strong>Overview</strong> page to begin training.
                            Both sections below will populate automatically.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Two Sections ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* ═══════════════ TRAINING DATASET ═══════════════════════════ */}
                <div className="flex flex-col gap-4">
                    {/* Section badge */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl px-4 py-2 shadow-lg shadow-indigo-500/25">
                            <Database className="w-4 h-4" />
                            <span className="text-sm font-bold">Training Dataset</span>
                        </div>
                        <div className="flex-1 h-px bg-gradient-to-r from-indigo-200 to-transparent" />
                        {hasTrain && (
                            <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 border border-indigo-200 rounded-full px-2.5 py-1">
                                {trainData.length} epoch{trainData.length !== 1 ? "s" : ""}
                            </span>
                        )}
                    </div>

                    {/* Training Accuracy — Area chart */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-2xl">
                        <CardHeader className="pb-0 pt-5 px-5">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-violet-500" />
                                    Accuracy per Epoch
                                </CardTitle>
                                {hasTrain && (
                                    <span className="text-lg font-black text-violet-600">
                                        {fmtAcc(trainData[trainData.length - 1]?.accuracy)}
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="pt-3 px-3 pb-3">
                            <div className="h-48 rounded-xl bg-gradient-to-b from-slate-50 to-white border border-slate-100 p-2">
                                {hasTrain ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={trainChartData}>
                                            <defs>
                                                <linearGradient id="trainAccGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false}
                                                tickFormatter={v => `${v}%`} domain={[0, 100]} />
                                            <Tooltip content={<ChartTooltip suffix="%" />} />
                                            <Area type="monotone" dataKey="accuracy" name="Train Accuracy"
                                                stroke="#8b5cf6" strokeWidth={2.5} fill="url(#trainAccGrad)"
                                                dot={{ fill: "#8b5cf6", r: 3, strokeWidth: 0 }}
                                                activeDot={{ r: 5, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
                                                connectNulls={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <EmptyChart label="Per-epoch accuracy will appear after CSV upload" accent="#8b5cf6" />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Training Loss — Area chart */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-2xl">
                        <CardHeader className="pb-0 pt-5 px-5">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                    Loss per Epoch
                                </CardTitle>
                                {hasTrain && (
                                    <span className="text-lg font-black text-amber-600">
                                        {fmtLoss(trainData[trainData.length - 1]?.loss)}
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="pt-3 px-3 pb-3">
                            <div className="h-48 rounded-xl bg-gradient-to-b from-slate-50 to-white border border-slate-100 p-2">
                                {hasTrain ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={trainChartData}>
                                            <defs>
                                                <linearGradient id="trainLossGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                            <Tooltip content={<ChartTooltip />} />
                                            <Area type="monotone" dataKey="loss" name="Train Loss"
                                                stroke="#f59e0b" strokeWidth={2.5} fill="url(#trainLossGrad)"
                                                dot={{ fill: "#f59e0b", r: 3, strokeWidth: 0 }}
                                                activeDot={{ r: 5, fill: "#f59e0b", stroke: "#fff", strokeWidth: 2 }}
                                                connectNulls={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <EmptyChart label="Per-epoch loss will appear after CSV upload" accent="#f59e0b" />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Training History Table — flex-1 fills remaining left-column space */}
                    <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden flex flex-col flex-1">
                        <CardHeader className="pt-5 px-5 pb-0 shrink-0">
                            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-violet-500" />
                                Training History
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 mt-3 flex-1 overflow-hidden">
                            <div className="h-full overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-slate-50 border-y border-slate-100">
                                        <tr className="text-slate-500 uppercase tracking-widest font-bold">
                                            <th className="px-5 py-2.5 text-left">Round</th>
                                            <th className="px-5 py-2.5 text-left">Epoch</th>
                                            <th className="px-5 py-2.5 text-right">Accuracy</th>
                                            <th className="px-5 py-2.5 text-right">Loss</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {hasTrain ? [...trainData].reverse().map((e, i) => (
                                            <tr key={i} className="hover:bg-violet-50/50 transition-colors">
                                                <td className="px-5 py-2.5 font-mono font-bold text-violet-600">R{e.round}</td>
                                                <td className="px-5 py-2.5 text-slate-500">E{e.epoch}</td>
                                                <td className="px-5 py-2.5 text-right font-bold text-slate-900">{fmtAcc(e.accuracy)}</td>
                                                <td className="px-5 py-2.5 text-right font-mono text-slate-500">{fmtLoss(e.loss)}</td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">No training epochs logged yet</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* ═══════════════ TEST DATASET ════════════════════════════════ */}
                <div className="flex flex-col gap-4">
                    {/* Section badge */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl px-4 py-2 shadow-lg shadow-emerald-500/25">
                            <FlaskConical className="w-4 h-4" />
                            <span className="text-sm font-bold">Test Dataset</span>
                        </div>
                        <div className="flex-1 h-px bg-gradient-to-r from-emerald-200 to-transparent" />
                        {hasTest && (
                            <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                                {evals.length} round{evals.length !== 1 ? "s" : ""}
                            </span>
                        )}
                    </div>

                    {/* Test Accuracy — Area chart */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-2xl">
                        <CardHeader className="pb-0 pt-5 px-5">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                    Test Accuracy per Round
                                </CardTitle>
                                {hasTest && (
                                    <span className="text-lg font-black text-emerald-600">
                                        {fmtAcc(latestEval?.accuracy)}
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="pt-3 px-3 pb-3">
                            <div className="h-48 rounded-xl bg-gradient-to-b from-slate-50 to-white border border-slate-100 p-2">
                                {hasTest ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={testChartData}>
                                            <defs>
                                                <linearGradient id="testAccGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="round" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false}
                                                tickFormatter={v => `${v}%`} domain={[0, 100]} />
                                            <Tooltip content={<ChartTooltip suffix="%" />} />
                                            <Area type="monotone" dataKey="accuracy" name="Test Accuracy"
                                                stroke="#10b981" strokeWidth={2.5} fill="url(#testAccGrad)"
                                                dot={{ fill: "#10b981", r: 4, strokeWidth: 0 }}
                                                activeDot={{ r: 6, fill: "#10b981", stroke: "#fff", strokeWidth: 2 }}
                                                connectNulls={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <EmptyChart label="Appears after aggregation round completes" accent="#10b981" />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Test Loss — Area chart */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-2xl">
                        <CardHeader className="pb-0 pt-5 px-5">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                                    Test Loss per Round
                                </CardTitle>
                                {hasTest && (
                                    <span className="text-lg font-black text-red-500">
                                        {fmtLoss(latestEval?.loss)}
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="pt-3 px-3 pb-3">
                            <div className="h-48 rounded-xl bg-gradient-to-b from-slate-50 to-white border border-slate-100 p-2">
                                {hasTest ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={testChartData}>
                                            <defs>
                                                <linearGradient id="testLossGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="round" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                            <Tooltip content={<ChartTooltip />} />
                                            <Area type="monotone" dataKey="loss" name="Test Loss"
                                                stroke="#ef4444" strokeWidth={2.5} fill="url(#testLossGrad)"
                                                dot={{ fill: "#ef4444", r: 4, strokeWidth: 0 }}
                                                activeDot={{ r: 6, fill: "#ef4444", stroke: "#fff", strokeWidth: 2 }}
                                                connectNulls={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <EmptyChart label="Appears after aggregation round completes" accent="#ef4444" />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Client Acceptance */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden rounded-2xl">
                        <CardHeader className="pb-0 pt-5 px-5">
                            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-indigo-500" />
                                Client Acceptance per Round
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-3 px-3 pb-3">
                            <div className="h-44 rounded-xl bg-gradient-to-b from-slate-50 to-white border border-slate-100 p-2">
                                {clientAcceptData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={clientAcceptData} barGap={4}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                            <XAxis dataKey="round" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                                            <Tooltip content={<ChartTooltip />} />
                                            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                                            <Bar dataKey="accepted" name="Accepted" fill="#10b981" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="rejected" name="Rejected" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <EmptyChart label="Accept/reject counts per aggregation round" accent="#6366f1" />
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Test Evaluation Table */}
                    <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                        <CardHeader className="pt-5 px-5 pb-0">
                            <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <BarChart2 className="w-4 h-4 text-emerald-500" />
                                Test Evaluation History
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 mt-3">
                            <div className="max-h-44 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-slate-50 border-y border-slate-100">
                                        <tr className="text-slate-500 uppercase tracking-widest font-bold">
                                            <th className="px-5 py-2.5 text-left">Round</th>
                                            <th className="px-5 py-2.5 text-right">Accuracy</th>
                                            <th className="px-5 py-2.5 text-right">Loss</th>
                                            <th className="px-5 py-2.5 text-right">Trend</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {hasTest ? evals.map((e, i) => {
                                            const prev = evals[i - 1];
                                            const up = e.accuracy != null && prev?.accuracy != null
                                                ? e.accuracy > prev.accuracy : null;
                                            return (
                                                <tr key={i} className="hover:bg-emerald-50/40 transition-colors">
                                                    <td className="px-5 py-2.5 font-mono font-bold text-emerald-700">v{e.version_id}</td>
                                                    <td className="px-5 py-2.5 text-right font-bold text-slate-900">{fmtAcc(e.accuracy)}</td>
                                                    <td className="px-5 py-2.5 text-right font-mono text-slate-500">{fmtLoss(e.loss)}</td>
                                                    <td className="px-5 py-2.5 text-right">
                                                        {up === null ? <span className="text-slate-300 text-base">—</span>
                                                            : up ? <span className="text-emerald-500 font-bold">↑</span>
                                                                : <span className="text-red-400 font-bold">↓</span>}
                                                    </td>
                                                </tr>
                                            );
                                        }) : (
                                            <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">No test rounds completed yet</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </div>

            {/* ── Full-width Test Evaluation History ───────────────────────── */}
            <Card className="bg-white border-slate-200 shadow-sm rounded-2xl overflow-hidden">
                <CardHeader className="pt-5 px-6 pb-0">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                            <BarChart2 className="w-4 h-4 text-emerald-500" />
                            Test Evaluation History
                        </CardTitle>
                        {hasTest && (
                            <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                                {evals.length} round{evals.length !== 1 ? "s" : ""} evaluated
                            </span>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0 mt-3">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-y border-slate-100">
                            <tr className="text-slate-500 uppercase text-xs tracking-widest font-bold">
                                <th className="px-6 py-3 text-left">Round</th>
                                <th className="px-6 py-3 text-center">Accuracy</th>
                                <th className="px-6 py-3 text-center">Loss</th>
                                <th className="px-6 py-3 text-center">Accepted</th>
                                <th className="px-6 py-3 text-center">Rejected</th>
                                <th className="px-6 py-3 text-center">Trend</th>
                                <th className="px-6 py-3 text-right">Evaluated At</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {hasTest ? evals.map((e, i) => {
                                const prev = evals[i - 1];
                                const up = e.accuracy != null && prev?.accuracy != null ? e.accuracy > prev.accuracy : null;
                                const agg = aggs.find(a => a.version_id === e.version_id);
                                return (
                                    <tr key={i} className="hover:bg-emerald-50/30 transition-colors">
                                        <td className="px-6 py-3 font-mono font-bold text-emerald-700 text-sm">v{e.version_id}</td>
                                        <td className="px-6 py-3 text-center">
                                            <span className="inline-flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1 text-xs font-bold">
                                                {fmtAcc(e.accuracy)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-center font-mono text-slate-600 text-xs">{fmtLoss(e.loss)}</td>
                                        <td className="px-6 py-3 text-center">
                                            {agg ? <span className="text-emerald-600 font-bold">{agg.total_accepted}</span> : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-6 py-3 text-center">
                                            {agg ? <span className="text-red-400 font-bold">{agg.total_rejected}</span> : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-6 py-3 text-center text-lg">
                                            {up === null ? <span className="text-slate-300 text-sm">—</span>
                                                : up ? <span className="text-emerald-500 font-black">↑</span>
                                                    : <span className="text-red-400 font-black">↓</span>}
                                        </td>
                                        <td className="px-6 py-3 text-right text-xs text-slate-400 tabular-nums">
                                            {e.created_at ? new Date(e.created_at).toLocaleString() : "—"}
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-10 text-center text-slate-400 text-sm">
                                        No test rounds completed yet — upload a CSV dataset to begin
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>
        </div>
    );
}
