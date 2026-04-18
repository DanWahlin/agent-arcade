// PixelGalaxy — Galaga-style space shooter with procedurally generated sprites.
// Runs as a transparent desktop overlay using manual movement (no arcade physics).

declare const Phaser: any;

import { BaseScene, W, H } from './BaseScene.js';

/* ---------- tiny helpers ---------- */
interface Rect { x: number; y: number; w: number; h: number }
function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ---------- enemy types ---------- */
type EnemyKind = 'bug' | 'moth' | 'boss';

const ENEMY_INFO: Record<EnemyKind, { tex: string; frame: string; hp: number; pts: number; w: number; h: number }> = {
  bug:  { tex: 'space', frame: 'enemyRed1.png',   hp: 1, pts: 100, w: 93, h: 84 },
  moth: { tex: 'space', frame: 'enemyBlue3.png',  hp: 2, pts: 200, w: 103, h: 84 },
  boss: { tex: 'space', frame: 'enemyGreen2.png', hp: 3, pts: 500, w: 104, h: 84 },
};

/* ---------- types ---------- */
interface Star { x: number; y: number; speed: number; size: number; alpha: number; gfx: any }

interface Enemy {
  sprite: any;
  kind: EnemyKind;
  hp: number;
  // formation
  slotIdx: number;
  inFormation: boolean;
  // entry animation
  entering: boolean;
  entryT: number;
  entryStartX: number;
  entryTargetX: number;
  entryTargetY: number;
  // dive
  diving: boolean;
  diveVx: number;
  diveVy: number;
}

interface Bullet { sprite: any; vy: number }

/* ---------- wave definitions ---------- */
interface WaveDef { bugs: number; moths: number; bosses: number }
function waveDef(n: number): WaveDef {
  const cycle = ((n - 1) % 3) + 1;
  const tier = Math.floor((n - 1) / 3);
  const extra = tier * 2;
  if (cycle === 1) return { bugs: 8 + extra, moths: 0, bosses: 0 };
  if (cycle === 2) return { bugs: 6 + extra, moths: 4, bosses: 0 };
  return { bugs: 5 + extra, moths: 4, bosses: 2 };
}

/* ---------- constants ---------- */
const SHIP_SPEED = 300;
const BULLET_SPEED = 700;
const MAX_BULLETS = 3;
const ENEMY_BULLET_SPEED = 400;
const FORMATION_COLS = 8;
const FORMATION_ROWS = 4;
const SLOT_W = 56;
const SLOT_H = 48;
const FORMATION_TOP = Math.floor(H * 0.35);
const ENTRY_DURATION = 1200;           // ms per enemy entry animation
const DIVE_INTERVAL_MIN = 3000;
const DIVE_INTERVAL_MAX = 5000;
const SWAY_SPEED = 0.0004;
const SWAY_AMP = 30;

export class PixelGalaxyScene extends BaseScene {
  /* player */
  private ship!: any;
  private shipX = W / 2;
  private readonly shipY = H - 140;
  private bullets: Bullet[] = [];
  private lives = 3;
  private invincible = 0;

  /* shield */
  private shieldActive = false;
  private shieldSprite?: any;
  private shieldPickups: any[] = [];

  /* enemies */
  private enemies: Enemy[] = [];
  private enemyBullets: Bullet[] = [];
  private formation: { x: number; y: number }[] = [];
  private formationOffset = 0;
  private formationTime = 0;

  /* wave */
  private wave = 0;
  private waveDelay = 0;              // ms before next wave
  private spawnQueue: EnemyKind[] = [];
  private spawnTimer = 0;
  private waveTextSprite: any = null;

  /* timers */
  private enemyShootTimer = 0;
  private diveTimer = 0;

  /* starfield */
  private stars: Star[] = [];

  /* input */
  private cursors!: any;
  private spaceKey!: any;
  private spaceWasDown = false;

  /* game over */
  private gameOver = false;

  constructor() { super('pixel-galaxy'); }
  get displayName() { return 'Pixel Galaxy'; }

  /* ================================================================
     LIFECYCLE
     ================================================================ */

  preload() {
    this.load.atlasXML('space', '../assets/space_sheet.png', '../assets/space_sheet.xml');
    this.load.image('space_bg', '../assets/space_bg.png');
    this.load.audio('sfx_laser', '../assets/sounds/sfx_laser1.ogg');
    this.load.audio('sfx_zap', '../assets/sounds/sfx_zap.ogg');
    this.load.audio('sfx_lose', '../assets/sounds/sfx_lose.ogg');
    this.load.audio('sfx_shieldUp', '../assets/sounds/sfx_shieldUp.ogg');
    this.load.audio('sfx_shieldDown', '../assets/sounds/sfx_shieldDown.ogg');
    this.load.audio('sfx_twoTone', '../assets/sounds/sfx_twoTone.ogg');
  }

  create() {
    this.score = 0;
    this.lives = 3;
    this.wave = 0;
    this.waveDelay = 0;
    this.enemies = [];
    this.bullets = [];
    this.enemyBullets = [];
    this.spawnQueue = [];
    this.formationTime = 0;
    this.formationOffset = 0;
    this.invincible = 0;
    this.gameOver = false;
    this.shipX = W / 2;
    this.shieldActive = false;
    if (this.shieldSprite) { this.shieldSprite.destroy(); this.shieldSprite = undefined; }
    this.shieldPickups.forEach(p => p.sprite.destroy());
    this.shieldPickups = [];

    this.makeTextures();
    this.createStarfield();
    this.setupFormation();

    this.ship = this.add.sprite(this.shipX, this.shipY, 'space', 'playerShip1_blue.png').setDepth(10);
    this.ship.setDisplaySize(60, 45);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey('SPACE');
    this.spaceWasDown = false;

    // pause bridge
    (window as any).__agentArcadePause = (shouldPause: boolean) => {
      const ab = (window as any).agentArcade;
      if (shouldPause) this.pauseGame(); else this.resumeGame();
      if (ab && ab.setClickThrough) ab.setClickThrough(shouldPause);
      if (ab && ab.setPaused) ab.setPaused(shouldPause);
    };
    const ab = (window as any).agentArcade;
    if (ab && ab.onResumeRequest) {
      ab.onResumeRequest(() => {
        const hud = document.getElementById('hud');
        if (hud) hud.classList.remove('paused');
        this.resumeGame();
        if (ab.setClickThrough) ab.setClickThrough(false);
        if (ab.setPaused) ab.setPaused(false);
      });
    }

    this.syncLivesToHUD();
    this.syncLevelToHUD();
    this.syncScoreToHUD();
    this.loadHighScore();
    this.startWave();
  }

  update(_t: number, dtMs: number) {
    if (this.gameOver) return;
    const dt = Math.min(dtMs, 33);        // clamp to ~30 fps floor

    this.updateStarfield(dt);
    this.updateShip(dt);
    this.updateBullets(dt);
    this.updateEnemies(dt);
    this.updateEnemyBullets(dt);
    this.checkCollisions();
    this.updateShieldPickups(dt);
    this.updateWave(dt);
  }

  /* ================================================================
     TEXTURES
     ================================================================ */

  private makeTextures() {
    if (this.textures.exists('pg_particle')) return;

    const g = this.add.graphics();

    // Explosion particle — orange dot
    g.clear();
    g.fillStyle(0xffaa00);
    g.fillCircle(3, 3, 3);
    g.generateTexture('pg_particle', 6, 6);

    g.destroy();
  }

  /* ================================================================
     STARFIELD
     ================================================================ */

  private createStarfield() {
    // Tiled space background at low opacity (transparent overlay friendly)
    const bgTile = 256;
    const cols = Math.ceil(W / bgTile) + 1;
    const rows = Math.ceil(H / bgTile) + 1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.add.image(c * bgTile + bgTile / 2, r * bgTile + bgTile / 2, 'space_bg')
          .setAlpha(0.25)
          .setDepth(-1);
      }
    }

    // Star dots on top for extra sparkle
    const layers = [
      { count: 30, speed: 20,  size: 1, alpha: 0.3 },
      { count: 20, speed: 40,  size: 1.5, alpha: 0.4 },
      { count: 15, speed: 70,  size: 2, alpha: 0.5 },
    ];
    for (const l of layers) {
      for (let i = 0; i < l.count; i++) {
        const gfx = this.add.graphics();
        const x = Math.random() * W;
        const y = Math.random() * H;
        gfx.fillStyle(0xffffff, l.alpha);
        gfx.fillCircle(0, 0, l.size);
        gfx.setPosition(x, y).setDepth(0);
        this.stars.push({ x, y, speed: l.speed, size: l.size, alpha: l.alpha, gfx });
      }
    }
  }

  private updateStarfield(dt: number) {
    for (const s of this.stars) {
      s.y += s.speed * (dt / 1000);
      if (s.y > H) s.y -= H;
      s.gfx.setPosition(s.x, s.y);
    }
  }

  /* ================================================================
     FORMATION GRID
     ================================================================ */

  private setupFormation() {
    this.formation = [];
    const gridW = FORMATION_COLS * SLOT_W;
    const startX = (W - gridW) / 2 + SLOT_W / 2;
    for (let r = 0; r < FORMATION_ROWS; r++) {
      for (let c = 0; c < FORMATION_COLS; c++) {
        this.formation.push({ x: startX + c * SLOT_W, y: FORMATION_TOP + r * SLOT_H });
      }
    }
  }

  /* ================================================================
     WAVE SYSTEM
     ================================================================ */

  private startWave() {
    this.wave++;
    this.syncLevelToHUD();

    const def = waveDef(this.wave);
    this.spawnQueue = [];
    for (let i = 0; i < def.bugs; i++) this.spawnQueue.push('bug');
    for (let i = 0; i < def.moths; i++) this.spawnQueue.push('moth');
    for (let i = 0; i < def.bosses; i++) this.spawnQueue.push('boss');
    // shuffle
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    this.spawnTimer = 0;
    this.diveTimer = DIVE_INTERVAL_MIN + Math.random() * (DIVE_INTERVAL_MAX - DIVE_INTERVAL_MIN);

    // Wave text
    if (this.waveTextSprite) { this.waveTextSprite.destroy(); this.waveTextSprite = null; }
    this.waveTextSprite = this.add.text(W / 2, H / 2 - 40, `WAVE ${this.wave}`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '28px',
      color: '#00ffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(800);

    this.tweens.add({
      targets: this.waveTextSprite,
      alpha: 0,
      duration: 1800,
      delay: 700,
      onComplete: () => { if (this.waveTextSprite) { this.waveTextSprite.destroy(); this.waveTextSprite = null; } },
    });
  }

  private updateWave(dt: number) {
    // spawn queued enemies one-by-one
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnEnemy(this.spawnQueue.shift()!);
        this.spawnTimer = 200;
      }
    }

    // enemy shooting
    this.enemyShootTimer -= dt;
    if (this.enemyShootTimer <= 0) {
      this.enemyShoot();
      this.enemyShootTimer = 1000 + Math.random() * 1000;
    }

    // dive bombing
    this.diveTimer -= dt;
    if (this.diveTimer <= 0) {
      this.triggerDive();
      this.diveTimer = DIVE_INTERVAL_MIN + Math.random() * (DIVE_INTERVAL_MAX - DIVE_INTERVAL_MIN);
    }

    // next wave when all enemies gone and spawn queue empty
    if (this.enemies.length === 0 && this.spawnQueue.length === 0) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) {
        this.waveDelay = 1500;
        this.sound.play('sfx_twoTone', { volume: 0.3 });
        this.startWave();
      }
    } else {
      this.waveDelay = 1500;
    }
  }

  /* ================================================================
     ENEMY SPAWN & BEHAVIOUR
     ================================================================ */

  private spawnEnemy(kind: EnemyKind) {
    const info = ENEMY_INFO[kind];

    // find open slot
    const used = new Set(this.enemies.map(e => e.slotIdx));
    let slot = -1;
    for (let i = 0; i < this.formation.length; i++) {
      if (!used.has(i)) { slot = i; break; }
    }
    if (slot === -1) return;               // formation full

    const target = this.formation[slot];
    const startX = Math.random() * W;

    const sprite = this.add.sprite(startX, -20, info.tex, info.frame).setDepth(5);
    sprite.setDisplaySize(48, 40);
    const e: Enemy = {
      sprite, kind, hp: info.hp, slotIdx: slot,
      inFormation: false,
      entering: true, entryT: 0,
      entryStartX: startX,
      entryTargetX: target.x,
      entryTargetY: target.y,
      diving: false, diveVx: 0, diveVy: 0,
    };
    this.enemies.push(e);
  }

  private updateEnemies(dt: number) {
    // sway formation
    this.formationTime += dt;
    this.formationOffset = Math.sin(this.formationTime * SWAY_SPEED) * SWAY_AMP;

    const speed = 1 + (this.wave - 1) * 0.08;   // speed ramp

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];

      if (e.entering) {
        e.entryT += dt * speed;
        const progress = Math.min(1, e.entryT / ENTRY_DURATION);
        const ease = 1 - Math.pow(1 - progress, 3);
        const x = e.entryStartX + (e.entryTargetX - e.entryStartX) * ease
                  + Math.sin(progress * Math.PI * 3) * 60;
        const y = -20 + (e.entryTargetY + 20) * ease;
        e.sprite.setPosition(x, y);
        if (progress >= 1) {
          e.entering = false;
          e.inFormation = true;
        }
      } else if (e.diving) {
        e.sprite.x += e.diveVx * (dt / 1000) * speed;
        e.sprite.y += e.diveVy * (dt / 1000) * speed;
        e.diveVy += 200 * (dt / 1000);           // accelerate down

        if (e.sprite.y > H + 30) {
          // off screen — remove
          e.sprite.destroy();
          this.enemies.splice(i, 1);
        }
      } else if (e.inFormation) {
        const slot = this.formation[e.slotIdx];
        e.sprite.setPosition(slot.x + this.formationOffset, slot.y);
      }
    }
  }

  private triggerDive() {
    const inForm = this.enemies.filter(e => e.inFormation && !e.diving && !e.entering);
    if (inForm.length === 0) return;
    const e = inForm[Math.floor(Math.random() * inForm.length)];
    e.inFormation = false;
    e.diving = true;
    const dx = this.shipX - e.sprite.x;
    const len = Math.max(1, Math.sqrt(dx * dx + (H * H)));
    e.diveVx = (dx / len) * 220;
    e.diveVy = 180;
  }

  private enemyShoot() {
    const shooters = this.enemies.filter(e => (e.inFormation || e.diving) && !e.entering);
    if (shooters.length === 0) return;
    const e = shooters[Math.floor(Math.random() * shooters.length)];
    const sprite = this.add.sprite(e.sprite.x, e.sprite.y + 8, 'space', 'laserRed01.png').setDepth(5);
    sprite.setDisplaySize(6, 20);
    this.enemyBullets.push({ sprite, vy: ENEMY_BULLET_SPEED });
  }

  /* ================================================================
     SHIP
     ================================================================ */

  private updateShip(dt: number) {
    if (this.invincible > 0) {
      this.invincible -= dt;
      this.ship.setAlpha(Math.sin(this.invincible * 0.02) > 0 ? 1 : 0.3);
      if (this.invincible <= 0) this.ship.setAlpha(1);
    }

    const left = this.cursors.left.isDown;
    const right = this.cursors.right.isDown;
    if (left) this.shipX -= SHIP_SPEED * (dt / 1000);
    if (right) this.shipX += SHIP_SPEED * (dt / 1000);
    this.shipX = Math.max(10, Math.min(W - 10, this.shipX));
    this.ship.setPosition(this.shipX, this.shipY);

    if (this.shieldSprite && this.shieldActive) {
      this.shieldSprite.setPosition(this.shipX, this.shipY);
      this.shieldSprite.setAlpha(0.4 + Math.sin(this.time.now / 200) * 0.2);
    }

    // fire (edge-detect)
    const spaceDown = this.spaceKey.isDown;
    if (spaceDown && !this.spaceWasDown && this.bullets.length < MAX_BULLETS) {
      const s = this.add.sprite(this.shipX, this.shipY - 12, 'space', 'laserBlue01.png').setDepth(5);
      s.setDisplaySize(6, 24);
      this.bullets.push({ sprite: s, vy: -BULLET_SPEED });
      this.sound.play('sfx_laser', { volume: 0.3 });
    }
    this.spaceWasDown = spaceDown;
  }

  /* ================================================================
     BULLETS
     ================================================================ */

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.sprite.y += b.vy * (dt / 1000);
      if (b.sprite.y < -10) {
        b.sprite.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  private updateEnemyBullets(dt: number) {
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.sprite.y += b.vy * (dt / 1000);
      if (b.sprite.y > H + 10) {
        b.sprite.destroy();
        this.enemyBullets.splice(i, 1);
      }
    }
  }

  /* ================================================================
     COLLISIONS
     ================================================================ */

  private checkCollisions() {
    // Player bullets vs enemies
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      const bRect: Rect = { x: b.sprite.x - 2, y: b.sprite.y - 4, w: 4, h: 8 };

      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        const eRect: Rect = {
          x: e.sprite.x - 24,
          y: e.sprite.y - 20,
          w: 48,
          h: 40,
        };

        if (overlap(bRect, eRect)) {
          // remove bullet
          b.sprite.destroy();
          this.bullets.splice(bi, 1);

          e.hp--;
          if (e.hp <= 0) {
            this.spawnExplosion(e.sprite.x, e.sprite.y, false);
            this.addScore(ENEMY_INFO[e.kind].pts, e.sprite.x, e.sprite.y - 10);
            this.sound.play('sfx_zap', { volume: 0.3 });
            const ex = e.sprite.x;
            const ey = e.sprite.y;
            e.sprite.destroy();
            this.enemies.splice(ei, 1);
            if (Math.random() < 0.08) {
              const pu = this.add.sprite(ex, ey, 'space', 'powerupBlue_shield.png').setDepth(5);
              pu.setDisplaySize(30, 30);
              this.shieldPickups.push({ sprite: pu, vy: 180 });
            }
          } else {
            // flash white
            e.sprite.setTint(0xffffff);
            this.time.delayedCall(80, () => { if (e.sprite && e.sprite.active) e.sprite.clearTint(); });
          }
          break;          // bullet consumed
        }
      }
    }

    // Enemy bullets vs player
    if (this.invincible <= 0) {
      const pRect: Rect = { x: this.shipX - 25, y: this.shipY - 20, w: 50, h: 40 };
      for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
        const b = this.enemyBullets[i];
        const bRect: Rect = { x: b.sprite.x - 2, y: b.sprite.y - 2, w: 4, h: 4 };
        if (overlap(pRect, bRect)) {
          b.sprite.destroy();
          this.enemyBullets.splice(i, 1);
          this.hitPlayer();
          break;
        }
      }
    }

    // Enemies vs player (dive collision)
    if (this.invincible <= 0) {
      const pRect: Rect = { x: this.shipX - 25, y: this.shipY - 20, w: 50, h: 40 };
      for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
        const e = this.enemies[ei];
        if (e.entering) continue;
        const eRect: Rect = {
          x: e.sprite.x - 24,
          y: e.sprite.y - 20,
          w: 48,
          h: 40,
        };
        if (overlap(pRect, eRect)) {
          // destroy the enemy too
          this.spawnExplosion(e.sprite.x, e.sprite.y, false);
          e.sprite.destroy();
          this.enemies.splice(ei, 1);
          this.hitPlayer();
          break;
        }
      }
    }
  }

  /* ================================================================
     PLAYER HIT / GAME OVER
     ================================================================ */

  private hitPlayer() {
    if (this.shieldActive) {
      this.shieldActive = false;
      this.sound.play('sfx_shieldDown', { volume: 0.4 });
      if (this.shieldSprite) { this.shieldSprite.destroy(); this.shieldSprite = undefined; }
      this.invincible = 500;
      return;
    }

    this.lives--;
    this.syncLivesToHUD();
    this.spawnExplosion(this.shipX, this.shipY, true);
    this.sound.play('sfx_lose', { volume: 0.4 });

    if (this.lives <= 0) {
      this.ship.setVisible(false);
      this.gameOver = true;
      this.showGameOver(this.score, () => {
        this.scene.restart();
      });
    } else {
      this.invincible = 2000;
    }
  }

  /* ================================================================
     SHIELD PICKUPS
     ================================================================ */

  private updateShieldPickups(dt: number) {
    for (let i = this.shieldPickups.length - 1; i >= 0; i--) {
      const pu = this.shieldPickups[i];
      pu.sprite.y += pu.vy * (dt / 1000);
      if (pu.sprite.y > H) { pu.sprite.destroy(); this.shieldPickups.splice(i, 1); continue; }
      const dx = Math.abs(pu.sprite.x - this.shipX);
      const dy = Math.abs(pu.sprite.y - this.shipY);
      if (dx < 30 && dy < 30) {
        pu.sprite.destroy();
        this.shieldPickups.splice(i, 1);
        this.activateShield();
      }
    }
  }

  private activateShield() {
    if (this.shieldActive) return;
    this.shieldActive = true;
    this.sound.play('sfx_shieldUp', { volume: 0.4 });
    this.shieldSprite = this.add.sprite(this.shipX, this.shipY, 'space', 'shield1.png').setDepth(11);
    this.shieldSprite.setDisplaySize(80, 70);
    this.shieldSprite.setAlpha(0.6);
  }

  /* ================================================================
     EXPLOSIONS
     ================================================================ */

  private spawnExplosion(x: number, y: number, big: boolean) {
    const count = big ? 12 : 6;
    for (let i = 0; i < count; i++) {
      const p = this.add.sprite(x, y, 'pg_particle').setDepth(50);
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * (big ? 120 : 60);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const dur = 300 + Math.random() * 300;
      this.tweens.add({
        targets: p,
        x: x + vx * (dur / 1000),
        y: y + vy * (dur / 1000),
        alpha: 0,
        duration: dur,
        onComplete: () => p.destroy(),
      });
    }
  }

  /* ================================================================
     HUD HELPERS
     ================================================================ */

  private syncLivesToHUD() {
    const el = document.getElementById('lives-value');
    if (el) el.textContent = String(this.lives);
  }

  private syncLevelToHUD() {
    const el = document.getElementById('level-value');
    if (el) el.textContent = String(this.wave);
  }
}
