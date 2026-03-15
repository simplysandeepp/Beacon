"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
    Calendar,
    CheckCircle2,
    FileText,
    Mail,
    MessageSquare,
    Settings as SettingsIcon,
    Users as UsersIcon,
    Video,
    XCircle,
    Loader2,
    Database,
    Hash,
    RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

import { useAuthStore } from "@/store/useAuthStore";
import { useIntegrationStore } from "@/store/useIntegrationStore";
import { useSessionStore } from "@/store/useSessionStore";
import {
    disconnectSlack,
    getSlackOAuthUrl,
    getSlackStatus,
    getChunks,
    ingestSlackChannels,
    listSlackChannels,
    getGmailStatus,
    getGmailOAuthUrl,
    disconnectGmail,
    listGmailEmails,
    ingestGmailEmails,
    type SlackChannel,
    type SlackStatus,
    type GmailEmail,
    type GmailStatus,
} from "@/lib/apiClient";

const dataSources = [
    {
        id: "slack",
        name: "Slack",
        icon: MessageSquare,
        color: "from-purple-500 to-pink-500",
        description: "Connect your Slack workspace to ingest conversations",
        available: true,
    },
    {
        id: "gmail",
        name: "Gmail",
        icon: Mail,
        color: "from-red-500 to-orange-500",
        description: "Sync email threads and discussions",
        available: true,
    },
    {
        id: "teams",
        name: "MS Teams",
        icon: UsersIcon,
        color: "from-blue-600 to-indigo-600",
        description: "Import team conversations and channels",
        available: false,
    },
    {
        id: "fireflies",
        name: "Meetings (Fireflies)",
        icon: Video,
        color: "from-blue-500 to-cyan-500",
        description: "Auto-sync meeting transcriptions",
        available: false,
    },
    {
        id: "documents",
        name: "Documents",
        icon: FileText,
        color: "from-green-500 to-emerald-500",
        description: "Upload and analyze PDF, DOCX, TXT files",
        available: false,
    },
    {
        id: "calendar",
        name: "Calendar",
        icon: Calendar,
        color: "from-yellow-500 to-amber-500",
        description: "Extract requirements from calendar events",
        available: false,
    },
];

export default function ProfilePage() {
    const searchParams = useSearchParams();
    const { user, updateUser } = useAuthStore();
    const { integrations, updateIntegration } = useIntegrationStore();
    const { activeSessionId } = useSessionStore();

    const [editingProfile, setEditingProfile] = useState(false);
    const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null);
    const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
    const [selectedSlackChannels, setSelectedSlackChannels] = useState<string[]>([]);
    const [slackLoading, setSlackLoading] = useState(false);
    const [slackIngesting, setSlackIngesting] = useState(false);
    const [slackError, setSlackError] = useState<string | null>(null);
    const [slackMessage, setSlackMessage] = useState<string | null>(null);

    const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null);
    const [gmailEmails, setGmailEmails] = useState<GmailEmail[]>([]);
    const [selectedGmailEmails, setSelectedGmailEmails] = useState<string[]>([]);
    const [gmailLoading, setGmailLoading] = useState(false);
    const [gmailIngesting, setGmailIngesting] = useState(false);
    const [gmailError, setGmailError] = useState<string | null>(null);
    const [gmailMessage, setGmailMessage] = useState<string | null>(null);

    const [totalChunks, setTotalChunks] = useState(0);
    const [activeChunks, setActiveChunks] = useState(0);
    const [noiseChunks, setNoiseChunks] = useState(0);
    const [statsLoading, setStatsLoading] = useState(false);

    const activeSources = useMemo(() => (slackStatus?.connected ? 1 : 0) + (gmailStatus?.connected ? 1 : 0), [slackStatus?.connected, gmailStatus?.connected]);
    const relevancePct = totalChunks > 0 ? Math.round((activeChunks / totalChunks) * 100) : 0;

    const syncSlackStatus = async () => {
        setSlackLoading(true);
        setSlackError(null);
        try {
            const status = await getSlackStatus();
            setSlackStatus(status);

            if (status.connected) {
                const channelRes = await listSlackChannels();
                setSlackChannels(channelRes.channels);

                const persisted = integrations.find((i) => i.type === "slack")?.config?.channels ?? [];
                const validSelected = persisted.filter((id) => channelRes.channels.some((c) => c.id === id));
                setSelectedSlackChannels(validSelected);

                const slackIntegration = integrations.find((i) => i.type === "slack");
                if (slackIntegration) {
                    updateIntegration(slackIntegration.id, {
                        connected: true,
                        name: status.team_name ? `${status.team_name} Workspace` : "Slack Workspace",
                        config: {
                            ...(slackIntegration.config ?? {}),
                            workspace: status.team_name ?? "",
                            channels: validSelected,
                        },
                    });
                }
            } else {
                setSlackChannels([]);
                setSelectedSlackChannels([]);

                const slackIntegration = integrations.find((i) => i.type === "slack");
                if (slackIntegration) {
                    updateIntegration(slackIntegration.id, {
                        connected: false,
                        config: {
                            ...(slackIntegration.config ?? {}),
                            workspace: "",
                            channels: [],
                        },
                    });
                }
            }
        } catch (e) {
            setSlackError(e instanceof Error ? e.message : "Failed to load Slack status");
        } finally {
            setSlackLoading(false);
        }
    };

    const syncGmailStatus = async () => {
        setGmailLoading(true);
        setGmailError(null);
        try {
            const status = await getGmailStatus();
            setGmailStatus(status);

            if (status.connected) {
                const emailsRes = await listGmailEmails({ count: 20 });
                setGmailEmails(emailsRes.emails);

                const gmailIntegration = integrations.find((i) => i.type === "gmail");
                if (gmailIntegration) {
                    updateIntegration(gmailIntegration.id, {
                        connected: true,
                    });
                }
            } else {
                const gmailIntegration = integrations.find((i) => i.type === "gmail");
                if (gmailIntegration) {
                    updateIntegration(gmailIntegration.id, {
                        connected: false,
                    });
                }
            }
        } catch (e) {
            setGmailError(e instanceof Error ? e.message : "Failed to load Gmail status");
        } finally {
            setGmailLoading(false);
        }
    };

    const loadSessionStats = async () => {
        if (!activeSessionId) {
            setTotalChunks(0);
            setActiveChunks(0);
            setNoiseChunks(0);
            return;
        }

        setStatsLoading(true);
        try {
            const all = await getChunks(activeSessionId, "all");
            const active = all.chunks.filter((chunk) => !chunk.suppressed).length;
            const noise = all.chunks.length - active;
            setTotalChunks(all.count);
            setActiveChunks(active);
            setNoiseChunks(noise);
        } catch {
            setTotalChunks(0);
            setActiveChunks(0);
            setNoiseChunks(0);
        } finally {
            setStatsLoading(false);
        }
    };

    useEffect(() => {
        syncSlackStatus();
        syncGmailStatus();
    }, []);

    useEffect(() => {
        loadSessionStats();
    }, [activeSessionId]);

    useEffect(() => {
        const slackParam = searchParams.get("slack");
        if (slackParam) {
            if (slackParam === "connected") {
                setSlackMessage("Slack workspace connected successfully.");
                syncSlackStatus();
            } else if (slackParam === "error") {
                setSlackError("Slack OAuth failed. Please try again.");
            }
        }

        const gmailParam = searchParams.get("gmail");
        if (gmailParam) {
            if (gmailParam === "connected") {
                setGmailMessage("Gmail connected successfully.");
                syncGmailStatus();
            } else if (gmailParam === "error") {
                setGmailError("Gmail OAuth failed. Please try again.");
            }
        }
    }, [searchParams]);

    useEffect(() => {
        const slackIntegration = integrations.find((i) => i.type === "slack");
        if (!slackIntegration) return;
        updateIntegration(slackIntegration.id, {
            config: {
                ...(slackIntegration.config ?? {}),
                channels: selectedSlackChannels,
            },
        });
    }, [selectedSlackChannels]);

    const connectSlack = async () => {
        setSlackError(null);
        try {
            const authUrl = await getSlackOAuthUrl();
            window.location.href = authUrl;
        } catch (e) {
            setSlackError(e instanceof Error ? e.message : "Failed to start Slack OAuth");
        }
    };

    const disconnectSlackWorkspace = async () => {
        setSlackError(null);
        try {
            await disconnectSlack();
            setSlackMessage("Slack disconnected.");
            await syncSlackStatus();
        } catch (e) {
            setSlackError(e instanceof Error ? e.message : "Failed to disconnect Slack");
        }
    };

    const ingestSelectedSlackChannels = async () => {
        if (!activeSessionId) {
            setSlackError("Select an active BRD session before ingesting Slack channels.");
            return;
        }
        if (selectedSlackChannels.length === 0) {
            setSlackError("Select at least one Slack channel to ingest.");
            return;
        }

        setSlackIngesting(true);
        setSlackError(null);
        try {
            const result = await ingestSlackChannels(activeSessionId, selectedSlackChannels);
            setSlackMessage(result.message);
            await loadSessionStats();
        } catch (e) {
            setSlackError(e instanceof Error ? e.message : "Slack ingestion failed");
        } finally {
            setSlackIngesting(false);
        }
    };

    const connectGmail = async () => {
        setGmailError(null);
        try {
            const authUrl = await getGmailOAuthUrl();
            window.location.href = authUrl;
        } catch (e) {
            setGmailError(e instanceof Error ? e.message : "Failed to start Gmail OAuth");
        }
    };

    const disconnectGmailAccount = async () => {
        setGmailError(null);
        try {
            await disconnectGmail();
            setGmailMessage("Gmail disconnected.");
            await syncGmailStatus();
        } catch (e) {
            setGmailError(e instanceof Error ? e.message : "Failed to disconnect Gmail");
        }
    };

    const ingestSelectedGmailEmails = async () => {
        if (!activeSessionId) {
            setGmailError("Select an active BRD session before ingesting Gmail emails.");
            return;
        }
        if (selectedGmailEmails.length === 0) {
            setGmailError("Select at least one email to ingest.");
            return;
        }

        setGmailIngesting(true);
        setGmailError(null);
        try {
            const result = await ingestGmailEmails(activeSessionId, selectedGmailEmails);
            setGmailMessage(result.message);
            await loadSessionStats();
        } catch (e) {
            setGmailError(e instanceof Error ? e.message : "Gmail ingestion failed");
        } finally {
            setGmailIngesting(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] pb-12">
            {/* Header / User Profile */}
            <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6 border-b border-white/5 pb-8">
                <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="relative">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-zinc-100 text-2xl font-bold">
                            {user?.name?.charAt(0) || "U"}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-emerald-500 border-4 border-zinc-950 rounded-full" />
                    </div>
                    <div className="text-center md:text-left">
                        <h1 className="text-2xl font-bold text-zinc-100">{user?.name || "User Profile"}</h1>
                        <p className="text-zinc-500 text-sm mt-0.5">{user?.email}</p>
                        <div className="flex items-center gap-2 mt-3">
                            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-[10px] font-bold uppercase tracking-wider">
                                Product Team
                            </span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => setEditingProfile(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-zinc-300 text-sm font-medium transition-all"
                >
                    <SettingsIcon size={14} />
                    Edit Profile
                </button>
            </div>

            {editingProfile && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]" onClick={() => setEditingProfile(false)}>
                    <div className="glass-card border-white/10 rounded-xl p-6 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-bold text-zinc-100">Edit Profile</h3>
                            <button onClick={() => setEditingProfile(false)} className="text-zinc-500 hover:text-white transition-colors">
                                <XCircle size={20} />
                            </button>
                        </div>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                const name = formData.get("name") as string;
                                const email = formData.get("email") as string;
                                updateUser(name, email);
                                setEditingProfile(false);
                            }}
                            className="space-y-4"
                        >
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Full Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    defaultValue={user?.name}
                                    className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-700 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
                                    placeholder="Your name"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-zinc-500 uppercase tracking-widest">Email Address</label>
                                <input
                                    type="email"
                                    name="email"
                                    required
                                    defaultValue={user?.email}
                                    className="w-full px-3 py-2 bg-zinc-950 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-700 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500/50 transition-all"
                                    placeholder="your@email.com"
                                />
                            </div>
                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setEditingProfile(false)}
                                    className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-zinc-300 text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="flex-1 px-4 py-2 bg-zinc-100 hover:bg-white text-zinc-950 rounded-lg text-sm font-bold transition-all">
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {(slackError || slackMessage || gmailError || gmailMessage) && (
                <div
                    className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 text-xs transition-all ${
                        (slackError || gmailError) ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    }`}
                >
                    { (slackError || gmailError) ? <XCircle size={14} /> : <CheckCircle2 size={14} /> }
                    <span>{slackError ?? slackMessage ?? gmailError ?? gmailMessage}</span>
                </div>
            )}

            {/* S2-01 style Connector Cards */}
            <div>
                <div className="mb-6">
                    <h2 className="text-base font-bold text-zinc-100">Data Ingestion Sources</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Connect and manage your data bridge connectors</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {dataSources.map((source) => {
                        const isSlack = source.id === "slack";
                        const isGmail = source.id === "gmail";
                        const isConnected = isSlack ? Boolean(slackStatus?.connected) : isGmail ? Boolean(gmailStatus?.connected) : false;

                        return (
                            <div key={source.id} className="glass-card p-5 rounded-xl border-white/5 space-y-4 flex flex-col relative overflow-hidden group">
                                {!source.available && (
                                    <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
                                        <span className="px-2 py-0.5 bg-zinc-800 border border-white/10 rounded-full text-[9px] font-bold text-zinc-500 uppercase tracking-widest">
                                            Coming Soon
                                        </span>
                                    </div>
                                )}
                                
                                <div className="flex items-center gap-3">
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl border flex items-center justify-center transition-colors shadow-sm",
                                        isSlack ? "bg-[#4A154B]/20 border-[#4A154B]/40" : 
                                        isGmail ? "bg-red-500/10 border-red-500/20" : 
                                        "bg-white/5 border-white/10"
                                    )}>
                                        {isSlack ? <Hash size={18} className="text-[#e01e5a]" /> : 
                                         isGmail ? <Mail size={18} className="text-red-400" /> : 
                                         <source.icon size={18} className="text-zinc-600" />}
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-zinc-100">{source.name}</h3>
                                        {source.available && (
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isConnected ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                                    {isConnected ? 'Connected' : 'Inactive'}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <p className="text-xs text-zinc-500 leading-relaxed flex-1">{source.description}</p>

                                {isSlack && isConnected && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-300 pt-2 border-t border-white/5">
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="text-zinc-500 uppercase tracking-wider">Workspace</span>
                                            <span className="text-cyan-400 font-mono">{slackStatus?.team_name ?? "Connected"}</span>
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Channels</p>
                                            <div className="max-h-32 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                                                {slackChannels.length === 0 ? (
                                                    <p className="text-[10px] text-zinc-600 italic px-2">{slackLoading ? "Loading..." : "None found"}</p>
                                                ) : (
                                                    slackChannels.slice(0, 20).map((channel) => (
                                                        <label key={channel.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group/item">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedSlackChannels.includes(channel.id)}
                                                                onChange={() =>
                                                                    setSelectedSlackChannels((prev) =>
                                                                        prev.includes(channel.id)
                                                                            ? prev.filter((id) => id !== channel.id)
                                                                            : [...prev, channel.id]
                                                                    )
                                                                }
                                                                className="w-3.5 h-3.5 rounded border-white/10 bg-zinc-950 text-cyan-500"
                                                            />
                                                            <span className="text-[11px] text-zinc-400 font-mono truncate group-hover/item:text-zinc-200">#{channel.name}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {isGmail && isConnected && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-300 pt-2 border-t border-white/5">
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="text-zinc-500 uppercase tracking-wider">Status</span>
                                            <span className="text-emerald-400 font-bold">AUTHENTICATED</span>
                                        </div>
                                    </div>
                                )}

                                {source.available && (
                                    <div className="pt-2 mt-auto space-y-2 text-center">
                                        {isConnected ? (
                                            <>
                                                {isSlack && (
                                                    <button
                                                        onClick={ingestSelectedSlackChannels}
                                                        disabled={slackIngesting || selectedSlackChannels.length === 0}
                                                        className="w-full py-2 rounded-lg font-bold text-xs transition-all bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider"
                                                    >
                                                        {slackIngesting ? "Ingesting..." : "Sync Selected"}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={isSlack ? disconnectSlackWorkspace : disconnectGmailAccount}
                                                    className="text-[10px] font-bold text-zinc-600 hover:text-red-400 transition-colors uppercase tracking-widest"
                                                >
                                                    Disconnect
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={isSlack ? connectSlack : connectGmail}
                                                className={cn(
                                                    "w-full py-2 rounded-lg font-bold text-xs transition-all uppercase tracking-wider",
                                                    isSlack ? "bg-white text-zinc-950 hover:bg-zinc-200" : "bg-red-500 text-white hover:bg-red-600"
                                                )}
                                            >
                                                Connect {source.name}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* S1-04 style Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                <div className="glass-card p-4 rounded-xl border-white/5 text-center bg-white/[0.01]">
                    <p className="text-2xl font-bold text-zinc-100">{activeSources}</p>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Active Sources</p>
                </div>
                <div className="glass-card p-4 rounded-xl border-white/5 text-center bg-white/[0.01]">
                    <p className="text-2xl font-bold text-zinc-100">
                        {statsLoading ? <Loader2 size={16} className="animate-spin mx-auto text-zinc-700" /> : totalChunks}
                    </p>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Processed</p>
                </div>
                <div className="glass-card p-4 rounded-xl border-white/5 text-center bg-white/[0.01]">
                    <p className="text-2xl font-bold text-emerald-400">
                        {statsLoading ? <Loader2 size={16} className="animate-spin mx-auto text-emerald-900" /> : `${relevancePct}%`}
                    </p>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Relevance</p>
                </div>
                <div className="glass-card p-4 rounded-xl border-white/5 text-center bg-white/[0.01]">
                    <p className="text-2xl font-bold text-amber-500">
                        {statsLoading ? <Loader2 size={16} className="animate-spin mx-auto text-amber-900" /> : noiseChunks}
                    </p>
                    <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Metadata-only</p>
                </div>
            </div>
        </div>
    );
}
