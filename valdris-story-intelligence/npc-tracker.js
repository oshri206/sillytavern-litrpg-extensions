import { generateUUID } from './utils.js';

export class NPCTracker {
    constructor(stateManager, entityDatabase, lorebookManager) {
        this.stateManager = stateManager;
        this.entityDatabase = entityDatabase;
        this.lorebookManager = lorebookManager;
        this.NPC_PROFILE_TEMPLATE = {
            id: 'uuid',
            name: '',
            aliases: [],
            title: null,
            race: null,
            gender: null,
            age: null,
            ageCategory: null,
            appearance: {
                height: null,
                build: null,
                faceShape: null,
                eyeColor: null,
                eyeShape: null,
                hairColor: null,
                hairStyle: null,
                hairTexture: null,
                facialHair: null,
                skinTone: null,
                scars: [],
                tattoos: [],
                birthmarks: [],
                piercings: [],
                notableFeatures: [],
                typicalClothing: null,
                accessories: [],
                weapons: [],
                voiceDescription: null,
                accent: null,
                speechPattern: null,
                smell: null,
                mannerisms: [],
                rawDescriptions: []
            },
            personality: {
                traits: [],
                likes: [],
                dislikes: [],
                fears: [],
                goals: [],
                secrets: [],
                demeanor: null,
                temperament: null,
                alignment: null,
                morality: [],
                rawObservations: []
            },
            background: {
                occupation: null,
                affiliations: [],
                socialStatus: null,
                hometown: null,
                backstory: [],
                skills: [],
                family: [],
                spouse: null,
                children: []
            },
            playerRelationship: {
                type: 'neutral',
                disposition: 0,
                trust: 50,
                familiarity: 0,
                romanticInterest: 0,
                firstMet: {
                    location: null,
                    date: null,
                    circumstances: null
                },
                lastSeen: {
                    location: null,
                    date: null
                },
                interactions: 0,
                milestones: [],
                owesPlayer: [],
                playerOwes: []
            },
            npcRelationships: {},
            conversations: [],
            locationHistory: [],
            currentLocation: null,
            status: {
                isAlive: true,
                condition: 'healthy',
                statusNotes: [],
                lastStatusChange: null
            },
            storyRole: {
                importance: 'minor',
                archetypes: [],
                plotInvolvement: [],
                questsGiven: [],
                questsInvolved: []
            },
            meta: {
                createdAt: null,
                updatedAt: null,
                sourceMessages: [],
                confidence: 0,
                manuallyEdited: false,
                lorebookEntryId: null
            }
        };

        this.appearancePatterns = {
            height: [
                /(?:stands?|was|is)\s+(tall|short|of average height|towering|diminutive)/gi,
                /(\d+(?:'\d+"?|ft|feet))/gi,
                /(tall|short|average)[- ](?:height|stature)/gi
            ],
            build: [
                /(?:with a |having a )?(muscular|lean|stocky|slender|slim|heavy|burly|wiry|athletic|broad|thin|gaunt)\s+(?:build|frame|body|physique)/gi,
                /(well-built|powerfully built|slightly built)/gi
            ],
            hairColor: [
                /(?:with |having )?(blonde|blond|brown|black|red|auburn|gray|grey|silver|white|golden|raven|chestnut|copper|strawberry)\s+hair/gi,
                /hair\s+(?:was|is|colored)\s+(blonde|brown|black|red|gray|white|silver)/gi
            ],
            hairStyle: [
                /(long|short|shoulder-length|waist-length|cropped)\s+hair/gi,
                /hair\s+(?:worn|styled|kept|tied)\s+(?:in\s+)?(braids?|ponytail|bun|loose|down)/gi,
                /(bald|shaved head|balding)/gi
            ],
            eyeColor: [
                /(blue|green|brown|hazel|gray|grey|amber|golden|violet|red|black)\s+eyes/gi,
                /eyes\s+(?:were|are|of)\s+(blue|green|brown|hazel|gray|amber)/gi
            ],
            skinTone: [
                /(pale|dark|tan|olive|ebony|fair|bronze|weathered|sun-kissed)\s+skin/gi,
                /skin\s+(?:was|is)\s+(pale|dark|tan|fair)/gi
            ],
            facialHair: [
                /(beard|mustache|goatee|stubble|clean-shaven)/gi,
                /(thick|thin|braided|long|short|grey|graying)\s+(beard|mustache)/gi
            ],
            scars: [
                /scar(?:s)?\s+(?:on|across|over)\s+(?:his|her|their)\s+(face|cheek|eye|lip|forehead|chin|neck|arm|hand|chest)/gi,
                /(jagged|thin|old|fresh|prominent)\s+scar/gi
            ],
            age: [
                /(young|old|elderly|middle-aged|ancient|youthful)/gi,
                /(?:appeared?|looked?|seemed?)\s+(?:to be\s+)?(?:in\s+)?(?:his|her|their)\s+(twenties|thirties|forties|fifties|sixties|seventies)/gi,
                /(?:around|about|nearly)\s+(\d+)\s+years?\s+old/gi
            ]
        };

        this.personalityPatterns = {
            traits: [
                /(?:was|is|seemed?|appeared?)\s+(friendly|hostile|cold|warm|suspicious|trusting|nervous|calm|angry|sad|happy|gruff|cheerful|stern|kind|cruel)/gi,
                /(spoke|talked|said)\s+(?:in a |with )?(gruff|soft|loud|quiet|gentle|harsh|warm|cold)\s+(?:tone|voice|manner)/gi
            ],
            demeanor: [
                /(?:with a |having a )?(friendly|cold|suspicious|warm|hostile|neutral|guarded)\s+(?:demeanor|manner|attitude)/gi
            ]
        };
    }

    createNPCProfile(basicEntity = {}) {
        return {
            ...this.NPC_PROFILE_TEMPLATE,
            ...basicEntity,
            id: basicEntity.id || generateUUID(),
            appearance: {
                ...this.NPC_PROFILE_TEMPLATE.appearance,
                ...(basicEntity.appearance || {})
            },
            personality: {
                ...this.NPC_PROFILE_TEMPLATE.personality,
                ...(basicEntity.personality || {})
            },
            background: {
                ...this.NPC_PROFILE_TEMPLATE.background,
                ...(basicEntity.background || {})
            },
            playerRelationship: {
                ...this.NPC_PROFILE_TEMPLATE.playerRelationship,
                ...(basicEntity.playerRelationship || {})
            },
            status: {
                ...this.NPC_PROFILE_TEMPLATE.status,
                ...(basicEntity.status || {})
            },
            storyRole: {
                ...this.NPC_PROFILE_TEMPLATE.storyRole,
                ...(basicEntity.storyRole || {})
            },
            meta: {
                ...this.NPC_PROFILE_TEMPLATE.meta,
                ...basicEntity.meta,
                createdAt: basicEntity.meta?.createdAt || Date.now()
            }
        };
    }

    extractAppearance(text, npcName) {
        const appearance = {};
        const npcContextPattern = new RegExp(
            `(?:${npcName}|(?:he|she|they|the \\w+))\\s+[^.]*`,
            'gi'
        );
        const relevantText = text.match(npcContextPattern)?.join(' ') || text;

        for (const [aspect, patterns] of Object.entries(this.appearancePatterns)) {
            for (const pattern of patterns) {
                const matches = relevantText.match(pattern);
                if (matches && matches.length > 0) {
                    const value = this.cleanAppearanceMatch(matches[0], aspect);
                    if (value) {
                        if (aspect === 'scars') {
                            appearance.scars = appearance.scars || [];
                            appearance.scars.push(value);
                        } else if (aspect === 'age') {
                            appearance.age = value;
                        } else {
                            appearance[aspect] = value;
                        }
                    }
                }
            }
        }

        return appearance;
    }

    cleanAppearanceMatch(match) {
        return match
            .toLowerCase()
            .trim()
            .replace(/^(with a |having a |was |is |stands? |appeared? )/i, '');
    }

    extractFullAppearanceDescription(text, npcName) {
        const descPatterns = [
            new RegExp(`${npcName}[^.]*(?:was|is|appeared|stood)[^.]+\.`, 'gi'),
            new RegExp(`(?:The|A)\\s+\\w+\\s+(?:man|woman|figure|person)\\s+[^.]*${npcName}[^.]*\.`, 'gi')
        ];

        for (const pattern of descPatterns) {
            const match = text.match(pattern);
            if (match) {
                return match[0];
            }
        }

        return null;
    }

    extractPersonality(text) {
        const personality = {
            traits: [],
            rawObservations: []
        };

        for (const patterns of Object.values(this.personalityPatterns)) {
            for (const pattern of patterns) {
                const matches = text.match(pattern);
                if (matches) {
                    for (const match of matches) {
                        const trait = this.cleanPersonalityMatch(match);
                        if (trait && !personality.traits.includes(trait)) {
                            personality.traits.push(trait);
                        }
                    }
                }
            }
        }

        return personality;
    }

    cleanPersonalityMatch(match) {
        const traitWords = [
            'friendly',
            'hostile',
            'cold',
            'warm',
            'suspicious',
            'trusting',
            'nervous',
            'calm',
            'angry',
            'sad',
            'happy',
            'gruff',
            'cheerful',
            'stern',
            'kind',
            'cruel',
            'gentle',
            'harsh',
            'soft',
            'loud'
        ];

        const lower = match.toLowerCase();
        return traitWords.find((trait) => lower.includes(trait)) || null;
    }

    extractDialogue(text, npcName) {
        const dialoguePatterns = [
            new RegExp(
                `${npcName}\\s+(?:said|asked|replied|whispered|shouted|muttered|exclaimed)[,:]?\\s*"([^"]+)"`,
                'gi'
            ),
            new RegExp(`"([^"]+)"\\s*(?:said|asked|replied)\\s+${npcName}`, 'gi')
        ];

        const quotes = [];

        for (const pattern of dialoguePatterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                quotes.push({
                    text: match[1],
                    context: match[0]
                });
            }
        }

        return quotes;
    }

    extractConversationTopics(quotes) {
        const topics = new Set();
        const topicKeywords = {
            quest: ['quest', 'mission', 'task', 'job', 'favor'],
            danger: ['danger', 'warning', 'careful', 'beware', 'threat'],
            location: ['go to', 'find', 'north', 'south', 'east', 'west', 'forest', 'mountain', 'city'],
            personal: ['family', 'home', 'past', 'remember', 'years ago'],
            trade: ['buy', 'sell', 'gold', 'price', 'coin', 'trade'],
            combat: ['fight', 'kill', 'weapon', 'sword', 'attack', 'defend'],
            magic: ['magic', 'spell', 'enchant', 'curse', 'arcane'],
            romance: ['love', 'heart', 'beautiful', 'handsome', 'feel']
        };

        for (const quote of quotes) {
            const lower = quote.text.toLowerCase();
            for (const [topic, keywords] of Object.entries(topicKeywords)) {
                if (keywords.some((keyword) => lower.includes(keyword))) {
                    topics.add(topic);
                }
            }
        }

        return Array.from(topics);
    }

    inferRelationship(text) {
        const relationship = {
            type: 'neutral',
            disposition: 0,
            evidence: [],
            romanticInterest: 0
        };

        const lower = text.toLowerCase();
        const positivePatterns = [
            /smiled warmly/i,
            /greeted .* warmly/i,
            /friend/i,
            /helped/i,
            /saved/i,
            /grateful/i,
            /thank/i,
            /trust/i,
            /ally/i,
            /welcome/i
        ];

        const negativePatterns = [
            /glared/i,
            /enemy/i,
            /hostile/i,
            /threat/i,
            /attacked/i,
            /betrayed/i,
            /hate/i,
            /despise/i,
            /suspicious/i,
            /distrust/i
        ];

        const romanticPatterns = [
            /blushed/i,
            /beautiful/i,
            /handsome/i,
            /heart raced/i,
            /attracted/i,
            /love/i,
            /kissed/i,
            /embraced/i
        ];

        for (const pattern of positivePatterns) {
            if (pattern.test(lower)) {
                relationship.disposition += 15;
                relationship.evidence.push(pattern.source);
            }
        }

        for (const pattern of negativePatterns) {
            if (pattern.test(lower)) {
                relationship.disposition -= 15;
                relationship.evidence.push(pattern.source);
            }
        }

        for (const pattern of romanticPatterns) {
            if (pattern.test(lower)) {
                relationship.romanticInterest += 20;
                relationship.evidence.push(pattern.source);
            }
        }

        if (relationship.disposition >= 30) {
            relationship.type = relationship.romanticInterest > 30 ? 'romantic_interest' : 'friend';
        } else if (relationship.disposition <= -30) {
            relationship.type = 'enemy';
        }

        return relationship;
    }

    updateProfileFromMessage(npcId, messageText, messageIndex) {
        const npc = this.entityDatabase.getEntity('npc', npcId);
        if (!npc) return null;

        const updates = {};
        const appearanceUpdates = this.extractAppearance(messageText, npc.name);
        if (Object.keys(appearanceUpdates).length > 0) {
            updates.appearance = { ...npc.appearance, ...appearanceUpdates };

            const fullDesc = this.extractFullAppearanceDescription(messageText, npc.name);
            if (fullDesc) {
                updates.appearance.rawDescriptions = [
                    ...(npc.appearance?.rawDescriptions || []),
                    fullDesc
                ];
            }
        }

        const personalityUpdates = this.extractPersonality(messageText, npc.name);
        if (personalityUpdates.traits.length > 0) {
            const existingTraits = npc.personality?.traits || [];
            updates.personality = {
                ...npc.personality,
                traits: [...new Set([...existingTraits, ...personalityUpdates.traits])]
            };
        }

        const dialogue = this.extractDialogue(messageText, npc.name);
        if (dialogue.length > 0) {
            const topics = this.extractConversationTopics(dialogue);
            const conversation = {
                date: this.getCurrentDate(),
                location: npc.currentLocation,
                summary: topics.length > 0 ? `Discussed ${topics.join(', ')}` : 'General conversation',
                topics,
                importantQuotes: dialogue.map((dialogueItem) => dialogueItem.text).slice(0, 3)
            };

            updates.conversations = [...(npc.conversations || []), conversation];
        }

        const relationshipUpdates = this.inferRelationship(messageText, npc.name);
        if (relationshipUpdates.evidence.length > 0) {
            const currentDisp = npc.playerRelationship?.disposition || 0;
            updates.playerRelationship = {
                ...npc.playerRelationship,
                disposition: Math.max(-100, Math.min(100, currentDisp + relationshipUpdates.disposition)),
                type:
                    relationshipUpdates.type !== 'neutral'
                        ? relationshipUpdates.type
                        : npc.playerRelationship?.type,
                interactions: (npc.playerRelationship?.interactions || 0) + 1,
                romanticInterest: Math.max(
                    0,
                    Math.min(100, (npc.playerRelationship?.romanticInterest || 0) + relationshipUpdates.romanticInterest)
                )
            };
        }

        updates.meta = {
            ...npc.meta,
            updatedAt: Date.now(),
            sourceMessages: [...(npc.meta?.sourceMessages || []), messageIndex]
        };

        if (Object.keys(updates).length > 0) {
            return this.entityDatabase.updateEntity('npc', npcId, updates);
        }

        return npc;
    }

    generateProfileSummary(npc) {
        let summary = `[NPC: ${npc.name}]`;

        if (npc.title) summary += ` (${npc.title})`;
        summary += '\n';

        const appearance = [];
        if (npc.appearance?.height) appearance.push(npc.appearance.height);
        if (npc.appearance?.build) appearance.push(`${npc.appearance.build} build`);
        if (npc.appearance?.hairColor) appearance.push(`${npc.appearance.hairColor} hair`);
        if (npc.appearance?.eyeColor) appearance.push(`${npc.appearance.eyeColor} eyes`);
        if (appearance.length > 0) {
            summary += `Appearance: ${appearance.join(', ')}\n`;
        }

        if (npc.personality?.traits?.length > 0) {
            summary += `Personality: ${npc.personality.traits.join(', ')}\n`;
        }

        if (npc.playerRelationship?.type && npc.playerRelationship.type !== 'neutral') {
            summary += `Relationship: ${npc.playerRelationship.type} (${npc.playerRelationship.disposition})\n`;
        }

        if (npc.background?.occupation) {
            summary += `Occupation: ${npc.background.occupation}\n`;
        }

        if (npc.conversations?.length > 0) {
            const recent = npc.conversations.slice(-1)[0];
            if (recent.topics?.length > 0) {
                summary += `Recent topics: ${recent.topics.join(', ')}\n`;
            }
        }

        return summary;
    }

    generateDetailedProfile(npc) {
        let profile = `=== ${npc.name} ===\n`;
        if (npc.title) profile += `Title: ${npc.title}\n`;

        profile += '\n--- APPEARANCE ---\n';
        if (npc.race) profile += `Race: ${npc.race}\n`;
        if (npc.gender) profile += `Gender: ${npc.gender}\n`;
        if (npc.appearance?.height) profile += `Height: ${npc.appearance.height}\n`;
        if (npc.appearance?.build) profile += `Build: ${npc.appearance.build}\n`;
        if (npc.appearance?.hairColor || npc.appearance?.hairStyle) {
            profile += `Hair: ${[npc.appearance.hairColor, npc.appearance.hairStyle]
                .filter(Boolean)
                .join(', ')}\n`;
        }
        if (npc.appearance?.eyeColor) profile += `Eyes: ${npc.appearance.eyeColor}\n`;
        if (npc.appearance?.skinTone) profile += `Skin: ${npc.appearance.skinTone}\n`;
        if (npc.appearance?.scars?.length > 0) profile += `Scars: ${npc.appearance.scars.join('; ')}\n`;
        if (npc.appearance?.voiceDescription) profile += `Voice: ${npc.appearance.voiceDescription}\n`;
        if (npc.appearance?.mannerisms?.length > 0) {
            profile += `Mannerisms: ${npc.appearance.mannerisms.join('; ')}\n`;
        }

        profile += '\n--- PERSONALITY ---\n';
        if (npc.personality?.traits?.length > 0) profile += `Traits: ${npc.personality.traits.join(', ')}\n`;
        if (npc.personality?.demeanor) profile += `Demeanor: ${npc.personality.demeanor}\n`;
        if (npc.personality?.likes?.length > 0) profile += `Likes: ${npc.personality.likes.join(', ')}\n`;
        if (npc.personality?.dislikes?.length > 0) profile += `Dislikes: ${npc.personality.dislikes.join(', ')}\n`;

        profile += '\n--- BACKGROUND ---\n';
        if (npc.background?.occupation) profile += `Occupation: ${npc.background.occupation}\n`;
        if (npc.background?.affiliations?.length > 0) {
            profile += `Affiliations: ${npc.background.affiliations.join(', ')}\n`;
        }
        if (npc.background?.hometown) profile += `From: ${npc.background.hometown}\n`;

        profile += '\n--- RELATIONSHIP ---\n';
        profile += `Status: ${npc.playerRelationship?.type || 'Unknown'}\n`;
        profile += `Disposition: ${npc.playerRelationship?.disposition || 0}/100\n`;
        profile += `Times Met: ${npc.playerRelationship?.interactions || 0}\n`;
        if (npc.playerRelationship?.firstMet?.location) {
            profile += `First Met: ${npc.playerRelationship.firstMet.location}\n`;
        }

        if (npc.conversations?.length > 0) {
            profile += '\n--- CONVERSATION HISTORY ---\n';
            for (const conv of npc.conversations.slice(-3)) {
                profile += `- Topics: ${conv.topics?.join(', ') || 'general'}\n`;
                if (conv.importantQuotes?.length > 0) {
                    profile += `  Quote: "${conv.importantQuotes[0]}"\n`;
                }
            }
        }

        return profile;
    }

    getNPCsByRelationshipType(type) {
        const npcs = this.entityDatabase.getAllEntities('npc');
        return npcs.filter((npc) => npc.playerRelationship?.type === type);
    }

    getNPCsByDisposition(minDisp, maxDisp = 100) {
        const npcs = this.entityDatabase.getAllEntities('npc');
        return npcs.filter((npc) => {
            const disp = npc.playerRelationship?.disposition || 0;
            return disp >= minDisp && disp <= maxDisp;
        });
    }

    getNPCsByTrait(trait) {
        const npcs = this.entityDatabase.getAllEntities('npc');
        return npcs.filter((npc) => npc.personality?.traits?.includes(trait.toLowerCase()));
    }

    getRelatedNPCs(npcId) {
        const npc = this.entityDatabase.getEntity('npc', npcId);
        if (!npc?.npcRelationships) return [];

        return Object.entries(npc.npcRelationships)
            .map(([id, rel]) => ({
                npc: this.entityDatabase.getEntity('npc', id),
                relationship: rel
            }))
            .filter((rel) => rel.npc);
    }

    getCurrentDate() {
        if (window.ValdrisWorldSim?.time) {
            return window.ValdrisWorldSim.time.getCurrentDateString();
        }
        return new Date().toISOString();
    }
}
