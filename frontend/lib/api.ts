/**
 * lib/api.ts
 *
 * Central API client for the Federated Learning backend.
 * All fetch calls in the dashboard should use these helpers so that:
 *  - The base URL is configured in one place.
 *  - Every call handles network errors gracefully.
 *  - Types are enforced at the boundary.
 */

const BASE = "http://localhost:8000/fl";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetricsResponse {
    current_version: number;
    pending_queue_size: number;
    evaluations: EvalRow[];
    aggregations: AggRow[];
}

export interface EvalRow {
    id: string;
    version_id: number;
    accuracy: number;   // 0–1
    loss: number;
    created_at?: string;
}

export interface AggRow {
    id: string;
    version_id: number;
    method: string;
    total_accepted: number;
    total_rejected: number;
    created_at?: string;
}

export interface ClientRow {
    id: string;
    client_id: string;      // UUID
    status: "ACCEPT" | "REJECT";
    norm_value: number | null;
    distance_value: number | null;
    reason: string;
    created_at?: string;
}

export interface ModelVersion {
    id: string;
    version_num: number;
    global_round: number;
    file_path: string;
    created_at: string;
}

export interface AdminConfig {
    dp_enabled: boolean;
    dp_clip_norm: number;
    dp_noise_mult: number;
    min_update_queue: number;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function get<T>(path: string): Promise<T | null> {
    try {
        const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
        if (!res.ok) return null;
        return res.json() as Promise<T>;
    } catch {
        return null;
    }
}

async function post<T>(path: string, body: unknown): Promise<T | null> {
    try {
        const res = await fetch(`${BASE}${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok) return null;
        return res.json() as Promise<T>;
    } catch {
        return null;
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** GET /fl/metrics — evaluations + aggregation history + queue size */
export async function fetchMetrics(): Promise<MetricsResponse | null> {
    return get<MetricsResponse>("/metrics");
}

/** GET /fl/clients — last 50 client update attempts */
export async function fetchClients(): Promise<ClientRow[]> {
    const res = await get<{ data: ClientRow[] }>("/clients");
    return res?.data ?? [];
}

/** GET /fl/versions — all stored model versions */
export async function fetchVersions(): Promise<ModelVersion[]> {
    const res = await get<{ data: ModelVersion[] }>("/versions");
    return res?.data ?? [];
}

/** GET /fl/admin/config */
export async function fetchConfig(): Promise<AdminConfig | null> {
    return get<AdminConfig>("/admin/config");
}

/** POST /fl/admin/config */
export async function saveConfig(cfg: AdminConfig): Promise<boolean> {
    const res = await post<{ status: string }>("/admin/config", cfg);
    return res?.status === "ok";
}

/** POST /fl/simulate */
export async function simulate(
    clientName: string,
    isMalicious: boolean,
    maliciousMultiplier = 50.0
): Promise<void> {
    await post("/simulate", {
        client_name: clientName,
        is_malicious: isMalicious,
        malicious_multiplier: maliciousMultiplier,
    });
}

/** Trigger model download */
export function getModelDownloadUrl(versionId?: string): string {
    return versionId
        ? `${BASE}/model/download?version_id=${versionId}`
        : `${BASE}/model/download`;
}

/** POST /fl/api/dataset/upload — upload a CSV and kick off background training */
export async function uploadDataset(
    clientId: string,
    file: File,
    epochs: number,
    versionId?: string
): Promise<{ message: string; epochs: number } | null> {
    try {
        const form = new FormData();
        form.append("client_id", clientId);
        form.append("file", file);
        form.append("epochs", String(epochs));
        if (versionId) form.append("version_id", versionId);
        const res = await fetch(`${BASE}/api/dataset/upload`, { method: "POST", body: form });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

/** POST /fl/api/dataset/test — check CSV structure for topic validation */
export async function testDataset(
    file: File
): Promise<{ valid: boolean; detected_topic: string; message: string } | null> {
    try {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch(`${BASE}/api/dataset/test`, { method: "POST", body: form });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

export interface TrainingStatus {
    current_version: number;
    pending_count: number;
    required_count: number;
    pending_clients: string[];
    round_active: boolean;
}

/** GET /fl/api/training/status — round progress for the Submit Training panel */
export async function fetchTrainingStatus(): Promise<TrainingStatus | null> {
    return get<TrainingStatus>("/api/training/status");
}

/** Poll helper: call cb every intervalMs ms, and immediately on mount */
export function startPolling(cb: () => void, intervalMs = 3000): () => void {
    cb();
    const id = setInterval(cb, intervalMs);
    return () => clearInterval(id);
}

// ─── Collaboration API ────────────────────────────────────────────────────────

export interface CollabUser {
    id: number;
    name: string;
    email: string;
    created_at: string;
}

export interface CollabSession {
    id: string;
    requester_id: number;
    recipient_id: number;
    message: string;
    status: "pending" | "active" | "rejected" | "completed" | "cancelled";
    shared_version_id?: number | null;
    round_submitted?: string[];
    created_at: string;
    updated_at: string;

    // Enriched fields from GET /sessions
    partner_name?: string;
    partner_id?: number;
    is_requester?: boolean;

    // For GET /session/{id}
    partner?: CollabUser;
    round_progress?: {
        submitted: string[];
        waiting_for: string[];
        ready_to_aggregate: boolean;
    };
}

export interface ChatMessage {
    id: string;
    session_id: string;
    sender_id: number;
    content: string;
    created_at: string;
    updated_at: string;
}

export async function fetchCollabUsers(): Promise<CollabUser[]> {
    const res = await get<{ data: CollabUser[] }>("/collab/users");
    return res?.data ?? [];
}

export async function sendCollabRequest(fromUserId: number, toUserId: number, message?: string): Promise<{ session_id: string, status: string } | null> {
    return post(`/collab/request?requester_id=${fromUserId}`, { to_user_id: toUserId, message });
}

export async function respondToCollabRequest(userId: number, sessionId: string, action: "accept" | "reject" | "cancel"): Promise<{ session_id: string, status: string } | null> {
    return post(`/collab/respond?user_id=${userId}`, { session_id: sessionId, action });
}

export async function fetchMyCollabSessions(userId: number): Promise<CollabSession[]> {
    const res = await get<{ data: CollabSession[] }>(`/collab/sessions?user_id=${userId}`);
    return res?.data ?? [];
}

export async function fetchCollabSessionDetail(userId: number, sessionId: string): Promise<CollabSession | null> {
    return get<CollabSession>(`/collab/session/${sessionId}?user_id=${userId}`);
}

export async function cancelCollabSession(userId: number, sessionId: string): Promise<{ session_id: string, status: string } | null> {
    try {
        const res = await fetch(`${BASE}/collab/session/${sessionId}?user_id=${userId}`, { method: "DELETE" });
        if (!res.ok) return null;
        return res.json();
    } catch {
        return null;
    }
}

export async function fetchCollabMessages(userId: number, sessionId: string): Promise<ChatMessage[]> {
    const res = await get<{ data: ChatMessage[] }>(`/collab/session/${sessionId}/messages?user_id=${userId}`);
    return res?.data ?? [];
}

export async function sendCollabMessage(sessionId: string, senderId: number, content: string): Promise<ChatMessage | null> {
    const res = await post<{ data: ChatMessage }>(`/collab/session/${sessionId}/messages`, { sender_id: senderId, content });
    return res?.data ?? null;
}
