import { getCurrentWindow } from '@tauri-apps/api/window';
import { PhysicalPosition } from '@tauri-apps/api/dpi';

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
  private lerpFactor = 0.05; // Lerp smoothing factor
  private minFollowDistance = 30; // Minimum distance before following

  constructor() {
    this.init();
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
        // Disable click-through when dragging
        await this.window.eval(`window.__DISABLE_CLICK_THROUGH__()`);
        console.log('Drag started - click-through disabled');
      });

      // mousemove: follow cursor during drag
      document.addEventListener('mousemove', async (e: MouseEvent) => {
        if (this.dragged) {
          // Move window to follow cursor
          await this.window.setPosition(
            new PhysicalPosition(e.screenX, e.screenY)
          );
          // Update current position
          this.currentX = e.screenX;
          this.currentY = e.screenY;
        }
        // Track mouse position for follow mode
        this.mouseX = e.screenX;
        this.mouseY = e.screenY;
      });

      // mouseup: stop drag, re-enable click-through
      document.addEventListener('mouseup', async () => {
        if (this.dragged) {
          this.dragged = false;
          // Re-enable click-through after drag
          await this.window.eval(`window.__ENABLE_CLICK_THROUGH__()`);
          console.log('Drag ended - click-through re-enabled');
          // Sync position after user finishes dragging
          const newPos = await this.window.outerPosition();
          this.currentX = newPos.x;
          this.currentY = newPos.y;
        }
      });
    }

    // Track mouse position
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

    // Change direction every 2–5 seconds when not following mouse
    if (!this.followMouse && timestamp - this.lastChange > this.changeInterval) {
      this.lastChange = timestamp;
      this.pickTarget();
    }

    // Pause AI movement during drag
    if (!this.dragged) {
      let targetX: number, targetY: number;

      if (this.followMouse) {
        // Follow mouse with lerp smoothing
        const dx = this.mouseX - this.currentX;
        const dy = this.mouseY - this.currentY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > this.minFollowDistance) {
          // Lerp toward mouse position
          this.currentX += dx * this.lerpFactor;
          this.currentY += dy * this.lerpFactor;
        }

        targetX = this.currentX;
        targetY = this.currentY;
      } else {
        // Wandering mode
        const dx = this.targetX - this.currentX;
        const dy = this.targetY - this.currentY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 1) {
          const step = this.speed * dt;
          const ratio = Math.min(step / dist, 1);
          this.currentX += dx * ratio;
          this.currentY += dy * ratio;
        }

        targetX = this.currentX;
        targetY = this.currentY;
      }

      await this.window.setPosition(
        new PhysicalPosition(Math.round(targetX), Math.round(targetY)),
      );

      // Rotate fox slightly toward target
      const container = document.getElementById('pet-container');
      if (container) {
        const targetDx = (this.followMouse ? this.mouseX : this.targetX) - this.currentX;
        const targetDy = (this.followMouse ? this.mouseY : this.targetY) - this.currentY;
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
  }
}

new WanderingAI();
