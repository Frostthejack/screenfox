import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

// ── Settings (persisted to localStorage) ─────────────────────────────────────

interface Settings {
    petSize: 'small' | 'medium' | 'large';
    moveSpeed: 'slow' | 'medium' | 'fast';
    followDist: 'close' | 'medium' | 'far';
    soundEffects: boolean;
    volume: number; // 0.0 to 1.0
}

function applySettings(s: Settings): void {
    const fox = document.getElementById('fox');
    if (fox) {
        const sizeMap = { small: 80, medium: 128, large: 176 };
        const px = sizeMap[s.petSize];
        fox.setAttribute('width', String(px));
        fox.setAttribute('height', String(px));
    }
}

// ── Pet State Machine ──────────────────────────────────────────────────────

enum PetState {
  IDLE = 'IDLE',
  WALKING = 'WALKING',
  SLEEPING = 'SLEEPING',
  PLAYING = 'PLAYING',
}

class PetStateMachine {
  private state: PetState = PetState.IDLE;
  private lastInteraction = performance.now();
  private idleSince = performance.now();
  private readonly idleToWalkDelay = 5000;    // 5s
  private readonly idleToSleepDelay = 10000;  // 10s
  private readonly mouseProximity = 200;       // px distance to trigger PLAYING
  private mouseX = 0;
  private mouseY = 0;
  private petX = 0;
  private petY = 0;
  private raf: number | null = null;
  private onStateChange: ((oldState: PetState, newState: PetState) => void) | null = null;

  constructor(
    private getCurrentX: () => number,
    private getCurrentY: () => number,
  ) {}

  setOnStateChange(cb: (oldState: PetState, newState: PetState) => void) {
    this.onStateChange = cb;
  }

  getState(): PetState {
    return this.state;
  }

  private transition(newState: PetState) {
    if (newState === this.state) return;
    const old = this.state;
    this.state = newState;
    console.log(`State: ${old} → ${newState}`);
    if (this.onStateChange) this.onStateChange(old, newState);
  }

  onMouseNear(x: number, y: number) {
    this.mouseX = x;
    this.mouseY = y;
    this.lastInteraction = performance.now();
    if (this.state === PetState.SLEEPING) {
      this.transition(PetState.PLAYING);
    } else if (this.state !== PetState.PLAYING) {
      this.transition(PetState.PLAYING);
    }
  }

  onMouseLeave() {
    if (this.state === PetState.PLAYING) {
      this.transition(PetState.IDLE);
      this.idleSince = performance.now();
    }
  }

  onInteraction() {
    this.lastInteraction = performance.now();
    if (this.state === PetState.SLEEPING) {
      this.transition(PetState.IDLE);
      this.idleSince = performance.now();
    }
  }

  onReachTarget() {
    if (this.state === PetState.WALKING) {
      this.transition(PetState.IDLE);
      this.idleSince = performance.now();
    }
  }

  update() {
    const now = performance.now();
    const x = this.getCurrentX();
    const y = this.getCurrentY();
    this.petX = x;
    this.petY = y;

    // Check mouse proximity for PLAYING state
    const dx = this.mouseX - x;
    const dy = this.mouseY - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.mouseProximity && this.state !== PetState.SLEEPING) {
      if (this.state !== PetState.PLAYING) {
        this.transition(PetState.PLAYING);
      }
    } else if (this.state === PetState.PLAYING) {
      this.transition(PetState.IDLE);
      this.idleSince = now;
    }

    // IDLE transitions
    if (this.state === PetState.IDLE) {
      const idleTime = now - this.idleSince;
      if (idleTime > this.idleToSleepDelay) {
        this.transition(PetState.SLEEPING);
      } else if (idleTime > this.idleToWalkDelay) {
        this.transition(PetState.WALKING);
      }
    }
  }

  destroy() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
  }
}

// ── Sound Effects (Web Audio API) ──────────────────────────────────────────

type SoundType = 'pickup' | 'drop' | 'click' | 'step' | 'happy' | 'sleep';

class SoundManager {
  private ctx: AudioContext | null = null;
  private initialized = false;
  private enabled = true;
  private volume = 0.7; // default volume 0.0-1.0

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.initialized = true;
    } catch (e) {
      console.warn('Web Audio API not available:', e);
    }
  }

  setEnabled(e: boolean) { this.enabled = e; }
  isEnabled() { return this.enabled; }
  setVolume(v: number) { this.volume = Math.max(0, Math.min(1, v)); }
  getVolume() { return this.volume; }

  private ensureCtx(): AudioContext | null {
    if (!this.ctx) this.init();
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  play(type: SoundType) {
    if (!this.enabled) return;
    const ctx = this.ensureCtx();
    if (!ctx) return;

    switch (type) {
      case 'pickup': this.playPickup(ctx); break;
      case 'drop': this.playDrop(ctx); break;
      case 'click': this.playClick(ctx); break;
      case 'step': this.playStep(ctx); break;
      case 'happy': this.playHappy(ctx); break;
      case 'sleep': this.playSleep(ctx); break;
    }
  }

  /// Short ascending chirp
  private playPickup(ctx: AudioContext) {
    const vol = this.volume;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }

  /// Soft thud — descending tone
  private playDrop(ctx: AudioContext) {
    const vol = this.volume;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.18 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  /// Quick click tick
  private playClick(ctx: AudioContext) {
    const vol = this.volume;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1000, ctx.currentTime);
    gain.gain.setValueAtTime(0.06 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.03);
  }

  /// Soft footstep — filtered noise burst
  private playStep(ctx: AudioContext) {
    const vol = this.volume;
    const bufferSize = ctx.sampleRate * 0.06;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.04 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start(ctx.currentTime);
  }

  /// Happy bounce — two quick ascending notes
  private playHappy(ctx: AudioContext) {
    const vol = this.volume;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = ctx.currentTime + i * 0.08;
      osc.frequency.setValueAtTime(500 + i * 200, t);
      osc.frequency.exponentialRampToValueAtTime(700 + i * 150, t + 0.06);
      gain.gain.setValueAtTime(0.08 * vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  /// Sleep sound — soft low tone with slow decay
  private playSleep(ctx: AudioContext) {
    const vol = this.volume;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, ctx.currentTime);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, ctx.currentTime);
    gain.gain.setValueAtTime(0.1 * vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.6);
  }
}

// Initialize sound manager on first user interaction (browser autoplay policy)
let _soundManager: SoundManager | null = null;
function getSoundManager(): SoundManager {
  if (!_soundManager) {
    _soundManager = new SoundManager();
  }
  return _soundManager;
}

document.addEventListener('mousedown', () => {
  getSoundManager().init();
}, { once: true });

document.addEventListener('keydown', () => {
  getSoundManager().init();
}, { once: true });

(window as any).__SOUND_MANAGER__ = getSoundManager();

// ── Multi-Monitor Support ─────────────────────────────────────────────────

interface MonitorInfo {
  name: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  scale_factor: number;
}

interface MonitorBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

class MultiMonitorManager {
  private monitors: MonitorInfo[] = [];
  private currentMonitorIdx = 0;
  private dpiScale = 1.0;
  private lastRefresh = 0;
  private readonly refreshCooldown = 1000; // ms between monitor refreshes

  constructor() {
    this.detectMonitors();
  }

  private async detectMonitors() {
    try {
      const monitors = await invoke<MonitorInfo[]>('list_monitors');
      this.monitors = monitors;
      // Use DPI scale from the current monitor (more accurate than window.devicePixelRatio)
      const current = this.getCurrentMonitor();
      this.dpiScale = current?.scale_factor ?? (window.devicePixelRatio || 1.0);
      console.log('Monitors detected:', this.monitors.length, 'DPI scale:', this.dpiScale, this.monitors);
    } catch (e) {
      console.warn('Tauri list_monitors failed, using window.screen fallback:', e);
      this.dpiScale = window.devicePixelRatio || 1.0;
      this.monitors = [{
        name: 'Primary',
        position_x: (window.screen as any).availLeft || 0,
        position_y: (window.screen as any).availTop || 0,
        width: window.screen.width,
        height: window.screen.height,
        scale_factor: this.dpiScale,
      }];
    }
  }

  /// Refresh monitor list (call on display change or periodically)
  async refresh() {
    const now = performance.now();
    if (now - this.lastRefresh < this.refreshCooldown) return;
    this.lastRefresh = now;
    await this.detectMonitors();
  }

  /// Set the current monitor index (fox stays on this monitor)
  setCurrentMonitor(idx: number) {
    if (idx >= 0 && idx < this.monitors.length) {
      this.currentMonitorIdx = idx;
    }
  }

  /// Get the current monitor the fox is on
  getCurrentMonitor(): MonitorInfo | null {
    return this.monitors[this.currentMonitorIdx] ?? this.monitors[0] ?? null;
  }

  /// Determine which monitor a position is on and update current
  updateCurrentMonitor(x: number, y: number) {
    for (let i = 0; i < this.monitors.length; i++) {
      const m = this.monitors[i];
      if (x >= m.position_x && x < m.position_x + m.width &&
          y >= m.position_y && y < m.position_y + m.height) {
        if (i !== this.currentMonitorIdx) {
          console.log(`Monitor changed: ${this.monitors[this.currentMonitorIdx]?.name} → ${m.name}`);
          this.currentMonitorIdx = i;
        }
        return;
      }
    }
  }

  /// Get the virtual desktop bounds (all monitors combined)
  getBounds(): MonitorBounds {
    if (this.monitors.length === 0) {
      return { minX: 0, minY: 0, maxX: window.screen.width, maxY: window.screen.height };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of this.monitors) {
      minX = Math.min(minX, m.position_x);
      minY = Math.min(minY, m.position_y);
      maxX = Math.max(maxX, m.position_x + m.width);
      maxY = Math.max(maxY, m.position_y + m.height);
    }
    return { minX, minY, maxX, maxY };
  }

  /// Get bounds of the current monitor (DPI-adjusted)
  getCurrentMonitorBounds(): MonitorBounds {
    const m = this.getCurrentMonitor();
    if (!m) return this.getBounds();
    // DPI scale the dimensions
    const w = Math.round(m.width / this.dpiScale);
    const h = Math.round(m.height / this.dpiScale);
    return {
      minX: m.position_x,
      minY: m.position_y,
      maxX: m.position_x + w,
      maxY: m.position_y + h,
    };
  }

  /// Clamp a position to within the current monitor
  clampToCurrentMonitor(x: number, y: number, margin: number = 50, petSize: number = 128): { x: number; y: number } {
    const bounds = this.getCurrentMonitorBounds();
    return {
      x: Math.max(bounds.minX + margin, Math.min(bounds.maxX - margin - petSize, x)),
      y: Math.max(bounds.minY + margin, Math.min(bounds.maxY - margin - petSize, y)),
    };
  }

  /// Get a random position on the current monitor
  getRandomPositionOnCurrentMonitor(margin: number = 50, petSize: number = 128): { x: number; y: number } {
    const bounds = this.getCurrentMonitorBounds();
    const effectiveW = Math.max(0, bounds.maxX - bounds.minX - margin * 2 - petSize);
    const effectiveH = Math.max(0, bounds.maxY - bounds.minY - margin * 2 - petSize);
    return {
      x: bounds.minX + margin + Math.random() * effectiveW,
      y: bounds.minY + margin + Math.random() * effectiveH,
    };
  }

  /// Get a random position across all monitors (legacy)
  getRandomPosition(margin: number = 50): { x: number; y: number } {
    const bounds = this.getBounds();
    return {
      x: bounds.minX + margin + Math.random() * Math.max(0, bounds.maxX - bounds.minX - margin * 2 - 200),
      y: bounds.minY + margin + Math.random() * Math.max(0, bounds.maxY - bounds.minY - margin * 2 - 200),
    };
  }

  getDpiScale(): number {
    return this.dpiScale;
  }
}

let _monitorManager: MultiMonitorManager | null = null;
function getMonitorManager(): MultiMonitorManager {
  if (!_monitorManager) _monitorManager = new MultiMonitorManager();
  return _monitorManager;
}

(window as any).__MONITOR_MANAGER__ = getMonitorManager();

// ── WanderingAI (optimized) ───────────────────────────────────────────────

class WanderingAI {
  private window = getCurrentWindow();
  private dragged = false;
  private targetX = 0;
  private targetY = 0;
  private currentX = 0;
  private currentY = 0;
  private speed = 120; // px per second
  private lastChange = 0;
  private changeInterval = 0;
  private readonly margin = 50;
  private raf: number | null = null;
  private prevTimestamp: number | null = null;
  private followMouse = false;
  private mouseX = 0;
  private mouseY = 0;
  private lerpFactor = 0.05;
  private minFollowDistance = 30;

  private stateMachine: PetStateMachine;

  // ── Cached DOM references (avoid per-frame getElementById) ─────────────
  private _fox: HTMLElement | null = null;
  private _container: HTMLElement | null = null;
  private _cachedPetSize = 128;

  // ── Frame rate control for idle states ────────────────────────────────
  private idleFrameInterval = 0;       // ms between frames when idle
  private lastFrameTime = 0;           // timestamp of last rendered frame
  private readonly ACTIVE_FPS = 60;    // target FPS when active
  private readonly IDLE_FPS = 10;      // target FPS when idle
  private readonly SLEEP_FPS = 2;      // target FPS when sleeping
  private readonly ACTIVE_INTERVAL = 1000 / 60;  // ~16.7ms
  private readonly IDLE_INTERVAL = 1000 / 10;    // 100ms
  private readonly SLEEP_INTERVAL = 1000 / 2;    // 500ms

  // ── Batched style changes ─────────────────────────────────────────────
  private _pendingTransform: string | null = null;
  private _pendingDirection: number | null = null;
  private _dirtyStyles = false;

  constructor() {
    this.stateMachine = new PetStateMachine(
      () => this.currentX,
      () => this.currentY,
    );
    this.stateMachine.setOnStateChange((oldState, newState) => {
      this.onStateChange(oldState, newState);
    });
    this.init();
  }

  /// Cache DOM references once, refresh on monitor change
  private cacheDOM(): void {
    this._fox = document.getElementById('fox');
    this._container = document.getElementById('pet-container');
  }

  /// Apply batched style changes in one pass
  private flushStyles(): void {
    if (!this._dirtyStyles) return;
    if (this._fox && this._pendingTransform !== null) {
      this._fox.style.transform = this._pendingTransform;
    }
    this._dirtyStyles = false;
    this._pendingTransform = null;
    this._pendingDirection = null;
  }

  /// Apply settings to this AI instance and the pet visuals
  applySettings(s: Settings): void {
    const speedMap: Record<string, number> = { slow: 60, medium: 120, fast: 200 };
    this.speed = speedMap[s.moveSpeed] ?? 120;

    const distMap: Record<string, number> = { close: 100, medium: 200, far: 300 };
    this.minFollowDistance = distMap[s.followDist] ?? 200;

    // Cache pet size for edge detection
    const sizeMap = { small: 80, medium: 128, large: 176 };
    this._cachedPetSize = sizeMap[s.petSize] ?? 128;

    // Apply visual settings (size)
    applySettings(s);
  }

  private onStateChange(oldState: PetState, newState: PetState) {
    const fox = this._fox;
    const container = this._container;
    if (!fox || !container) return;

    // Batch: remove all state classes at once
    container.classList.remove('state-idle', 'state-walking', 'state-sleeping', 'state-playing');

    // Add transition class for smooth crossfade, then remove after animation
    container.classList.add('state-transition');
    setTimeout(() => {
      container.classList.remove('state-transition');
    }, 400);

    // Add new state class
    container.classList.add(`state-${newState.toLowerCase()}`);

    // Remove any existing zzz elements
    const existingZzz = document.querySelectorAll('.zzz-particle');
    existingZzz.forEach(el => el.remove());

    if (newState === PetState.SLEEPING) {
      // Add floating zzz particles
      this.spawnZzz(container);
    }

    if (newState === PetState.PLAYING) {
      // CSS animation handles the bounce — just set direction
      fox.style.animation = '';
    } else {
      fox.style.animation = '';
    }

    // Play state transition sound
    this.playSound(newState);
  }

  private spawnZzz(container: HTMLElement) {
    const emojis = ['💤', 'z', 'Z'];
    for (let i = 0; i < 3; i++) {
      const zzz = document.createElement('div');
      zzz.className = 'zzz-particle';
      zzz.textContent = emojis[i % emojis.length];
      zzz.style.cssText = `
        top: ${10 + i * 8}px;
        right: ${-5 + i * 5}px;
        font-size: ${14 + i * 4}px;
        animation-delay: ${i * 0.8}s;
        opacity: 0.7;
      `;
      container.appendChild(zzz);
    }
  }

  private lastDirection = 1; // 1 = right, -1 = left
  private lastAnimClass: string | null = null; // track active animation class

  setDirection(dir: number) {
    this.lastDirection = dir;
    const fox = this._fox;
    if (!fox) return;
    if (dir < 0) {
      fox.classList.add('facing-left');
    } else {
      fox.classList.remove('facing-left');
    }
  }

  /// Trigger a bounce-landing squash/stretch animation
  playBounceLanding() {
    const container = this._container;
    if (!container) return;
    this.clearAnimClass();
    void container.offsetWidth; // force reflow to restart animation
    container.classList.add('bounce-landing');
    this.lastAnimClass = 'bounce-landing';
    this.scheduleAnimCleanup(250);
  }

  /// Trigger a jump-squash anticipation animation
  playJumpSquash() {
    const container = this._container;
    if (!container) return;
    this.clearAnimClass();
    void container.offsetWidth; // force reflow to restart animation
    container.classList.add('jump-squash');
    this.lastAnimClass = 'jump-squash';
    this.scheduleAnimCleanup(180);
  }

  /// Clear any active one-shot animation class
  private clearAnimClass() {
    const container = this._container;
    if (!container || !this.lastAnimClass) return;
    container.classList.remove(this.lastAnimClass);
    this.lastAnimClass = null;
  }

  /// Remove animation class after duration completes
  private scheduleAnimCleanup(ms: number) {
    setTimeout(() => this.clearAnimClass(), ms);
  }

  playSound(state: PetState) {
    const sm = (window as any).__SOUND_MANAGER__ as SoundManager | undefined;
    if (!sm) return;
    switch (state) {
      case PetState.PLAYING:
        sm.play('happy');
        break;
      case PetState.SLEEPING:
        sm.play('sleep');
        break;
      case PetState.WALKING:
        sm.play('step');
        break;
    }
  }

  playDragSound(start: boolean) {
    const sm = (window as any).__SOUND_MANAGER__ as SoundManager | undefined;
    if (!sm) return;
    sm.play(start ? 'pickup' : 'drop');
  }

  private async init() {
    // Load settings from Rust backend and apply
    try {
      const s = await invoke<Settings>('get_settings');
      this.applySettings(s);
    } catch (e) {
      console.error('Failed to load settings, using defaults:', e);
    }

    // Cache DOM references once
    this.cacheDOM();

    const pos = await this.window.outerPosition();
    this.currentX = pos.x;
    this.currentY = pos.y;
    this.targetX = this.currentX;
    this.targetY = this.currentY;

    // Update current monitor based on initial position
    const mm = getMonitorManager();
    mm.updateCurrentMonitor(this.currentX, this.currentY);

    const container = this._container;
    if (container) {
      // mousedown: start drag, disable click-through
      container.addEventListener('mousedown', async (e: MouseEvent) => {
        this.dragged = true;
        container.classList.add('dragging');
        this.stateMachine.onInteraction();
        this.playDragSound(true);
        await this.window.invoke('disable_click_through');
        console.log('Drag started - click-through disabled');
      });

      // mousemove: follow cursor during drag + track for state machine
      // (consolidated from two duplicate listeners)
      document.addEventListener('mousemove', async (e: MouseEvent) => {
        if (this.dragged) {
          await this.window.setPosition(
            new PhysicalPosition(e.screenX, e.screenY),
          );
          this.currentX = e.screenX;
          this.currentY = e.screenY;
          // Update current monitor during drag
          getMonitorManager().updateCurrentMonitor(e.screenX, e.screenY);
        }
        // Track mouse position for follow mode and state machine
        this.mouseX = e.screenX;
        this.mouseY = e.screenY;
        this.stateMachine.onMouseNear(e.screenX, e.screenY);
      });

      // mouseup: stop drag, re-enable click-through
      document.addEventListener('mouseup', async () => {
        if (this.dragged) {
          this.dragged = false;
          container.classList.remove('dragging');
          this.playDragSound(false);
          await this.window.invoke('enable_click_through');
          console.log('Drag ended - click-through re-enabled');
          const newPos = await this.window.outerPosition();
          this.currentX = newPos.x;
          this.currentY = newPos.y;
          // Update current monitor after drag
          getMonitorManager().updateCurrentMonitor(this.currentX, this.currentY);
        }
      });
    }

    // 'F' key to toggle follow-mouse mode
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        this.toggleFollowMouse();
      }
    });

    // Expose toggle function globally
    (window as any).__TOGGLE_FOLLOW__ = () => {
      this.toggleFollowMouse();
    };

    // Listen for display changes (monitor connect/disconnect)
    window.addEventListener('resize', () => {
      getMonitorManager().refresh();
      // Re-cache DOM in case of display change
      this.cacheDOM();
    });

    // Also listen for Tauri monitor change events if available
    listen('tauri://resize', () => {
      getMonitorManager().refresh();
      this.cacheDOM();
    }).catch(() => {
      // Event may not be available, that's fine
    });

    this.lastChange = performance.now();
    this.pickTarget();
    this.lastFrameTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  toggleFollowMouse() {
    this.followMouse = !this.followMouse;
    console.log('Follow mouse:', this.followMouse);
  }

  private pickTarget() {
    const mm = getMonitorManager();
    // Pick target on the CURRENT monitor, not across all monitors
    const pos = mm.getRandomPositionOnCurrentMonitor(this.margin, this._cachedPetSize);
    this.targetX = pos.x;
    this.targetY = pos.y;
    this.changeInterval = 2000 + Math.random() * 3000;
  }

  /// Get the target frame interval based on current state
  private getFrameInterval(): number {
    const state = this.stateMachine.getState();
    switch (state) {
      case PetState.SLEEPING: return this.SLEEP_INTERVAL;
      case PetState.IDLE: return this.IDLE_INTERVAL;
      default: return this.ACTIVE_INTERVAL;
    }
  }

  private loop = async (timestamp: number) => {
    // Schedule next frame immediately (always keep the loop alive)
    this.raf = requestAnimationFrame(this.loop);

    // Frame rate control: skip frames when idle/sleeping
    const interval = this.getFrameInterval();
    if (timestamp - this.lastFrameTime < interval) return;
    this.lastFrameTime = timestamp;

    if (this.prevTimestamp === null) this.prevTimestamp = timestamp;
    const dt = Math.min((timestamp - this.prevTimestamp) / 1000, 0.1);
    this.prevTimestamp = timestamp;

    // Update state machine
    this.stateMachine.update();

    const currentState = this.stateMachine.getState();

    // Pause AI movement during drag
    if (!this.dragged) {
      let targetX: number, targetY: number;

      if (currentState === PetState.SLEEPING) {
        // Don't move when sleeping
        targetX = this.currentX;
        targetY = this.currentY;
      } else if (currentState === PetState.PLAYING || this.followMouse) {
        // Follow mouse with lerp smoothing
        const dx = this.mouseX - this.currentX;
        const dy = this.mouseY - this.currentY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.minFollowDistance) {
          this.currentX += dx * this.lerpFactor;
          this.currentY += dy * this.lerpFactor;
        }

        // Clamp to current monitor
        const mm = getMonitorManager();
        const clamped = mm.clampToCurrentMonitor(this.currentX, this.currentY, this.margin, this._cachedPetSize);
        this.currentX = clamped.x;
        this.currentY = clamped.y;

        targetX = this.currentX;
        targetY = this.currentY;
      } else if (currentState === PetState.WALKING) {
        // Change direction every 2-5 seconds
        if (timestamp - this.lastChange > this.changeInterval) {
          this.lastChange = timestamp;
          this.pickTarget();
          this.playJumpSquash(); // anticipation squash before new direction
        }

        const dx = this.targetX - this.currentX;
        const dy = this.targetY - this.currentY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 1) {
          const step = this.speed * dt;
          const ratio = Math.min(step / dist, 1);
          this.currentX += dx * ratio;
          this.currentY += dy * ratio;
        } else {
          // Reached target — play landing squash
          this.stateMachine.onReachTarget();
          this.playBounceLanding();
        }

        // Clamp to current monitor bounds
        const mm = getMonitorManager();
        const clamped = mm.clampToCurrentMonitor(this.currentX, this.currentY, this.margin, this._cachedPetSize);
        this.currentX = clamped.x;
        this.currentY = clamped.y;

        targetX = this.currentX;
        targetY = this.currentY;
      } else {
        // IDLE: small occasional movements
        targetX = this.currentX;
        targetY = this.currentY;
      }

      await this.window.setPosition(
        new PhysicalPosition(Math.round(targetX), Math.round(targetY)),
      );

      // Update current monitor tracking
      getMonitorManager().updateCurrentMonitor(this.currentX, this.currentY);

      // Rotate fox toward target (not when sleeping)
      const container = this._container;
      const fox = this._fox;
      if (container && fox && currentState !== PetState.SLEEPING) {
        const targetDx = (this.followMouse || currentState === PetState.PLAYING)
          ? this.mouseX - this.currentX
          : this.targetX - this.currentX;
        const targetDy = (this.followMouse || currentState === PetState.PLAYING)
          ? this.mouseY - this.currentY
          : this.targetY - this.currentY;

        // Use direction-aware flip instead of rotation
        if (Math.abs(targetDx) > 2) {
          this.setDirection(targetDx > 0 ? 1 : -1);
        }

        // Subtle tilt based on vertical movement
        if (currentState !== PetState.PLAYING) {
          const tilt = Math.max(-15, Math.min(15, targetDy * 0.3));
          // Apply tilt on top of the facing direction
          const baseFlip = this.lastDirection < 0 ? 'scaleX(-1)' : '';
          fox.style.transform = `${baseFlip} rotate(${tilt}deg)`;
        }
      }
    }
  };

  destroy() {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
    }
    this.stateMachine.destroy();
  }
}

const _wanderingAI = new WanderingAI();
(window as any).__WANDERING_AI__ = _wanderingAI;

// ── Settings Event Listener ───────────────────────────────────────────────
// When the settings panel saves changes, apply them to the pet in real-time

listen<Settings>('settings:changed', (event) => {
  _wanderingAI.applySettings(event.payload);
  // Sync sound manager with settings
  const sm = (window as any).__SOUND_MANAGER__ as SoundManager | undefined;
  if (sm) {
    sm.setEnabled(event.payload.soundEffects);
    sm.setVolume(event.payload.volume);
  }
  console.log('Settings updated:', event.payload);
});

// ── Tray Event Listeners ───────────────────────────────────────────────────

listen<boolean>('tray:toggle-visible', (event) => {
  const visible = event.payload;
  const container = document.getElementById('pet-container');
  if (container) {
    container.style.display = visible ? 'flex' : 'none';
  }
  console.log('Tray: pet visible =', visible);
});

listen<boolean>('tray:toggle-follow', (event) => {
  const follow = event.payload;
  const ai = (window as any).__WANDERING_AI__;
  if (ai && typeof ai.toggleFollowMouse === 'function') {
    // Only toggle if current state doesn't match desired state
    if (ai.followMouse !== follow) {
      ai.toggleFollowMouse();
    }
  }
  console.log('Tray: follow mouse =', follow);
});
