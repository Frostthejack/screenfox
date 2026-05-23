import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';

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
  private readonly idleToSleepDelay = 30000;  // 30s
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
    if (this.state !== PetState.PLAYING && this.state !== PetState.SLEEPING) {
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

// ── WanderingAI (refactored to use PetStateMachine) ───────────────────────

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

  private onStateChange(oldState: PetState, newState: PetState) {
    const fox = document.getElementById('fox');
    const container = document.getElementById('pet-container');
    if (!fox || !container) return;

    // Remove all state classes
    container.classList.remove('state-idle', 'state-walking', 'state-sleeping', 'state-playing');
    // Add new state class
    container.classList.add(`state-${newState.toLowerCase()}`);

    // Update fox appearance per state
    if (newState === PetState.SLEEPING) {
      fox.style.transform = 'none';
    }

    // Remove any existing zzz element
    const existingZzz = document.getElementById('zzz-animation');
    if (existingZzz) existingZzz.remove();

    if (newState === PetState.SLEEPING) {
      // Add zzz animation
      const zzz = document.createElement('div');
      zzz.id = 'zzz-animation';
      zzz.textContent = '💤';
      zzz.style.cssText = `
        position: absolute;
        top: -20px;
        right: -10px;
        font-size: 24px;
        animation: zzz-float 2s ease-in-out infinite;
        pointer-events: none;
      `;
      container.appendChild(zzz);
    }

    if (newState === PetState.PLAYING) {
      // Bouncy effect
      fox.style.animation = 'pet-bounce 0.3s ease-in-out infinite';
    } else {
      fox.style.animation = '';
    }
  }

  private async init() {
    const pos = await this.window.outerPosition();
    this.currentX = pos.x;
    this.currentY = pos.y;
    this.targetX = this.currentX;
    this.targetY = this.currentY;

    const container = document.getElementById('pet-container');
    if (container) {
      // mousedown: start drag, disable click-through
      container.addEventListener('mousedown', async () => {
        this.dragged = true;
        this.stateMachine.onInteraction();
        await this.window.invoke('disable_click_through');
        console.log('Drag started - click-through disabled');
      });

      // mousemove: follow cursor during drag
      document.addEventListener('mousemove', async (e: MouseEvent) => {
        if (this.dragged) {
          await this.window.setPosition(
            new PhysicalPosition(e.screenX, e.screenY),
          );
          this.currentX = e.screenX;
          this.currentY = e.screenY;
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
          await this.window.invoke('enable_click_through');
          console.log('Drag ended - click-through re-enabled');
          const newPos = await this.window.outerPosition();
          this.currentX = newPos.x;
          this.currentY = newPos.y;
        }
      });
    }

    // Track mouse for state machine proximity detection
    document.addEventListener('mousemove', (e: MouseEvent) => {
      this.mouseX = e.screenX;
      this.mouseY = e.screenY;
    });

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

    this.lastChange = performance.now();
    this.pickTarget();
    this.raf = requestAnimationFrame(this.loop);
  }

  toggleFollowMouse() {
    this.followMouse = !this.followMouse;
    console.log('Follow mouse:', this.followMouse);
  }

  private pickTarget() {
    const w = window.screen.width - 200;
    const h = window.screen.height - 200;
    this.targetX = this.margin + Math.random() * Math.max(0, w - this.margin * 2);
    this.targetY = this.margin + Math.random() * Math.max(0, h - this.margin * 2);
    this.changeInterval = 2000 + Math.random() * 3000;
  }

  private loop = async (timestamp: number) => {
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

        targetX = this.currentX;
        targetY = this.currentY;
      } else if (currentState === PetState.WALKING) {
        // Change direction every 2-5 seconds
        if (timestamp - this.lastChange > this.changeInterval) {
          this.lastChange = timestamp;
          this.pickTarget();
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
          // Reached target
          this.stateMachine.onReachTarget();
        }

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

      // Rotate fox slightly toward target (not when sleeping)
      const container = document.getElementById('pet-container');
      if (container && currentState !== PetState.SLEEPING) {
        const targetDx = (this.followMouse || currentState === PetState.PLAYING)
          ? this.mouseX - this.currentX
          : this.targetX - this.currentX;
        const targetDy = (this.followMouse || currentState === PetState.PLAYING)
          ? this.mouseY - this.currentY
          : this.targetY - this.currentY;
        const angle = Math.atan2(targetDy, targetDx) * (180 / Math.PI);
        const fox = document.getElementById('fox');
        if (fox) {
          fox.style.transform = `rotate(${angle}deg)`;
        }
      }
    }

    this.raf = requestAnimationFrame(this.loop);
  };

  destroy() {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
    }
    this.stateMachine.destroy();
  }
}

new WanderingAI();
