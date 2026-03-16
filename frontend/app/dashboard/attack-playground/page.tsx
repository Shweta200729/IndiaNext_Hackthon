"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Swords, Zap, ShieldAlert, Activity, TrendingDown, AlertTriangle,
    CheckCircle2, Skull, FlaskConical, ArrowRight
} from "lucide-react";

// ─── types ───────────────────────────────────────────────────────────────────
interface ProbeResult {
    caught: boolean;
    status: string;
    reason: string;
    norm: number;
    norm_threshold: number;
    distance: number;
    distance_threshold: number;
    slash_amount: number;
    reward_amount: number;
}

interface AttackLogEntry {
    id: number;
    time: string;
    attack_type: string;
    intensity: number;
    caught: boolean;
    norm: number;
    distance: number;
    token_change: number;
}

// ─── constants ───────────────────────────────────────────────────────────────
const ATTACK_TYPES = [
    { value: "gaussian", label: "Gaussian Noise Injection", desc: "Adds random noise to model weights — classic Byzantine attack", icon: Activity },
    { value: "label_flip", label: "Label Flipping", desc: "Inverts training labels — subtle targeted data poisoning", icon: FlaskConical },
    { value: "sign_flip", label: "Sign Flipping", desc: "Negates gradient directions — disrupts convergence", icon: TrendingDown },
];

export default function AttackPlaygroundPage() {
    const [attackType, setAttackType] = useState("gaussian");
    const [intensity, setIntensity] = useState(500);
    const [flipRatio, setFlipRatio] = useState(0.5);
    const [probe, setProbe] = useState<ProbeResult | null>(null);
    const [isLaunching, setIsLaunching] = useState(false);
    const [launchResult, setLaunchResult] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
    const [attackLog, setAttackLog] = useState<AttackLogEntry[]>([]);
    const [walletBefore, setWalletBefore] = useState<{ balance: number; staked: number } | null>(null);
    const [walletAfter, setWalletAfter] = useState<{ balance: number; staked: number } | null>(null);
    const logIdRef = useRef(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Get current user
    const [userName, setUserName] = useState("");
    useEffect(() => {
        const stored = localStorage.getItem("user");
        if (stored) {
            try {
                const u = JSON.parse(stored);
                if (u?.name) setUserName(u.name);
            } catch { }
        }
    }, []);

    // ─── live probe on slider change ─────────────────────────────────────────
    const runProbe = useCallback(async (noiseLevel: number, type: string) => {
        try {
            const res = await fetch("http://localhost:8000/fl/attack-probe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ noise_level: noiseLevel, attack_type: type }),
            });
            if (res.ok) {
                const data: ProbeResult = await res.json();
                setProbe(data);
            }
        } catch { }
    }, []);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            runProbe(intensity, attackType);
        }, 150);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [intensity, attackType, runProbe]);

    // ─── fetch wallet snapshot ───────────────────────────────────────────────
    const fetchWallet = async (): Promise<{ balance: number; staked: number } | null> => {
        try {
            const res = await fetch("http://localhost:8000/fl/blockchain/status");
            if (res.ok) {
                const data = await res.json();
                const w = data.wallets?.find((w: any) => w.client_id === userName);
                if (w) return { balance: w.balance, staked: w.staked };
            }
        } catch { }
        return null;
    };

    // ─── launch attack ───────────────────────────────────────────────────────
    const handleLaunch = async () => {
        if (!userName) {
            setLaunchResult({ type: "err", msg: "No user session found. Please log in first." });
            return;
        }

        setIsLaunching(true);
        setLaunchResult(null);

        // Snapshot wallet before
        const before = await fetchWallet();
        setWalletBefore(before);
        setWalletAfter(null);

        try {
            const res = await fetch("http://localhost:8000/fl/simulate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_name: userName,
                    is_malicious: true,
                    malicious_multiplier: intensity,
                    attack_type: attackType,
                    noise_intensity: attackType === "label_flip" ? 1.0 : intensity / 1000.0,
                    label_flip_ratio: flipRatio,
                }),
            });

            if (res.ok) {
                setLaunchResult({ type: "ok", msg: "Attack launched. Waiting for detection result..." });

                // Poll for wallet change (the simulation runs in the background)
                let attempts = 0;
                const poll = setInterval(async () => {
                    attempts++;
                    const after = await fetchWallet();
                    if (after && before && (after.balance !== before.balance || after.staked !== before.staked)) {
                        clearInterval(poll);
                        setWalletAfter(after);
                        const tokenChange = (after.balance - before.balance) + (after.staked - before.staked);
                        const caught = tokenChange < 0;
                        setLaunchResult({
                            type: caught ? "err" : "ok",
                            msg: caught
                                ? `⚡ CAUGHT! Byzantine defense triggered. Slashed ${Math.abs(tokenChange)} FLT.`
                                : `🎭 Attack slipped through! Rewarded +${tokenChange} FLT. Try higher intensity!`
                        });

                        // Log entry
                        logIdRef.current++;
                        setAttackLog(prev => [{
                            id: logIdRef.current,
                            time: new Date().toLocaleTimeString(),
                            attack_type: attackType,
                            intensity,
                            caught,
                            norm: probe?.norm ?? 0,
                            distance: probe?.distance ?? 0,
                            token_change: tokenChange,
                        }, ...prev].slice(0, 20));

                        setIsLaunching(false);
                    }
                    if (attempts > 25) {
                        clearInterval(poll);
                        setLaunchResult({ type: "ok", msg: "Simulation running — check the Clients page for results." });
                        setIsLaunching(false);
                    }
                }, 1500);
            } else {
                const j = await res.json().catch(() => ({}));
                setLaunchResult({ type: "err", msg: j.detail || "Failed to launch attack." });
                setIsLaunching(false);
            }
        } catch (e) {
            setLaunchResult({ type: "err", msg: "Network error — is the backend running?" });
            setIsLaunching(false);
        }
    };

    // ─── gauge helpers ───────────────────────────────────────────────────────
    const gaugePercent = (value: number, threshold: number) => Math.min((value / threshold) * 100, 150);
    const gaugeColor = (pct: number) => {
        if (pct < 60) return "bg-emerald-500";
        if (pct < 90) return "bg-amber-500";
        return "bg-red-500";
    };
    const gaugeGlow = (pct: number) => {
        if (pct < 60) return "shadow-emerald-500/40";
        if (pct < 90) return "shadow-amber-500/40";
        return "shadow-red-500/40";
    };

    const currentAttack = ATTACK_TYPES.find(a => a.value === attackType)!;

    return (
        <div className="flex flex-col gap-6 pb-10 w-full max-w-7xl">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                    <Swords className="w-7 h-7 text-red-500" />
                    Attack Playground
                </h2>
                <p className="text-slate-500 text-base max-w-3xl">
                    Simulate Byzantine adversaries in real-time. Adjust attack vectors, watch the detection engine catch them,
                    and see the blockchain smart contract slash their staked tokens — all live.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ─── LEFT: Attack Config + Launch ─────────────────────────────── */}
                <div className="lg:col-span-1 flex flex-col gap-6">
                    <Card className="bg-slate-950 border-slate-800 shadow-xl overflow-hidden relative">
                        <div className="absolute -top-20 -right-20 w-72 h-72 bg-red-500/10 blur-3xl rounded-full pointer-events-none" />

                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg font-bold text-red-400 flex items-center gap-2">
                                <Skull className="w-5 h-5" />
                                Configure Attack
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="flex flex-col gap-5 relative z-10">
                            {/* Attack type */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">Attack Vector</label>
                                <div className="flex flex-col gap-2">
                                    {ATTACK_TYPES.map((t) => (
                                        <button
                                            key={t.value}
                                            onClick={() => setAttackType(t.value)}
                                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${attackType === t.value
                                                ? "bg-red-950/50 border-red-700/60 text-red-300 shadow-lg shadow-red-900/20"
                                                : "bg-slate-900/50 border-slate-700/40 text-slate-400 hover:bg-slate-800/50 hover:border-slate-600"
                                                }`}
                                        >
                                            <t.icon className={`w-5 h-5 shrink-0 ${attackType === t.value ? "text-red-400" : "text-slate-500"}`} />
                                            <div>
                                                <p className="text-sm font-bold">{t.label}</p>
                                                <p className="text-[11px] opacity-70 mt-0.5">{t.desc}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Intensity slider */}
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                        {attackType === "label_flip" ? "Flip Ratio" : "Noise Intensity"}
                                    </label>
                                    <span className="text-sm font-bold text-red-400 font-mono">
                                        {attackType === "label_flip" ? `${Math.round(flipRatio * 100)}%` : intensity.toLocaleString()}
                                    </span>
                                </div>

                                {attackType === "label_flip" ? (
                                    <input
                                        type="range"
                                        min={0} max={100} step={5}
                                        value={flipRatio * 100}
                                        onChange={e => setFlipRatio(Number(e.target.value) / 100)}
                                        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-red-500"
                                        style={{ background: `linear-gradient(to right, #10b981 0%, #f59e0b 50%, #ef4444 100%)` }}
                                    />
                                ) : (
                                    <input
                                        type="range"
                                        min={0} max={5000} step={50}
                                        value={intensity}
                                        onChange={e => setIntensity(Number(e.target.value))}
                                        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-red-500"
                                        style={{ background: `linear-gradient(to right, #10b981 0%, #f59e0b 40%, #ef4444 100%)` }}
                                    />
                                )}

                                <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                                    <span>Safe</span>
                                    <span>Borderline</span>
                                    <span>Extreme</span>
                                </div>
                            </div>

                            {/* Launch */}
                            <button
                                onClick={handleLaunch}
                                disabled={isLaunching || !userName}
                                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-xl ${isLaunching
                                    ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                                    : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white shadow-red-900/40 hover:shadow-red-800/60"
                                    }`}
                            >
                                {isLaunching ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                        </svg>
                                        Deploying Attack...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4" />
                                        Launch Attack as "{userName || "?"}"
                                    </>
                                )}
                            </button>

                            {launchResult && (
                                <div className={`px-4 py-3 rounded-lg text-sm font-medium border ${launchResult.type === "ok"
                                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/40"
                                    : "bg-red-950/40 text-red-300 border-red-800/40"
                                    }`}>
                                    {launchResult.msg}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ─── RIGHT: Gauge + Impact ────────────────────────────────────── */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    {/* Detection Gauges */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
                            <CardTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <ShieldAlert className="w-5 h-5 text-indigo-500" />
                                Live Byzantine Detection Gauge
                                {probe && (
                                    <span className={`ml-auto text-xs font-bold px-3 py-1 rounded-full ${probe.caught
                                        ? "bg-red-100 text-red-700 border border-red-200"
                                        : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                        }`}>
                                        {probe.caught ? "WOULD BE CAUGHT" : "WOULD PASS"}
                                    </span>
                                )}
                            </CardTitle>
                            <p className="text-sm text-slate-500 mt-1">
                                Drag the slider to see detection thresholds in real-time — before you even launch.
                            </p>
                        </CardHeader>

                        <CardContent className="pt-6">
                            {probe ? (
                                <div className="flex flex-col gap-6">
                                    {/* L2 Norm gauge */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-bold text-slate-700">L2 Norm</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-mono text-slate-600">{probe.norm.toLocaleString()}</span>
                                                <span className="text-xs text-slate-400">/</span>
                                                <span className="text-sm font-mono text-slate-400">{probe.norm_threshold.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="h-5 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200">
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 shadow-lg ${gaugeColor(gaugePercent(probe.norm, probe.norm_threshold))} ${gaugeGlow(gaugePercent(probe.norm, probe.norm_threshold))}`}
                                                style={{ width: `${Math.min(gaugePercent(probe.norm, probe.norm_threshold), 100)}%` }}
                                            />
                                            {/* Threshold line */}
                                            <div className="absolute right-0 top-0 h-full w-0.5 bg-slate-800" title="Threshold" />
                                        </div>
                                        {probe.norm > probe.norm_threshold && (
                                            <p className="text-xs text-red-500 font-semibold mt-1 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Exceeds norm threshold — REJECT
                                            </p>
                                        )}
                                    </div>

                                    {/* L2 Distance gauge */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-bold text-slate-700">L2 Distance from Global Model</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-mono text-slate-600">{probe.distance.toLocaleString()}</span>
                                                <span className="text-xs text-slate-400">/</span>
                                                <span className="text-sm font-mono text-slate-400">{probe.distance_threshold.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div className="h-5 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200">
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 shadow-lg ${gaugeColor(gaugePercent(probe.distance, probe.distance_threshold))} ${gaugeGlow(gaugePercent(probe.distance, probe.distance_threshold))}`}
                                                style={{ width: `${Math.min(gaugePercent(probe.distance, probe.distance_threshold), 100)}%` }}
                                            />
                                            <div className="absolute right-0 top-0 h-full w-0.5 bg-slate-800" title="Threshold" />
                                        </div>
                                        {probe.distance > probe.distance_threshold && (
                                            <p className="text-xs text-red-500 font-semibold mt-1 flex items-center gap-1">
                                                <AlertTriangle className="w-3 h-3" />
                                                Exceeds distance threshold — REJECT
                                            </p>
                                        )}
                                    </div>

                                    {/* Verdict */}
                                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${probe.caught
                                        ? "bg-red-50 border-red-200"
                                        : "bg-emerald-50 border-emerald-200"
                                        }`}>
                                        {probe.caught
                                            ? <AlertTriangle className="w-6 h-6 text-red-500" />
                                            : <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                        }
                                        <div>
                                            <p className={`font-bold text-sm ${probe.caught ? "text-red-800" : "text-emerald-800"}`}>
                                                Verdict: {probe.status}
                                            </p>
                                            <p className="text-xs text-slate-600 mt-0.5">{probe.reason}</p>
                                        </div>
                                        <div className="ml-auto text-right">
                                            <p className={`text-lg font-black ${probe.caught ? "text-red-600" : "text-emerald-600"}`}>
                                                {probe.caught ? `-${probe.slash_amount}` : `+${probe.reward_amount}`} FLT
                                            </p>
                                            <p className="text-[10px] text-slate-500 uppercase font-bold">
                                                {probe.caught ? "Slash" : "Reward"}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-slate-400">
                                    <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                    <p className="text-sm font-medium">Drag the intensity slider to preview detection</p>
                                    <p className="text-xs mt-1">Requires a model to be loaded (upload a dataset first)</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Blockchain Impact + Wallet Diff */}
                    {(walletBefore || walletAfter) && (
                        <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                            <CardHeader className="pb-3 border-b border-slate-100 bg-slate-50/50">
                                <CardTitle className="text-md font-bold text-slate-800 flex items-center gap-2">
                                    <Zap className="w-4 h-4 text-amber-500" />
                                    Blockchain Impact
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-5">
                                <div className="flex items-center gap-4 justify-center">
                                    {/* Before */}
                                    <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200 min-w-[140px]">
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Before Attack</p>
                                        <p className="text-xl font-black text-slate-800">{walletBefore?.balance ?? "—"} <span className="text-xs text-slate-400">FLT</span></p>
                                        <p className="text-xs text-slate-500 mt-1">Staked: {walletBefore?.staked ?? "—"}</p>
                                    </div>

                                    <ArrowRight className="w-6 h-6 text-slate-300 shrink-0" />

                                    {/* After */}
                                    <div className={`text-center p-4 rounded-xl border min-w-[140px] ${walletAfter
                                        ? walletAfter.balance < (walletBefore?.balance ?? 0) || walletAfter.staked < (walletBefore?.staked ?? 0)
                                            ? "bg-red-50 border-red-200"
                                            : "bg-emerald-50 border-emerald-200"
                                        : "bg-slate-50 border-slate-200"
                                        }`}>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">After Attack</p>
                                        {walletAfter ? (
                                            <>
                                                <p className="text-xl font-black text-slate-800">{walletAfter.balance} <span className="text-xs text-slate-400">FLT</span></p>
                                                <p className="text-xs text-slate-500 mt-1">Staked: {walletAfter.staked}</p>
                                            </>
                                        ) : (
                                            <div className="flex items-center justify-center gap-2 py-2">
                                                <svg className="animate-spin h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                                </svg>
                                                <span className="text-xs text-slate-400">Waiting...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Attack History Log */}
                    <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
                        <CardHeader className="pb-4 border-b border-slate-100 bg-slate-50/50">
                            <CardTitle className="text-lg font-bold text-slate-800 flex items-center justify-between">
                                <span className="flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-indigo-500" />
                                    Attack History
                                </span>
                                {attackLog.length > 0 && (
                                    <span className="text-xs font-semibold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
                                        {attackLog.length} attacks
                                    </span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {attackLog.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">
                                    <Swords className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    <p className="text-sm font-medium">No attacks launched yet</p>
                                    <p className="text-xs mt-1">Configure and launch your first attack on the left</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                                    {attackLog.map(entry => (
                                        <div key={entry.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${entry.caught ? "bg-red-500" : "bg-emerald-500"}`} />
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800 capitalize">
                                                        {entry.attack_type.replace("_", " ")}
                                                        <span className="text-xs text-slate-400 font-mono ml-2">×{entry.intensity}</span>
                                                    </p>
                                                    <p className="text-[11px] text-slate-500">{entry.time}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-[10px] text-slate-400 uppercase font-bold">Norm / Distance</p>
                                                    <p className="text-xs font-mono text-slate-600">{entry.norm.toFixed(1)} / {entry.distance.toFixed(1)}</p>
                                                </div>
                                                <span className={`text-sm font-black px-2.5 py-1 rounded-lg ${entry.caught
                                                    ? "text-red-600 bg-red-50 border border-red-200"
                                                    : "text-emerald-600 bg-emerald-50 border border-emerald-200"
                                                    }`}>
                                                    {entry.token_change > 0 ? "+" : ""}{entry.token_change} FLT
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
