export const ENTITY_TYPES = {
    npc: {
        name: "NPC",
        icon: "👤",
        color: "#3498db",
        description: "Non-player characters",
        detectPatterns: [
            /(?:Lord|Lady|King|Queen|Prince|Princess|Sir|Dame|Master|Mistress|Captain|General|Doctor|Professor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
            /(?:said|asked|replied|whispered|shouted|muttered|exclaimed)\s+([A-Z][a-z]+)/g,
            /(?:a|an|the)\s+(?:man|woman|person|figure|stranger|merchant|guard|soldier|mage|wizard|knight)\s+(?:named|called|known as)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi
        ],
        fields: [
            "name",
            "race",
            "class",
            "occupation",
            "appearance",
            "personality",
            "location_met",
            "relationship",
            "notes"
        ]
    },
    location: {
        name: "Location",
        icon: "📍",
        color: "#2ecc71",
        description: "Places and areas",
        detectPatterns: [
            /(?:the|a|an)\s+((?:[A-Z][a-z]+\s*)+(?:Inn|Tavern|Castle|Tower|Temple|Shrine|Forest|Mountain|Valley|River|Lake|Sea|City|Town|Village|Kingdom|Empire|Guild|Academy|Market|Square|District|Quarter|Gate|Bridge|Road|Path|Dungeon|Cave|Ruins|Fortress|Palace|Manor|Estate|Shop|Store))/g,
            /(?:in|at|to|from|near|towards)\s+(?:the\s+)?((?:[A-Z][a-z]+\s*)+(?:Inn|Tavern|Castle|Tower|Temple|Forest|City|Town|Village|Mountains?))/g,
            /(?:arrived at|entered|reached|approached|left)\s+(?:the\s+)?((?:[A-Z][a-z]+\s*)+)/g
        ],
        fields: [
            "name",
            "type",
            "region",
            "description",
            "notable_features",
            "inhabitants",
            "dangers",
            "notes"
        ]
    },
    item: {
        name: "Item",
        icon: "⚔️",
        color: "#e74c3c",
        description: "Objects, weapons, artifacts",
        detectPatterns: [
            /(?:a|an|the)\s+((?:[A-Z][a-z]+\s*)+(?:Sword|Blade|Dagger|Axe|Bow|Staff|Wand|Ring|Amulet|Necklace|Armor|Shield|Helm|Cloak|Robe|Potion|Scroll|Book|Tome|Key|Gem|Crystal|Orb|Crown|Scepter))/g,
            /(?:gave|handed|received|found|picked up|obtained|acquired)\s+(?:a|an|the)\s+((?:[A-Z][a-z]+\s*)+)/g,
            /(?:called|named|known as)\s+(?:the\s+)?((?:[A-Z][a-z]+(?:'s)?\s*)+)/g
        ],
        fields: [
            "name",
            "type",
            "rarity",
            "description",
            "properties",
            "origin",
            "current_holder",
            "notes"
        ]
    },
    faction: {
        name: "Faction",
        icon: "🏰",
        color: "#9b59b6",
        description: "Organizations and groups",
        detectPatterns: [
            /(?:the)\s+((?:[A-Z][a-z]+\s*)+(?:Guild|Order|Brotherhood|Sisterhood|Clan|Tribe|House|Family|Alliance|Coalition|Empire|Kingdom|Republic|Council|Circle|Cult|Church|Temple|Academy|College|Company|Band|Legion|Army))/g,
            /(?:member|agent|soldier|knight|mage|priest)\s+of\s+(?:the\s+)?((?:[A-Z][a-z]+\s*)+)/g
        ],
        fields: [
            "name",
            "type",
            "alignment",
            "description",
            "leader",
            "headquarters",
            "goals",
            "relationship_to_player",
            "notes"
        ]
    },
    quest: {
        name: "Quest",
        icon: "📜",
        color: "#f39c12",
        description: "Objectives and missions",
        detectPatterns: [
            /(?:must|need to|should|have to|tasked with|asked to)\s+(find|retrieve|kill|defeat|rescue|deliver|investigate|discover|protect|escort|collect)/gi,
            /(?:reward|payment|bounty)\s+(?:of|for)\s+/gi
        ],
        fields: [
            "name",
            "type",
            "giver",
            "objective",
            "reward",
            "status",
            "deadline",
            "notes"
        ]
    },
    event: {
        name: "Event",
        icon: "⚡",
        color: "#1abc9c",
        description: "Significant story events",
        detectPatterns: [
            /(?:suddenly|finally|at last|in that moment)/gi,
            /(?:attacks?|strikes?|lunges?|charges?)\s+(?:at|toward)/gi,
            /(?:dies?|killed?|slain|fell|collapsed)/gi
        ],
        fields: [
            "name",
            "type",
            "participants",
            "location",
            "outcome",
            "consequences",
            "date",
            "notes"
        ]
    }
};

export const DEFAULT_STATE = {
    version: "1.0.0",
    lastUpdated: null,
    entities: {
        npcs: {},
        locations: {},
        items: {},
        factions: {},
        quests: {},
        events: {}
    },
    pendingEntities: [],
    relationships: [],
    plotThreads: [],
    summaries: [],
    lorebook: {
        enabled: true,
        autoCreate: true,
        autoUpdate: true,
        autoDelete: false,
        targetLorebook: null,
        useCharacterLorebook: true,
        entryPrefix: "[VSI] ",
        addCategoryTag: true,
        includeTimestamp: true,
        defaultPosition: 4,
        defaultDepth: 4,
        defaultMatchWholeWords: false,
        defaultCaseSensitive: false,
        defaultEnabled: true,
        createdEntries: [],
        lastSync: null,
        customTemplates: {},
        keywordBlacklist: []
    },
    detection: {
        enabled: true,
        autoDetect: true,
        useAIDetection: false,
        confirmNewEntities: true,
        detectNPCs: true,
        detectLocations: true,
        detectItems: true,
        detectFactions: true,
        detectQuests: true,
        detectEvents: false
    },
    detectionHistory: [],
    settings: {
        showNotifications: true,
        autoExpandPanel: false,
        maxPendingEntities: 20
    }
};

export function generateUUID() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const rand = (Math.random() * 16) | 0;
        const value = char === "x" ? rand : (rand & 0x3) | 0x8;
        return value.toString(16);
    });
}

export function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function normalizeName(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

export function truncateText(text, maxLength = 80) {
    const cleaned = String(text || "").trim();
    if (cleaned.length <= maxLength) {
        return cleaned;
    }
    return `${cleaned.slice(0, maxLength - 1)}…`;
}

export function formatDate(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleDateString();
}

export function calculateSimilarity(a, b) {
    const nameA = normalizeName(a);
    const nameB = normalizeName(b);
    if (!nameA || !nameB) return 0;
    if (nameA === nameB) return 1;

    const distance = levenshtein(nameA, nameB);
    const maxLen = Math.max(nameA.length, nameB.length);
    return maxLen === 0 ? 0 : 1 - distance / maxLen;
}

function levenshtein(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => []);

    for (let i = 0; i <= a.length; i += 1) {
        matrix[i][0] = i;
    }
    for (let j = 0; j <= b.length; j += 1) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }

    return matrix[a.length][b.length];
}
