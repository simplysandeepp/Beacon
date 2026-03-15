const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function joinUrl(base: string, path: string): string {
    return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

async function apiFetch<T = unknown>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(joinUrl(BASE, path), options);
    if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        const error = new Error(`API error ${res.status}: ${errorText}`);
        (error as any).status = res.status;
        throw error;
    }

    if (res.status === 204) {
        return undefined as T;
    }

    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.includes("application/json")) {
        return res.json() as Promise<T>;
    }
    return (await res.text()) as T;
}

export interface Session {
    session_id: string;
    status: string;
    message?: string;
}

export interface Chunk {
    chunk_id: string;
    session_id: string;
    cleaned_text: string;
    signal_label?: string;
    label?: string;
    confidence: number;
    source_type: string;
    source_ref: string;
    speaker: string;
    reasoning?: string;
    classification_path?: string;
    suppressed: boolean;
    manually_restored?: boolean;
    flagged_for_review?: boolean;
}

export interface RawDataChunk {
    source_type: string;
    source_ref: string;
    speaker?: string;
    text: string;
}

export interface BRDSections {
    executive_summary?: string;
    functional_requirements?: string;
    stakeholder_analysis?: string;
    timeline?: string;
    decisions?: string;
    assumptions?: string;
    success_metrics?: string;
    [key: string]: string | undefined;
}

export interface BRDSectionMeta {
    snapshot_id: string | null;
    version_number: number;
    human_edited: boolean;
    generated_at: string | null;
    source_chunk_ids: string[];
}

export interface ValidationFlag {
    section_name: string;
    flag_type: string;
    severity: "high" | "medium" | "low";
    description: string;
}

export interface BRDResponse {
    session_id: string;
    snapshot_id: string | null;
    sections: BRDSections;
    section_meta: Record<string, BRDSectionMeta>;
    flags: ValidationFlag[];
}

export type BRDStreamEventType =
    | "generation_started"
    | "snapshot_created"
    | "agents_launched"
    | "agent_started"
    | "agent_completed"
    | "agent_failed"
    | "generation_completed"
    | "validation_started"
    | "validation_completed"
    | "complete"
    | "error";

export interface BRDStreamEventPayload {
    type?: BRDStreamEventType | string;
    session_id?: string;
    snapshot_id?: string;
    agent?: string;
    message?: string;
    error?: string;
    count?: number;
}

export interface SlackChannel {
    id: string;
    name: string;
    is_member: boolean;
}

export interface SlackStatus {
    connected: boolean;
    team_id: string | null;
    team_name: string | null;
    scopes: string[];
}

export interface SlackIngestResponse {
    message: string;
    session_id: string;
    selected_channels: string[];
    channel_message_counts: Record<string, number>;
    chunk_count: number;
}

export interface GmailStatus {
    available: boolean;
    connected: boolean;
    message: string;
}

export interface GmailIngestResponse {
    message: string;
    session_id: string;
    item_count: number;
}

export interface GmailEmail {
    subject: string;
    from: string;
    body: string;
    snippet: string;
    message_id: string;
    attachments: any[];
}

export interface GmailProfile {
    name: string;
    email: string;
    picture: string;
}

export interface GmailLabel {
    id: string;
    name: string;
    type: string;
    labelListVisibility?: string;
    messageListVisibility?: string;
}

export interface GmailThread {
    id: string;
    snippet: string;
    messages: GmailMessage[];
}

export interface GmailMessage {
    id: string;
    threadId: string;
    labelIds: string[];
    snippet: string;
    payload: any;
    sizeEstimate: number;
}

export async function createSession(): Promise<Session> {
    return apiFetch<Session>("/sessions/", { method: "POST" });
}

export async function getSession(sessionId: string): Promise<Session> {
    return apiFetch<Session>(`/sessions/${sessionId}`);
}

export async function ingestChunks(sessionId: string, chunks: RawDataChunk[]): Promise<{ message: string }> {
    return apiFetch<{ message: string }>(`/sessions/${sessionId}/ingest/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chunks }),
    });
}

export async function uploadFile(
    sessionId: string,
    file: File,
    sourceType: string = "email"
): Promise<{ message: string; chunk_count: number; filename: string }> {
    const form = new FormData();
    form.append("file", file);
    form.append("source_type", sourceType);
    return apiFetch(`/sessions/${sessionId}/ingest/upload`, {
        method: "POST",
        body: form,
    });
}

export async function ingestDemoDataset(
    sessionId: string,
    limit: number = 80,
    onLog?: (line: string) => void
): Promise<{ message: string; chunk_count: number; logs: string[] }> {
    const res = await fetch(joinUrl(BASE, `/sessions/${sessionId}/ingest/demo?limit=${limit}`), {
        method: "POST",
        headers: { Accept: "text/plain" },
    });

    if (!res.ok) {
        const errorText = await res.text().catch(() => "Demo ingest failed");
        throw new Error(`API error ${res.status}: ${errorText}`);
    }

    if (!res.body) {
        const text = await res.text();
        const fallbackLogs = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        fallbackLogs.forEach((line) => onLog?.(line));
        const count = extractChunkCount(text);
        return {
            message: count > 0
                ? `Demo dataset loaded - ${count} chunks classified and stored.`
                : "Demo dataset ingestion completed.",
            chunk_count: count,
            logs: fallbackLogs,
        };
    }

    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    const logs: string[] = [];
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
                continue;
            }
            logs.push(line);
            onLog?.(line);
        }
    }

    const tail = buffer.trim();
    if (tail) {
        logs.push(tail);
        onLog?.(tail);
    }

    const fullText = logs.join("\n");
    const count = extractChunkCount(fullText);
    return {
        message: count > 0
            ? `Demo dataset loaded - ${count} chunks classified and stored.`
            : "Demo dataset ingestion completed.",
        chunk_count: count,
        logs,
    };
}

function extractChunkCount(logText: string): number {
    const patterns = [
        /(\d+)\s+chunks\s+stored/i,
        /Complete!\s+(\d+)\s+chunks/i,
    ];
    for (const re of patterns) {
        const match = logText.match(re);
        if (!match) {
            continue;
        }
        const value = Number.parseInt(match[1], 10);
        if (!Number.isNaN(value)) {
            return value;
        }
    }
    return 0;
}

export async function getChunks(
    sessionId: string,
    status: "signal" | "noise" | "all" = "signal"
): Promise<{ session_id: string; count: number; chunks: Chunk[] }> {
    return apiFetch(`/sessions/${sessionId}/chunks/?status=${status}`);
}

export async function restoreChunk(
    sessionId: string,
    chunkId: string
): Promise<{ message: string }> {
    return apiFetch(`/sessions/${sessionId}/chunks/${chunkId}/restore`, { method: "POST" });
}

export async function generateBRD(
    sessionId: string
): Promise<{ message: string; snapshot_id: string }> {
    return apiFetch(`/sessions/${sessionId}/brd/generate`, { method: "POST" });
}

export function streamBRDGeneration(
    sessionId: string,
    handlers: {
        onEvent?: (payload: BRDStreamEventPayload) => void;
        onError?: (message: string) => void;
        onDone?: (payload: BRDStreamEventPayload) => void;
    }
): () => void {
    const streamUrl = `${BASE.replace(/\/$/, "")}/sessions/${sessionId}/brd/generate/stream`;
    const source = new EventSource(streamUrl);

    const handleRaw = (event: MessageEvent) => {
        try {
            const payload = JSON.parse(event.data) as BRDStreamEventPayload;
            handlers.onEvent?.(payload);
            if (payload.type === "complete") {
                handlers.onDone?.(payload);
                source.close();
            }
            if (payload.type === "error") {
                handlers.onError?.(payload.message ?? payload.error ?? "Generation failed");
                source.close();
            }
        } catch {
            handlers.onEvent?.({ type: "message", message: event.data });
        }
    };

    const eventTypes: BRDStreamEventType[] = [
        "generation_started",
        "snapshot_created",
        "agents_launched",
        "agent_started",
        "agent_completed",
        "agent_failed",
        "generation_completed",
        "validation_started",
        "validation_completed",
        "complete",
        "error",
    ];

    eventTypes.forEach((eventType) => {
        source.addEventListener(eventType, handleRaw as EventListener);
    });

    source.onerror = () => {
        handlers.onError?.("Lost connection to generation stream.");
        source.close();
    };

    return () => source.close();
}

export async function getBRD(
    sessionId: string,
    format: "markdown" | "html" = "markdown"
): Promise<BRDResponse> {
    return apiFetch(`/sessions/${sessionId}/brd/?format=${format}`);
}

export async function editBRDSection(
    sessionId: string,
    sectionName: string,
    content: string,
    snapshotId: string
): Promise<{ message: string }> {
    return apiFetch(`/sessions/${sessionId}/brd/sections/${sectionName}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, snapshot_id: snapshotId }),
    });
}

export async function getSlackOAuthUrl(): Promise<string> {
    const data = await apiFetch<{ auth_url: string }>("/integrations/slack/auth/start");
    return data.auth_url;
}

export async function getSlackStatus(): Promise<SlackStatus> {
    return apiFetch<SlackStatus>("/integrations/slack/status");
}

export async function disconnectSlack(): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/integrations/slack/disconnect", { method: "POST" });
}

export async function listSlackChannels(): Promise<{ count: number; channels: SlackChannel[] }> {
    return apiFetch<{ count: number; channels: SlackChannel[] }>("/integrations/slack/channels");
}

export async function ingestSlackChannels(
    sessionId: string,
    channelIds: string[],
    limitPerChannel: number = 200
): Promise<SlackIngestResponse> {
    return apiFetch<SlackIngestResponse>("/integrations/slack/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            session_id: sessionId,
            channel_ids: channelIds,
            limit_per_channel: limitPerChannel,
        }),
    });
}

export async function getGmailStatus(): Promise<GmailStatus> {
    return apiFetch<GmailStatus>("/integrations/gmail/status");
}

export async function getGmailProfile(): Promise<GmailProfile> {
    return apiFetch<GmailProfile>("/integrations/gmail/profile");
}

export async function getGmailLabels(): Promise<{ labels: GmailLabel[] }> {
    return apiFetch<{ labels: GmailLabel[] }>("/integrations/gmail/labels");
}

export async function getGmailThreadFull(threadId: string): Promise<GmailThread> {
    return apiFetch<GmailThread>(`/integrations/gmail/threads/${threadId}`);
}

export async function getGmailAttachment(messageId: string, attachmentId: string): Promise<{ data: string }> {
    return apiFetch<{ data: string }>(`/integrations/gmail/messages/${messageId}/attachments/${attachmentId}`);
}

export async function getGmailOAuthUrl(): Promise<string> {
    return joinUrl(BASE, "/integrations/gmail/auth/start");
}

export async function disconnectGmail(): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/integrations/gmail/disconnect", { method: "POST" });
}

export interface GmailSearchOptions {
    count?: number;
    q?: string;
    from?: string;
    to?: string;
    content?: string;
    hasAttachments?: boolean;
    pageToken?: string;
}

export async function listGmailEmails(options: GmailSearchOptions = {}): Promise<{ count: number; emails: GmailEmail[]; query_used?: string; next_page_token?: string }> {
    const params = new URLSearchParams();
    if (options.count) params.append("count", options.count.toString());
    if (options.q) params.append("q", options.q);
    if (options.from) params.append("from_mail", options.from);
    if (options.to) params.append("to_mail", options.to);
    if (options.content) params.append("content_search", options.content);
    if (options.hasAttachments) params.append("has_attachments", "true");
    if (options.pageToken) params.append("page_token", options.pageToken);

    const query = params.toString();
    return apiFetch<{ count: number; emails: GmailEmail[]; query_used?: string; next_page_token?: string }>(`/integrations/gmail/check${query ? `?${query}` : ""}`);
}

export async function ingestGmailEmails(
    sessionId: string,
    messageIds: string[],
    includeAttachments: boolean = true
): Promise<GmailIngestResponse> {
    return apiFetch<GmailIngestResponse>("/integrations/gmail/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            session_id: sessionId,
            message_ids: messageIds,
            include_attachments: includeAttachments,
        }),
    });
}

export type ExportFormat = "markdown" | "html" | "docx";

export async function exportBRD(
    sessionId: string,
    format: ExportFormat = "markdown"
): Promise<void> {
    const res = await fetch(joinUrl(BASE, `/sessions/${sessionId}/brd/export?format=${format}`));
    if (!res.ok) {
        const errorText = await res.text().catch(() => "Export failed");
        throw new Error(`Export error ${res.status}: ${errorText}`);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const disposition = res.headers.get("content-disposition") ?? "";
    const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
    const fallbackExt = format === "docx" ? "docx" : format === "html" ? "html" : "md";
    a.download = filenameMatch?.[1] ?? `brd_${sessionId}.${fallbackExt}`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
