"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Clock,
    Edit3,
    FileText,
    Loader2,
    Lock,
    RefreshCw,
    Share2,
    Unlock,
    Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import Drawer from "@/components/ui/Drawer";
import { ShareBoardModal } from "@/components/ShareBoardModal";
import { useBRDStore } from "@/store/useBRDStore";
import { useSessionStore } from "@/store/useSessionStore";
import { useAuth } from "@/contexts/AuthContext";
import { getChunks, type Chunk } from "@/lib/apiClient";
import type { Board } from "@/lib/firestore/boards";

type SectionStatus = "generated" | "insufficient" | "human_edited" | "flagged";

interface BRDSectionView {
    id: string;
    number: number;
    title: string;
    version: string;
    status: SectionStatus;
    timestamp?: string;
    sourceCount: number;
    sourceChunkIds: string[];
    content: string;
    flagType?: string;
    flagSeverity?: "high" | "medium" | "low";
    flagDescription?: string;
}

interface ValidationFlagView {
    id: string;
    section: string;
    type: string;
    severity: "high" | "medium" | "low";
    description: string;
    acknowledged: boolean;
}

const SECTION_META: { id: string; number: number; title: string }[] = [
    { id: "executive_summary", number: 1, title: "Executive Summary" },
    { id: "functional_requirements", number: 2, title: "Functional Requirements" },
    { id: "stakeholder_analysis", number: 3, title: "Stakeholder Analysis" },
    { id: "timeline", number: 4, title: "Timeline & Milestones" },
    { id: "decisions", number: 5, title: "Key Decisions" },
    { id: "assumptions", number: 6, title: "Assumptions & Constraints" },
    { id: "success_metrics", number: 7, title: "Success Metrics" },
];

function StatusBadge({ status }: { status: SectionStatus }) {
    const styleMap = {
        generated: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
        insufficient: "bg-zinc-700/30 border-zinc-600/30 text-zinc-400",
        human_edited: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300",
        flagged: "bg-red-500/10 border-red-500/30 text-red-300",
    };
    const labelMap = {
        generated: "Generated",
        insufficient: "Insufficient Data",
        human_edited: "Human Edited",
        flagged: "Flagged",
    };
    return <span className={cn("glass-badge", styleMap[status])}>{labelMap[status]}</span>;
}

function SectionCard({
    section,
    saving,
    onSave,
    onRegenerate,
    onViewAttribution,
    onViewHistory,
}: {
    section: BRDSectionView;
    saving: boolean;
    onSave: (section: BRDSectionView, content: string) => Promise<void>;
    onRegenerate: () => void;
    onViewAttribution: (section: BRDSectionView) => void;
    onViewHistory: (section: BRDSectionView) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editContent, setEditContent] = useState(section.content);
    const [ackFlag, setAckFlag] = useState(false);

    useEffect(() => {
        setEditContent(section.content);
    }, [section.id, section.content]);

    return (
        <div
            id={`section-${section.id}`}
            className={cn("glass-card rounded-xl overflow-hidden", {
                "border-red-500/30": section.status === "flagged" && !ackFlag,
                "border-yellow-500/25": section.status === "human_edited",
            })}
        >
            <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs text-zinc-600">S{section.number}</span>
                <h3 className="text-sm font-semibold text-zinc-100 flex-1">{section.title}</h3>
                <span className="glass-badge bg-white/5 border-white/10 text-zinc-500 text-[9px] font-mono">{section.version}</span>
                <StatusBadge status={section.status} />
                {section.status === "human_edited" && <Lock size={12} className="text-yellow-400" />}
                {section.timestamp && (
                    <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                        <Clock size={9} />
                        {section.timestamp}
                    </span>
                )}
                <div className="flex items-center gap-1 ml-1">
                    <button
                        onClick={() => setEditing((v) => !v)}
                        className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                        title={section.status === "human_edited" ? "Unlock & Edit" : "Edit"}
                    >
                        {section.status === "human_edited" ? <Unlock size={13} /> : <Edit3 size={13} />}
                    </button>
                    <button
                        onClick={onRegenerate}
                        className="p-1.5 rounded-lg text-zinc-600 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                        title="Regenerate all sections"
                    >
                        <RefreshCw size={13} />
                    </button>
                </div>
            </div>

            {section.status === "flagged" && !ackFlag && (
                <div className="mx-5 mt-4 p-3 rounded-lg bg-red-500/8 border border-red-500/25 flex items-start gap-3">
                    <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-semibold text-red-300">{section.flagType}</span>
                            <span
                                className={cn(
                                    "glass-badge text-[9px]",
                                    section.flagSeverity === "high"
                                        ? "badge-severity-high"
                                        : section.flagSeverity === "medium"
                                        ? "badge-severity-medium"
                                        : "badge-severity-low"
                                )}
                            >
                                {(section.flagSeverity ?? "medium").toUpperCase()}
                            </span>
                        </div>
                        <p className="text-xs text-red-200/70">{section.flagDescription}</p>
                    </div>
                    <button
                        onClick={() => setAckFlag(true)}
                        className="text-xs text-zinc-400 hover:text-zinc-200 flex-shrink-0 bg-white/5 px-2.5 py-1 rounded-lg transition-colors"
                    >
                        Acknowledge
                    </button>
                </div>
            )}

            {section.status === "insufficient" && (
                <div className="mx-5 mt-4 p-4 rounded-lg striped-bg border border-white/8 space-y-2">
                    <p className="text-sm text-zinc-400 font-medium">Insufficient signal coverage</p>
                    <p className="text-xs text-zinc-500">This section has no enough evidence yet. Ingest more data and regenerate.</p>
                </div>
            )}

            {!editing && section.content && (
                <div className="px-5 py-4">
                    <div className="prose prose-invert prose-sm max-w-none text-zinc-300 text-xs leading-relaxed whitespace-pre-line">
                        {section.content}
                    </div>
                </div>
            )}

            {editing && (
                <div className="px-5 py-4">
                    <textarea
                        className="glass-input w-full font-mono text-xs p-3 rounded-lg resize-none"
                        rows={12}
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                    />
                    <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-zinc-600 font-mono">{editContent.length} chars</span>
                        <div className="flex gap-2">
                            <button onClick={() => setEditing(false)} className="btn-ghost text-xs py-1.5">
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    await onSave(section, editContent);
                                    setEditing(false);
                                }}
                                disabled={saving}
                                className="btn-primary text-xs py-1.5 disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-5 py-3 border-t border-white/5 flex items-center gap-3">
                <span className="text-[11px] text-zinc-600">Generated from {section.sourceCount} signals</span>
                <button onClick={() => onViewAttribution(section)} className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">
                    View Attribution
                </button>
                <button onClick={() => onViewHistory(section)} className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors">
                    Version History
                </button>
            </div>
        </div>
    );
}

export default function BRDPage() {
    const { activeSessionId, sessions } = useSessionStore();
    const { user } = useAuth();
    const sessionId = activeSessionId ?? "";
    const { sections, flags: apiFlags, loading, generating, error, generateAll, loadBRD, updateSection, acknowledgedFlagKeys, acknowledgeFlag } = useBRDStore();

    const [flagsExpanded, setFlagsExpanded] = useState(false);
    const [flags, setFlags] = useState<ValidationFlagView[]>([]);
    const [attrDrawer, setAttrDrawer] = useState<BRDSectionView | null>(null);
    const [histDrawer, setHistDrawer] = useState<BRDSectionView | null>(null);
    const [allChunks, setAllChunks] = useState<Chunk[]>([]);
    const [chunkLoading, setChunkLoading] = useState(false);
    const [shareOpen, setShareOpen] = useState(false);

    const activeSession = sessions.find((s) => s.id === sessionId);
    const boardForShare: Board | null =
        activeSession && sessionId
            ? {
                  id: sessionId,
                  title: activeSession.name ?? "Untitled BRD",
                  description: activeSession.description ?? "",
                  ownerUid: activeSession.role === "owner" ? (user?.uid ?? "") : "shared",
                  status: activeSession.status ?? "draft",
                  createdAt: new Date() as unknown as import("firebase/firestore").Timestamp,
                  updatedAt: new Date() as unknown as import("firebase/firestore").Timestamp,
              }
            : null;

    useEffect(() => {
        if (!sessionId) {
            setAllChunks([]);
            return;
        }
        loadBRD(sessionId);
    }, [sessionId]);

    useEffect(() => {
        const loadChunks = async () => {
            if (!sessionId) return;
            setChunkLoading(true);
            try {
                const res = await getChunks(sessionId, "all");
                setAllChunks(res.chunks);
            } catch {
                setAllChunks([]);
            } finally {
                setChunkLoading(false);
            }
        };
        loadChunks();
    }, [sessionId, generating]);

    useEffect(() => {
        setFlags(
            apiFlags.map((f, i) => {
                const key = `${f.section_name}::${f.flag_type}::${f.description}`;
                return {
                    id: String(i),
                    section: f.section_name,
                    type: f.flag_type,
                    severity: f.severity,
                    description: f.description,
                    acknowledged: acknowledgedFlagKeys.includes(key),
                };
            })
        );
    }, [apiFlags, acknowledgedFlagKeys]);

    const displaySections: BRDSectionView[] = useMemo(
        () =>
            SECTION_META.map((meta) => {
                const storeSection = sections.find((s) => s.id === meta.id);
                const flagForSection = flags.find((f) => f.section === meta.id && !f.acknowledged);
                const content = storeSection?.content ?? "";
                const hasInsufficientData = content.toLowerCase().includes("insufficient data");
                const status: SectionStatus = storeSection?.humanEdited
                    ? "human_edited"
                    : flagForSection
                    ? "flagged"
                    : !content || hasInsufficientData
                    ? "insufficient"
                    : "generated";
                return {
                    id: meta.id,
                    number: meta.number,
                    title: meta.title,
                    version: `v${storeSection?.version ?? 1}`,
                    status,
                    content,
                    sourceCount: storeSection?.sourceChunkIds?.length ?? 0,
                    sourceChunkIds: storeSection?.sourceChunkIds ?? [],
                    flagType: flagForSection?.type,
                    flagSeverity: flagForSection?.severity,
                    flagDescription: flagForSection?.description,
                    timestamp: storeSection?.generatedAt
                        ? new Date(storeSection.generatedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                        : undefined,
                };
            }),
        [sections, flags]
    );

    const chunkById = useMemo(() => new Map(allChunks.map((chunk) => [chunk.chunk_id, chunk])), [allChunks]);
    const attributionChunks = useMemo(() => {
        if (!attrDrawer) return [];
        return attrDrawer.sourceChunkIds.map((id) => chunkById.get(id)).filter((c): c is Chunk => Boolean(c));
    }, [attrDrawer, chunkById]);

    const unacknowledgedFlags = flags.filter((f) => !f.acknowledged);
    const highCount = unacknowledgedFlags.filter((f) => f.severity === "high").length;
    const medCount = unacknowledgedFlags.filter((f) => f.severity === "medium").length;

    const scrollTo = (id: string) => {
        document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="flex h-full overflow-hidden">
            <aside className="w-52 flex-shrink-0 border-r border-white/8 overflow-y-auto p-3 space-y-1">
                <p className="text-[10px] text-zinc-500 uppercase tracking-wider px-2 mb-3 font-semibold">Sections</p>
                {displaySections.map((sec) => (
                    <button
                        key={sec.id}
                        onClick={() => scrollTo(sec.id)}
                        className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 text-left transition-colors group"
                    >
                        <span className="text-[10px] font-mono text-zinc-700 mt-0.5 flex-shrink-0">{sec.number}.</span>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors leading-tight">{sec.title}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-mono text-zinc-700">{sec.version}</span>
                                {sec.status === "flagged" && <div className="w-1.5 h-1.5 rounded-full bg-red-400" />}
                                {sec.status === "human_edited" && <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                                {sec.status === "insufficient" && <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />}
                                {sec.status === "generated" && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
                                {sec.sourceCount > 0 && <span className="text-[9px] text-zinc-700">{sec.sourceCount}s</span>}
                            </div>
                        </div>
                    </button>
                ))}
                <div className="pt-3 border-t border-white/8 mt-2 space-y-2">
                    <button
                        onClick={() => setShareOpen(true)}
                        disabled={!sessionId || !user}
                        className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-50 border-white/15 hover:border-white/25"
                    >
                        <Share2 size={11} /> Share BRD
                    </button>
                    <button
                        onClick={() => generateAll(sessionId)}
                        disabled={generating || !sessionId}
                        className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                        {generating ? (
                            <>
                                <Loader2 size={11} className="animate-spin" /> Generating...
                            </>
                        ) : (
                            <>
                                <Zap size={11} /> Generate BRD
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => loadBRD(sessionId)}
                        disabled={loading || !sessionId}
                        className="btn-secondary w-full text-xs py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                        <RefreshCw size={11} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </aside>

            <div className="flex-1 overflow-y-auto">
                {unacknowledgedFlags.length > 0 && (
                    <div className="mx-6 mt-5">
                        <div className="glass-card rounded-xl overflow-hidden border-red-500/20">
                            <button onClick={() => setFlagsExpanded((v) => !v)} className="w-full flex items-center gap-3 px-4 py-3">
                                <AlertTriangle size={14} className="text-red-400" />
                                <span className="text-sm font-medium text-red-300">
                                    {unacknowledgedFlags.length} Validation {unacknowledgedFlags.length === 1 ? "Flag" : "Flags"}
                                </span>
                                <div className="flex items-center gap-1.5 ml-1">
                                    {highCount > 0 && <span className="glass-badge badge-severity-high text-[9px]">{highCount} HIGH</span>}
                                    {medCount > 0 && <span className="glass-badge badge-severity-medium text-[9px]">{medCount} MEDIUM</span>}
                                </div>
                                <div className="ml-auto text-zinc-600">{flagsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</div>
                            </button>
                            <AnimatePresence>
                                {flagsExpanded && (
                                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                                        <div className="px-4 pb-4 space-y-2 border-t border-white/8 pt-3">
                                            {flags.map((flag) => (
                                                <div key={flag.id} className={cn("flex items-start gap-3 p-3 rounded-lg", flag.acknowledged ? "opacity-40" : "bg-white/3")}>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-xs font-medium text-zinc-300">{flag.section}</span>
                                                            <span
                                                                className={cn("glass-badge text-[9px]", {
                                                                    "badge-severity-high": flag.severity === "high",
                                                                    "badge-severity-medium": flag.severity === "medium",
                                                                    "badge-severity-low": flag.severity === "low",
                                                                })}
                                                            >
                                                                {flag.severity.toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-zinc-500">{flag.description}</p>
                                                    </div>
                                                    {!flag.acknowledged && (
                                                        <button
                                                            onClick={() => {
                                                                const key = `${flag.section}::${flag.type}::${flag.description}`;
                                                                acknowledgeFlag(key);
                                                                setFlags((prev) =>
                                                                    prev.map((f) => (f.id === flag.id ? { ...f, acknowledged: true } : f))
                                                                );
                                                            }}
                                                            className="text-[11px] text-zinc-400 hover:text-zinc-200 flex-shrink-0 bg-white/5 px-2.5 py-1 rounded-lg transition-colors"
                                                        >
                                                            Acknowledge
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                )}

                {generating && (
                    <div className="mx-6 mt-5 glass-card rounded-xl p-5 flex items-center gap-4">
                        <Loader2 size={20} className="animate-spin text-cyan-400 flex-shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-cyan-300">Generating BRD sections...</p>
                            <p className="text-xs text-zinc-500 mt-0.5">Running multi-agent generation. This can take 30-90 seconds.</p>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="mx-6 mt-5 glass-card rounded-xl p-4 border-red-500/30">
                        <p className="text-sm text-red-300">{error}</p>
                    </div>
                )}

                <div className="p-6 space-y-5">
                    {(generating ? [] : displaySections).map((section, i) => (
                        <motion.div key={section.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: i * 0.05 }}>
                            <SectionCard
                                section={section}
                                saving={loading}
                                onSave={async (s, nextContent) => updateSection(sessionId, s.id, nextContent)}
                                onRegenerate={() => generateAll(sessionId)}
                                onViewAttribution={(s) => setAttrDrawer(s)}
                                onViewHistory={(s) => setHistDrawer(s)}
                            />
                        </motion.div>
                    ))}

                    {!generating && displaySections.every((s) => !s.content) && !loading && (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                            <FileText size={36} className="text-zinc-700" />
                            <p className="text-sm text-zinc-500">No BRD generated yet.</p>
                            <button onClick={() => generateAll(sessionId)} className="btn-primary text-sm mt-1 flex items-center gap-2">
                                <Zap size={14} /> Generate BRD Draft
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {boardForShare && <ShareBoardModal board={boardForShare} isOpen={shareOpen} onClose={() => setShareOpen(false)} />}

            <Drawer
                open={Boolean(attrDrawer)}
                onClose={() => setAttrDrawer(null)}
                title={attrDrawer?.title ?? ""}
                subtitle={`${attrDrawer?.sourceCount ?? 0} contributing signals`}
            >
                {chunkLoading ? (
                    <div className="text-xs text-zinc-500 flex items-center gap-2">
                        <Loader2 size={12} className="animate-spin" /> Loading source chunks...
                    </div>
                ) : attributionChunks.length === 0 ? (
                    <div className="text-xs text-zinc-500">No source chunks were found for this section.</div>
                ) : (
                    <div className="space-y-3">
                        {attributionChunks.map((chunk) => (
                            <div key={chunk.chunk_id} className="glass-card p-3.5 rounded-xl">
                                <p className="text-xs text-zinc-200 leading-relaxed mb-2 italic">"{chunk.cleaned_text}"</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="glass-badge text-[9px]">{chunk.signal_label ?? chunk.label ?? "unknown"}</span>
                                    <span className="text-[10px] text-zinc-500">{chunk.speaker || "Unknown"}</span>
                                    <span className="font-mono text-[10px] text-zinc-600">{chunk.source_ref}</span>
                                    <span className="ml-auto text-[10px] font-mono text-emerald-400">{Math.round((chunk.confidence ?? 0) * 100)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Drawer>

            <Drawer open={Boolean(histDrawer)} onClose={() => setHistDrawer(null)} title={histDrawer?.title ?? ""} subtitle="Version history">
                {!histDrawer ? null : (
                    <div className="space-y-3">
                        <div className="glass-card p-4 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="font-mono text-xs text-zinc-300 font-semibold">{histDrawer.version}</span>
                                <span className="glass-badge badge-timeline text-[9px]">Current</span>
                                {histDrawer.timestamp && (
                                    <span className="text-[10px] text-zinc-600 ml-auto flex items-center gap-1">
                                        <Clock size={9} />
                                        {histDrawer.timestamp}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-zinc-500">{histDrawer.sourceCount} source chunk(s) attached to this section.</p>
                        </div>
                        <p className="text-xs text-zinc-600">
                            Historical versions are stored in backend, but a dedicated section-history endpoint is not available yet.
                        </p>
                    </div>
                )}
            </Drawer>
        </div>
    );
}
