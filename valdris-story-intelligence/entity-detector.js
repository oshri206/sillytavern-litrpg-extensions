import { ENTITY_TYPES, calculateSimilarity, generateUUID, normalizeName, truncateText } from './utils.js';

export class EntityDetector {
    constructor(stateManager, entityDatabase) {
        this.stateManager = stateManager;
        this.entityDatabase = entityDatabase;
        this.ENTITY_TYPES = ENTITY_TYPES;
        this.excludedWords = new Set([
            'The',
            'This',
            'That',
            'There',
            'They',
            'Then',
            'What',
            'When',
            'Where',
            'You',
            'Your',
            'I',
            'My',
            'We',
            'Our',
            'He',
            'She',
            'It',
            'His',
            'Her'
        ]);
        this.entityDetectedCallbacks = [];
        this.newEntityCallbacks = [];
    }

    async detectEntities(messageText, messageIndex = null) {
        const text = String(messageText || '');
        const detectionSettings = this.stateManager.getSection('detection');
        const detections = {
            npcs: [],
            locations: [],
            items: [],
            factions: [],
            quests: [],
            events: []
        };

        if (!text.trim()) return detections;

        if (detectionSettings.detectNPCs) {
            detections.npcs = this.detectEntitiesOfType(text, 'npc');
        }
        if (detectionSettings.detectLocations) {
            detections.locations = this.detectEntitiesOfType(text, 'location');
        }
        if (detectionSettings.detectItems) {
            detections.items = this.detectEntitiesOfType(text, 'item');
        }
        if (detectionSettings.detectFactions) {
            detections.factions = this.detectEntitiesOfType(text, 'faction');
        }
        if (detectionSettings.detectQuests) {
            detections.quests = this.detectEntitiesOfType(text, 'quest');
        }
        if (detectionSettings.detectEvents) {
            detections.events = this.detectEntitiesOfType(text, 'event');
        }

        if (detectionSettings.useAIDetection) {
            const aiDetections = await this.detectWithAI(text);
            this.mergeDetections(detections, aiDetections);
        }

        Object.entries(detections).forEach(([type, items]) => {
            items.forEach((entity) => {
                const payload = {
                    ...entity,
                    type,
                    createdFromMessage: messageIndex
                };
                this.entityDetectedCallbacks.forEach((callback) => callback(payload));
            });
        });

        return detections;
    }

    detectEntitiesOfType(text, entityType) {
        const typeConfig = this.ENTITY_TYPES[entityType];
        if (!typeConfig) return [];
        const matches = this.matchPatterns(text, typeConfig.detectPatterns);
        return matches.map((match) => {
            const name = this.cleanMatch(match.match);
            const confidence = this.calculateConfidence(name, match.context);
            return {
                name,
                context: truncateText(match.context, 120),
                confidence
            };
        });
    }

    matchPatterns(text, patterns) {
        const results = [];
        patterns.forEach((pattern) => {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const raw = match[1] || match[0];
                const cleaned = this.cleanMatch(raw);
                if (!cleaned || this.isExcluded(cleaned)) {
                    continue;
                }
                results.push({
                    match: cleaned,
                    context: text.slice(Math.max(0, match.index - 60), match.index + match[0].length + 60)
                });
            }
        });

        const deduped = new Map();
        results.forEach((result) => {
            const key = normalizeName(result.match);
            if (!deduped.has(key)) {
                deduped.set(key, result);
            }
        });
        return Array.from(deduped.values());
    }

    cleanMatch(match) {
        if (!match) return '';
        return String(match)
            .replace(/^(a|an|the)\s+/i, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    isExcluded(match) {
        return this.excludedWords.has(match);
    }

    calculateConfidence(match, context) {
        let score = 0.4;
        if (/^[A-Z]/.test(match)) score += 0.2;
        if (match.split(' ').length > 1) score += 0.2;
        if (context && /named|known as|called/i.test(context)) score += 0.2;
        return Math.min(score, 0.95);
    }

    async detectWithAI(text) {
        if (typeof SillyTavern === 'undefined') {
            return {};
        }
        const context = SillyTavern.getContext?.();
        const generate = context?.generate;
        if (!generate) {
            console.warn('[VSI] AI detection requested but no generator available.');
            return {};
        }

        const prompt = this.buildAIDetectionPrompt(text);
        const response = await generate(prompt, { temperature: 0.2, max_tokens: 400 });
        return this.parseAIResponse(response?.text || response || '');
    }

    buildAIDetectionPrompt(text) {
        return `Analyze the following roleplay text and identify any entities mentioned.

TEXT:
${text}

Identify and categorize any:
- NPCs (characters with names)
- Locations (named places)
- Items (named objects, weapons, artifacts)
- Factions (organizations, groups)
- Quests (objectives given to the player)

Return ONLY a JSON object in this format:
{
  "npcs": [{"name": "...", "context": "brief description"}],
  "locations": [{"name": "...", "context": "..."}],
  "items": [{"name": "...", "context": "..."}],
  "factions": [{"name": "...", "context": "..."}],
  "quests": [{"name": "...", "context": "..."}]
}

If no entities found, return empty arrays. Return ONLY valid JSON.`;
    }

    parseAIResponse(response) {
        if (!response) return {};
        const jsonStart = response.indexOf('{');
        const jsonEnd = response.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) {
            return {};
        }
        try {
            return JSON.parse(response.slice(jsonStart, jsonEnd + 1));
        } catch (error) {
            console.warn('[VSI] Failed to parse AI response.', error);
            return {};
        }
    }

    isKnownEntity(entityType, name) {
        return Boolean(this.findSimilarEntity(entityType, name));
    }

    findSimilarEntity(entityType, name) {
        const section = this.entityDatabase.getSection(entityType);
        const entries = Object.values(section);
        let best = null;
        let bestScore = 0;
        entries.forEach((entity) => {
            const score = this.calculateSimilarity(name, entity.name);
            if (score > bestScore) {
                best = entity;
                bestScore = score;
            }
        });
        return bestScore >= 0.75 ? best : null;
    }

    calculateSimilarity(name1, name2) {
        return calculateSimilarity(name1, name2);
    }

    createEntityFromDetection(type, name, context, messageIndex) {
        return {
            id: generateUUID(),
            type,
            name,
            createdAt: Date.now(),
            createdFromMessage: messageIndex,
            context,
            confidence: this.calculateConfidence(name, context),
            confirmed: false,
            lorebookEntryId: null,
            ...this.getDefaultFields(type)
        };
    }

    getDefaultFields(entityType) {
        const typeConfig = this.ENTITY_TYPES[entityType];
        if (!typeConfig) return {};
        return typeConfig.fields.reduce((accumulator, field) => {
            if (field === 'name') return accumulator;
            accumulator[field] = '';
            return accumulator;
        }, {});
    }

    mergeDetections(base, incoming) {
        if (!incoming) return;
        Object.keys(base).forEach((key) => {
            if (Array.isArray(incoming[key])) {
                base[key] = [...base[key], ...incoming[key]];
            }
        });
    }

    onEntityDetected(callback) {
        this.entityDetectedCallbacks.push(callback);
    }

    onNewEntityFound(callback) {
        this.newEntityCallbacks.push(callback);
    }
}
