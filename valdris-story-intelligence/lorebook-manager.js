export class LorebookManager {
    constructor(stateManager, entityDatabase) {
        this.stateManager = stateManager;
        this.entityDatabase = entityDatabase;
        this.ENTRY_TEMPLATES = {
            npc: {
                format: `[NPC: {{name}}]
Race: {{race}} | Class: {{class}} | Occupation: {{occupation}}
Appearance: {{appearance}}
Personality: {{personality}}
First Met: {{location_met}} ({{date_met}})
Relationship: {{relationship}}
{{#if notes}}Notes: {{notes}}{{/if}}`,
                defaultKeywords: (entity) => [
                    entity.name,
                    entity.name.split(' ')[0],
                    ...(entity.aliases || [])
                ]
            },
            location: {
                format: `[Location: {{name}}]
Type: {{type}} | Region: {{region}}
Description: {{description}}
Notable Features: {{notable_features}}
Inhabitants: {{inhabitants}}
Dangers: {{dangers}}
{{#if notes}}Notes: {{notes}}{{/if}}`,
                defaultKeywords: (entity) => [
                    entity.name,
                    `the ${entity.name}`,
                    entity.type,
                    ...(entity.aliases || [])
                ]
            },
            item: {
                format: `[Item: {{name}}]
Type: {{type}} | Rarity: {{rarity}}
Description: {{description}}
Properties: {{properties}}
Origin: {{origin}}
Current Holder: {{current_holder}}
{{#if notes}}Notes: {{notes}}{{/if}}`,
                defaultKeywords: (entity) => [
                    entity.name,
                    `the ${entity.name}`,
                    entity.type,
                    ...(entity.aliases || [])
                ]
            },
            faction: {
                format: `[Faction: {{name}}]
Type: {{type}} | Alignment: {{alignment}}
Description: {{description}}
Leader: {{leader}}
Headquarters: {{headquarters}}
Goals: {{goals}}
Player Relationship: {{relationship_to_player}}
{{#if notes}}Notes: {{notes}}{{/if}}`,
                defaultKeywords: (entity) => [
                    entity.name,
                    `the ${entity.name}`,
                    ...(entity.aliases || [])
                ]
            },
            quest: {
                format: `[Active Quest: {{name}}]
Type: {{type}} | Status: {{status}}
Quest Giver: {{giver}}
Objective: {{objective}}
Reward: {{reward}}
{{#if deadline}}Deadline: {{deadline}}{{/if}}
{{#if notes}}Notes: {{notes}}{{/if}}`,
                defaultKeywords: (entity) => [
                    entity.name,
                    entity.giver,
                    ...(entity.aliases || [])
                ]
            }
        };
    }

    async getTargetLorebook() {
        const settings = this.stateManager.getSection('lorebook');
        if (settings.useCharacterLorebook) {
            return await this.getCharacterLorebook();
        }
        return settings.targetLorebook;
    }

    async getCharacterLorebook() {
        const context = SillyTavern.getContext();
        const characterId = context.characterId;
        const worldInfo = context.characters?.[characterId]?.data?.extensions?.world;
        return worldInfo || null;
    }

    async getAllLorebooks() {
        const context = SillyTavern.getContext();
        return context.worldInfoList || [];
    }

    async getLorebookEntries(lorebookName) {
        const context = SillyTavern.getContext();
        return await context.getWorldInfoEntries(lorebookName);
    }

    async createEntryForEntity(entity) {
        const settings = this.stateManager.getSection('lorebook');
        if (!settings.enabled || !settings.autoCreate) return null;

        const existing = this.getTrackedEntry(entity.id);
        if (existing) {
            return null;
        }

        const lorebookName = await this.getTargetLorebook();
        if (!lorebookName) {
            console.warn('[VSI] No target lorebook available');
            return null;
        }

        const entryContent = this.generateEntryContent(entity);
        const entryName = this.generateEntryName(entity);
        const keywords = this.generateKeywords(entity);

        const entry = await this.createLorebookEntry(lorebookName, {
            name: entryName,
            content: entryContent,
            keywords,
            position: settings.defaultPosition,
            depth: settings.defaultDepth,
            matchWholeWords: settings.defaultMatchWholeWords,
            caseSensitive: settings.defaultCaseSensitive,
            enabled: settings.defaultEnabled,
            extensions: {
                vsi: {
                    entityId: entity.id,
                    entityType: entity.type,
                    createdAt: Date.now(),
                    version: 1
                }
            }
        });

        if (entry) {
            this.trackCreatedEntry(entity.id, entry.uid, lorebookName);
        }

        return entry;
    }

    async createLorebookEntry(lorebookName, entryData) {
        try {
            const context = SillyTavern.getContext();
            const result = await context.createWorldInfoEntry(lorebookName, entryData);
            console.log(`[VSI] Created lorebook entry: ${entryData.name}`);
            return result;
        } catch (error) {
            console.error('[VSI] Failed to create lorebook entry:', error);
            return null;
        }
    }

    generateEntryContent(entity) {
        const template = this.getTemplate(entity.type);
        return this.fillTemplate(template.format, entity);
    }

    generateEntryName(entity) {
        const settings = this.stateManager.getSection('lorebook');
        let name = entity.name;

        if (settings.entryPrefix) {
            name = settings.entryPrefix + name;
        }

        if (settings.addCategoryTag) {
            name = `${name} (${entity.type.toUpperCase()})`;
        }

        return name;
    }

    generateKeywords(entity) {
        const template = this.getTemplate(entity.type);
        const settings = this.stateManager.getSection('lorebook');

        let keywords = template.defaultKeywords(entity) || [];

        if (settings.keywordBlacklist.length > 0) {
            const blacklist = settings.keywordBlacklist.map((word) => word.toLowerCase());
            keywords = keywords.filter((keyword) => !blacklist.includes(String(keyword).toLowerCase()));
        }

        keywords = [...new Set(keywords)].filter((keyword) => keyword && keyword.trim());
        return keywords;
    }

    getTemplate(entityType) {
        const settings = this.stateManager.getSection('lorebook');
        return (
            settings.customTemplates[entityType] ||
            this.ENTRY_TEMPLATES[entityType] || {
                format: `[${entityType?.toUpperCase() || 'Entity'}: {{name}}]\n{{#if notes}}Notes: {{notes}}{{/if}}`,
                defaultKeywords: (entity) => [entity.name, ...(entity.aliases || [])]
            }
        );
    }

    fillTemplate(template, data) {
        let result = template;

        Object.entries(data).forEach(([key, value]) => {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(placeholder, value || 'Unknown');
        });

        result = result.replace(/{{#if (\w+)}}([\s\S]*?){{\/if}}/g, (match, field, content) => {
            return data[field] ? content : '';
        });

        result = result.replace(/{{[\w#\/]+}}/g, '');

        return result.trim();
    }

    async updateEntryForEntity(entity) {
        const settings = this.stateManager.getSection('lorebook');
        if (!settings.enabled || !settings.autoUpdate) return;

        const trackedEntry = this.getTrackedEntry(entity.id);
        if (!trackedEntry) {
            return await this.createEntryForEntity(entity);
        }

        const entryContent = this.generateEntryContent(entity);
        const keywords = this.generateKeywords(entity);

        await this.updateLorebookEntry(trackedEntry.lorebookName, trackedEntry.entryUid, {
            content: entryContent,
            keywords,
            extensions: {
                vsi: {
                    entityId: entity.id,
                    entityType: entity.type,
                    updatedAt: Date.now(),
                    version: (trackedEntry.version || 1) + 1
                }
            }
        });
    }

    async updateLorebookEntry(lorebookName, entryUid, updates) {
        try {
            const context = SillyTavern.getContext();
            await context.updateWorldInfoEntry(lorebookName, entryUid, updates);
            console.log(`[VSI] Updated lorebook entry: ${entryUid}`);
        } catch (error) {
            console.error('[VSI] Failed to update lorebook entry:', error);
        }
    }

    async deleteEntryForEntity(entityId) {
        const settings = this.stateManager.getSection('lorebook');
        if (!settings.enabled || !settings.autoDelete) return;

        const trackedEntry = this.getTrackedEntry(entityId);
        if (!trackedEntry) return;

        await this.deleteLorebookEntry(trackedEntry.lorebookName, trackedEntry.entryUid);
        this.untrackEntry(entityId);
    }

    async deleteLorebookEntry(lorebookName, entryUid) {
        try {
            const context = SillyTavern.getContext();
            await context.deleteWorldInfoEntry(lorebookName, entryUid);
            console.log(`[VSI] Deleted lorebook entry: ${entryUid}`);
        } catch (error) {
            console.error('[VSI] Failed to delete lorebook entry:', error);
        }
    }

    trackCreatedEntry(entityId, entryUid, lorebookName) {
        const state = this.stateManager.getSection('lorebook');
        state.createdEntries.push({
            entityId,
            entryUid,
            lorebookName,
            createdAt: Date.now()
        });
        this.stateManager.updateSection('lorebook', state);
    }

    getTrackedEntry(entityId) {
        const state = this.stateManager.getSection('lorebook');
        return state.createdEntries.find((entry) => entry.entityId === entityId);
    }

    untrackEntry(entityId) {
        const state = this.stateManager.getSection('lorebook');
        state.createdEntries = state.createdEntries.filter((entry) => entry.entityId !== entityId);
        this.stateManager.updateSection('lorebook', state);
    }

    async createEntriesForAllEntities() {
        const allEntities = this.entityDatabase.getAllEntities();
        let created = 0;

        for (const entity of allEntities) {
            const tracked = this.getTrackedEntry(entity.id);
            if (!tracked) {
                await this.createEntryForEntity(entity);
                created += 1;
            }
        }

        return created;
    }

    async syncAllEntries() {
        const state = this.stateManager.getSection('lorebook');

        for (const tracked of state.createdEntries) {
            const entity = this.entityDatabase.getEntityById(tracked.entityId);
            if (entity) {
                await this.updateEntryForEntity(entity);
            } else if (state.autoDelete) {
                await this.deleteLorebookEntry(tracked.lorebookName, tracked.entryUid);
                this.untrackEntry(tracked.entityId);
            }
        }

        state.lastSync = Date.now();
        this.stateManager.updateSection('lorebook', state);
    }

    async cleanupOrphanedEntries() {
        const state = this.stateManager.getSection('lorebook');
        const orphaned = [];

        for (const tracked of state.createdEntries) {
            const entity = this.entityDatabase.getEntityById(tracked.entityId);
            if (!entity) {
                orphaned.push(tracked);
            }
        }

        for (const tracked of orphaned) {
            await this.deleteLorebookEntry(tracked.lorebookName, tracked.entryUid);
            this.untrackEntry(tracked.entityId);
        }

        return orphaned.length;
    }

    async importEntitiesFromLorebook(lorebookName) {
        const entries = await this.getLorebookEntries(lorebookName);
        const imported = [];

        for (const entry of entries) {
            const parsed = this.parseLorebookEntry(entry);
            if (parsed) {
                const entity = this.entityDatabase.addEntity(parsed.type, parsed);
                imported.push(entity);
            }
        }

        return imported;
    }

    parseLorebookEntry(entry) {
        const content = entry.content || '';

        const typeMatch = content.match(/\[(NPC|Location|Item|Faction|Quest):\s*([^\]]+)\]/i);
        if (!typeMatch) return null;

        const type = typeMatch[1].toLowerCase();
        const name = typeMatch[2].trim();

        const data = {
            name,
            type,
            importedFrom: 'lorebook',
            originalEntry: entry.uid
        };

        const raceMatch = content.match(/Race:\s*([^\n|]+)/i);
        if (raceMatch) data.race = raceMatch[1].trim();

        const classMatch = content.match(/Class:\s*([^\n|]+)/i);
        if (classMatch) data.class = classMatch[1].trim();

        const descMatch = content.match(/Description:\s*([^\n]+)/i);
        if (descMatch) data.description = descMatch[1].trim();

        return data;
    }

    getLorebookStatus(entityId) {
        const tracked = this.getTrackedEntry(entityId);
        return Boolean(tracked);
    }

    buildPreview(entity) {
        return {
            name: this.generateEntryName(entity),
            content: this.generateEntryContent(entity),
            keywords: this.generateKeywords(entity)
        };
    }
}
