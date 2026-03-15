
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { LayoutGrid, Database, Bot, FileText, Settings, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutGrid },
    { name: "Data Ingestion", href: "/ingestion", icon: Database },
    { name: "Agent Orchestrator", href: "/agents", icon: Bot },
    { name: "BRD Editor", href: "/editor", icon: FileText },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <motion.aside
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="fixed left-4 top-4 bottom-4 w-20 flex flex-col items-center py-8 glass-panel z-50 rounded-full"
        >
            {/* Logo */}
            <div className="mb-10 text-cyan-400 font-bold text-xl tracking-tighter drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]">
                Beacon
            </div>

            {/* Nav Items */}
            <nav className="flex-1 flex flex-col gap-6 w-full items-center">
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    const Icon = item.icon;

                    return (
                        <Link key={item.href} href={item.href} passHref>
                            <div className="relative group flex items-center justify-center">
                                {isActive && (
                                    <motion.div
                                        layoutId="activeNav"
                                        className="absolute inset-0 bg-cyan-500/20 blur-md rounded-xl"
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}

                                <motion.div
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.95 }}
                                    className={cn(
                                        "p-3 rounded-xl transition-all duration-300 relative z-10",
                                        isActive ? "text-cyan-400 bg-white/10 shadow-[0_0_15px_rgba(34,211,238,0.3)]" : "text-gray-400 hover:text-white"
                                    )}
                                >
                                    <Icon size={24} />

                                    {/* Tooltip on Hover */}
                                    <span className="absolute left-14 bg-black/80 px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/10 pointer-events-none">
                                        {item.name}
                                    </span>
                                </motion.div>
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* User Avatar */}
            <div className="mt-auto">
                <Link href="/profile">
                    <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-cyan-500 border border-white/20 shadow-lg cursor-pointer flex items-center justify-center overflow-hidden"
                    >
                        <User size={20} className="text-white/80" />
                    </motion.div>
                </Link>
            </div>
        </motion.aside>
    );
}
