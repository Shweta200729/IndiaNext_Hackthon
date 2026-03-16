"use client";

import React, {
    useEffect,
    useRef,
    useState,
    useCallback,
    useMemo,
} from "react";
import { X } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ClientNode {
    client_id: string;
    total_updates: number;
    accepted: number;
    rejected: number;
    last_status: string;
    last_norm: number;
    last_distance: number;
}

interface NetworkData {
    clients: ClientNode[];
    aggregation_count: number;
    dp_enabled: boolean;
}

interface GraphNode {
    id: string;
    label: string;
    type: "server" | "client";
    data?: ClientNode;
    x?: number;
    y?: number;
    fx?: number;
    fy?: number;
}

interface GraphLink {
    source: string;
    target: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:8000/fl";
const POLL_MS = 4000;

const STATUS_COLORS: Record<string, string> = {
    ACCEPT: "#22c55e",
    REJECT: "#ef4444",
    PENDING: "#eab308",
};

// ── Component ────────────────────────────────────────────────────────────────

export default function NetworkGraph() {
    const containerRef = useRef<HTMLDivElement>(null);
    const fgRef = useRef<any>(null);

    const [networkData, setNetworkData] = useState<NetworkData | null>(null);
    const [selectedNode, setSelectedNode] = useState<ClientNode | null>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [prevAggCount, setPrevAggCount] = useState(0);
    const [particleCount, setParticleCount] = useState(0);
    const [shakeIds, setShakeIds] = useState<Set<string>>(new Set());
    const [ForceGraph, setForceGraph] = useState<any>(null);

    // ── Dynamic import (react-force-graph-2d uses canvas, SSR incompatible) ──
    useEffect(() => {
        let cancelled = false;
        import("react-force-graph-2d").then((mod) => {
            if (!cancelled) setForceGraph(() => mod.default);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // ── Resize observer ──────────────────────────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            setDimensions({ width, height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // ── Data polling ─────────────────────────────────────────────────────────
    useEffect(() => {
        let alive = true;

        const poll = async () => {
            try {
                const res = await fetch(`${API_BASE}/network`);
                if (!res.ok) return;
                const data: NetworkData = await res.json();
                if (!alive) return;
                setNetworkData(data);
            } catch {
                /* server may be down */
            }
        };

        poll();
        const id = setInterval(poll, POLL_MS);
        return () => {
            alive = false;
            clearInterval(id);
        };
    }, []);

    // ── Detect new aggregation rounds → trigger particles ─────────────────
    useEffect(() => {
        if (!networkData) return;
        if (networkData.aggregation_count > prevAggCount && prevAggCount > 0) {
            setParticleCount(6);
            const t = setTimeout(() => setParticleCount(0), 3000);
            return () => clearTimeout(t);
        }
        setPrevAggCount(networkData.aggregation_count);
    }, [networkData?.aggregation_count]);

    // ── Detect rejected nodes → shake animation ─────────────────────────────
    useEffect(() => {
        if (!networkData) return;
        const rejected = networkData.clients
            .filter((c) => c.last_status === "REJECT")
            .map((c) => c.client_id);
        if (rejected.length > 0) {
            setShakeIds(new Set(rejected));
            const t = setTimeout(() => setShakeIds(new Set()), 1500);
            return () => clearTimeout(t);
        }
    }, [networkData]);

    // ── Build graph data ──────────────────────────────────────────────────────
    const graphData = useMemo(() => {
        if (!networkData || networkData.clients.length === 0)
            return { nodes: [], links: [] };

        const nodes: GraphNode[] = [
            { id: "server", label: "FL Server", type: "server" },
        ];
        const links: GraphLink[] = [];

        networkData.clients.forEach((c) => {
            nodes.push({
                id: c.client_id,
                label: c.client_id,
                type: "client",
                data: c,
            });
            links.push({ source: c.client_id, target: "server" });
        });

        return { nodes, links };
    }, [networkData]);

    // ── Node painting ─────────────────────────────────────────────────────────
    const paintNode = useCallback(
        (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const isServer = node.type === "server";
            const radius = isServer ? 18 : 10;
            const x = node.x ?? 0;
            const y = node.y ?? 0;

            // Shake offset for rejected nodes
            let offsetX = 0;
            if (shakeIds.has(node.id)) {
                offsetX = Math.sin(Date.now() / 40) * 4;
            }

            const drawX = x + offsetX;

            // DP glow around server
            if (isServer && networkData?.dp_enabled) {
                const dpGlow = ctx.createRadialGradient(drawX, y, radius, drawX, y, radius * 3.5);
                dpGlow.addColorStop(0, "rgba(59, 130, 246, 0.25)");
                dpGlow.addColorStop(0.5, "rgba(59, 130, 246, 0.08)");
                dpGlow.addColorStop(1, "rgba(59, 130, 246, 0)");
                ctx.beginPath();
                ctx.arc(drawX, y, radius * 3.5, 0, 2 * Math.PI);
                ctx.fillStyle = dpGlow;
                ctx.fill();
            }

            // Outer glow
            if (isServer) {
                const glow = ctx.createRadialGradient(drawX, y, radius * 0.5, drawX, y, radius * 2);
                glow.addColorStop(0, "rgba(59, 130, 246, 0.4)");
                glow.addColorStop(1, "rgba(59, 130, 246, 0)");
                ctx.beginPath();
                ctx.arc(drawX, y, radius * 2, 0, 2 * Math.PI);
                ctx.fillStyle = glow;
                ctx.fill();
            }

            // Node body
            ctx.beginPath();
            ctx.arc(drawX, y, radius, 0, 2 * Math.PI);
            if (isServer) {
                const grad = ctx.createRadialGradient(drawX - 3, y - 3, 1, drawX, y, radius);
                grad.addColorStop(0, "#93c5fd");
                grad.addColorStop(1, "#2563eb");
                ctx.fillStyle = grad;
            } else {
                const status = node.data?.last_status || "PENDING";
                ctx.fillStyle = STATUS_COLORS[status] || STATUS_COLORS.PENDING;
            }
            ctx.fill();

            // Border
            ctx.strokeStyle = isServer ? "#1d4ed8" : "rgba(255,255,255,0.3)";
            ctx.lineWidth = isServer ? 2 : 1;
            ctx.stroke();

            // Label
            const fontSize = isServer ? 14 / globalScale : 11 / globalScale;
            ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = "#e2e8f0";
            const label = isServer
                ? "FL Server"
                : (node.data?.client_id || node.id).replace("MOCK-", "");
            ctx.fillText(label, drawX, y + radius + 4 / globalScale);
        },
        [shakeIds, networkData?.dp_enabled]
    );

    // ── DP floating noise particles around server ──────────────────────────
    const paintAfter = useCallback(
        (ctx: CanvasRenderingContext2D, globalScale: number) => {
            if (!networkData?.dp_enabled || !graphData.nodes.length) return;
            const serverNode = graphData.nodes.find((n) => n.id === "server") as any;
            if (!serverNode || serverNode.x == null) return;

            const t = Date.now() / 1000;
            for (let i = 0; i < 8; i++) {
                const angle = (Math.PI * 2 * i) / 8 + t * 0.5;
                const dist = 30 + Math.sin(t * 2 + i) * 8;
                const px = serverNode.x + Math.cos(angle) * dist;
                const py = serverNode.y + Math.sin(angle) * dist;
                const r = (1.5 + Math.sin(t * 3 + i * 0.7) * 0.8) / globalScale;
                ctx.beginPath();
                ctx.arc(px, py, r, 0, 2 * Math.PI);
                ctx.fillStyle = `rgba(147, 197, 253, ${0.4 + Math.sin(t + i) * 0.2})`;
                ctx.fill();
            }
        },
        [networkData?.dp_enabled, graphData.nodes]
    );

    // ── Node click handler ──────────────────────────────────────────────────
    const handleNodeClick = useCallback((node: any) => {
        if (node.type === "server") {
            setSelectedNode(null);
            return;
        }
        setSelectedNode(node.data || null);
    }, []);

    // ── Render ────────────────────────────────────────────────────────────────
    if (!ForceGraph) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-pulse text-slate-400 text-sm">
                    Loading graph engine…
                </div>
            </div>
        );
    }

    // Empty state
    if (!networkData || networkData.clients.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full bg-blue-500 animate-pulse" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-yellow-500 animate-bounce" />
                </div>
                <p className="text-slate-400 text-lg font-medium">
                    Waiting for clients to join the federation.
                </p>
                <p className="text-slate-500 text-sm">
                    Run a simulation or upload a dataset to see nodes appear.
                </p>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full" ref={containerRef}>
            {/* Force Graph */}
            <ForceGraph
                ref={fgRef}
                width={dimensions.width}
                height={dimensions.height}
                graphData={graphData}
                nodeId="id"
                nodeCanvasObject={paintNode}
                nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
                    const r = node.type === "server" ? 18 : 10;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
                    ctx.fillStyle = color;
                    ctx.fill();
                }}
                onNodeClick={handleNodeClick}
                linkColor={() => "rgba(100, 116, 139, 0.35)"}
                linkWidth={1.5}
                linkDirectionalParticles={particleCount}
                linkDirectionalParticleWidth={3}
                linkDirectionalParticleColor={() => "#60a5fa"}
                linkDirectionalParticleSpeed={0.008}
                backgroundColor="transparent"
                onRenderFramePost={paintAfter}
                cooldownTicks={80}
                d3AlphaDecay={0.04}
                d3VelocityDecay={0.3}
                enableZoomInteraction={true}
                enablePanInteraction={true}
            />

            {/* Legend */}
            <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-xl px-4 py-3 text-xs space-y-2">
                <p className="text-slate-300 font-semibold mb-1">Legend</p>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                    <span className="text-slate-400">Accepted</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
                    <span className="text-slate-400">Rejected / Byzantine</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" />
                    <span className="text-slate-400">Pending</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                    <span className="text-slate-400">Server</span>
                </div>
                {networkData.dp_enabled && (
                    <div className="flex items-center gap-2 mt-1 pt-1 border-t border-slate-700">
                        <span className="w-3 h-3 rounded-full bg-blue-400/50 inline-block ring-2 ring-blue-400/30" />
                        <span className="text-blue-300">DP Enabled</span>
                    </div>
                )}
            </div>

            {/* Stats badge */}
            <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-sm border border-slate-700/50 rounded-xl px-4 py-3 text-xs space-y-1">
                <div className="flex justify-between gap-6">
                    <span className="text-slate-400">Nodes</span>
                    <span className="text-white font-mono font-bold">
                        {networkData.clients.length}
                    </span>
                </div>
                <div className="flex justify-between gap-6">
                    <span className="text-slate-400">Rounds</span>
                    <span className="text-white font-mono font-bold">
                        {networkData.aggregation_count}
                    </span>
                </div>
            </div>

            {/* Side panel */}
            {selectedNode && (
                <div className="absolute top-4 right-4 mt-20 w-72 bg-slate-900/95 backdrop-blur-md border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-right-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/40">
                        <h3 className="text-sm font-bold text-white">Client Details</h3>
                        <button
                            onClick={() => setSelectedNode(null)}
                            className="text-slate-400 hover:text-white transition"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="px-5 py-4 space-y-3 text-sm">
                        <Row label="Client ID" value={selectedNode.client_id.replace("MOCK-", "")} />
                        <Row label="Total Updates" value={String(selectedNode.total_updates)} />
                        <Row
                            label="Accepted"
                            value={String(selectedNode.accepted)}
                            color="text-green-400"
                        />
                        <Row
                            label="Rejected"
                            value={String(selectedNode.rejected)}
                            color="text-red-400"
                        />
                        <Row
                            label="Trust Score"
                            value={
                                selectedNode.total_updates > 0
                                    ? `${Math.round(
                                        (selectedNode.accepted / selectedNode.total_updates) * 100
                                    )}%`
                                    : "N/A"
                            }
                            color="text-blue-400"
                        />
                        <div className="border-t border-slate-700/40 pt-3 space-y-2">
                            <Row
                                label="Last Norm"
                                value={selectedNode.last_norm?.toFixed(4) ?? "—"}
                            />
                            <Row
                                label="Last Distance"
                                value={selectedNode.last_distance?.toFixed(4) ?? "—"}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Row({
    label,
    value,
    color,
}: {
    label: string;
    value: string;
    color?: string;
}) {
    return (
        <div className="flex justify-between">
            <span className="text-slate-400">{label}</span>
            <span className={`font-mono font-semibold ${color ?? "text-slate-200"}`}>
                {value}
            </span>
        </div>
    );
}
