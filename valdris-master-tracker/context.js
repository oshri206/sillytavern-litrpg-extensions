/**
 * Valdris Master Tracker - Context Injection helpers
 */

function formatLines(items = []) {
    if (!items || items.length === 0) return '';
    return items.map(item => `- ${item}`).join('\n');
}

function formatStatusLines(items = []) {
    if (!items || items.length === 0) return '';
    return items.map(item => `- ${item.name}${item.duration ? ` (${item.duration} remaining)` : ''}`).join('\n');
}

export function buildContextBlock(state, settings) {
    const ctxSettings = settings ?? state?.settings?.contextInjection ?? {};
    const header = ctxSettings.customHeader?.trim() || `[CHARACTER STATE - ${state.characterName || 'Unknown'}]`;
    const footer = ctxSettings.customFooter?.trim() || '[/CHARACTER STATE]';

    const lines = [header];

    if (ctxSettings.includeResources !== false) {
        lines.push(`HP: ${state.hp?.current ?? 0}/${state.hp?.max ?? 0} | MP: ${state.mp?.current ?? 0}/${state.mp?.max ?? 0} | SP: ${state.stamina?.current ?? 0}/${state.stamina?.max ?? 0}`);
    }

    lines.push(`Level: ${state.level ?? 1} | Class: ${state.mainClass?.name ?? 'Unknown'} Lv.${state.mainClass?.level ?? 1}`);
    if (state.currentLocation) {
        lines.push(`Location: ${state.currentLocation}`);
    } else {
        lines.push('Location: Unknown');
    }

    if (ctxSettings.includeBuffsDebuffs !== false) {
        const buffs = formatStatusLines(state.buffs || []);
        const debuffs = formatStatusLines(state.debuffs || []);
        lines.push('');
        lines.push('Active Effects:');
        if (buffs) lines.push(buffs);
        if (debuffs) lines.push(debuffs);
        if (!buffs && !debuffs) lines.push('- None');
    }

    if (ctxSettings.includeStats !== false) {
        const attrs = state.attributes || {};
        lines.push('');
        lines.push(`Key Stats: STR ${attrs.STR?.base ?? 0} | DEX ${attrs.DEX?.base ?? 0} | CON ${attrs.CON?.base ?? 0} | INT ${attrs.INT?.base ?? 0} | WIS ${attrs.WIS?.base ?? 0} | CHA ${attrs.CHA?.base ?? 0}`);
    }

    if (ctxSettings.includeEquipment !== false) {
        const eq = state.equipment || {};
        lines.push('');
        lines.push(`Equipment: ${eq.mainHand?.name || 'None'}, ${eq.offHand?.name || 'None'}, ${eq.chest?.name || 'None'}`);
    }

    if (ctxSettings.includeSurvival !== false) {
        const survival = state.survivalMeters || {};
        const hunger = survival.hunger?.enabled ? `Hunger: ${survival.hunger?.current ?? 0}%` : '';
        const thirst = survival.thirst?.enabled ? `Thirst: ${survival.thirst?.current ?? 0}%` : '';
        if (hunger || thirst) {
            lines.push('');
            lines.push(`Survival: ${[hunger, thirst].filter(Boolean).join(' ')}`);
        }
    }

    if (state.conditions) {
        lines.push('');
        lines.push(`Active Conditions: ${formatLines(state.conditions)}`);
    }

    lines.push(footer);
    return lines.join('\n');
}
