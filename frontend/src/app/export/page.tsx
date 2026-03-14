"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    Download,
    File,
    FileText,
    Loader2,
    Table2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { exportBRD, getBRD, getChunks, type ExportFormat } from "@/lib/apiClient";
import { useSessionStore } from "@/store/useSessionStore";
import { useBRDStore } from "@/store/useBRDStore";

interface CheckItem {
    id: string;
    label: string;
    description: string;
    status: "ok" | "warn";
    fixHref?: string;
}

const FORMAT_CARDS = [
    {
        id: "markdown" as ExportFormat,
        label: "Markdown",
        icon: <FileText size={22} className="text-zinc-300" />,
        desc: "Raw content export with all generated sections and validation notes.",
        sub: "Plain .md file",
    },
    {
        id: "docx" as ExportFormat,
        label: "DOCX",
        icon: <Table2 size={22} className="text-blue-300" />,
        desc: "Word document for stakeholder review and offline editing.",
        sub: "Business-ready",
    },
    {
        id: "html" as ExportFormat,
        label: "HTML",
        icon: <File size={22} className="text-amber-300" />,
        desc: "Styled browser-friendly document with section formatting.",
        sub: "Web-friendly export",
    },
];

const EXPECTED_SECTION_IDS = [
    "executive_summary",
    "functional_requirements",
    "stakeholder_analysis",
    "timeline",
    "decisions",
    "assumptions",
    "success_metrics",
];

function countGeneratedSections(sections: Record<string, string | undefined>): { generated: number; insufficient: number } {
    let generated = 0;
    let insufficient = 0;

    EXPECTED_SECTION_IDS.forEach((id) => {
        const text = (sections[id] ?? "").trim();
        if (!text) {
            return;
        }
        if (text.toLowerCase().includes("insufficient data")) {
            insufficient += 1;
            return;
        }
        generated += 1;
    });
    return { generated, insufficient };
}

export default function ExportPage() {
    const { activeSessionId, sessions } = useSessionStore();
    const { acknowledgedFlagKeys } = useBRDStore();
    const sessionId = activeSessionId ?? "";
    const activeSession = sessions.find((s) => s.id === sessionId);

    const [loadingChecks, setLoadingChecks] = useState(false);
    const [proceedAnyway, setProceedAnyway] = useState(false);
    const [downloading, setDownloading] = useState<ExportFormat | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);

    const [chunksTotal, setChunksTotal] = useState(0);
    const [flagsTotal, setFlagsTotal] = useState(0);
    const [highFlags, setHighFlags] = useState(0);
    const [generatedSections, setGeneratedSections] = useState(0);
    const [insufficientSections, setInsufficientSections] = useState(0);
    const [humanEditedSections, setHumanEditedSections] = useState(0);

    useEffect(() => {
        const loadChecks = async () => {
            if (!sessionId) {
                setChunksTotal(0);
                setFlagsTotal(0);
                setHighFlags(0);
                setGeneratedSections(0);
                setInsufficientSections(0);
                setHumanEditedSections(0);
                return;
            }

            setLoadingChecks(true);
            try {
                const [chunksRes, brdRes] = await Promise.all([getChunks(sessionId, "all"), getBRD(sessionId, "markdown")]);
                setChunksTotal(chunksRes.count);
                // Exclude flags the user has already acknowledged in the BRD review page
                const unacknowledged = brdRes.flags.filter(
                    (f) => !acknowledgedFlagKeys.includes(`${f.section_name}::${f.flag_type}::${f.description}`)
                );
                setFlagsTotal(unacknowledged.length);
                setHighFlags(unacknowledged.filter((f) => f.severity === "high").length);

                const { generated, insufficient } = countGeneratedSections(brdRes.sections);
                setGeneratedSections(generated);
                setInsufficientSections(insufficient);

                const editedCount = Object.values(brdRes.section_meta ?? {}).filter((m) => m.human_edited).length;
                setHumanEditedSections(editedCount);
            } catch (e) {
                setExportError(e instanceof Error ? e.message : "Failed to load export readiness checks");
            } finally {
                setLoadingChecks(false);
            }
        };

        loadChecks();
    }, [sessionId, acknowledgedFlagKeys]);

    const checklist: CheckItem[] = useMemo(() => {
        const hasSessionName = Boolean(activeSession?.name?.trim()) && activeSession?.name !== "Untitled Session";
        const hasSources = chunksTotal > 0;
        const allSectionsCovered = generatedSections + insufficientSections >= EXPECTED_SECTION_IDS.length;
        const noHighFlags = highFlags === 0;

        return [
            {
                id: "c1",
                label: "Sections generated or explicitly marked",
                description: `${generatedSections}/${EXPECTED_SECTION_IDS.length} generated, ${insufficientSections} marked insufficient.`,
                status: allSectionsCovered ? "ok" : "warn",
                fixHref: "/brd",
            },
            {
                id: "c2",
                label: "High-severity flags resolved",
                description: highFlags === 0 ? "No high-severity validation flags remain." : `${highFlags} high-severity flags need review.`,
                status: noHighFlags ? "ok" : "warn",
                fixHref: "/brd",
            },
            {
                id: "c3",
                label: "At least one source ingested",
                description: hasSources ? `${chunksTotal} chunks are available for this session.` : "No chunks ingested yet.",
                status: hasSources ? "ok" : "warn",
                fixHref: "/ingestion",
            },
            {
                id: "c4",
                label: "Human review recorded",
                description:
                    humanEditedSections > 0
                        ? `${humanEditedSections} section(s) were human-edited and locked.`
                        : "No section has been human-edited yet.",
                status: humanEditedSections > 0 ? "ok" : "warn",
                fixHref: "/brd",
            },
            {
                id: "c5",
                label: "Session name set",
                description: hasSessionName ? `Session name: "${activeSession?.name}"` : "Session still uses default name.",
                status: hasSessionName ? "ok" : "warn",
                fixHref: "/dashboard",
            },
        ];
    }, [activeSession?.name, chunksTotal, generatedSections, insufficientSections, highFlags, humanEditedSections]);

    const warnCount = checklist.filter((c) => c.status === "warn").length;
    const allOk = checklist.every((c) => c.status === "ok") || proceedAnyway;

    const handleExport = async (format: ExportFormat) => {
        if (!sessionId) {
            setExportError("No active session. Go to Dashboard to create/select one.");
            return;
        }
        setDownloading(format);
        setExportError(null);
        try {
            await exportBRD(sessionId, format);
        } catch (e) {
            setExportError(e instanceof Error ? e.message : "Export failed");
        } finally {
            setDownloading(null);
        }
    };

    return (
        <div className="p-6 space-y-6 max-w-5xl">
            <div>
                <h1 className="text-2xl font-bold text-zinc-100">Export BRD</h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                    Review and download your Business Requirements Document
                    {sessionId && <span className="font-mono text-zinc-600"> - {sessionId.slice(0, 8)}</span>}
                </p>
            </div>

            {exportError && (
                <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300">
                    {exportError}
                </div>
            )}

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="glass-card rounded-xl overflow-hidden"
            >
                <div className="px-5 py-4 border-b border-white/8 flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-zinc-200 flex-1">Pre-Export Checklist</h2>
                    {loadingChecks ? (
                        <span className="glass-badge bg-white/5 border-white/10 text-zinc-400 inline-flex items-center gap-1">
                            <Loader2 size={11} className="animate-spin" /> Checking
                        </span>
                    ) : allOk ? (
                        <span className="glass-badge badge-timeline">All Clear</span>
                    ) : (
                        <span className="glass-badge badge-severity-medium">{warnCount} Issues</span>
                    )}
                </div>
                <div className="p-5 space-y-3">
                    {checklist.map((item, i) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={cn(
                                "flex items-start gap-3 p-3 rounded-xl transition-all",
                                item.status === "ok"
                                    ? "bg-emerald-500/5 border border-emerald-500/15"
                                    : "bg-amber-500/5 border border-amber-500/15"
                            )}
                        >
                            {item.status === "ok" ? (
                                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                            ) : (
                                <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-zinc-200">{item.label}</p>
                                <p className="text-xs text-zinc-500 mt-0.5">{item.description}</p>
                            </div>
                            {item.fixHref && item.status !== "ok" && (
                                <Link href={item.fixHref}>
                                    <button className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 flex-shrink-0 transition-colors">
                                        Fix Now <ArrowRight size={11} />
                                    </button>
                                </Link>
                            )}
                        </motion.div>
                    ))}

                    {!allOk && (
                        <button onClick={() => setProceedAnyway(true)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mt-1">
                            Proceed anyway (override for this export)
                        </button>
                    )}
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.1 }}
                className="glass-card rounded-xl p-5"
            >
                <h2 className="text-sm font-semibold text-zinc-200 mb-4">Document Readiness Summary</h2>
                <div className="grid md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-white/10 bg-white/4 p-3">
                        <p className="text-zinc-500">Generated Sections</p>
                        <p className="text-zinc-200 font-semibold mt-1">
                            {generatedSections}/{EXPECTED_SECTION_IDS.length}
                        </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/4 p-3">
                        <p className="text-zinc-500">Insufficient Sections</p>
                        <p className="text-zinc-200 font-semibold mt-1">{insufficientSections}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/4 p-3">
                        <p className="text-zinc-500">Validation Flags</p>
                        <p className="text-zinc-200 font-semibold mt-1">
                            {flagsTotal} total ({highFlags} high)
                        </p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/4 p-3">
                        <p className="text-zinc-500">Ingested Chunks</p>
                        <p className="text-zinc-200 font-semibold mt-1">{chunksTotal}</p>
                    </div>
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.18 }}>
                <h2 className="text-sm font-semibold text-zinc-200 mb-3">Export Format</h2>
                <div className="grid md:grid-cols-2 gap-4">
                    {FORMAT_CARDS.map((fmt, i) => {
                        const isDownloading = downloading === fmt.id;
                        const disabled = !allOk || !sessionId || isDownloading;
                        return (
                            <motion.div
                                key={fmt.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.22 + i * 0.07 }}
                                className="glass-card rounded-xl p-5 flex flex-col gap-4"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">{fmt.icon}</div>
                                    <div>
                                        <p className="text-sm font-semibold text-zinc-100">{fmt.label}</p>
                                        <p className="text-[10px] text-zinc-600">{fmt.sub}</p>
                                    </div>
                                </div>
                                <p className="text-xs text-zinc-400 leading-relaxed flex-1">{fmt.desc}</p>
                                <button
                                    disabled={disabled}
                                    onClick={() => handleExport(fmt.id)}
                                    className={cn(
                                        "w-full flex items-center justify-center gap-2 text-sm py-2.5 rounded-lg font-medium transition-all",
                                        disabled ? "bg-white/5 text-zinc-600 border border-white/8 cursor-not-allowed" : "btn-primary"
                                    )}
                                >
                                    {isDownloading ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" /> Exporting...
                                        </>
                                    ) : (
                                        <>
                                            <Download size={14} /> Download {fmt.label}
                                        </>
                                    )}
                                </button>
                            </motion.div>
                        );
                    })}
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.3 }}
                className="glass-card rounded-xl p-5"
            >
                <h2 className="text-sm font-semibold text-zinc-200 mb-4">Export Metadata</h2>
                <div className="grid md:grid-cols-2 gap-4 text-xs">
                    {[
                        ["Session ID", sessionId || "-"],
                        ["Export Timestamp", new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })],
                        ["Sections Included", `${generatedSections} generated + ${insufficientSections} insufficient`],
                        ["Validation Flags", `${flagsTotal} total (${highFlags} high)`],
                    ].map(([k, v]) => (
                        <div key={k} className="flex items-start gap-3">
                            <span className="text-zinc-600 flex-shrink-0 w-36">{k}</span>
                            <span className="text-zinc-300 font-mono break-all">{v}</span>
                        </div>
                    ))}
                </div>
                <div className="mt-4 pt-4 border-t border-white/8">
                    <p className="text-[11px] text-zinc-600 italic leading-relaxed">
                        This document was generated with Beacon AI. Review and validate the contents with stakeholders before implementation.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
