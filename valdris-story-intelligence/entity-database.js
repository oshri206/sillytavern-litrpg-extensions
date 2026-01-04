import { calculateSimilarity, generateUUID, normalizeName } from './utils.js';

export class EntityDatabase {
    constructor(stateManager) {
        this.stateManager = stateManager;
    }

    addEntity(type, entityData) {
        const section = this.getSection(type);
        const id = entityData.id || generateUUID();
        const timestamp = Date.now();
        section[id] = {
            ...entityData,
            id,
            type,
            createdAt: entityData.createdAt || timestamp,
            updatedAt: timestamp
        };
        this.stateManager.saveState();
        return section[id];
    }

    getEntity(type, id) {
        const section = this.getSection(type);
        return section[id] || null;
    }

    getEntityByName(type, name) {
        const section = this.getSection(type);
        const normalized = normalizeName(name);
        const entries = Object.values(section);
        const exact = entries.find((entity) => normalizeName(entity.name) === normalized);
        if (exact) return exact;

        let best = null;
        let bestScore = 0;
        for (const entity of entries) {
            const score = calculateSimilarity(entity.name, name);
            if (score > bestScore) {
                best = entity;
                bestScore = score;
            }
        }
        return bestScore >= 0.75 ? best : null;
    }

    updateEntity(type, id, updates) {
        const section = this.getSection(type);
        if (!section[id]) return null;
        section[id] = {
            ...section[id],
            ...updates,
            updatedAt: Date.now()
        };
        this.stateManager.saveState();
        return section[id];
    }

    deleteEntity(type, id) {
        const section = this.getSection(type);
        if (!section[id]) return false;
        delete section[id];
        this.stateManager.saveState();
        return true;
    }

    getAllEntities(type = null) {
        if (!type) {
            return Object.entries(this.stateManager.getSection('entities')).flatMap(
                ([sectionType, entities]) =>
                    Object.values(entities).map((entity) => ({
                        ...entity,
                        type: this.singularType(sectionType)
                    }))
            );
        }
        return Object.values(this.getSection(type));
    }

    searchEntities(query, types = null) {
        const term = normalizeName(query);
        if (!term) return [];
        const pool = types ? types.flatMap((type) => this.getAllEntities(type)) : this.getAllEntities();
        return pool.filter((entity) => {
            const haystack = `${entity.name} ${entity.description || ''} ${entity.notes || ''}`;
            return normalizeName(haystack).includes(term);
        });
    }

    getRecentEntities(limit = 10) {
        const all = this.getAllEntities();
        return all
            .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
            .slice(0, limit);
    }

    getEntitiesByRelationship(entityId) {
        const relationships = this.stateManager.getSection('relationships');
        return relationships.filter((relation) => relation.entity1 === entityId || relation.entity2 === entityId);
    }

    getEntitiesInLocation(locationId) {
        return this.getAllEntities('npc').filter((entity) => entity.location === locationId);
    }

    getStats() {
        const entities = this.stateManager.getSection('entities');
        return {
            npcs: Object.keys(entities.npcs).length,
            locations: Object.keys(entities.locations).length,
            items: Object.keys(entities.items).length,
            factions: Object.keys(entities.factions).length,
            quests: Object.keys(entities.quests).length,
            events: Object.keys(entities.events).length
        };
    }

    exportEntities(types = null) {
        if (!types) {
            return JSON.stringify(this.stateManager.getSection('entities'), null, 2);
        }
        const data = {};
        types.forEach((type) => {
            data[type] = this.getSection(type);
        });
        return JSON.stringify(data, null, 2);
    }

    importEntities(data, merge = true) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const current = this.stateManager.getSection('entities');
        const next = merge ? { ...current } : {};
        Object.entries(parsed).forEach(([type, entities]) => {
            next[type] = merge ? { ...(current[type] || {}), ...entities } : entities;
        });
        this.stateManager.setSection('entities', next);
        return next;
    }

    addRelationship(entity1Id, entity2Id, type, description = '') {
        const relationships = this.stateManager.getSection('relationships');
        const relationship = {
            id: generateUUID(),
            entity1: entity1Id,
            entity2: entity2Id,
            type,
            description
        };
        relationships.push(relationship);
        this.stateManager.saveState();
        return relationship;
    }

    getRelationships(entityId) {
        const relationships = this.stateManager.getSection('relationships');
        return relationships.filter((relation) => relation.entity1 === entityId || relation.entity2 === entityId);
    }

    removeRelationship(relationshipId) {
        const relationships = this.stateManager.getSection('relationships');
        const index = relationships.findIndex((relation) => relation.id === relationshipId);
        if (index === -1) return false;
        relationships.splice(index, 1);
        this.stateManager.saveState();
        return true;
    }

    isKnownEntity(type, name) {
        return Boolean(this.getEntityByName(type, name));
    }

    getSection(type) {
        const entities = this.stateManager.getSection('entities');
        const key = this.normalizeType(type);
        if (!entities[key]) {
            entities[key] = {};
        }
        return entities[key];
    }

    normalizeType(type) {
        if (type === 'npc') return 'npcs';
        if (type === 'location') return 'locations';
        if (type === 'item') return 'items';
        if (type === 'faction') return 'factions';
        if (type === 'quest') return 'quests';
        if (type === 'event') return 'events';
        return type;
    }

    singularType(type) {
        if (type === 'npcs') return 'npc';
        if (type === 'locations') return 'location';
        if (type === 'items') return 'item';
        if (type === 'factions') return 'faction';
        if (type === 'quests') return 'quest';
        if (type === 'events') return 'event';
        return type;
    }
}
