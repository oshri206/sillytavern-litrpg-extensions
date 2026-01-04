/**
 * Valdris Master Tracker - NPC Lives module
 * Scoped system for important NPCs only.
 */

let _initialized = false;

const DEFAULT_SCHEDULE = {
    morning: '',
    afternoon: '',
    evening: '',
    night: ''
};

function normalizeName(name = '') {
    return String(name || '').trim().toLowerCase();
}

function parseScore(value) {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    const str = String(value || '').trim().toLowerCase();
    if (!str) return 0;
    if (str === 'low') return 25;
    if (str === 'medium' || str === 'mid') return 50;
    if (str === 'high') return 75;
    const numeric = Number(str);
    return Number.isNaN(numeric) ? 0 : numeric;
}

function evaluateBehavior(npc) {
    const relationshipScore = parseScore(npc.relationship);
    const incentivesScore = (npc.incentives || []).length * 10;
    const loyaltyScore = parseScore(npc.loyalty);
    const riskScore = parseScore(npc.riskTolerance);
    const composite = relationshipScore + incentivesScore + loyaltyScore - riskScore;

    const scoreToLikelihood = (score, thresholds) => {
        if (score < thresholds[0]) return 'Likely';
        if (score < thresholds[1]) return 'Possible';
        return 'Unlikely';
    };

    return {
        refusal: scoreToLikelihood(composite, [30, 60]),
        lie: scoreToLikelihood(composite, [40, 70]),
        betray: scoreToLikelihood(composite, [55, 80])
    };
}

function detectActiveNpcName(context) {
    if (!context) return '';
    const candidates = [
        context?.character?.name,
        context?.character_name,
        context?.char_name,
        context?.name,
        context?.characters?.[context?.characterId]?.name,
        context?.characters?.[context?.activeCharacterId]?.name,
        context?.activeCharacter?.name
    ];
    for (const candidate of candidates) {
        if (candidate && String(candidate).trim()) return String(candidate).trim();
    }
    const lastMessage = context?.chat?.[context?.chat?.length - 1];
    return lastMessage?.name || '';
}

function normalizeNpc(npc = {}) {
    const schedule = { ...DEFAULT_SCHEDULE, ...(npc.schedule || {}) };
    return {
        name: npc.name || 'Unknown',
        important: npc.important !== false,
        priority: Number.isFinite(npc.priority) ? npc.priority : 0,
        goals: npc.goals || [],
        limits: npc.limits || [],
        secrets: npc.secrets || [],
        incentives: npc.incentives || [],
        relationship: npc.relationship || '',
        riskTolerance: npc.riskTolerance || '',
        loyalty: npc.loyalty || '',
        schedule
    };
}

function buildScheduleLine(schedule) {
    const parts = [
        schedule.morning ? `Morning: ${schedule.morning}` : '',
        schedule.afternoon ? `Afternoon: ${schedule.afternoon}` : '',
        schedule.evening ? `Evening: ${schedule.evening}` : '',
        schedule.night ? `Night: ${schedule.night}` : ''
    ].filter(Boolean);
    return parts.length ? parts.join(' | ') : 'Schedule: (placeholder)';
}

function buildNpcSections(npc) {
    const sections = [];
    const behavior = evaluateBehavior(npc);

    sections.push({ priority: 100, text: `NPC: ${npc.name}` });
    if (npc.goals.length) sections.push({ priority: 90, text: `Goals: ${npc.goals.join('; ')}` });
    if (npc.limits.length) sections.push({ priority: 85, text: `Limits: ${npc.limits.join('; ')}` });
    if (npc.secrets.length) sections.push({ priority: 80, text: `Secrets: ${npc.secrets.join('; ')}` });
    if (npc.incentives.length) sections.push({ priority: 75, text: `Incentives: ${npc.incentives.join('; ')}` });
    if (npc.relationship) sections.push({ priority: 70, text: `Relationship: ${npc.relationship}` });
    if (npc.riskTolerance || npc.loyalty) {
        sections.push({
            priority: 65,
            text: `Risk Tolerance: ${npc.riskTolerance || 'Unknown'} | Loyalty: ${npc.loyalty || 'Unknown'}`
        });
    }
    sections.push({
        priority: 60,
        text: `Behavior Checks: Refusal ${behavior.refusal} | Lie ${behavior.lie} | Betray ${behavior.betray}`
    });
    sections.push({ priority: 50, text: buildScheduleLine(npc.schedule) });
    return sections;
}

function appendWithCap(lines, nextLine, cap) {
    const candidate = [...lines, nextLine].join('\n');
    if (candidate.length <= cap) {
        lines.push(nextLine);
        return true;
    }
    return false;
}

export function buildNpcLivesBlock(state, settings, context) {
    const npcSettings = settings || {};
    if (!npcSettings.enabled) return '';

    const cap = Number.isFinite(npcSettings.maxChars) ? npcSettings.maxChars : 1200;
    const pinned = (npcSettings.pinnedNpcs || []).map(normalizeName).filter(Boolean);
    const activeName = normalizeName(detectActiveNpcName(context));
    const allNpcs = (state?.npcLives?.npcs || []).map(normalizeNpc).filter(npc => npc.important);

    let scopedNpcs = [];
    if (activeName) {
        scopedNpcs = allNpcs.filter(npc => normalizeName(npc.name) === activeName);
    }
    if (!scopedNpcs.length && pinned.length) {
        scopedNpcs = allNpcs.filter(npc => pinned.includes(normalizeName(npc.name)));
    }

    if (!scopedNpcs.length) return '';

    scopedNpcs.sort((a, b) => b.priority - a.priority);

    const lines = ['[IMPORTANT NPC LIVES]'];
    for (const npc of scopedNpcs) {
        const sections = buildNpcSections(npc).sort((a, b) => b.priority - a.priority);
        for (const section of sections) {
            if (!appendWithCap(lines, section.text, cap)) {
                return lines.join('\n');
            }
        }
        if (!appendWithCap(lines, '', cap)) {
            return lines.join('\n');
        }
    }
    appendWithCap(lines, '[/IMPORTANT NPC LIVES]', cap);
    return lines.join('\n');
}

export function initNpcLivesModule() {
    if (_initialized) return () => {};
    _initialized = true;
    return () => {
        _initialized = false;
    };
}

export function isNpcLivesInitialized() {
    return _initialized;
}
