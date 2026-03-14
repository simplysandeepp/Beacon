/**
 * useBRDStore.ts
 * Zustand store for BRD sections and conflicts.
 * Wired to the real FastAPI backend via apiClient.ts.
 */
import { create } from 'zustand';
import {
    generateBRD,
    getBRD,
    editBRDSection,
    type BRDSections,
    type BRDSectionMeta,
    type ValidationFlag,
} from '@/lib/apiClient';

export interface BRDSection {
    id: string;
    title: string;
    content: string;
    citations: string[];
    lastEdited?: Date;
    humanEdited?: boolean;
    version?: number;
    snapshotId?: string | null;
    sourceChunkIds?: string[];
    generatedAt?: string | null;
}

interface BRDStore {
    sections: BRDSection[];
    flags: ValidationFlag[];
    acknowledgedFlagKeys: string[];
    snapshotId: string | null;
    loading: boolean;
    generating: boolean;
    error: string | null;
    generateAll: (sessionId: string) => Promise<void>;
    loadBRD: (sessionId: string) => Promise<void>;
    updateSection: (sessionId: string, sectionId: string, content: string) => Promise<void>;
    acknowledgeFlag: (key: string) => void;
}

const SECTION_META: { id: keyof BRDSections; title: string }[] = [
    { id: 'executive_summary', title: 'Executive Summary' },
    { id: 'functional_requirements', title: 'Functional Requirements' },
    { id: 'stakeholder_analysis', title: 'Stakeholder Analysis' },
    { id: 'timeline', title: 'Timeline & Milestones' },
    { id: 'decisions', title: 'Key Decisions' },
    { id: 'assumptions', title: 'Assumptions & Constraints' },
    { id: 'success_metrics', title: 'Success Metrics' },
];

function sectionsFromAPI(raw: BRDSections, meta: Record<string, BRDSectionMeta>): BRDSection[] {
    return SECTION_META.map(({ id, title }) => ({
        id: id as string,
        title,
        content: raw[id] ?? '',
        citations: [],
        humanEdited: meta[id]?.human_edited ?? false,
        version: meta[id]?.version_number ?? 1,
        snapshotId: meta[id]?.snapshot_id ?? null,
        sourceChunkIds: meta[id]?.source_chunk_ids ?? [],
        generatedAt: meta[id]?.generated_at ?? null,
    }));
}

export const useBRDStore = create<BRDStore>((set, get) => ({
    sections: SECTION_META.map(({ id, title }) => ({ id: id as string, title, content: '', citations: [] })),
    flags: [],
    acknowledgedFlagKeys: [],
    snapshotId: null,
    loading: false,
    generating: false,
    error: null,

    /**
     * Trigger BRD generation.
     * Shows a generating state — this call takes 30-90 seconds.
     */
    generateAll: async (sessionId) => {
        set({ generating: true, error: null });
        try {
            const res = await generateBRD(sessionId);
            set({ snapshotId: res.snapshot_id });
            // Once done, immediately load the results
            await get().loadBRD(sessionId);
        } catch (e) {
            set({ error: e instanceof Error ? e.message : 'Generation failed' });
        } finally {
            set({ generating: false });
        }
    },

    /**
     * Load existing BRD sections from the DB (does not re-generate).
     */
    loadBRD: async (sessionId) => {
        set({ loading: true, error: null });
        try {
            const data = await getBRD(sessionId);
            set({
                sections: sectionsFromAPI(data.sections, data.section_meta ?? {}),
                flags: data.flags,
                snapshotId: data.snapshot_id ?? get().snapshotId,
            });
        } catch (e) {
            set({ error: e instanceof Error ? e.message : 'Failed to load BRD' });
        } finally {
            set({ loading: false });
        }
    },

    /**
     * Save a human-edited section and lock it from AI overwrite.
     */
    updateSection: async (sessionId, sectionId, content) => {
        const { snapshotId } = get();
        if (!snapshotId) {
            set({ error: 'No snapshot ID — generate the BRD first.' });
            return;
        }
        set({ loading: true, error: null });
        try {
            await editBRDSection(sessionId, sectionId, content, snapshotId);
            // Optimistically update local state
            set((state) => ({
                sections: state.sections.map((s) =>
                    s.id === sectionId ? { ...s, content, lastEdited: new Date(), humanEdited: true } : s
                ),
            }));
        } catch (e) {
            set({ error: e instanceof Error ? e.message : 'Save failed' });
        } finally {
            set({ loading: false });
        }
    },

    /**
     * Mark a validation flag as acknowledged so the export page respects the user's decision.
     * key should be a stable composite: `${section_name}::${flag_type}::${description}`.
     */
    acknowledgeFlag: (key: string) => {
        set((state) => ({
            acknowledgedFlagKeys: state.acknowledgedFlagKeys.includes(key)
                ? state.acknowledgedFlagKeys
                : [...state.acknowledgedFlagKeys, key],
        }));
    },
}));
