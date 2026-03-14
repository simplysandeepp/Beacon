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
} from "lucide-react";

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
                const emailsRes = await listGmailEmails(20);
                setGmailEmails(emailsRes.emails);

                const gmailIntegration = integrations.find((i) => i.type === "gmail");
                if (gmailIntegration) {
                    updateIntegration(gmailIntegration.id, {
                        connected: true,
                    });
                }
            } else {
                setGmailEmails([]);
                setSelectedGmailEmails([]);
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
        <div className="space-y-8">
            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-8">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white text-2xl font-bold">
                            {user?.name?.charAt(0) || "U"}
                        </div>
                        <div>
                            <h1 className="text-2xl font-semibold text-zinc-100">{user?.name || "User Profile"}</h1>
                            <p className="text-zinc-400 mt-1">{user?.email}</p>
                            <p className="text-cyan-400 text-sm mt-2">Employee - Product Team</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setEditingProfile(!editingProfile)}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-zinc-300 transition-colors"
                    >
                        <SettingsIcon size={16} />
                        Edit Profile
                    </button>
                </div>
            </div>

            {editingProfile && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setEditingProfile(false)}>
                    <div className="bg-zinc-900 border border-white/10 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-xl font-semibold text-zinc-100 mb-4">Edit Profile</h3>
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
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">Name</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    defaultValue={user?.name}
                                    className="w-full px-4 py-3 bg-zinc-950 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="Your name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-zinc-300 mb-2">Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    required
                                    defaultValue={user?.email}
                                    className="w-full px-4 py-3 bg-zinc-950 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                                    placeholder="your@email.com"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditingProfile(false)}
                                    className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-zinc-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors">
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {(slackError || slackMessage || gmailError || gmailMessage) && (
                <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                        (slackError || gmailError) ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                    }`}
                >
                    {slackError ?? slackMessage ?? gmailError ?? gmailMessage}
                </div>
            )}

            <div>
                <div className="mb-6">
                    <h2 className="text-xl font-semibold text-zinc-100">Data Ingestion Sources</h2>
                    <p className="text-zinc-400 text-sm mt-1">Connect your accounts to collect requirements and feedback</p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {dataSources.map((source) => {
                        const Icon = source.icon;
                        const isSlack = source.id === "slack";
                        const isGmail = source.id === "gmail";
                        const isConnected = isSlack ? Boolean(slackStatus?.connected) : isGmail ? Boolean(gmailStatus?.connected) : false;

                        return (
                            <div key={source.id} className="bg-zinc-900/50 border border-white/5 rounded-xl p-6 hover:border-white/10 transition-all group">
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`p-4 rounded-xl bg-gradient-to-br ${source.color} group-hover:scale-110 transition-transform`}>
                                        <Icon size={28} className="text-white" />
                                    </div>
                                    {isConnected ? (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                                            <CheckCircle2 size={12} className="text-green-400" />
                                            <span className="text-xs font-medium text-green-400">Connected</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-zinc-800 border border-white/5 rounded-full">
                                            <XCircle size={12} className="text-zinc-500" />
                                            <span className="text-xs font-medium text-zinc-500">
                                                {source.available ? "Inactive" : "Coming soon"}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <h3 className="text-lg font-semibold text-zinc-100 mb-2">{source.name}</h3>
                                <p className="text-sm text-zinc-400 mb-4">{source.description}</p>

                                {isSlack && isConnected && (
                                    <div className="mb-4 space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-zinc-500">Workspace</span>
                                            <span className="text-cyan-400">{slackStatus?.team_name ?? "Connected"}</span>
                                        </div>
                                        <div className="space-y-1.5 pt-2">
                                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Read-only channels</p>
                                            <div className="max-h-28 overflow-y-auto pr-1 space-y-1">
                                                {slackChannels.length === 0 ? (
                                                    <p className="text-[11px] text-zinc-500">{slackLoading ? "Loading channels..." : "No channels found"}</p>
                                                ) : (
                                                    slackChannels.slice(0, 20).map((channel) => (
                                                        <label key={channel.id} className="flex items-center gap-2 text-xs text-zinc-300">
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
                                                                className="w-3.5 h-3.5 accent-cyan-400"
                                                            />
                                                            <span className="truncate">#{channel.name}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {isGmail && isConnected && (
                                    <div className="mb-4 space-y-2">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-zinc-500">Status</span>
                                            <span className="text-emerald-400">Authenticated</span>
                                        </div>
                                        <div className="space-y-1.5 pt-2">
                                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Recent Emails</p>
                                            <div className="max-h-28 overflow-y-auto pr-1 space-y-1">
                                                {gmailEmails.length === 0 ? (
                                                    <p className="text-[11px] text-zinc-500">{gmailLoading ? "Loading emails..." : "No emails found"}</p>
                                                ) : (
                                                    gmailEmails.map((email) => (
                                                        <label key={email.message_id} className="flex items-center gap-2 text-xs text-zinc-300">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedGmailEmails.includes(email.message_id)}
                                                                onChange={() =>
                                                                    setSelectedGmailEmails((prev) =>
                                                                        prev.includes(email.message_id)
                                                                            ? prev.filter((id) => id !== email.message_id)
                                                                            : [...prev, email.message_id]
                                                                    )
                                                                }
                                                                className="w-3.5 h-3.5 accent-red-400"
                                                            />
                                                            <span className="truncate" title={email.subject}>{email.subject || "(No Subject)"}</span>
                                                        </label>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {isSlack || isGmail ? (
                                    <div className="space-y-2">
                                        <button
                                            onClick={isSlack ? (isConnected ? disconnectSlackWorkspace : connectSlack) : (isConnected ? disconnectGmailAccount : connectGmail)}
                                            className={`w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                                                isConnected
                                                    ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                                                    : isSlack ? "bg-cyan-500 hover:bg-cyan-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"
                                            }`}
                                        >
                                            {isConnected ? `Disconnect ${isSlack ? "Slack" : "Gmail"}` : `Connect ${isSlack ? "Slack" : "Gmail"}`}
                                        </button>
                                        {isConnected && (
                                            <button
                                                onClick={isSlack ? ingestSelectedSlackChannels : ingestSelectedGmailEmails}
                                                disabled={(isSlack ? (slackIngesting || selectedSlackChannels.length === 0) : (gmailIngesting || selectedGmailEmails.length === 0))}
                                                className={`w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-colors border hover:bg-opacity-20 disabled:opacity-50 ${
                                                    isSlack ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20" : "bg-red-500/10 text-red-300 border-red-500/30 hover:bg-red-500/20"
                                                }`}
                                            >
                                                {(isSlack ? (slackIngesting ? "Ingesting..." : "Ingest Selected Channels") : (gmailIngesting ? "Ingesting..." : "Ingest Selected Emails"))}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <button
                                        disabled
                                        className="w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-colors bg-zinc-800/70 text-zinc-500 border border-white/10 cursor-not-allowed"
                                    >
                                        Coming Soon
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="bg-zinc-900/50 border border-white/5 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-zinc-100 mb-4">Session Ingestion Statistics</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                        <p className="text-3xl font-bold text-cyan-400">{activeSources}</p>
                        <p className="text-xs text-zinc-500 mt-1">Active Sources</p>
                    </div>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-purple-400">{statsLoading ? "..." : totalChunks}</p>
                        <p className="text-xs text-zinc-500 mt-1">Items Collected</p>
                    </div>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-green-400">{statsLoading ? "..." : `${relevancePct}%`}</p>
                        <p className="text-xs text-zinc-500 mt-1">Relevant Content</p>
                    </div>
                    <div className="text-center">
                        <p className="text-3xl font-bold text-yellow-400">{statsLoading ? "..." : noiseChunks}</p>
                        <p className="text-xs text-zinc-500 mt-1">Suppressed Items</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
