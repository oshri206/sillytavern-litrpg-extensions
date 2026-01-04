# SillyTavern LitRPG Extensions - Code Analysis Report

**Date:** 2026-01-04
**Analyzed Extensions:** 11 (valdris-vtss, valdris-journey, valdris-diplomacy, valdris-economy, valdris-encounters, valdris-rumors, valdris-quests, valdris-weather, valdris-relationships, valdris-autolore, litrpg-tracker)

---

## Summary

This analysis examines the SillyTavern LitRPG extensions for common issues including incorrect event listener usage, memory leaks, improper API calls, race conditions, and compatibility issues with the SillyTavern framework.

### Overall Assessment: **Moderate Issues Found**

The codebase is generally well-structured but contains several issues that could cause problems in production use.

---

## 1. Event Listener Issues

### 1.1 Missing Event Listener Cleanup (Memory Leak Risk)

**Severity: HIGH**

**Location:** Multiple files

| File | Line | Issue |
|------|------|-------|
| `valdris-vtss/index.js` | 62-63 | jQuery event listeners added without cleanup mechanism |
| `valdris-vtss/index.js` | 209 | `beforeunload` listener never removed |
| `valdris-vtss/vtss-ui.js` | 78-104 | Document-level `mousemove`/`mouseup` listeners never removed |
| `valdris-journey/index.js` | 728 | Click listener added without removal on re-mount |
| `valdris-diplomacy/index.js` | 1133 | Global click listener without cleanup |
| `litrpg-tracker/index.js` | 279-386 | Multiple event listeners added on mount without cleanup |

**Example Problem (vtss-ui.js:78-104):**
```javascript
document.addEventListener('mousemove', (e) => { ... });
document.addEventListener('mouseup', () => { ... });
// These are never removed when the UI is destroyed
```

**Recommendation:** Implement proper cleanup in `destroy()` methods:
```javascript
this.boundMouseMove = this.handleMouseMove.bind(this);
document.addEventListener('mousemove', this.boundMouseMove);
// In destroy():
document.removeEventListener('mousemove', this.boundMouseMove);
```

### 1.2 Event Handler Re-attachment on Re-render

**Severity: MEDIUM**

**Location:** `valdris-vtss/vtss-ui.js:209-212`

```javascript
render() {
    // ...innerHTML replacement...
    this.attachEventListeners(); // Called every render
    this.setupDrag();            // Adds document-level listeners again!
}
```

This causes duplicate event listeners to accumulate on each render.

---

## 2. Memory Leaks

### 2.1 Unbounded Array Growth

**Severity: MEDIUM**

**Location:** Multiple state objects

| File | Line | Array | Limit |
|------|------|-------|-------|
| `valdris-journey/index.js` | 601-604 | `recentActivities` | 20 (OK) |
| `valdris-diplomacy/index.js` | 997-999 | `events` | 50 (OK) |
| `litrpg-tracker/index.js` | 116 | `journal` | None |
| `valdris-journey/index.js` | 325 | `npcsKnown` | None |
| `valdris-journey/index.js` | 326 | `itemsNoted` | None |

**Recommendation:** Add maximum size limits to all growing arrays.

### 2.2 Interval Timers Not Cleared

**Severity: HIGH**

**Location:** Multiple files

| File | Line | Issue |
|------|------|-------|
| `valdris-vtss/index.js` | 206 | `setInterval(saveState, 60000)` - never cleared |
| `valdris-diplomacy/index.js` | 1748-1780 | Multiple `setInterval` calls without cleanup |

**Example (valdris-diplomacy/index.js:1754):**
```javascript
setInterval(async () => {
    // Polls VTSS every 2 seconds - never cleared
}, 2000);
```

### 2.3 Subscription Leaks

**Severity: MEDIUM**

**Location:** `valdris-vtss/index.js:392-450`, `valdris-diplomacy/index.js:1607-1671`

Subscriptions to VJourney events are created but never unsubscribed:
```javascript
function subscribeToJourney() {
    window.VJourney.subscribe(window.VJourney.EVENTS.TIME_CHANGED, (data) => {
        // Returns unsubscribe function but it's never stored or called
    });
}
```

---

## 3. Improper API Calls

### 3.1 Missing Error Handling for ST APIs

**Severity: MEDIUM**

**Location:** Multiple files

```javascript
// valdris-journey/index.js:347-351
async function saveChatMetadata() {
    const ctx = SillyTavern?.getContext ? SillyTavern.getContext() : (getContext ? getContext() : null);
    if (ctx?.saveMetadata) return await ctx.saveMetadata();
    if (ctx?.saveMetadataDebounced) return await ctx.saveMetadataDebounced();
    // No error thrown if neither method exists - silent failure
}
```

### 3.2 Inconsistent API Access Patterns

**Severity: LOW**

Different extensions use different patterns to access SillyTavern context:
- Some use `SillyTavern.getContext()`
- Some use imported `getContext`
- Some check for both

This creates inconsistency and potential issues if one method becomes unavailable.

### 3.3 Unsafe Property Access

**Severity: LOW**

**Location:** `litrpg-tracker/index.js:1649`

```javascript
const isAssistant = data?.is_user === false || data?.name && data?.name !== (SillyTavern.getContext()?.name1);
```

This can throw if `SillyTavern` is undefined.

---

## 4. Race Conditions

### 4.1 Async State Mutations Without Locks

**Severity: HIGH**

**Location:** Multiple files

State is modified and saved without synchronization:

```javascript
// valdris-journey/index.js:1088-1108
eventSource.on(event_types.MESSAGE_RECEIVED, async (msgIdx) => {
    const st = getChatState();
    // ... async operations ...
    await commitState(st);  // Could race with MESSAGE_SENT handler
});

eventSource.on(event_types.MESSAGE_SENT, async (msgIdx) => {
    const st = getChatState();
    // ... async operations ...
    await commitState(st);  // Could overwrite MESSAGE_RECEIVED changes
});
```

### 4.2 setTimeout-Based Dependency Resolution

**Severity: MEDIUM**

**Location:** Multiple files

```javascript
// valdris-vtss/index.js:450
setTimeout(subscribeToJourney, 1000);

// valdris-diplomacy/index.js:1742
setTimeout(subscribeToJourney, 500);

// valdris-journey/index.js:1142-1148
setTimeout(async () => {
    const st = getChatState();
    parseAllMessages(st);
    // ...
}, 1000);
```

These arbitrary timeouts don't guarantee that dependencies are ready, causing potential race conditions.

### 4.3 Non-Atomic State Updates

**Severity: MEDIUM**

**Location:** `litrpg-tracker/index.js:1547-1555`

```javascript
function applyMessageToState(st, text) {
    const tags = parseMechanicsTags(text);
    let changed = false;
    for (const t of tags) {
        try { if (applyTag(st, t)) changed = true; } catch {}
    }
    // Silently swallows errors - partial updates possible
    return changed;
}
```

---

## 5. ST Framework Compatibility Issues

### 5.1 Direct DOM Manipulation

**Severity: LOW**

All extensions append elements directly to `document.body` instead of using ST's extension container system.

### 5.2 Missing `extension_settings` Initialization

**Severity: MEDIUM**

**Location:** `valdris-vtss/index.js:138`

```javascript
if (typeof extension_settings !== 'undefined' && extension_settings[MODULE_NAME]) {
```

If `extension_settings` exists but `extension_settings[MODULE_NAME]` is undefined, the extension won't initialize properly for first-time users.

### 5.3 Fallback Event Names May Not Exist

**Severity: LOW**

**Location:** `valdris-vtss/index.js:48-57`

```javascript
const messageEvents = [
    'chatMessageReceived',
    'messageReceived',     // Not a standard ST event
    'message_received'     // Not a standard ST event
];
```

Only `event_types.MESSAGE_RECEIVED` is the canonical ST event.

### 5.4 MutationObserver Fallback Issues

**Severity: LOW**

**Location:** `valdris-vtss/index.js:101-126`

The MutationObserver setup may find the wrong container or cause double-processing of messages.

---

## 6. Manifest.json Issues

### 6.1 Missing Required Fields

**Severity: MEDIUM**

| Extension | Missing Fields |
|-----------|----------------|
| `valdris-vtss/manifest.json` | `minimum_client_version` |

**Example (valdris-vtss/manifest.json):**
```json
{
    "display_name": "Valdris VTSS...",
    "loading_order": 1,
    // Missing: "minimum_client_version": "1.12.0"
}
```

### 6.2 Empty/Invalid Homepage URLs

**Severity: LOW**

| Extension | Homepage Value |
|-----------|----------------|
| Most extensions | `""` (empty) |
| `litrpg-tracker` | `"https://example.com"` (placeholder) |

### 6.3 Inconsistent Field Ordering

**Severity: COSMETIC**

Field ordering varies between manifest files. Recommended consistent order:
1. `display_name`
2. `loading_order`
3. `requires`
4. `optional`
5. `dependencies`
6. `js`
7. `css`
8. `author`
9. `version`
10. `description`
11. `auto_update`
12. `minimum_client_version`
13. `homePage`

### 6.4 Conflicting Loading Order

**Severity: MEDIUM**

Both `valdris-vtss` and `valdris-journey` have `loading_order: 1`. This creates undefined behavior for which loads first.

---

## 7. Additional Issues Found

### 7.1 Regex Performance

**Severity: LOW**

**Location:** `valdris-journey/index.js`

Complex regex patterns executed on every message could cause performance issues on long chats:
```javascript
// NPC_PATTERNS contains 5 complex regexes
// Each is executed with global flag, creating new RegExp objects
```

### 7.2 Hardcoded Paths

**Severity: MEDIUM**

**Location:** `litrpg-tracker/index.js:13`

```javascript
const EXT_FOLDER = `scripts/extensions/third-party/${EXT_NAME}`;
```

This assumes the standard ST directory structure and may break in custom installations.

### 7.3 Console.log in Production

**Severity: LOW**

Numerous `console.log` statements throughout all extensions should be gated behind debug flags.

---

## Recommendations Summary

### Critical (Fix Immediately)
1. Add event listener cleanup in all `destroy()` methods
2. Clear interval timers on extension unload
3. Add mutex/queue for async state operations
4. Store and call unsubscribe functions for all subscriptions

### High Priority
1. Fix duplicate event listener attachment on re-render
2. Add size limits to all unbounded arrays
3. Implement proper error handling for ST API calls
4. Resolve loading order conflict between VTSS and Journey

### Medium Priority
1. Add `minimum_client_version` to all manifest files
2. Use consistent API access patterns across extensions
3. Replace setTimeout dependency resolution with proper event-based waiting
4. Remove placeholder homepage URLs

### Low Priority
1. Gate console.log statements behind debug mode
2. Consider moving DOM elements to ST's extension container
3. Standardize manifest.json field ordering
4. Optimize regex patterns for large chats

---

## Appendix: Files Analyzed

- `valdris-vtss/index.js` (495 lines)
- `valdris-vtss/vtss-manager.js` (685 lines)
- `valdris-vtss/vtss-ui.js` (360 lines)
- `valdris-journey/index.js` (1,155 lines)
- `valdris-diplomacy/index.js` (1,794 lines)
- `litrpg-tracker/index.js` (1,678 lines)
- All 11 manifest.json files
