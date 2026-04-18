// BaseScene — shared contract for all Agent Break mini-games.
// Provides score bridge to the HTML HUD, pause/resume hooks, and
// a consistent lifecycle so the game bootstrap can swap scenes.

declare const Phaser: any;

export const W = window.innerWidth;
export const H = window.innerHeight;

export abstract class BaseScene extends Phaser.Scene {
  protected score = 0;
  private scoreAnimTimer?: number;

  constructor(key: string) {
    super(key);
  }

  /** Push current score into the HTML HUD element. */
  protected syncScoreToHUD() {
    const el = document.getElementById('score-value');
    if (el) el.textContent = String(this.score);
  }

  /** Animated score bump (count-up + pop class). */
  protected addScore(points: number, worldX?: number, worldY?: number) {
    const prev = this.score;
    this.score += points;

    // Floating "+N" text at world position
    if (worldX !== undefined && worldY !== undefined) {
      const txt = this.add.text(worldX, worldY, `+${points}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '14px',
        color: '#ffff00',
        stroke: '#000',
        strokeThickness: 3,
      });
      txt.setOrigin(0.5, 0.5).setDepth(900);
      this.tweens.add({
        targets: txt,
        y: worldY - 50,
        alpha: 0,
        duration: 800,
        onComplete: () => txt.destroy(),
      });
    }

    // Count-up animation in HUD
    const el = document.getElementById('score-value');
    if (!el) return;
    if (this.scoreAnimTimer) clearInterval(this.scoreAnimTimer);

    const start = prev;
    const end = this.score;
    const duration = 450;
    const startTime = performance.now();

    this.scoreAnimTimer = window.setInterval(() => {
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(start + (end - start) * ease));
      if (t >= 1) {
        clearInterval(this.scoreAnimTimer);
        this.scoreAnimTimer = undefined;
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
      }
    }, 16);
  }

  /** Called by the pause system. Override if the scene needs custom cleanup. */
  pauseGame() {
    this.scene.pause();
    this.sound.pauseAll();
  }

  /** Called by the resume system. Override if needed. */
  resumeGame() {
    this.scene.resume();
    this.sound.resumeAll();
  }

  /** Return the display name for the HUD. */
  abstract get displayName(): string;
}
