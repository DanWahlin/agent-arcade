// BaseScene — shared contract for all Agent Arcade mini-games.
// Provides score bridge to the HTML HUD, pause/resume hooks, and
// a consistent lifecycle so the game bootstrap can swap scenes.

declare const Phaser: any;

export const W = window.innerWidth;
export const H = window.innerHeight;

export abstract class BaseScene extends Phaser.Scene {
  protected score = 0;
  protected highScore = 0;
  private scoreAnimTimer?: number;

  constructor(key: string) {
    super(key);
  }

  /** Safe localStorage helpers */
  private storageGet(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  private storageSet(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* quota exceeded or disabled */ }
  }
  private storageRemove(key: string) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }

  /** Load high score for this scene from localStorage. */
  protected loadHighScore() {
    // Clean up old agentBreak keys (from before rename)
    this.storageRemove(`agentBreak_board_${this.scene.key}`);
    this.storageRemove(`agentBreak_hi_${this.scene.key}`);

    const stored = this.storageGet(`agentArcade_hi_${this.scene.key}`);
    this.highScore = stored ? parseInt(stored, 10) || 0 : 0;
    this.gameOverShown = false;
    this.syncHighScoreToHUD();
  }

  /** Save high score if current score exceeds it. */
  protected checkHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.storageSet(`agentArcade_hi_${this.scene.key}`, String(this.highScore));
      this.syncHighScoreToHUD();
    }
  }

  /** Push current score into the HTML HUD element. */
  protected syncScoreToHUD() {
    const el = document.getElementById('score-value');
    if (el) el.textContent = String(this.score);
  }

  /** Push high score into the HTML HUD element. */
  protected syncHighScoreToHUD() {
    const el = document.getElementById('hi-value');
    if (el) el.textContent = String(this.highScore);
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

    this.checkHighScore();
  }

  /** Get top 10 scores for this game from localStorage. */
  protected getLeaderboard(): number[] {
    const stored = this.storageGet(`agentArcade_board_${this.scene.key}`);
    if (!stored) return [];
    try { return JSON.parse(stored); } catch { return []; }
  }

  /** Add a score to the leaderboard, keep top 10, return rank (1-based, 0 = not in top 10). */
  protected addToLeaderboard(score: number): number {
    if (score <= 0) return 0;
    const board = this.getLeaderboard();
    board.push(score);
    board.sort((a: number, b: number) => b - a);
    const trimmed = board.slice(0, 10);
    this.storageSet(`agentArcade_board_${this.scene.key}`, JSON.stringify(trimmed));
    this.checkHighScore();
    const rank = trimmed.indexOf(score) + 1;
    return rank <= 10 ? rank : 0;
  }

  protected gameOverShown = false;

  /** Show game over overlay with leaderboard. Call restartFn when dismissed. */
  protected showGameOver(finalScore: number, restartFn: () => void) {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    const rank = this.addToLeaderboard(finalScore);
    const board = this.getLeaderboard();

    const overlay = document.createElement('div');
    overlay.id = 'gameover-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.75); pointer-events: auto;
      animation: fadeIn 0.4s ease-out;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: linear-gradient(145deg, #0d1b2a 0%, #1b2838 50%, #0d1b2a 100%);
      border: 2px solid rgba(255,215,0,0.4);
      border-radius: 20px; padding: 36px 48px;
      text-align: center; min-width: 460px; max-width: 540px;
      box-shadow: 0 0 60px rgba(255,215,0,0.15), 0 0 100px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05);
      font-family: 'Press Start 2P', 'SF Mono', monospace;
      animation: scaleIn 0.3s ease-out;
    `;

    // Title
    const title = document.createElement('h2');
    title.textContent = 'GAME OVER';
    title.style.cssText = `
      color: #ff4444; font-size: 28px; margin: 0 0 20px;
      text-shadow: 0 0 20px rgba(255,68,68,0.6), 0 0 40px rgba(255,0,0,0.3);
      letter-spacing: 4px;
    `;
    modal.appendChild(title);

    // Divider
    const div1 = document.createElement('div');
    div1.style.cssText = 'height: 1px; background: linear-gradient(90deg, transparent, rgba(255,215,0,0.3), transparent); margin: 0 0 20px;';
    modal.appendChild(div1);

    // Score
    const scoreLine = document.createElement('p');
    scoreLine.innerHTML = `YOUR SCORE<br><span style="font-size:28px; color:#ffeb3b; text-shadow: 0 0 12px rgba(255,235,59,0.5);">${finalScore.toLocaleString()}</span>`;
    scoreLine.style.cssText = 'color: #8899aa; font-size: 10px; margin: 0 0 12px; letter-spacing: 2px; line-height: 2.2;';
    modal.appendChild(scoreLine);

    // Rank badge
    if (rank === 1) {
      const badge = document.createElement('div');
      badge.innerHTML = '🏆 NEW HIGH SCORE!';
      badge.style.cssText = `
        color: #ffd700; font-size: 13px; margin: 8px 0 16px;
        padding: 8px 16px; border-radius: 8px;
        background: rgba(255,215,0,0.1); border: 1px solid rgba(255,215,0,0.3);
        display: inline-block;
        text-shadow: 0 0 8px rgba(255,215,0,0.4);
      `;
      modal.appendChild(badge);
    } else if (rank > 0) {
      const badge = document.createElement('div');
      badge.textContent = `#${rank} ON LEADERBOARD`;
      badge.style.cssText = `
        color: #4fc3f7; font-size: 11px; margin: 8px 0 16px;
        padding: 6px 14px; border-radius: 8px;
        background: rgba(79,195,247,0.1); border: 1px solid rgba(79,195,247,0.2);
        display: inline-block;
      `;
      modal.appendChild(badge);
    } else {
      const spacer = document.createElement('div');
      spacer.style.cssText = 'height: 12px;';
      modal.appendChild(spacer);
    }

    // Divider
    const div2 = document.createElement('div');
    div2.style.cssText = 'height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent); margin: 12px 0 16px;';
    modal.appendChild(div2);

    // Leaderboard header
    const boardTitle = document.createElement('p');
    boardTitle.textContent = '─── TOP 10 ───';
    boardTitle.style.cssText = 'color: #667; font-size: 9px; margin: 0 0 10px; letter-spacing: 3px;';
    modal.appendChild(boardTitle);

    // Score list
    const table = document.createElement('div');
    table.style.cssText = 'margin: 0 auto; display: inline-block; width: 100%;';
    board.forEach((s: number, i: number) => {
      const isMe = (i === rank - 1);
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        font-size: 16px; padding: 8px 16px; margin: 3px 0;
        border-radius: 8px;
        background: ${isMe ? 'rgba(255,235,59,0.12)' : (i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent')};
        ${isMe ? 'border: 1px solid rgba(255,235,59,0.25);' : ''}
      `;

      const rankEl = document.createElement('span');
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      rankEl.textContent = medal;
      rankEl.style.cssText = `
        color: ${isMe ? '#ffeb3b' : '#778'};
        min-width: 42px; text-align: left;
        font-size: ${i < 3 ? '20px' : '16px'};
      `;

      const scoreEl = document.createElement('span');
      scoreEl.textContent = s.toLocaleString();
      scoreEl.style.cssText = `
        color: ${isMe ? '#ffeb3b' : '#bcc'};
        font-size: ${i < 3 ? '20px' : '16px'};
        font-weight: ${i < 3 ? '900' : '700'};
        ${isMe ? 'text-shadow: 0 0 10px rgba(255,235,59,0.5);' : ''}
      `;

      if (isMe) {
        const youTag = document.createElement('span');
        youTag.textContent = '◄';
        youTag.style.cssText = 'color: #ffeb3b; font-size: 10px; margin-left: 6px;';
        scoreEl.appendChild(youTag);
      }

      row.appendChild(rankEl);
      row.appendChild(scoreEl);
      table.appendChild(row);
    });
    // Fill empty slots
    for (let i = board.length; i < 10; i++) {
      const row = document.createElement('div');
      row.style.cssText = `
        display: flex; justify-content: space-between;
        font-size: 16px; padding: 8px 16px; margin: 3px 0;
        color: #334;
      `;
      row.innerHTML = `<span>${i + 1}.</span><span>---</span>`;
      table.appendChild(row);
    }
    modal.appendChild(table);

    // Hint
    const hint = document.createElement('p');
    hint.innerHTML = 'Press <span style="color:#ffeb3b;">SPACE</span> or click to play again';
    hint.style.cssText = 'color: #667; font-size: 11px; margin: 24px 0 0; letter-spacing: 1px;';
    modal.appendChild(hint);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const dismiss = () => {
      this.gameOverShown = false;
      overlay.style.animation = 'go-fadeIn 0.3s ease-in reverse';
      setTimeout(() => { overlay.remove(); restartFn(); }, 250);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Space' || ev.code === 'Enter') { ev.preventDefault(); dismiss(); }
    };
    // Brief delay before accepting input (prevent accidental dismiss)
    this.time.delayedCall(500, () => {
      document.addEventListener('keydown', onKey);
      overlay.addEventListener('click', dismiss);
    });
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
