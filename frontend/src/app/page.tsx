"use client";

import Link from 'next/link';
import {
    ArrowRight, Zap, Shield, Check, FileText, GitBranch,
    Search, Database, Filter, Brain, Download, ChevronRight,
    Github, Mail, ExternalLink,
} from 'lucide-react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState, useCallback, useEffect } from 'react';
import { LampContainer } from '@/components/ui/lamp';

/* ─── useTypewriter ────────────────────────────────────────────────────────── */
function useTypewriter(text: string, speed = 28) {
    const [displayed, setDisplayed] = useState('');
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const start = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setDisplayed('');
        let i = 0;
        const tick = () => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i < text.length) timerRef.current = setTimeout(tick, speed);
        };
        timerRef.current = setTimeout(tick, speed);
    }, [text, speed]);

    const stop = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
    return { displayed, start, stop, typing: displayed.length > 0 && displayed.length < text.length };
}

/* ─── Lamp Effect ──────────────────────────────────────────────────────────── */
function LampBeam() {
    return (
        <div className="absolute top-0 inset-x-0 pointer-events-none overflow-hidden" style={{ height: '600px', zIndex: 0 }}>
            <div className="relative flex w-full flex-1 items-center justify-center isolate">
                <motion.div
                    initial={{ opacity: 0.7, width: "15rem" }}
                    animate={{ opacity: 1, width: "30rem" }}
                    transition={{
                        delay: 0.3,
                        duration: 0.8,
                        ease: "easeInOut",
                    }}
                    style={{
                        backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
                    }}
                    className="absolute inset-auto right-1/2 h-96 overflow-visible w-[30rem] bg-gradient-conic from-slate-400 via-slate-500 to-transparent text-white [--conic-position:from_70deg_at_center_top]"
                >
                    <div className="absolute w-[100%] left-0 bg-slate-950 h-52 bottom-0 z-20 [mask-image:linear-gradient(to_top,white,transparent)]" />
                    <div className="absolute w-40 h-[100%] left-0 bg-slate-950 bottom-0 z-20 [mask-image:linear-gradient(to_right,white,transparent)]" />
                </motion.div>
                <motion.div
                    initial={{ opacity: 0.7, width: "15rem" }}
                    animate={{ opacity: 1, width: "30rem" }}
                    transition={{
                        delay: 0.3,
                        duration: 0.8,
                        ease: "easeInOut",
                    }}
                    style={{
                        backgroundImage: `conic-gradient(var(--conic-position), var(--tw-gradient-stops))`,
                    }}
                    className="absolute inset-auto left-1/2 h-96 w-[30rem] bg-gradient-conic from-transparent via-slate-500 to-slate-400 text-white [--conic-position:from_290deg_at_center_top]"
                >
                    <div className="absolute w-40 h-[100%] right-0 bg-slate-950 bottom-0 z-20 [mask-image:linear-gradient(to_left,white,transparent)]" />
                    <div className="absolute w-[100%] right-0 bg-slate-950 h-52 bottom-0 z-20 [mask-image:linear-gradient(to_top,white,transparent)]" />
                </motion.div>
                <div className="absolute top-1/2 h-64 w-full translate-y-12 scale-x-150 bg-slate-950 blur-3xl"></div>
                <div className="absolute top-1/2 z-50 h-64 w-full bg-transparent opacity-20 backdrop-blur-md"></div>
                <div className="absolute inset-auto z-50 h-48 w-[28rem] -translate-y-1/2 rounded-full bg-slate-400 opacity-70 blur-3xl"></div>
                <motion.div
                    initial={{ width: "8rem" }}
                    animate={{ width: "16rem" }}
                    transition={{
                        delay: 0.3,
                        duration: 0.8,
                        ease: "easeInOut",
                    }}
                    className="absolute inset-auto z-30 h-48 w-64 -translate-y-[6rem] rounded-full bg-slate-300 blur-2xl"
                ></motion.div>
                <motion.div
                    initial={{ width: "15rem" }}
                    animate={{ width: "30rem" }}
                    transition={{
                        delay: 0.3,
                        duration: 0.8,
                        ease: "easeInOut",
                    }}
                    className="absolute inset-auto z-50 h-0.5 w-[30rem] -translate-y-[7rem] bg-slate-300"
                ></motion.div>
                <div className="absolute inset-auto z-40 h-56 w-full -translate-y-[12.5rem] bg-slate-950"></div>
            </div>
        </div>
    );
}

/* ─── Floating card wrapper ────────────────────────────────────────────────── */
function FloatCard({
    children, floatY = 10, duration = 5, delay = 0,
    onHoverStart, onHoverEnd,
}: {
    children: React.ReactNode; floatY?: number; duration?: number; delay?: number;
    onHoverStart?: () => void; onHoverEnd?: () => void;
}) {
    return (
        <motion.div
            animate={{ y: [0, -floatY, 0] }}
            transition={{ repeat: Infinity, duration, ease: 'easeInOut', delay }}
            onHoverStart={onHoverStart}
            onHoverEnd={onHoverEnd}
            whileHover={{ scale: 1.03, y: -floatY - 4 }}
            className="cursor-pointer select-none group"
        >
            {children}
        </motion.div>
    );
}

/* ─── Terminal card ────────────────────────────────────────────────────────── */
const TERM = '$ beacon analyze --src slack\n[✓] 248 chunks parsed\n[✓] 183 signals found\n[→] Classifying… 94%\n[✓] BRD queued';
function TerminalCard() {
    const tw = useTypewriter(TERM, 24);
    return (
        <FloatCard floatY={11} duration={4.8} delay={0} onHoverStart={tw.start} onHoverEnd={tw.stop}>
            <div className="w-56 rounded-2xl p-4 transition-all duration-300"
                style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 20px 56px rgba(0,0,0,0.7)' }}>
                <div className="flex items-center gap-1.5 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
                    <span className="ml-auto font-mono text-[9px] text-zinc-700">beacon-cli</span>
                </div>
                <div className="font-mono text-[10.5px] text-zinc-400 leading-[1.6] whitespace-pre min-h-[68px]">
                    {tw.displayed || <span className="text-zinc-700">hover to run →</span>}
                    {tw.typing && <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-white">▋</motion.span>}
                </div>
            </div>
        </FloatCard>
    );
}

/* ─── Signal card ──────────────────────────────────────────────────────────── */
const SIG = 'REQ-047 ─ REQUIREMENT\nConf: 0.94 · auto-accepted\n\n"The system shall support\nmulti-tenant isolation with\nrow-level security enforced\nat the database layer."\n\nSrc: #engineering · @priya';
function SignalCard() {
    const tw = useTypewriter(SIG, 18);
    return (
        <FloatCard floatY={8} duration={6} delay={1.2} onHoverStart={tw.start} onHoverEnd={tw.stop}>
            <div className="w-52 rounded-2xl p-4 transition-all duration-300"
                style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 44px rgba(0,0,0,0.65)' }}>
                <div className="flex items-center gap-2 mb-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px rgba(74,222,128,0.5)' }} />
                    <span className="font-mono text-[9px] text-zinc-600">signal · live</span>
                </div>
                <div className="font-mono text-[10px] text-zinc-400 leading-relaxed min-h-[72px] whitespace-pre">
                    {tw.displayed || <span className="text-zinc-700">hover to read →</span>}
                    {tw.typing && <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-white">▋</motion.span>}
                </div>
            </div>
        </FloatCard>
    );
}

/* ─── BRD progress card ────────────────────────────────────────────────────── */
const BRD_PREV = 'BRD-2025-Q2  v1.3\n─────────────────\n01 Executive Summary  ✓\n02 Business Context   ✓\n03 Func. Requirements ↻\n04 Non-Func. Req      ·\n05 Constraints        ·\n\nGenerating section 3…';
function BRDCard() {
    const tw = useTypewriter(BRD_PREV, 30);
    return (
        <FloatCard floatY={9} duration={5.2} delay={0.4} onHoverStart={tw.start} onHoverEnd={tw.stop}>
            <div className="w-52 rounded-2xl p-4 transition-all duration-300"
                style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 44px rgba(0,0,0,0.65)' }}>
                <div className="flex items-center justify-between mb-2.5">
                    <span className="font-mono text-[9px] text-zinc-600">brd generation</span>
                    <span className="font-mono text-[9px] text-zinc-500">67%</span>
                </div>
                <div className="w-full h-1 rounded-full mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <motion.div className="h-full rounded-full" style={{ background: 'rgba(255,255,255,0.35)' }}
                        initial={{ width: '0%' }} animate={{ width: '67%' }} transition={{ duration: 1.8, ease: 'easeOut' }} />
                </div>
                <div className="font-mono text-[9.5px] text-zinc-400 leading-relaxed whitespace-pre min-h-[68px]">
                    {tw.displayed || <span className="text-zinc-700">hover to preview →</span>}
                    {tw.typing && <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-white">▋</motion.span>}
                </div>
            </div>
        </FloatCard>
    );
}

/* ─── Confidence badge ─────────────────────────────────────────────────────── */
const CONF = 'LLM classification\n─────────────────\nLabel: REQUIREMENT\nConf:  0.94 (high)\nPath:  heuristic→llm\nSrc:   Slack DM\nSpkr:  @dev.team\nAuto:  accepted ✓';
function ConfCard() {
    const tw = useTypewriter(CONF, 22);
    return (
        <FloatCard floatY={12} duration={6.5} delay={2} onHoverStart={tw.start} onHoverEnd={tw.stop}>
            <div className="w-48 rounded-2xl p-4 transition-all duration-300"
                style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 12px 36px rgba(0,0,0,0.6)' }}>
                <div className="flex items-center gap-1.5 mb-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    <span className="font-mono text-[9px] text-zinc-700">confidence</span>
                </div>
                <div className="font-mono text-[9.5px] text-zinc-400 leading-relaxed whitespace-pre min-h-[60px]">
                    {tw.displayed || <span className="text-zinc-700">hover →</span>}
                    {tw.typing && <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-white">▋</motion.span>}
                </div>
            </div>
        </FloatCard>
    );
}

/* ─── Orbit ring ───────────────────────────────────────────────────────────── */
function OrbitRing() {
    return (
        <motion.div
            animate={{ rotateZ: 360 }}
            transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
            className="relative"
            style={{ width: 76, height: 76 }}
        >
            {/* Outer ring */}
            <div style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(255,255,255,0.18)', borderRadius: '50%', transform: 'rotateX(68deg)', boxShadow: '0 0 16px rgba(255,255,255,0.04)' }} />
            {/* Inner ring */}
            <div style={{ position: 'absolute', inset: 14, border: '1px solid rgba(255,255,255,0.09)', borderRadius: '50%', transform: 'rotateX(68deg)' }} />
            {/* Center dot */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', boxShadow: '0 0 10px rgba(255,255,255,0.4)' }} />
            </div>
            {/* Orbiting dot */}
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                style={{ position: 'absolute', top: '50%', left: '50%', width: 76, height: 76, marginTop: -38, marginLeft: -38 }}>
                <div style={{ position: 'absolute', top: 0, left: '50%', width: 5, height: 5, borderRadius: '50%', background: 'white', transform: 'translate(-50%, -50%)', boxShadow: '0 0 10px rgba(255,255,255,0.8)' }} />
            </motion.div>
        </motion.div>
    );
}

/* ─── Export mini card ─────────────────────────────────────────────────────── */
const EXP = 'export BRD-2025-Q2\n─────────────────\n[✓] Markdown ready\n[✓] PDF generated\n[✓] DOCX compiled\n[→] Attribution ok\n[→] Sharing link…';
function ExportCard() {
    const tw = useTypewriter(EXP, 26);
    return (
        <FloatCard floatY={7} duration={5.8} delay={0.8} onHoverStart={tw.start} onHoverEnd={tw.stop}>
            <div className="w-44 rounded-2xl p-3.5 transition-all duration-300"
                style={{ background: 'rgba(8,8,8,0.97)', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 10px 28px rgba(0,0,0,0.55)' }}>
                <div className="flex items-center gap-1.5 mb-2">
                    <Download size={10} className="text-zinc-600" />
                    <span className="font-mono text-[9px] text-zinc-700">export</span>
                </div>
                <div className="font-mono text-[9.5px] text-zinc-400 leading-relaxed whitespace-pre min-h-[52px]">
                    {tw.displayed || <span className="text-zinc-700">hover →</span>}
                    {tw.typing && <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.5 }} className="text-white">▋</motion.span>}
                </div>
            </div>
        </FloatCard>
    );
}

/* ─── Stat ─────────────────────────────────────────────────────────────────── */
function Stat({ value, suffix = '', label }: { value: string; suffix?: string; label: string }) {
    return (
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="text-center">
            <div className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-1">{value}<span className="text-zinc-600">{suffix}</span></div>
            <div className="text-sm text-zinc-600">{label}</div>
        </motion.div>
    );
}

/* ─── Pipeline ─────────────────────────────────────────────────────────────── */
const STAGES = [
    { id: 'ingest', icon: Database, label: 'Ingestion', sub: 'Multi-source', detail: 'Slack · Email · PDF · DOCX', count: '248 chunks', status: 'complete' },
    { id: 'filter', icon: Filter, label: 'Noise Filter', sub: 'LLM+Heuristic', detail: '27% noise removed', count: '183 signals', status: 'complete' },
    { id: 'classify', icon: Brain, label: 'Classification', sub: 'Groq LLM', detail: 'Req · Decision · Timeline', count: '94% accurate', status: 'running' },
    { id: 'generate', icon: FileText, label: 'BRD Draft', sub: 'AI Generated', detail: '7-section document', count: '7 sections', status: 'pending' },
    { id: 'validate', icon: Shield, label: 'Validation', sub: 'Conflict detect', detail: 'Auto-flags contradictions', count: '2 flags', status: 'pending' },
    { id: 'export', icon: Download, label: 'Export', sub: 'MD · PDF · DOCX', detail: 'With AI attribution', count: 'Ready', status: 'pending' },
];

function PipelineArchitecture() {
    const [hovered, setHovered] = useState<string | null>(null);
    return (
        <div className="relative w-full overflow-hidden py-6">
            <div className="relative mx-auto" style={{ perspective: '1100px', maxWidth: '1040px' }}>
                <motion.div
                    initial={{ opacity: 0, rotateX: 22, y: 50 }}
                    whileInView={{ opacity: 1, rotateX: 7, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformStyle: 'preserve-3d' }}
                >
                    <div className="absolute inset-x-0 -bottom-8 h-40 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 100%, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />
                    <div className="relative grid grid-cols-3 lg:grid-cols-6 gap-3 px-2">
                        {STAGES.map((s, i) => {
                            const Icon = s.icon;
                            const isHov = hovered === s.id, isRun = s.status === 'running', isDone = s.status === 'complete';
                            return (
                                <motion.div key={s.id}
                                    initial={{ opacity: 0, y: 36, scale: 0.88 }}
                                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.55, delay: i * 0.09 }}
                                    onHoverStart={() => setHovered(s.id)}
                                    onHoverEnd={() => setHovered(null)}
                                    whileHover={{ y: -9, scale: 1.04 }}
                                    className="relative cursor-pointer group" style={{ transformStyle: 'preserve-3d' }}
                                >
                                    <div className="absolute -inset-2 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none blur-xl"
                                        style={{ background: 'rgba(255,255,255,0.06)' }} />
                                    <div className="relative rounded-2xl p-4 flex flex-col gap-3 transition-all duration-300"
                                        style={{
                                            background: isHov ? 'rgba(26,26,26,0.99)' : 'rgba(14,14,14,0.97)',
                                            border: `1px solid ${isHov ? 'rgba(255,255,255,0.22)' : isRun ? 'rgba(250,204,21,0.28)' : isDone ? 'rgba(74,222,128,0.20)' : 'rgba(255,255,255,0.07)'}`,
                                            boxShadow: isHov ? '0 22px 55px rgba(0,0,0,0.72)' : '0 6px 20px rgba(0,0,0,0.5)',
                                        }}>
                                        <div className="flex items-center justify-between">
                                            <div className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{ background: isDone ? '#4ade80' : isRun ? '#facc15' : 'rgba(255,255,255,0.15)', boxShadow: isRun ? '0 0 8px rgba(250,204,21,0.55)' : isDone ? '0 0 8px rgba(74,222,128,0.45)' : 'none' }} />
                                            <span className="font-mono text-[9px] text-zinc-700">0{i + 1}</span>
                                        </div>
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            <Icon size={15} className="text-zinc-500" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-white leading-tight">{s.label}</p>
                                            <p className="text-[10px] text-zinc-600 mt-0.5">{s.sub}</p>
                                        </div>
                                        <div className="text-[9px] font-mono px-2 py-1 rounded-md truncate"
                                            style={{ background: 'rgba(255,255,255,0.04)', color: '#555', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            {s.count}
                                        </div>
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: isHov ? 1 : 0, height: isHov ? 'auto' : 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                                            <p className="text-[10px] text-zinc-500 leading-relaxed pt-1.5 border-t border-white/5">{s.detail}</p>
                                        </motion.div>
                                    </div>
                                    {i < STAGES.length - 1 && (
                                        <div className="hidden lg:block absolute -right-2 top-10 z-10">
                                            <motion.div animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.3 }}>
                                                <ChevronRight size={11} className="text-zinc-700" />
                                            </motion.div>
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </div>
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {[...Array(5)].map((_, i) => (
                            <motion.div key={i} className="absolute w-1 h-1 rounded-full bg-white/12"
                                initial={{ x: `${i * 20}%`, y: '55%', opacity: 0 }}
                                animate={{ x: [`${i * 20}%`, `${(i + 1) * 20}%`], opacity: [0, 0.45, 0] }}
                                transition={{ repeat: Infinity, duration: 2.5, delay: i * 0.44 }} />
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
}

/* ─── Feature card ─────────────────────────────────────────────────────────── */
function FeatureCard({ icon: Icon, title, description, tag }: { icon: React.ElementType; title: string; description: string; tag: string }) {
    return (
        <motion.div initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.45 }}
            whileHover={{ y: -5 }} className="group p-7 rounded-2xl cursor-default transition-all duration-300"
            style={{ background: 'rgba(12,12,12,0.97)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-start justify-between mb-5">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Icon size={18} className="text-zinc-300" />
                </div>
                <span className="text-[10px] font-mono px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.04)', color: '#555', border: '1px solid rgba(255,255,255,0.06)' }}>
                    {tag}
                </span>
            </div>
            <h3 className="font-semibold text-white text-[15px] mb-2">{title}</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
        </motion.div>
    );
}

/* ─── PrimaryBtn ───────────────────────────────────────────────────────────── */
function PrimaryBtn({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link href={href}>
            <motion.button whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-base bg-white text-zinc-900 shadow-[0_4px_28px_rgba(255,255,255,0.16)] hover:shadow-[0_6px_38px_rgba(255,255,255,0.24)]">
                {children}
            </motion.button>
        </Link>
    );
}

/* ─── Footer ───────────────────────────────────────────────────────────────── */
function Footer() {
    return (
        <footer className="w-full bg-[#09090B] text-white px-6 py-16 flex flex-col items-center justify-center text-sm relative overflow-hidden">
            {/* Top Section */}
            <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-5 gap-10 text-left mb-20">
                {/* Left Column - Brand (wider) */}
                <div className="md:col-span-2 flex flex-col gap-6">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-white/8 border border-white/14 flex items-center justify-center flex-shrink-0">
                            <Zap size={14} className="text-white" />
                        </div>
                        <span className="font-semibold text-white text-base">Beacon</span>
                    </div>
                    <p className="text-zinc-300 text-sm leading-relaxed max-w-sm">
                        Beacon is an AI-powered platform designed to help product teams generate
                        complete Business Requirements Documents by intelligently processing Slack threads,
                        emails, and documents — in under 5 minutes.
                    </p>

                    {/* Blinking Status */}
                    <div className="flex items-center gap-2 mt-2">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                        <span className="text-white text-xs">All systems online</span>
                    </div>

                    <p className="text-gray-600 text-xs mt-4">
                        © {new Date().getFullYear()} Beacon. Built by{' '}
                        <a href="https://www.sandeepp.in/" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors">
                            Sandeep Prajapati
                        </a>
                        . All rights reserved.
                    </p>
                </div>

                {/* Product Links */}
                <div className="flex flex-col gap-4">
                    <h4 className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase font-bold">Product</h4>
                    <ul className="space-y-3 flex flex-col">
                        {[
                            { label: 'Dashboard', href: '/dashboard' },
                            { label: 'Source Ingestion', href: '/ingestion' },
                            { label: 'Signal Review', href: '/signals' },
                            { label: 'BRD Editor', href: '/brd' },
                            { label: 'Export', href: '/export' },
                            { label: 'Settings', href: '/settings' },
                        ].map(({ label, href }) => (
                            <li key={label}>
                                <Link href={href} className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors">
                                    {label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Resources Links */}
                <div className="flex flex-col gap-4">
                    <h4 className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase font-bold">Resources</h4>
                    <ul className="space-y-3 flex flex-col">
                        {[
                            { label: 'GitHub Repo', href: 'https://github.com/simplysandeepp/Beacon' },
                            { label: 'Contributing', href: 'https://github.com/simplysandeepp/Beacon/blob/main/CONTRIBUTING.md' },
                            { label: 'Privacy Policy', href: '#' },
                            { label: 'Terms of Use', href: '#' },
                            { label: 'AI Disclaimer', href: '#' },
                        ].map(({ label, href }) => (
                            <li key={label}>
                                <a
                                    href={href}
                                    target={href.startsWith('http') ? '_blank' : undefined}
                                    rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
                                    className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors inline-flex items-center gap-1"
                                >
                                    {label}
                                    {href.startsWith('http') && <ExternalLink size={9} />}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Team */}
                <div className="flex flex-col gap-4">
                    <h4 className="text-[10px] font-mono text-zinc-600 tracking-widest uppercase font-bold">Team</h4>
                    <ul className="space-y-4 flex flex-col">
                        {/* Lead */}
                        <li className="flex flex-col gap-0.5">
                            <a
                                href="https://www.sandeepp.in/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-white font-medium hover:text-zinc-300 transition-colors"
                            >
                                Sandeep Prajapati
                            </a>
                            <div className="flex items-center gap-2 mt-0.5">
                                <a href="https://www.sandeepp.in/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-0.5">Portfolio <ExternalLink size={8} /></a>
                                <span className="text-zinc-700">·</span>
                                <a href="https://github.com/simplysandeepp/" target="_blank" rel="noopener noreferrer" className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center gap-0.5">GitHub <ExternalLink size={8} /></a>
                            </div>
                        </li>
                        {/* Teammates */}
                        {[
                            { name: 'Kurian Jose', github: 'https://github.com/KurianJose7586' },
                            { name: 'Aryan Singh', github: 'https://github.com/DevAryanSin' },
                            { name: 'Preet Biswas', github: 'https://github.com/preetbiswas12' },
                        ].map(({ name, github }) => (
                            <li key={name} className="flex flex-col gap-0.5">
                                <a
                                    href={github}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors inline-flex items-center gap-1"
                                >
                                    {name} <ExternalLink size={9} />
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            {/* Giant BG Title Watermark */}
            <h1 className="absolute top-2/3 left-[48%] -translate-x-1/2 -translate-y-1/2 text-[14rem] md:text-[18rem] lg:text-[20rem] font-black text-white/[0.03] select-none pointer-events-none leading-none whitespace-nowrap">
                Beacon
            </h1>
        </footer>
    );
}

/* ─── PAGE ─────────────────────────────────────────────────────────────────── */
export default function HomePage() {
    const heroRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
    const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '20%']);
    const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

    const plus = (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>

            {/* ── Navbar ─────────────────────────────────── */}
            <nav className="sticky top-0 z-50 border-b border-white/5"
                style={{ background: 'rgba(6,6,6,0.93)', backdropFilter: 'blur(20px)' }}>
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-white/8 border border-white/14 flex items-center justify-center">
                            <Zap size={13} className="text-white" />
                        </div>
                        <span className="text-sm font-bold text-white tracking-tight">
                            Beacon
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/login">
                            <button className="px-4 py-2 text-sm text-zinc-500 hover:text-white transition-colors">Sign In</button>
                        </Link>
                        <Link href="/register">
                            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-white text-zinc-900 hover:bg-zinc-100 shadow-[0_0_18px_rgba(255,255,255,0.10)]">
                                Get Started <ArrowRight size={13} />
                            </motion.button>
                        </Link>
                    </div>
                </div>
            </nav>

            {/* ── Hero ───────────────────────────────────── */}
            <section ref={heroRef} className="relative overflow-visible">
                <LampBeam />

                <div className="relative z-10 max-w-6xl mx-auto px-6 pt-16 pb-14">
                    <div className="flex items-start gap-6 xl:gap-10">

                        {/* ── Left floating elements (xl+) ── */}
                        <div className="hidden xl:flex flex-col gap-5 pt-20 flex-shrink-0 w-[228px]">
                            <TerminalCard />
                            <SignalCard />
                        </div>

                        {/* ── Center hero text ── */}
                        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="flex-1 text-center pt-14 pb-4 space-y-8">
                            <motion.h1
                                initial={{ opacity: 0, y: 28 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                                className="text-5xl md:text-6xl font-black text-white leading-[1.06] tracking-[-0.03em]"
                            >
                                Turn raw signals<br />
                                <span className="text-zinc-500">into BRDs.</span>
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 18 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.75, delay: 0.14 }}
                                className="text-base text-zinc-400 leading-relaxed max-w-lg mx-auto"
                            >
                                Beacon ingests Slack threads, emails, and documents — then
                                automatically produces structured, validated Business Requirements Documents
                                with full source attribution in under 5 minutes.
                            </motion.p>

                            <motion.div
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.6, delay: 0.26 }}
                                className="flex flex-wrap items-center justify-center gap-4"
                            >
                                <PrimaryBtn href="/register">
                                    {plus} New BRD Session
                                </PrimaryBtn>
                                <a href="#architecture">
                                    <motion.button whileHover={{ scale: 1.02 }}
                                        className="flex items-center gap-2 px-6 py-4 rounded-2xl font-semibold text-sm text-zinc-400 hover:text-white transition-colors"
                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                        See how it works ↓
                                    </motion.button>
                                </a>
                            </motion.div>

                            {/* Hint text */}
                            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                                className="text-xs text-zinc-700 pt-1">
                                Hover the cards to see the pipeline in action →
                            </motion.p>
                        </motion.div>

                        {/* ── Right floating elements (xl+) ── */}
                        <div className="hidden xl:flex flex-col gap-5 pt-10 flex-shrink-0 w-[214px] items-end">
                            <BRDCard />
                            <ConfCard />
                            <div className="flex items-center gap-5 pr-4">
                                <ExportCard />
                                <OrbitRing />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Stats — outlined ────────────────────────── */}
            <section className="max-w-5xl mx-auto px-6 pb-16">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-8 py-10 px-10 rounded-3xl"
                    style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.015)' }}>
                    <Stat value="< 5" suffix=" min" label="BRD generation time" />
                    <Stat value="94" suffix="%" label="Classification accuracy" />
                    <Stat value="7" label="Auto-generated sections" />
                    <Stat value="3" label="Export formats" />
                </div>
            </section>

            {/* ── 3D Architecture — outlined ──────────────── */}
            <section id="architecture" className="max-w-6xl mx-auto px-6 pb-20">
                <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-10">
                    <span className="text-xs font-mono text-zinc-700 tracking-widest uppercase mb-3 block">Pipeline Architecture</span>
                    <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Six stages. Zero manual effort.</h2>
                    <p className="text-zinc-600 mt-3 max-w-lg mx-auto text-sm">Hover each stage card to inspect what runs inside.</p>
                </motion.div>
                <div className="rounded-3xl p-6 md:p-8"
                    style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.012)' }}>
                    <PipelineArchitecture />
                    <div className="flex items-center justify-center gap-6 mt-4 flex-wrap">
                        {[['#4ade80', 'Complete'], ['#facc15', 'Running'], ['rgba(255,255,255,0.18)', 'Pending']].map(([c, l]) => (
                            <div key={l} className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full" style={{ background: c }} />
                                <span className="text-xs text-zinc-700">{l}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Problem / Solution ──────────────────────── */}
            <section className="max-w-6xl mx-auto px-6 pb-24">
                <div className="grid md:grid-cols-2 gap-10 items-start">
                    <motion.div initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="space-y-5">
                        <span className="text-xs font-mono text-zinc-700 tracking-widest uppercase">The Problem</span>
                        <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                            BRDs take weeks.<br /><span className="text-zinc-500">Most are already outdated.</span>
                        </h2>
                        <div className="space-y-3">
                            {['Requirements scattered across Slack threads, emails, and meeting notes', 'Engineers and PMs disagree on what was actually decided', 'Conflicting specs discovered mid-sprint, causing expensive rework', 'BAs spend 40+ hours distilling conversations into a single document', 'No audit trail — "who said what" is impossible to answer months later'].map(p => (
                                <div key={p} className="flex items-start gap-3 text-sm text-zinc-500">
                                    <div className="w-1 h-1 rounded-full bg-zinc-700 mt-2 flex-shrink-0" />{p}
                                </div>
                            ))}
                        </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, x: 16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="space-y-5">
                        <span className="text-xs font-mono text-zinc-700 tracking-widest uppercase">The Solution</span>
                        <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-tight">
                            Automated pipeline.<br /><span className="text-zinc-500">Validated output.</span>
                        </h2>
                        <div className="space-y-3">
                            {[
                                ['Ingestion', 'Connect Slack, upload emails or drag-drop documents directly'],
                                ['Signal Extraction', 'Two-stage LLM + heuristic pipeline classifies every chunk into Req, Decision, Timeline, or Feedback'],
                                ['Calibrated Review', 'High-confidence signals auto-accepted; borderline ones surfaced for fast human review'],
                                ['BRD Generation', 'Groq generates 7 standard sections with source-cited signals traceable per sentence'],
                                ['Conflict Detection', 'Semantic comparison flags contradictory requirements before engineering starts'],
                                ['Export', 'DOCX, PDF, or Markdown with attribution chain and AI disclaimer embedded'],
                            ].map(([label, detail]) => (
                                <div key={label} className="flex items-start gap-3">
                                    <Check size={13} className="text-zinc-300 mt-1 flex-shrink-0" />
                                    <span className="text-sm text-zinc-500"><span className="text-zinc-200 font-semibold">{label} </span>— {detail}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </section>

            {/* ── Features grid ───────────────────────────── */}
            <section className="max-w-6xl mx-auto px-6 pb-24">
                <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center mb-12">
                    <span className="text-xs font-mono text-zinc-700 tracking-widest uppercase mb-3 block">Features</span>
                    <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">Built for product teams.</h2>
                </motion.div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <FeatureCard icon={Search} tag="NLP" title="Multi-Label Signal Extraction" description="Every chunk classified into Requirement, Decision, Timeline, Feedback, or Noise using a two-stage LLM + heuristic pipeline with per-signal confidence scores." />
                    <FeatureCard icon={GitBranch} tag="AI REVIEW" title="Calibrated Human-in-the-Loop" description="Auto-accept high-confidence signals, surface ambiguous ones for fast human review. Built-in suppression, reclassify, and undo within a 5-second toast." />
                    <FeatureCard icon={Brain} tag="GROQ LLM" title="Section-by-Section Generation" description="Each of the 7 BRD sections generated independently with its own source signals, enabling partial regeneration without losing human edits elsewhere." />
                    <FeatureCard icon={Shield} tag="VALIDATION" title="Automatic Conflict Detection" description="Semantic comparison across all signals detects contradictions — e.g. REQ-007 (PostgreSQL) vs REQ-012 (NoSQL) — before they reach the engineering team." />
                    <FeatureCard icon={FileText} tag="ATTRIBUTION" title="Full Audit Trail" description="Every sentence in the generated BRD links back to its source signal, document, speaker, and timestamp. Ask the system where any claim came from." />
                    <FeatureCard icon={Download} tag="EXPORT" title="Production-Ready Export" description="One-click Markdown, PDF, or DOCX export with embedded AI disclaimer, confidence metadata, version history, and full attribution chain." />
                </div>
            </section>

            {/* ── Tech stack — outlined ───────────────────── */}
            <section className="max-w-6xl mx-auto px-6 pb-24">
                <div className="rounded-3xl p-10 md:p-14"
                    style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.012)' }}>
                    <div className="grid md:grid-cols-2 gap-12">
                        <div>
                            <span className="text-xs font-mono text-zinc-700 tracking-widest uppercase mb-4 block">Technology</span>
                            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-6">What powers Beacon</h2>
                            <div className="space-y-4">
                                {[['Groq LLM API', 'Ultra-fast inference for classification and generation (sub-1s per section)'], ['Next.js 14 + TypeScript', 'App Router, server components, and full type safety'], ['PostgreSQL + Supabase', 'Signal storage, session management, and attribution linking'], ['FastAPI (Python)', 'Signal processing pipeline, noise filter, and LLM orchestration'], ['Framer Motion', 'Smooth 60fps animations and interactive 3D visualizations'], ['Zustand + Persist', 'Client-side state with localStorage hydration']].map(([n, d]) => (
                                    <div key={n} className="flex items-start gap-3">
                                        <div className="w-1 h-1 rounded-full bg-zinc-700 mt-2 flex-shrink-0" />
                                        <p className="text-sm text-zinc-500"><span className="text-zinc-200 font-semibold">{n}</span> — {d}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <span className="text-xs font-mono text-zinc-700 tracking-widest uppercase mb-4 block">Under the Hood</span>
                            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-6">Pipeline details</h2>
                            <div>
                                {[['Chunking', 'Semantic sentence-level with overlap to preserve cross-boundary context'], ['Classification model', 'Groq Llama-3 with domain-specific few-shot examples per signal label'], ['Deduplication', 'Cosine similarity on embeddings — near-duplicates merged automatically'], ['Confidence thresholds', 'Auto-accept ≥ 0.85 · human review 0.55–0.85 · auto-reject < 0.55'], ['Conflict detection', 'Semantic clustering + contradiction prompt across requirement signals'], ['Version control', 'Every BRD section versioned — restore any prior generation instantly']].map(([k, v]) => (
                                    <div key={k} className="py-3 border-b last:border-0" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                                        <div className="text-[11px] font-mono text-zinc-700 mb-0.5">{k}</div>
                                        <div className="text-sm text-zinc-500">{v}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Final CTA ───────────────────────────────── */}
            <section className="max-w-5xl mx-auto px-6 py-6 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                    className="relative text-center rounded-3xl py-20 px-8 overflow-hidden"
                    style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.015)' }}
                >
                    {/* Background glow */}
                    <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,255,255,0.04) 0%, transparent 70%)' }} />

                    <div className="relative space-y-5">
                        <span className="text-xs font-mono text-zinc-700 tracking-widest uppercase">Get started</span>
                        <h2 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
                            Ship your BRD.<br /><span className="text-zinc-500">Not your weekend.</span>
                        </h2>
                        <p className="text-zinc-500 text-base max-w-md mx-auto leading-relaxed">
                            Create a free account and generate your first complete, validated BRD in under 5 minutes.
                        </p>

                        <div className="pt-6 pb-4 flex flex-col items-center gap-4">
                            <PrimaryBtn href="/register">{plus} Create Free Account</PrimaryBtn>
                            <p className="text-xs text-zinc-700">
                                Already have an account?{' '}
                                <Link href="/login" className="text-zinc-500 hover:text-zinc-300 transition-colors underline underline-offset-2">Sign in →</Link>
                            </p>
                        </div>

                        {/* Mini feature row */}
                        <div className="flex items-center justify-center gap-6 flex-wrap pt-2">
                            {['No credit card required', 'Free forever tier', '5-min onboarding'].map(f => (
                                <div key={f} className="flex items-center gap-1.5 text-xs text-zinc-600">
                                    <Check size={11} className="text-zinc-600" /> {f}
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </section>

            {/* ── Footer ──────────────────────────────────── */}
            <Footer />
        </div>
    );
}
