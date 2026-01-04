/**
 * VALDRIS TEMPORAL-SPATIAL STATE SYSTEM
 * Floating Draggable UI Panel
 * 
 * Always-visible panel that can be dragged anywhere on screen
 */

import { vtssManager } from './vtss-manager.js';
import { ValdrisCalendar } from './vtss-calendar.js';

export class VTSSUI {
    constructor(manager) {
        this.manager = manager || vtssManager;
        this.container = null;
        this.isExpanded = true;
        this.isMinimized = false;
        
        // Drag state
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.position = { x: null, y: null };
    }

    // ═══════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    init() {
        this.createContainer();
        this.render();
        this.attachEventListeners();
        this.setupDrag();
        this.loadPosition();
        this.subscribeToChanges();
        console.log('[VTSS] Floating panel initialized');
        return this;
    }

    createContainer() {
        // Remove existing
        const existing = document.getElementById('vtss-panel');
        if (existing) existing.remove();

        this.container = document.createElement('div');
        this.container.id = 'vtss-panel';
        this.container.className = 'vtss-panel vtss-floating';
        
        // Always append to body for floating
        document.body.appendChild(this.container);
    }

    // ═══════════════════════════════════════════════════════════════
    // DRAG FUNCTIONALITY
    // ═══════════════════════════════════════════════════════════════

    setupDrag() {
        const header = this.container.querySelector('.vtss-header');
        if (!header) return;
        
        header.style.cursor = 'grab';
        
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            
            this.isDragging = true;
            header.style.cursor = 'grabbing';
            this.container.classList.add('vtss-dragging');
            
            const rect = this.container.getBoundingClientRect();
            this.dragOffset = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const x = e.clientX - this.dragOffset.x;
            const y = e.clientY - this.dragOffset.y;
            
            // Clamp to viewport
            const maxX = window.innerWidth - this.container.offsetWidth;
            const maxY = window.innerHeight - this.container.offsetHeight;
            
            this.position.x = Math.max(0, Math.min(x, maxX));
            this.position.y = Math.max(0, Math.min(y, maxY));
            
            this.container.style.left = this.position.x + 'px';
            this.container.style.top = this.position.y + 'px';
            this.container.style.right = 'auto';
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                const header = this.container.querySelector('.vtss-header');
                if (header) header.style.cursor = 'grab';
                this.container.classList.remove('vtss-dragging');
                this.savePosition();
            }
        });
    }

    savePosition() {
        try {
            localStorage.setItem('vtss-panel-position', JSON.stringify(this.position));
            localStorage.setItem('vtss-panel-expanded', JSON.stringify(this.isExpanded));
            localStorage.setItem('vtss-panel-minimized', JSON.stringify(this.isMinimized));
        } catch (e) { /* localStorage unavailable */ }
    }

    loadPosition() {
        try {
            const pos = localStorage.getItem('vtss-panel-position');
            if (pos) {
                this.position = JSON.parse(pos);
                if (this.position.x !== null) {
                    this.container.style.left = this.position.x + 'px';
                    this.container.style.top = this.position.y + 'px';
                    this.container.style.right = 'auto';
                }
            }
            
            const expanded = localStorage.getItem('vtss-panel-expanded');
            if (expanded !== null) this.isExpanded = JSON.parse(expanded);
            
            const minimized = localStorage.getItem('vtss-panel-minimized');
            if (minimized !== null) this.isMinimized = JSON.parse(minimized);
            
            this.updateExpandedState();
        } catch (e) { /* use defaults */ }
    }

    // ═══════════════════════════════════════════════════════════════
    // RENDERING
    // ═══════════════════════════════════════════════════════════════

    render() {
        const state = this.manager.getState();
        
        this.container.innerHTML = `
            <div class="vtss-header">
                <div class="vtss-header-left">
                    <span class="vtss-icon">🌍</span>
                    <span class="vtss-title">Valdris</span>
                </div>
                <div class="vtss-header-controls">
                    <button class="vtss-btn vtss-btn-minimize" title="Minimize">_</button>
                    <button class="vtss-btn vtss-btn-collapse" title="Collapse">${this.isExpanded ? '▼' : '▶'}</button>
                </div>
            </div>
            
            <div class="vtss-body ${this.isExpanded ? '' : 'collapsed'} ${this.isMinimized ? 'minimized' : ''}">
                <!-- TIME -->
                <div class="vtss-section">
                    <div class="vtss-date-main">${state.time.formattedDate || this.formatDate(state)}</div>
                    <div class="vtss-time-clock">${this.formatClock(state.time.hour, state.time.minute)}</div>
                    <div class="vtss-date-sub">
                        ${state.time.octaveDay?.name || 'Unknown'} • ${this.capitalize(state.time.timeOfDay || 'midday')}
                    </div>
                    <div class="vtss-detail-row">
                        <span class="vtss-season-badge vtss-season-${state.time.season}">${this.capitalize(state.time.season)}</span>
                        <span class="vtss-days-passed">${state.time.totalDaysPassed} days passed</span>
                    </div>
                </div>
                
                <!-- MOONS -->
                <div class="vtss-section vtss-moons">
                    <div class="vtss-moon">
                        <span class="vtss-moon-icon">${this.getMoonIcon(state.time.moonSolara?.phase)}</span>
                        <span class="vtss-moon-label">Solara: ${this.capitalize(state.time.moonSolara?.phase || 'unknown')}</span>
                    </div>
                    <div class="vtss-moon">
                        <span class="vtss-moon-icon">${this.getMoonIcon(state.time.moonNyxara?.phase)}</span>
                        <span class="vtss-moon-label">Nyxara: ${this.capitalize(state.time.moonNyxara?.phase || 'unknown')}</span>
                    </div>
                    ${state.time.moonAlignment ? `<div class="vtss-moon-alignment">✨ ${this.getAlignmentName(state.time.moonAlignment)}</div>` : ''}
                </div>
                
                <!-- LOCATION -->
                <div class="vtss-section vtss-location">
                    <div class="vtss-location-icon">📍</div>
                    <div class="vtss-location-text">
                        <div class="vtss-location-main">${state.location.specificLocation || state.location.settlement || 'Unknown'}</div>
                        ${state.location.nation ? `<div class="vtss-location-nation">${state.location.nation}</div>` : ''}
                    </div>
                </div>
                
                <!-- ENVIRONMENT -->
                <div class="vtss-section vtss-env">
                    <span class="vtss-env-item">${this.getWeatherIcon(state.environment.weather)} ${this.capitalize(state.environment.weather)}</span>
                    <span class="vtss-env-item">🌡️ ${this.capitalize(state.environment.temperature)}</span>
                    <span class="vtss-env-item">✨ ${this.capitalize(state.environment.magicDensity)} magic</span>
                </div>
                
                <!-- QUICK CONTROLS -->
                <div class="vtss-controls">
                    <button class="vtss-ctrl-btn" data-action="hour">+1h</button>
                    <button class="vtss-ctrl-btn" data-action="day">+1d</button>
                    <button class="vtss-ctrl-btn" data-action="octave">+8d</button>
                    <button class="vtss-ctrl-btn" data-action="undo">↩</button>
                </div>
            </div>
        `;
        
        // Re-attach events after render
        this.attachEventListeners();
        this.setupDrag();
    }

    formatDate(state) {
        return ValdrisCalendar.formatDate(
            state.time.day,
            state.time.month,
            state.time.year,
            'full'
        );
    }

    formatClock(hour, minute) {
        const h = hour || 0;
        const m = minute || 0;
        const hourStr = h.toString().padStart(2, '0');
        const minStr = m.toString().padStart(2, '0');
        return `${hourStr}:${minStr}`;
    }

    // ═══════════════════════════════════════════════════════════════
    // EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════════

    attachEventListeners() {
        // Collapse button
        const collapseBtn = this.container.querySelector('.vtss-btn-collapse');
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => this.toggleExpanded());
        }
        
        // Minimize button
        const minimizeBtn = this.container.querySelector('.vtss-btn-minimize');
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', () => this.toggleMinimized());
        }
        
        // Control buttons
        this.container.querySelectorAll('.vtss-ctrl-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.handleControlAction(action);
            });
        });
    }

    handleControlAction(action) {
        switch (action) {
            case 'hour':
                this.manager.applyTimeSkip(1, 'hour');
                break;
            case 'day':
                this.manager.applyTimeSkip(1, 'day');
                break;
            case 'octave':
                this.manager.applyTimeSkip(8, 'day');
                break;
            case 'undo':
                this.manager.undo();
                break;
        }
        this.render();
    }

    toggleExpanded() {
        this.isExpanded = !this.isExpanded;
        this.updateExpandedState();
        this.savePosition();
    }

    toggleMinimized() {
        this.isMinimized = !this.isMinimized;
        this.updateExpandedState();
        this.savePosition();
    }

    updateExpandedState() {
        const body = this.container.querySelector('.vtss-body');
        const btn = this.container.querySelector('.vtss-btn-collapse');
        
        if (body) {
            body.classList.toggle('collapsed', !this.isExpanded);
            body.classList.toggle('minimized', this.isMinimized);
        }
        if (btn) {
            btn.textContent = this.isExpanded ? '▼' : '▶';
        }
    }

    subscribeToChanges() {
        this.manager.subscribe('vtss-ui', () => {
            this.render();
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════

    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    getMoonIcon(phase) {
        const icons = {
            'new': '🌑',
            'waxing crescent': '🌒',
            'first quarter': '🌓',
            'waxing gibbous': '🌔',
            'full': '🌕',
            'waning gibbous': '🌖',
            'last quarter': '🌗',
            'waning crescent': '🌘'
        };
        return icons[phase] || '🌑';
    }

    getWeatherIcon(weather) {
        const icons = {
            'clear': '☀️',
            'cloudy': '☁️',
            'overcast': '🌥️',
            'rain': '🌧️',
            'storm': '⛈️',
            'snow': '🌨️',
            'blizzard': '❄️',
            'fog': '🌫️',
            'magical': '✨'
        };
        return icons[weather] || '🌤️';
    }

    getAlignmentName(alignments) {
        if (alignments.includes('dualFull')) return 'The Convergence';
        if (alignments.includes('dualNew')) return 'The Void Night';
        return 'Alignment';
    }

    destroy() {
        if (this.container) {
            this.container.remove();
        }
    }
}

// Singleton export
export const vtssUI = new VTSSUI();
export default vtssUI;
