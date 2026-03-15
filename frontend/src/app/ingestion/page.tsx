"use client";

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Hash, Mail, Upload, CheckCircle2, AlertCircle, Database,
    Eye, RefreshCw, Trash2, FileText, File, Table2, X, Loader2, RotateCcw, ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Drawer from '@/components/ui/Drawer';
import Link from 'next/link';
import {
    uploadFile,
    ingestDemoDataset,
    getChunks,
    restoreChunk,
    createSession,
    getSlackStatus,
    getSlackOAuthUrl,
    listSlackChannels,
    ingestSlackChannels,
    disconnectSlack,
    getGmailStatus,
    getGmailOAuthUrl,
    disconnectGmail,
    listGmailEmails,
    ingestGmailEmails,
    type Chunk,
    type GmailStatus,
    type GmailEmail,
    type SlackChannel,
    type SlackStatus,
} from '@/lib/apiClient';
import { useSessionStore } from '@/store/useSessionStore';
import { useAuth } from '@/contexts/AuthContext';
import GmailReplica from '@/components/features/GmailWindow';

// ─── Static Connector Data ────────────────────────────────────────────────────

const FILE_ICONS: Record<string, React.ReactNode> = {
    pdf: <FileText size={14} className="text-red-400" />,
    txt: <File size={14} className="text-zinc-400" />,
    csv: <Table2 size={14} className="text-emerald-400" />,
};

// ─── Upload File entry ────────────────────────────────────────────────────────

interface UploadedFile {
    name: string;
    size: string;
    ext: string;
    rawFile: File;
    status: 'queued' | 'uploading' | 'done' | 'error';
    chunkCount?: number;
    error?: string;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function IngestionPage() {
    const searchParams = useSearchParams();
    const { activeSessionId, addSession } = useSessionStore();
    const { user } = useAuth();
    const sessionId = activeSessionId ?? '';

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerSourceName, setDrawerSourceName] = useState('');
    const [chunks, setChunks] = useState<Chunk[]>([]);
    const [chunksLoading, setChunksLoading] = useState(false);

    const [dragOver, setDragOver] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [demoLoading, setDemoLoading] = useState(false);
    const [demoResult, setDemoResult] = useState<string | null>(null);
    const [demoLogs, setDemoLogs] = useState<string[]>([]);

    const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
    const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
    const [selectedSlackChannels, setSelectedSlackChannels] = useState<string[]>([]);
    const [slackLoading, setSlackLoading] = useState(false);
    const [slackSyncing, setSlackSyncing] = useState(false);
    const [slackMessage, setSlackMessage] = useState<string | null>(null);
    const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
    const [gmailEmails, setGmailEmails] = useState<GmailEmail[]>([]);
    const [selectedGmailEmails, setSelectedGmailEmails] = useState<string[]>([]);
    const [gmailLoading, setGmailLoading] = useState(false);
    const [gmailSyncing, setGmailSyncing] = useState(false);
    const [gmailMessage, setGmailMessage] = useState<string | null>(null);
    const [expandedChunk, setExpandedChunk] = useState<string | null>(null);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [activeSignals, setActiveSignals] = useState<Chunk[]>([]);
    const [suppressedSignals, setSuppressedSignals] = useState<Chunk[]>([]);
    const [restoringChunkId, setRestoringChunkId] = useState<string | null>(null);
    const [gmailReplicaOpen, setGmailReplicaOpen] = useState(false);

    const ensureSessionId = async (): Promise<string> => {
        if (sessionId) return sessionId;
        if (!user) return '';
        try {
            const res = await createSession();
            await addSession('Untitled Session', 'Auto-created for ingestion', user.uid, res.session_id);
            return res.session_id;
        } catch {
            return '';
        }
    };

    const syncSlackData = async () => {
        setSlackLoading(true);
        try {
            const status = await getSlackStatus();
            setSlackStatus(status);
            if (!status.connected) {
                setSlackChannels([]);
                setSelectedSlackChannels([]);
                setSlackMessage(null);
                return;
            }
            const res = await listSlackChannels();
            setSlackChannels(res.channels);
            setSelectedSlackChannels((prev) => prev.filter((id) => res.channels.some((c) => c.id === id)));
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Failed to load Slack integration data');
        } finally {
            setSlackLoading(false);
        }
    };

    const toggleSlackChannel = (channelId: string) => {
        setSelectedSlackChannels((prev) =>
            prev.includes(channelId)
                ? prev.filter((id) => id !== channelId)
                : [...prev, channelId]
        );
    };

    const startSlackConnect = async () => {
        try {
            const authUrl = await getSlackOAuthUrl();
            window.location.href = authUrl;
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Failed to start Slack OAuth');
        }
    };

    const syncGmailData = async () => {
        setGmailLoading(true);
        try {
            const status = await getGmailStatus();
            setGmailStatus(status);
            if (status.connected) {
                const res = await listGmailEmails({ count: 10 });
                setGmailEmails(res.emails);
            } else {
                setGmailEmails([]);
                setSelectedGmailEmails([]);
                setGmailMessage(null);
            }
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Failed to load Gmail integration data');
        } finally {
            setGmailLoading(false);
        }
    };

    const startGmailConnect = async () => {
        try {
            const authUrl = await getGmailOAuthUrl();
            window.location.href = authUrl;
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Failed to start Gmail OAuth');
        }
    };

    const syncSelectedGmailEmails = async (overrideIds?: string[], includeAttachments: boolean = true) => {
        const sid = await ensureSessionId();
        if (!sid) {
            setUploadError('No active session. Create/select one first.');
            return;
        }
        if (!gmailStatus?.connected) {
            setUploadError('Connect Gmail first.');
            return;
        }
        
        const idsToIngest = overrideIds ?? selectedGmailEmails;
        if (idsToIngest.length === 0) {
            setUploadError('Select at least one email.');
            return;
        }

        setGmailSyncing(true);
        setUploadError(null);
        try {
            const result = await ingestGmailEmails(sid, idsToIngest, includeAttachments);
            setGmailMessage(result.message);
            await refreshReviewGate(sid);
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Gmail sync failed');
        } finally {
            setGmailSyncing(false);
        }
    };

    const disconnectSlackWorkspace = async () => {
        try {
            await disconnectSlack();
            setSlackMessage('Slack disconnected.');
            await syncSlackData();
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Failed to disconnect Slack');
        }
    };

    const syncSelectedSlackChannels = async () => {
        const sid = await ensureSessionId();
        if (!sid) {
            setUploadError('No active session. Create/select one first.');
            return;
        }
        if (!slackStatus?.connected) {
            setUploadError('Connect Slack first.');
            return;
        }
        if (selectedSlackChannels.length === 0) {
            setUploadError('Select at least one Slack channel.');
            return;
        }

        setSlackSyncing(true);
        setUploadError(null);
        try {
            const result = await ingestSlackChannels(sid, selectedSlackChannels);
            setSlackMessage(result.message);
            await refreshReviewGate(sid);
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Slack sync failed');
        } finally {
            setSlackSyncing(false);
        }
    };

    const addFiles = (files: File[]) => {
        const newEntries: UploadedFile[] = files.map(f => {
            const ext = f.name.split('.').pop() ?? 'txt';
            const size = f.size > 1024 * 1024
                ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
                : `${(f.size / 1024).toFixed(0)} KB`;
            return { name: f.name, size, ext, rawFile: f, status: 'queued' };
        });
        setUploadedFiles(prev => [...prev, ...newEntries]);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        addFiles(Array.from(e.dataTransfer.files));
    }, []);

    const removeFile = (name: string) =>
        setUploadedFiles(prev => prev.filter(f => f.name !== name));

    const processFiles = async () => {
        const sid = await ensureSessionId();
        if (!sid) {
            setUploadError('No active session. Create one from the Dashboard.');
            return;
        }
        const queued = uploadedFiles.filter(f => f.status === 'queued');
        if (queued.length === 0) return;

        setUploading(true);
        setUploadError(null);

        for (const uf of queued) {
            // mark uploading
            setUploadedFiles(prev => prev.map(f => f.name === uf.name ? { ...f, status: 'uploading' } : f));
            try {
                const ext = uf.ext.toLowerCase();
                const sourceType = ext === 'csv' ? 'csv' : 'file';
                const result = await uploadFile(sid, uf.rawFile, sourceType);
                setUploadedFiles(prev => prev.map(f =>
                    f.name === uf.name ? { ...f, status: 'done', chunkCount: result.chunk_count } : f
                ));
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Upload failed';
                setUploadedFiles(prev => prev.map(f =>
                    f.name === uf.name ? { ...f, status: 'error', error: msg } : f
                ));
                setUploadError(`Failed to upload ${uf.name}: ${msg}`);
            }
        }
        setUploading(false);
        await refreshReviewGate(sid);
    };

    const processDemoDataset = async () => {
        setDemoLoading(true);
        setUploadError(null);
        setDemoResult(null);
        setDemoLogs([]);

        try {
            const sid = await ensureSessionId();
            if (!sid) {
                throw new Error('No active session. Create/select one first.');
            }

            const res = await ingestDemoDataset(sid, 200, (line) => {
                const time = new Date().toISOString().split('T')[1].slice(0, 12);
                setDemoLogs(prev => [...prev, `[${time}] ${line}`]);
            });

            if (res.logs.length === 0) {
                const time = new Date().toISOString().split('T')[1].slice(0, 12);
                setDemoLogs(prev => [...prev, `[${time}] Demo ingestion completed.`]);
            }
            setDemoResult(`✅ ${res.message}`);
            await refreshReviewGate(sid);
        } catch (e) {
            const time = new Date().toISOString().split('T')[1].slice(0, 12);
            const msg = e instanceof Error ? e.message : 'Demo ingestion failed';
            setDemoLogs(prev => [...prev, `[${time}] ❌ ERROR: ${msg}`]);
            setUploadError(msg);
        } finally {
            setDemoLoading(false);
        }
    };

    const refreshReviewGate = async (sidOverride?: string) => {
        const sid = sidOverride ?? sessionId;
        if (!sid) {
            setActiveSignals([]);
            setSuppressedSignals([]);
            return;
        }
        setReviewLoading(true);
        try {
            const [activeRes, noiseRes] = await Promise.all([
                getChunks(sid, 'signal'),
                getChunks(sid, 'noise'),
            ]);
            setActiveSignals(activeRes.chunks);
            setSuppressedSignals(noiseRes.chunks);
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Failed to load classified chunks');
        } finally {
            setReviewLoading(false);
        }
    };

    const restoreSuppressedChunk = async (chunkId: string) => {
        if (!sessionId) return;
        setRestoringChunkId(chunkId);
        try {
            await restoreChunk(sessionId, chunkId);
            await refreshReviewGate();
        } catch (e) {
            setUploadError(e instanceof Error ? e.message : 'Failed to restore chunk');
        } finally {
            setRestoringChunkId(null);
        }
    };

    const openDrawer = async (sourceName: string) => {
        setDrawerSourceName(sourceName);
        setDrawerOpen(true);
        if (!sessionId) return;
        setChunksLoading(true);
        try {
            const res = await getChunks(sessionId, 'all');
            setChunks(res.chunks);
        } catch {
            setChunks([]);
        } finally {
            setChunksLoading(false);
        }
    };

    useEffect(() => {
        syncSlackData();
        syncGmailData();
    }, []);

    useEffect(() => {
        const slackParam = searchParams.get('slack');
        const slackReason = searchParams.get('reason');
        if (slackParam === 'connected') {
            setSlackMessage('Slack workspace connected.');
            syncSlackData();
        } else if (slackParam === 'error') {
            setUploadError(slackReason ? `Slack OAuth failed: ${slackReason}` : 'Slack OAuth failed. Please try again.');
        }

        const gmailParam = searchParams.get('gmail');
        const gmailReason = searchParams.get('reason');
        if (gmailParam === 'connected') {
            setGmailMessage('Gmail connected.');
            syncGmailData();
        } else if (gmailParam === 'error') {
            setUploadError(gmailReason ? `Gmail OAuth failed: ${gmailReason}` : 'Gmail OAuth failed. Please try again.');
        }
    }, [searchParams]);

    useEffect(() => {
        if (!sessionId) return;
        refreshReviewGate();
    }, [sessionId]);

    return (
        <>
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-[1400px]">
            {/* Header */}
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-100">Source Management</h1>
                <p className="text-xs sm:text-sm text-zinc-500 mt-0.5">Connect and manage your data sources</p>
            </div>

            {/* Error banner */}
            {uploadError && (
                <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
                    <AlertCircle size={13} className="flex-shrink-0" />
                    {uploadError}
                    <button onClick={() => setUploadError(null)} className="ml-auto text-red-400 hover:text-red-300">
                        <X size={12} />
                    </button>
                </div>
            )}

            {slackMessage && (
                <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 size={13} className="flex-shrink-0" />
                    {slackMessage}
                    <button onClick={() => setSlackMessage(null)} className="ml-auto text-emerald-400 hover:text-emerald-300">
                        <X size={12} />
                    </button>
                </div>
            )}

            {gmailMessage && (
                <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 size={13} className="flex-shrink-0" />
                    {gmailMessage}
                    <button onClick={() => setGmailMessage(null)} className="ml-auto text-emerald-400 hover:text-emerald-300">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* S2-01: Connector Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">

                {/* Slack Connector */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
                    className="glass-card p-3 sm:p-5 rounded-xl space-y-3 sm:space-y-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#4A154B]/40 border border-[#4A154B]/60 flex items-center justify-center">
                            <Hash size={18} className="text-[#e01e5a]" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-100">Slack</h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${slackStatus?.connected ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
                                <span className={`text-[11px] font-medium ${slackStatus?.connected ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                    {slackStatus?.connected ? 'Connected' : 'Disconnected'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-zinc-500">
                        Workspace:
                        <span className="text-zinc-300 font-mono ml-1">
                            {slackStatus?.team_name ?? 'Not connected'}
                        </span>
                    </p>

                    {/* Rate limit */}
                    <div>
                        <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-zinc-500">Slack status</span>
                            <span className="text-cyan-300 font-medium">
                                {slackLoading ? 'Syncing...' : `${slackChannels.length} channels`}
                            </span>
                        </div>
                        <div className="h-1 rounded-full bg-white/8 overflow-hidden">
                            <div
                                className="h-full bg-emerald-400/70 rounded-full"
                                style={{ width: `${Math.min(100, slackChannels.length * 5)}%` }}
                            />
                        </div>
                    </div>

                    {/* Channel selector */}
                    <div>
                        <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2 font-medium">Channels</p>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                            {!slackStatus?.connected ? (
                                <p className="text-xs text-zinc-500 px-2 py-2">Connect Slack to load channels.</p>
                            ) : slackLoading ? (
                                <p className="text-xs text-zinc-500 px-2 py-2">Loading channels...</p>
                            ) : slackChannels.length === 0 ? (
                                <p className="text-xs text-zinc-500 px-2 py-2">No channels available.</p>
                            ) : (
                                slackChannels.map((ch) => (
                                    <label
                                        key={ch.id}
                                        className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedSlackChannels.includes(ch.id)}
                                            onChange={() => toggleSlackChannel(ch.id)}
                                            className="w-3.5 h-3.5 accent-cyan-400 cursor-pointer"
                                        />
                                        <span className="text-xs text-zinc-300 font-mono flex-1 truncate">#{ch.name}</span>
                                        <span className="text-[10px] text-zinc-600">{ch.is_member ? 'joined' : 'read-only'}</span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    {!slackStatus?.connected ? (
                        <button
                            onClick={startSlackConnect}
                            className="btn-primary w-full text-sm flex items-center justify-center gap-2"
                        >
                            <Hash size={13} />
                            Connect Slack
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <button
                                onClick={syncSelectedSlackChannels}
                                disabled={slackSyncing || selectedSlackChannels.length === 0}
                                className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {slackSyncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                {slackSyncing ? 'Syncing...' : 'Sync Selected'}
                            </button>
                            <button
                                onClick={disconnectSlackWorkspace}
                                className="btn-secondary w-full text-xs py-2 border-red-500/20 text-red-300 hover:bg-red-500/10"
                            >
                                Disconnect Slack
                            </button>
                        </div>
                    )}
                </motion.div>

                {/* Gmail Connector */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.07 }}
                    className="glass-card p-3 sm:p-5 rounded-xl space-y-3 sm:space-y-4"
                >
                    <div className="flex items-center gap-3">
                        <div
                            className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                                gmailStatus?.connected
                                    ? 'bg-emerald-500/15 border-emerald-500/25'
                                    : gmailStatus?.available
                                        ? 'bg-blue-500/15 border-blue-500/25'
                                        : 'bg-white/5 border-white/10'
                            }`}
                        >
                            <Mail size={18} className={gmailStatus?.connected ? 'text-emerald-400' : gmailStatus?.available ? 'text-blue-300' : 'text-zinc-600'} />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-100">Gmail</h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div
                                    className={`w-1.5 h-1.5 rounded-full ${
                                        gmailLoading
                                            ? 'bg-zinc-500 animate-pulse'
                                            : gmailStatus?.connected
                                                ? 'bg-emerald-400'
                                                : gmailStatus?.available
                                                    ? 'bg-blue-400'
                                                    : 'bg-zinc-600'
                                    }`}
                                />
                                <span
                                    className={`text-[11px] font-medium ${
                                        gmailLoading
                                            ? 'text-zinc-500'
                                            : gmailStatus?.connected
                                                ? 'text-emerald-400'
                                                : gmailStatus?.available
                                                    ? 'text-blue-300'
                                                    : 'text-zinc-500'
                                    }`}
                                >
                                    {gmailLoading ? 'Syncing...' : gmailStatus?.connected ? 'Connected' : gmailStatus?.available ? 'Available' : 'Unavailable'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <p className="text-xs text-zinc-500">
                        {gmailLoading ? 'Fetching emails...' : (gmailStatus?.message ?? 'Checking status...')}
                    </p>

                    {/* Email selector */}
                    <div>
                        <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-2 font-medium">Recent Emails</p>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                            {!gmailStatus?.connected ? (
                                <p className="text-xs text-zinc-500 px-2 py-2">Connect Gmail to load emails.</p>
                            ) : gmailLoading ? (
                                <p className="text-xs text-zinc-500 px-2 py-2">Loading emails...</p>
                            ) : gmailEmails.length === 0 ? (
                                <p className="text-xs text-zinc-500 px-2 py-2">No emails found.</p>
                            ) : (
                                gmailEmails.map((email) => (
                                    <label
                                        key={email.message_id}
                                        className="flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedGmailEmails.includes(email.message_id)}
                                            onChange={() => {
                                                setSelectedGmailEmails((prev) =>
                                                    prev.includes(email.message_id)
                                                        ? prev.filter((id) => id !== email.message_id)
                                                        : [...prev, email.message_id]
                                                );
                                            }}
                                            className="w-3.5 h-3.5 accent-red-400 cursor-pointer"
                                        />
                                        <span className="text-xs text-zinc-300 flex-1 truncate" title={email.subject}>
                                            {email.subject || '(No Subject)'}
                                        </span>
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    {!gmailStatus?.connected ? (
                        <button
                            onClick={startGmailConnect}
                            disabled={gmailLoading || !gmailStatus?.available}
                            className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Mail size={13} />
                            Connect to Gmail
                        </button>
                    ) : (
                        <div className="space-y-2">
                            <button
                                onClick={() => setGmailReplicaOpen(true)}
                                className="btn-primary w-full text-sm flex items-center justify-center gap-2"
                            >
                                <Mail size={13} />
                                Open Gmail
                            </button>
                            <button
                                onClick={() => syncSelectedGmailEmails()}
                                disabled={gmailSyncing || selectedGmailEmails.length === 0}
                                className="btn-secondary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {gmailSyncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                {gmailSyncing ? 'Ingesting...' : 'Ingest Selected'}
                            </button>
                            <button
                                onClick={syncGmailData}
                                className="btn-secondary w-full text-xs py-2"
                            >
                                <RefreshCw size={12} className="inline mr-1" />
                                Refresh Status
                            </button>
                        </div>
                    )}
                </motion.div>

                {/* File Upload */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.14 }}
                    className="glass-card p-3 sm:p-5 rounded-xl space-y-3 sm:space-y-4 sm:col-span-2 lg:col-span-1"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
                            <Upload size={18} className="text-cyan-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-100">File Upload</h3>
                            <p className="text-[11px] text-zinc-500 mt-0.5">CSV, TXT · max 25MB</p>
                        </div>
                    </div>

                    {/* Drop zone */}
                    <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-xl p-4 sm:p-6 flex flex-col items-center gap-2 transition-all cursor-pointer ${dragOver
                            ? 'border-cyan-400/60 bg-cyan-400/5'
                            : 'border-white/10 hover:border-white/20 hover:bg-white/3'
                            }`}
                        onClick={() => document.getElementById('file-input')?.click()}
                    >
                        <Upload size={18} className={dragOver ? 'text-cyan-400' : 'text-zinc-600'} />
                        <p className="text-xs text-zinc-400 text-center">
                            Drop files here or <span className="text-cyan-400">browse</span>
                        </p>
                        <input id="file-input" type="file" multiple accept=".csv,.txt" className="hidden"
                            onChange={e => addFiles(Array.from(e.target.files ?? []))}
                        />
                    </div>

                    {/* File list */}
                    {uploadedFiles.length > 0 && (
                        <div className="space-y-1.5">
                            {uploadedFiles.map(f => (
                                <div key={f.name} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/4">
                                    {FILE_ICONS[f.ext] ?? <File size={14} className="text-zinc-400" />}
                                    <span className="text-xs text-zinc-300 flex-1 truncate">{f.name}</span>
                                    <span className="text-[10px] text-zinc-600 flex-shrink-0">{f.size}</span>
                                    {f.status === 'uploading' && <Loader2 size={12} className="text-cyan-400 animate-spin flex-shrink-0" />}
                                    {f.status === 'done' && (
                                        <span className="text-[10px] text-emerald-400 flex-shrink-0 flex items-center gap-0.5">
                                            <CheckCircle2 size={10} /> {f.chunkCount ?? '?'} chunks
                                        </span>
                                    )}
                                    {f.status === 'error' && <AlertCircle size={12} className="text-red-400 flex-shrink-0" />}
                                    {f.status !== 'uploading' && (
                                        <button onClick={() => removeFile(f.name)} className="text-zinc-600 hover:text-red-400 transition-colors flex-shrink-0">
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {demoResult && (
                        <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300">
                            {demoResult}
                        </div>
                    )}

                    <button
                        onClick={processFiles}
                        disabled={uploading || demoLoading || uploadedFiles.filter(f => f.status === 'queued').length === 0}
                        className="btn-primary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {uploading
                            ? <><Loader2 size={13} className="animate-spin" /> Processing…</>
                            : <><Upload size={13} /> Process Files</>}
                    </button>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/8" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="bg-zinc-900 px-2 text-[10px] text-zinc-600">or use demo data</span>
                        </div>
                    </div>

                    <button
                        onClick={processDemoDataset}
                        disabled={demoLoading || uploading}
                        className="btn-secondary w-full text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-dashed"
                    >
                        {demoLoading
                            ? <><Loader2 size={13} className="animate-spin" /> Retrieving Emails…</>
                            : <><Database size={13} className="text-cyan-400" /> Use Demo Dataset (Enron)</>}
                    </button>

                    {/* Terminal Logger for Demo Ingestion */}
                    {demoLogs.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="bg-black/80 border border-white/10 rounded-lg p-3 mt-4 h-48 overflow-y-auto font-mono text-[10px] space-y-1.5 flex flex-col"
                        >
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10 sticky top-0 bg-black/80 backdrop-blur z-10">
                                <div className="flex gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></div>
                                </div>
                                <span className="text-zinc-500 ml-2">noise_filter.log</span>
                            </div>

                            {demoLogs.map((log, idx) => {
                                const isError = log.includes('ERROR');
                                const isSuccess = log.includes('Success');
                                const isHeuristic = log.includes('Heuristic');
                                const isLLM = log.includes('LLM');

                                return (
                                    <div key={idx} className={cn(
                                        "leading-relaxed transition-opacity animate-in fade-in duration-300",
                                        isError ? "text-red-400" :
                                            isSuccess ? "text-emerald-400" :
                                                isHeuristic ? "text-amber-300" :
                                                    isLLM ? "text-purple-300" : "text-zinc-300"
                                    )}>
                                        {log}
                                    </div>
                                )
                            })}
                            {demoLoading && (
                                <div className="flex items-center gap-2 text-zinc-500 mt-2">
                                    <span className="animate-pulse">_</span>
                                </div>
                            )}
                        </motion.div>
                    )}
                </motion.div>
            </div>

            {/* S2-02: Active Sources Table — shows real uploaded files */}
            <motion.div
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}
                className="glass-card rounded-xl overflow-hidden"
            >
                <div className="px-5 py-4 border-b border-white/8">
                    <h2 className="text-sm font-semibold text-zinc-200">Active Sources</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5">
                                {['Source', 'Status', 'Chunks', 'Type', 'Actions'].map(h => (
                                    <th key={h} className="px-5 py-3 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {uploadedFiles.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-8 text-center text-xs text-zinc-600">
                                        No files uploaded yet. Use the File Upload panel above.
                                    </td>
                                </tr>
                            ) : uploadedFiles.map((src, i) => (
                                <motion.tr
                                    key={src.name}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.25 + i * 0.05 }}
                                    className="hover:bg-white/4 transition-colors"
                                >
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-2.5">
                                            {FILE_ICONS[src.ext] ?? <File size={13} className="text-zinc-400" />}
                                            <span className="font-mono text-xs text-zinc-300">{src.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        {src.status === 'done' && <span className="glass-badge badge-timeline">Done</span>}
                                        {src.status === 'uploading' && <span className="glass-badge badge-severity-medium">Processing</span>}
                                        {src.status === 'queued' && <span className="glass-badge bg-zinc-700/40 border border-white/10 text-zinc-400">Queued</span>}
                                        {src.status === 'error' && <span className="glass-badge badge-severity-high">Error</span>}
                                    </td>
                                    <td className="px-5 py-3.5 font-mono text-xs text-zinc-300">{src.chunkCount ?? '—'}</td>
                                    <td className="px-5 py-3.5 text-xs text-zinc-500 uppercase font-mono">{src.ext}</td>
                                    <td className="px-5 py-3.5">
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => openDrawer(src.name)}
                                                className="p-1.5 rounded-lg text-zinc-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                                                title="View Chunks"
                                            >
                                                <Eye size={13} />
                                            </button>
                                            <button
                                                onClick={() => removeFile(src.name)}
                                                className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                title="Remove"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.div>

            {/* Signal Review Gate */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.28 }}
                className="glass-card rounded-xl p-5 space-y-4"
            >
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-sm font-semibold text-zinc-200">Signal Review Gate</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">Review classified chunks before BRD generation.</p>
                    </div>
                    <button
                        onClick={() => refreshReviewGate()}
                        disabled={!sessionId || reviewLoading}
                        className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50"
                    >
                        {reviewLoading ? <Loader2 size={12} className="animate-spin inline mr-1" /> : null}
                        Refresh
                    </button>
                </div>

                {!sessionId ? (
                    <p className="text-xs text-zinc-500">Create/select a session first to review signals.</p>
                ) : (
                    <>
                        <div className="grid md:grid-cols-3 gap-3">
                            <div className="rounded-lg border border-white/10 bg-white/4 p-3">
                                <p className="text-[11px] text-zinc-500">Active signals</p>
                                <p className="text-xl font-semibold text-emerald-300">{activeSignals.length}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/4 p-3">
                                <p className="text-[11px] text-zinc-500">Suppressed signals</p>
                                <p className="text-xl font-semibold text-amber-300">{suppressedSignals.length}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-white/4 p-3">
                                <p className="text-[11px] text-zinc-500">Ready to generate</p>
                                <p className="text-xl font-semibold text-cyan-300">{activeSignals.length > 0 ? 'Yes' : 'No'}</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <p className="text-xs uppercase tracking-wider text-zinc-500">Suppressed Chunks</p>
                            {suppressedSignals.length === 0 ? (
                                <p className="text-xs text-zinc-500">No suppressed chunks found for this session.</p>
                            ) : (
                                suppressedSignals.slice(0, 8).map((chunk) => (
                                    <div key={chunk.chunk_id} className="rounded-lg border border-white/10 bg-zinc-950/40 p-3">
                                        <div className="flex items-start gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs text-zinc-300">
                                                    {chunk.cleaned_text.slice(0, 220)}
                                                    {chunk.cleaned_text.length > 220 ? '…' : ''}
                                                </p>
                                                <p className="text-[10px] text-zinc-600 font-mono mt-1 truncate">
                                                    {chunk.source_ref}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => restoreSuppressedChunk(chunk.chunk_id)}
                                                disabled={restoringChunkId === chunk.chunk_id}
                                                className="text-[11px] px-2 py-1 rounded-md border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"
                                            >
                                                {restoringChunkId === chunk.chunk_id ? (
                                                    <Loader2 size={11} className="animate-spin inline mr-1" />
                                                ) : (
                                                    <RotateCcw size={11} className="inline mr-1" />
                                                )}
                                                Restore
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                            <Link href="/signals">
                                <button className="btn-secondary text-sm py-2">Open Full Signal Review</button>
                            </Link>
                            <Link href="/brd">
                                <button
                                    disabled={activeSignals.length === 0}
                                    className="btn-primary text-sm py-2 px-4 disabled:opacity-50"
                                >
                                    Continue to BRD
                                    <ArrowRight size={13} className="inline ml-2" />
                                </button>
                            </Link>
                        </div>
                    </>
                )}
            </motion.div>

            {/* S2-03: Raw Chunks Drawer */}
            <Drawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title={drawerSourceName}
                subtitle={`${chunks.length} chunks · read-only transparency view`}
                footer={
                    <button onClick={() => setDrawerOpen(false)} className="btn-secondary ml-auto text-sm">
                        Close
                    </button>
                }
            >
                {chunksLoading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-zinc-500 text-sm">
                        <Loader2 size={16} className="animate-spin" /> Loading chunks…
                    </div>
                ) : chunks.length === 0 ? (
                    <div className="py-12 text-center text-xs text-zinc-600">
                        No chunks found. Process files first.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {chunks.map(chunk => (
                            <div key={chunk.chunk_id} className="glass-card p-3.5 rounded-xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="font-mono text-[10px] text-zinc-600">{chunk.chunk_id.slice(0, 8)}</span>
                                    <span className="text-[10px] text-zinc-500">·</span>
                                    <span className="text-[10px] text-zinc-400">{chunk.speaker ?? 'Unknown'}</span>
                                    <span className="text-[10px] text-zinc-500">·</span>
                                    <span className="glass-badge text-[9px]">{chunk.signal_label ?? chunk.label ?? 'unknown'}</span>
                                </div>
                                <p className="text-xs text-zinc-300 leading-relaxed">
                                    {expandedChunk === chunk.chunk_id
                                        ? chunk.cleaned_text
                                        : chunk.cleaned_text.slice(0, 120) + (chunk.cleaned_text.length > 120 ? '…' : '')}
                                </p>
                                {chunk.cleaned_text.length > 120 && (
                                    <button
                                        onClick={() => setExpandedChunk(expandedChunk === chunk.chunk_id ? null : chunk.chunk_id)}
                                        className="text-[11px] text-cyan-400 hover:text-cyan-300 mt-1.5 transition-colors"
                                    >
                                        {expandedChunk === chunk.chunk_id ? 'Collapse' : 'View Full Text'}
                                    </button>
                                )}
                                <div className="mt-2 font-mono text-[10px] text-zinc-600">{chunk.source_ref}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Drawer>
        </div>
        
        {/* Gmail Replica Window */}
        <AnimatePresence>
            {gmailReplicaOpen && (
                <GmailReplica 
                    onClose={() => setGmailReplicaOpen(false)}
                    onIngest={(ids, includeAtts) => {
                        syncSelectedGmailEmails(ids, includeAtts);
                        setGmailReplicaOpen(false);
                    }}
                    isIngesting={gmailSyncing}
                />
            )}
        </AnimatePresence>
        </>
    );
}
