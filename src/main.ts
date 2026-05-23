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
      container.addEventListener('mousedown', () => {
        this.dragged = true;
      });
      document.addEventListener('mouseup', async () => {
        if (this.dragged) {
          this.dragged = false;
          // Sync position after user finishes dragging
          const newPos = await this.window.outerPosition();
          this.currentX = newPos.x;
          this.currentY = newPos.y;
        }
      });
    }

    this.lastChange = performance.now();
    this.pickTarget();
    this.raf = requestAnimationFrame(this.loop);
  }

  private pickTarget() {
    const w = window.screen.width - 200;  // subtract window width
    const h = window.screen.height - 200;  // subtract window height
    this.targetX = this.margin + Math.random() * Math.max(0, w - this.margin * 2);
    this.targetY = this.margin + Math.random() * Math.max(0, h - this.margin * 2);
    this.changeInterval = 2000 + Math.random() * 3000;
  }

  private loop = async (timestamp: number) => {
    // Compute delta time in seconds for frame-rate-independent movement
    if (this.prevTimestamp === null) this.prevTimestamp = timestamp;
    const dt = Math.min((timestamp - this.prevTimestamp) / 1000, 0.1); // cap at 100ms
    this.prevTimestamp = timestamp;

    // Change direction every 2–5 seconds
    if (timestamp - this.lastChange > this.changeInterval) {
      this.lastChange = timestamp;
      this.pickTarget();
    }

    if (!this.dragged) {
      const dx = this.targetX - this.currentX;
      const dy = this.targetY - this.currentY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 1) {
        const step = this.speed * dt;
        const ratio = Math.min(step / dist, 1);
        this.currentX += dx * ratio;
        this.currentY += dy * ratio;

        await this.window.setPosition(
          new PhysicalPosition(Math.round(this.currentX), Math.round(this.currentY)),
        );
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
