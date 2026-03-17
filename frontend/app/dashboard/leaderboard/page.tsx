"use client";
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BACKEND_URL } from "@/lib/api";
import { Trophy, Medal, TrendingUp, TrendingDown, Shield, CheckCircle2 } from "lucide-react";

const FL_BASE = `${BACKEND_URL}/fl`;

interface LeaderboardEntry {
    rank: number;
    contributor: string;
    accepted: number;
    rejected: number;
    total: number;
    score: number;
}

const RANK_MEDAL = (rank: number) => {
    if (rank === 1) return <span className="text-yellow-400 text-xl">🥇</span>;
    if (rank === 2) return <span className="text-slate-400 text-xl">🥈</span>;
    if (rank === 3) return <span className="text-amber-600 text-xl">🥉</span>;
    return <span className="text-slate-500 font-bold text-sm">#{rank}</span>;
};

export default function LeaderboardPage() {
    const [data, setData] = useState<LeaderboardEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const loadLeaderboard = async () => {
        try {
            const res = await fetch(`${FL_BASE}/leaderboard`);
            if (res.ok) {
                const json = await res.json();
                setData(json.leaderboard || []);
                setLastUpdated(new Date());
            }
        } catch (e) {
            console.error("Failed to load leaderboard", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLeaderboard();
        const interval = setInterval(loadLeaderboard, 8000);
        return () => clearInterval(interval);
    }, []);

    const maxScore = Math.max(...data.map(d => d.score), 1);

    return (
        <div className="flex flex-col gap-8 pb-10">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
                        <Trophy className="w-8 h-8 text-yellow-500" />
                        Contributor Leaderboard
                    </h2>
                    <p className="text-slate-500 text-sm">
                        Ranked by quality-weighted model contributions.
                        {lastUpdated && <span className="ml-2 text-slate-400">Last updated: {lastUpdated.toLocaleTimeString()}</span>}
                    </p>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${data.length > 0 ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-400 border-slate-200"}`}>
                    <span className={`w-2 h-2 rounded-full ${data.length > 0 ? "bg-green-400 animate-pulse" : "bg-slate-300"}`} />
                    {data.length > 0 ? `${data.length} Contributors` : "No Data"}
                </div>
            </div>

            {/* Score Key */}
            <div className="flex items-center gap-6 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-500">
                <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /> <span>+10 pts per accepted update</span></div>
                <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-red-500" /> <span>−5 pts per rejected update</span></div>
                <div className="flex items-center gap-2"><Medal className="w-4 h-4 text-indigo-500" /> <span>Score = Accepted×10 − Rejected×5</span></div>
            </div>

            {/* Table */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-4 font-semibold">Rank</th>
                            <th className="px-6 py-4 font-semibold">Contributor</th>
                            <th className="px-6 py-4 font-semibold text-green-600">Accepted</th>
                            <th className="px-6 py-4 font-semibold text-red-500">Rejected</th>
                            <th className="px-6 py-4 font-semibold">Total</th>
                            <th className="px-6 py-4 font-semibold">Score</th>
                            <th className="px-6 py-4 font-semibold">Bar</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            [...Array(5)].map((_, i) => (
                                <tr key={i}>
                                    {[...Array(7)].map((_, j) => (
                                        <td key={j} className="px-6 py-4">
                                            <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                                    <Trophy className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                                    <p className="font-medium">No contributors yet.</p>
                                    <p className="text-xs mt-1">Submit model updates to appear on the leaderboard.</p>
                                </td>
                            </tr>
                        ) : (
                            data.map((entry) => (
                                <tr
                                    key={entry.contributor}
                                    className={`hover:bg-slate-50 transition-colors ${entry.rank <= 3 ? "bg-yellow-50/30" : ""}`}
                                >
                                    <td className="px-6 py-4 w-16">{RANK_MEDAL(entry.rank)}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                                {entry.contributor.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-semibold text-slate-900">{entry.contributor}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="flex items-center gap-1 text-green-600 font-semibold">
                                            <TrendingUp className="w-3.5 h-3.5" /> {entry.accepted}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="flex items-center gap-1 text-red-500 font-semibold">
                                            <TrendingDown className="w-3.5 h-3.5" /> {entry.rejected}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">{entry.total}</td>
                                    <td className="px-6 py-4">
                                        <span className={`font-bold text-base ${entry.score >= 0 ? "text-indigo-600" : "text-red-500"}`}>
                                            {entry.score > 0 ? "+" : ""}{entry.score}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 w-48">
                                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ${entry.rank === 1 ? "bg-yellow-400" : entry.rank === 2 ? "bg-slate-400" : entry.rank === 3 ? "bg-amber-600" : "bg-indigo-400"}`}
                                                style={{ width: `${Math.max(4, (entry.score / maxScore) * 100)}%` }}
                                            />
                                        </div>
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
