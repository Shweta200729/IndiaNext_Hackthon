"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
    LayoutDashboard,
    Users,
    Network,
    Waypoints,
    LineChart,
    TerminalSquare,
    Users2,
    Swords
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export function Sidebar() {
    const pathname = usePathname();

    const links = [
        { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
        { name: "Clients", href: "/dashboard/clients", icon: Users },
        { name: "Attack Lab", href: "/dashboard/attack-playground", icon: Swords },
        { name: "Network", href: "/dashboard/network", icon: Waypoints },
        { name: "Models", href: "/dashboard/models", icon: Network },
        { name: "Collaborate", href: "/dashboard/collaborate", icon: Users2 },
        { name: "Evaluation", href: "/dashboard/evaluation", icon: LineChart },
        { name: "Logs", href: "/dashboard/logs", icon: TerminalSquare },
    ];

    const [escrowBalance, setEscrowBalance] = useState<number>(0);
    const [pendingInvites, setPendingInvites] = useState<number>(0);

    useEffect(() => {
        const fetchTokens = async () => {
            try {
                const res = await fetch("http://localhost:8000/fl/clients");
                if (res.ok) {
                    const json = await res.json();
                    let total = 0;
                    json.data?.forEach((c: any) => {
                        if (c.status === "ACCEPT") total += 10;
                        else total -= 15;
                    });
                    setEscrowBalance(total);
                }
            } catch (e) {
                setEscrowBalance(0);
            }
        };
        fetchTokens();
        const interval = setInterval(fetchTokens, 5000);

        // Fetch initial pending invites
        const fetchInvites = async () => {
            const res = await supabase.from('collab_sessions').select('id', { count: 'exact' }).eq('recipient_id', 1).eq('status', 'pending');
            setPendingInvites(res.count || 0);
        };
        fetchInvites();

        // Listen for new invites
        const channel = supabase.channel('sidebar-collab')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'collab_sessions', filter: 'recipient_id=eq.1' }, () => {
                fetchInvites();
            }).subscribe();

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
        };
    }, []);

    return (
        <div className="w-[240px] flex-shrink-0 bg-white border-r border-slate-200 min-h-screen flex flex-col pt-6 z-20 shadow-sm relative">
            <div className="px-6 mb-8 flex items-center gap-2">
                <div className="bg-blue-100 p-1.5 rounded-lg border border-blue-200">
                    <Network className="w-5 h-5 text-blue-600" />
                </div>
                <span className="font-bold text-lg text-slate-900 tracking-tight">AsyncFL</span>
            </div>

            <nav className="flex flex-col gap-1 px-3">
                {links.map((link) => {
                    // Exact match for overview, startsWith for others to keep active state on subpages
                    const isActive = link.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname.startsWith(link.href);

                    return (
                        <Link
                            key={link.name}
                            href={link.href}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium transition-all group relative overflow-hidden ${isActive
                                ? "text-blue-700 bg-blue-50/80 shadow-sm border border-blue-100"
                                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                                }`}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-r-full" />
                            )}
                            <link.icon className={`w-5 h-5 ${isActive ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                            <span className="flex-1">{link.name}</span>

                            {/* Notification Badge for Collaborate */}
                            {link.name === "Collaborate" && pendingInvites > 0 && (
                                <span className="bg-amber-400 text-amber-900 font-bold text-[10px] px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                                    {pendingInvites}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-auto p-4 m-4 rounded-xl bg-slate-50 border border-slate-200 relative overflow-hidden flex flex-col gap-2 shadow-sm">
                <div className="absolute inset-0 bg-indigo-500/5 blur-2xl rounded-full" />

                <div className="flex items-center justify-between relative z-10">
                    <span className="text-xs font-semibold text-slate-500">Smart Contract Escrow</span>
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)] inline-block" />
                </div>

                <div className="flex items-baseline gap-1 relative z-10">
                    <span className="text-2xl font-black text-slate-900 tracking-tight">
                        {escrowBalance.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-indigo-600">FLT</span>
                </div>

                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1 relative z-10">
                    <div className="bg-indigo-500 h-full w-[85%] rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                </div>
                <p className="text-[10px] text-slate-400 text-right mt-0.5 relative z-10 font-mono">
                    Pool Health: Stable
                </p>
            </div>
        </div>
    );
}
