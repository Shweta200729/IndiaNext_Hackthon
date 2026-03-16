"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, SlidersHorizontal, RotateCcw, CheckCircle2, Save, AlertTriangle } from "lucide-react";
import { fetchConfig, saveConfig, AdminConfig } from "@/lib/api";

const DEFAULTS: AdminConfig = {
    dp_enabled: true,
    dp_clip_norm: 10.0,
    dp_noise_mult: 1.0,
    min_update_queue: 1,
};

export default function SettingsPage() {
    const [config, setConfig] = useState<AdminConfig>(DEFAULTS);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchConfig()
            .then(d => { if (d) setConfig(d); })
            .catch(() => { })
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setError(null);
        const ok = await saveConfig(config);
        if (ok) {
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } else {
            setError("Failed to reach server. Is the backend running?");
        }
    };

    return (
        <div className="flex flex-col gap-8 pb-10 max-w-3xl">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">System Configuration</h2>
                <p className="text-slate-500">
                    Tune Differential Privacy parameters and federation thresholds. Changes apply on the next aggregation round.
                </p>
            </div>

            {error && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Differential Privacy */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100">
                            <Shield className="w-5 h-5 text-indigo-600" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-bold text-slate-900">Differential Privacy</CardTitle>
                            <p className="text-sm text-slate-500 mt-0.5">Gaussian noise injection to protect individual gradients.</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 flex flex-col gap-6">
                    {/* Toggle */}
                    <div className="flex items-center justify-between py-2 border-b border-slate-100">
                        <div>
                            <p className="font-semibold text-slate-800">Enable DP Noise</p>
                            <p className="text-sm text-slate-500">Off = pure FedAvg (ablation mode, no ε-DP guarantee).</p>
                        </div>
                        <button
                            onClick={() => setConfig(c => ({ ...c, dp_enabled: !c.dp_enabled }))}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${config.dp_enabled ? "bg-indigo-600" : "bg-slate-200"}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${config.dp_enabled ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                    </div>

                    {/* Clip Norm */}
                    <div className={`flex flex-col gap-3 transition-opacity ${config.dp_enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-semibold text-slate-800">Clip Norm (C)</p>
                                <p className="text-sm text-slate-500">Max L2 norm per client update. Sensitivity bound.</p>
                            </div>
                            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold font-mono text-sm px-3 py-1.5 rounded-lg min-w-[56px] text-center">
                                {config.dp_clip_norm.toFixed(1)}
                            </span>
                        </div>
                        <input type="range" min={1} max={50} step={0.5}
                            value={config.dp_clip_norm}
                            onChange={e => setConfig(c => ({ ...c, dp_clip_norm: parseFloat(e.target.value) }))}
                            className="w-full h-2 rounded-full appearance-none bg-slate-200 accent-indigo-600 cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-slate-400 font-mono">
                            <span>1.0 (high privacy)</span>
                            <span>50.0 (low privacy)</span>
                        </div>
                    </div>

                    {/* Noise Multiplier */}
                    <div className={`flex flex-col gap-3 transition-opacity ${config.dp_enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-semibold text-slate-800">Noise Multiplier (σ)</p>
                                <p className="text-sm text-slate-500">σ = multiplier × C / n. Higher = stronger ε-DP guarantee.</p>
                            </div>
                            <span className="bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold font-mono text-sm px-3 py-1.5 rounded-lg min-w-[56px] text-center">
                                {config.dp_noise_mult.toFixed(2)}
                            </span>
                        </div>
                        <input type="range" min={0.1} max={3.0} step={0.05}
                            value={config.dp_noise_mult}
                            onChange={e => setConfig(c => ({ ...c, dp_noise_mult: parseFloat(e.target.value) }))}
                            className="w-full h-2 rounded-full appearance-none bg-slate-200 accent-indigo-600 cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-slate-400 font-mono">
                            <span>0.10 (low noise)</span>
                            <span>3.00 (high noise)</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Federation Settings */}
            <Card className="bg-white border-slate-200 shadow-sm">
                <CardHeader className="border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
                            <SlidersHorizontal className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-bold text-slate-900">Federation Round Config</CardTitle>
                            <p className="text-sm text-slate-500">How many accepted updates must queue before aggregation fires.</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-6 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-slate-800">Min Update Queue Size</p>
                            <p className="text-sm text-slate-500">Set to 1 for immediate aggregation after each valid client update.</p>
                        </div>
                        <span className="bg-blue-50 border border-blue-200 text-blue-700 font-bold font-mono text-sm px-3 py-1.5 rounded-lg min-w-[48px] text-center">
                            {config.min_update_queue}
                        </span>
                    </div>
                    <input type="range" min={1} max={20} step={1}
                        value={config.min_update_queue}
                        onChange={e => setConfig(c => ({ ...c, min_update_queue: parseInt(e.target.value) }))}
                        className="w-full h-2 rounded-full appearance-none bg-slate-200 accent-blue-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-slate-400 font-mono">
                        <span>1 client (immediate)</span>
                        <span>20 clients (batch)</span>
                    </div>
                </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex items-center gap-4">
                <button
                    onClick={handleSave}
                    className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white transition-all shadow-lg ${saved ? "bg-green-600 shadow-green-500/20" : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20 hover:-translate-y-0.5"}`}
                >
                    {saved ? <CheckCircle2 className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                    {saved ? "Saved to server!" : "Apply Changes"}
                </button>
                <button
                    onClick={() => setConfig(DEFAULTS)}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-all"
                >
                    <RotateCcw className="w-4 h-4" />
                    Reset to Defaults
                </button>
            </div>
        </div>
    );
}
