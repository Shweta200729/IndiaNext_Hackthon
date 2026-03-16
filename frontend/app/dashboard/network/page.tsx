"use client";

import dynamic from "next/dynamic";

const NetworkGraph = dynamic(() => import("@/components/NetworkGraph"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-[600px]">
            <div className="animate-pulse text-slate-400 text-sm">
                Loading Network Visualizer…
            </div>
        </div>
    ),
});

export default function NetworkPage() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Federation Network
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Real-time topology of connected FL clients. Click any node for details.
                </p>
            </div>

            {/* Graph container */}
            <div className="relative w-full h-[650px] rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-slate-950">
                <NetworkGraph />
            </div>
        </div>
    );
}
