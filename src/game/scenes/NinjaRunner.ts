// NinjaRunner — side-scrolling platformer with free JuhoSprite assets.
// Extracted from the original monolithic game.ts and refactored to
// extend BaseScene for the multi-game architecture.

declare const Phaser: any;

import { BaseScene, W, H } from './BaseScene.js';

const BLOCK = 48;                // logical world tile size
const PLAYER_W = 48;              // player draw size
const PLAYER_H = 48;              // player draw size
const GROUND_Y = H - 64;         // top of ground row
const SPAWN_X = 600;

export class NinjaRunnerScene extends BaseScene {
  // Input
  private cursors!: any;
  private keys!: { space: any; shift: any; f: any; z: any };

  // Player state
  private player!: any;
  private isBig = false;
  private facingRight = true;
  private invincible = 90;
  private shrinkTimer = 0;
  private stompGrace = 0;
  private dead = false;
  private deadTimer = 0;
  private lives = 3;
  private lastSafeX = SPAWN_X;
  private fireCooldown = 0;
  // Jump tracking — manual edge detection is more reliable on macOS than
  // Phaser's JustDown when multiple keys are held simultaneously.
  private jumpKeyWasDown = false;
  private coyoteTime = 0;     // ms left where we can still jump after leaving ground
  private jumpBuffer = 0;     // ms left where a queued jump press will fire on landing
  private canDoubleJump = false;
  private hasDoubleJumped = false;

  // Animation: cycle the run frame based on distance traveled, not wall time,
  // so step rhythm matches actual movement speed.
  private runDistance = 0;

  // Generation
  private genX = 0;

  // Groups
  private groundGroup!: any;
  private brickGroup!: any;
  private qblockGroup!: any;
  private pipeGroup!: any;
  private coinGroup!: any;
  private mushroomGroup!: any;
  private fireballGroup!: any;
  private enemyGroup!: any;

  private gaps: { start: number; end: number }[] = [];
  private bridgeGroup!: any;
  private bounceGroup!: any;
  private flagGroup!: any;
  private currentLevel = 1;
  private currentBiome = 0;
  private distanceSinceFlag = 0;
  private piranhaGroup!: any;
  private fireGroup!: any;
  private warping = false;
  private parachuteMode = false;
  private parachuteSprite?: any;
  private parachuteFlyingEnemies: any[] = [];
  private parachuteTimer = 0;
  private glowSprite?: any;

  constructor() { super('ninja-runner'); }

  get displayName() { return 'Ninja Runner'; }

  preload() {
    // Player spritesheet: 7 frames of 16×16
    this.load.spritesheet('player', '../assets/agent-ninja/player_strip.png', { frameWidth: 16, frameHeight: 16 });
    // Enemy spritesheet: 5 frames of 16×16
    this.load.spritesheet('enemy', '../assets/agent-ninja/enemy_strip.png', { frameWidth: 16, frameHeight: 16 });
    // Coin animation: 4 frames of 16×16
    this.load.spritesheet('coin_anim', '../assets/agent-ninja/coin_sheet.png', { frameWidth: 16, frameHeight: 16 });
    // Heart pickup
    this.load.spritesheet('heart_anim', '../assets/agent-ninja/heart_sheet.png', { frameWidth: 16, frameHeight: 16 });
    // Tile textures
    this.load.image('grass_block', '../assets/agent-ninja/grass_block.png');
    this.load.image('dirt_block', '../assets/agent-ninja/dirt_block.png');
    this.load.image('brown_block', '../assets/agent-ninja/brown_block.png');
    this.load.image('qblock_img', '../assets/agent-ninja/qblock_new.png');
    this.load.image('platform_tile', '../assets/agent-ninja/platform.png');
    this.load.image('spikes_tile', '../assets/agent-ninja/spikes.png');
    this.load.image('flag_tile', '../assets/agent-ninja/flag.png');
    this.load.image('bridge_tile', '../assets/agent-ninja/bridge.png');
    this.load.image('impact', '../assets/agent-ninja/impact_sheet.png');
    this.load.image('clouds', '../assets/agent-ninja/clouds.png');
    this.load.image('hill_0', '../assets/agent-ninja/hill_0.png');
    this.load.image('hill_1', '../assets/agent-ninja/hill_1.png');
    this.load.image('big_bush', '../assets/agent-ninja/big_bush.png');
    this.load.image('small_bush', '../assets/agent-ninja/small_bush.png');
    this.load.image('background', '../assets/agent-ninja/background.png');
    this.load.spritesheet('enemy_tall', '../assets/agent-ninja/enemy_tall_strip.png', { frameWidth: 16, frameHeight: 32 });
    this.load.spritesheet('enemy_short', '../assets/agent-ninja/enemy_short_strip.png', { frameWidth: 16, frameHeight: 16 });
    // Sound effects (shared with Galaxy Shooter)
    this.load.audio('sfx_jump', '../assets/agent-galaxy/sounds/sfx_laser2.ogg');
    this.load.audio('sfx_coin', '../assets/agent-galaxy/sounds/sfx_twoTone.ogg');
    this.load.audio('sfx_stomp', '../assets/agent-galaxy/sounds/sfx_zap.ogg');
    this.load.audio('sfx_powerup', '../assets/agent-galaxy/sounds/sfx_shieldUp.ogg');
    this.load.audio('sfx_hit', '../assets/agent-galaxy/sounds/sfx_shieldDown.ogg');
    this.load.audio('sfx_die', '../assets/agent-galaxy/sounds/sfx_lose.ogg');
    this.load.audio('sfx_flag', '../assets/agent-galaxy/sounds/sfx_twoTone.ogg');
  }

  create() {
    this.makeBlockTextures();

    this.physics.world.setBounds(0, 0, 1_000_000, H);

    this.groundGroup = this.physics.add.staticGroup();
    this.brickGroup = this.physics.add.staticGroup();
    this.qblockGroup = this.physics.add.staticGroup();
    this.pipeGroup = this.physics.add.staticGroup();
    this.coinGroup = this.physics.add.group({ allowGravity: false });
    this.mushroomGroup = this.physics.add.group();
    this.fireballGroup = this.physics.add.group();
    this.enemyGroup = this.physics.add.group();
    this.piranhaGroup = this.physics.add.group({ allowGravity: false });
    this.bridgeGroup = this.physics.add.staticGroup();
    this.bounceGroup = this.physics.add.staticGroup();
    this.flagGroup = this.physics.add.staticGroup();
    this.fireGroup = this.physics.add.group({ allowGravity: false });

    // Initial ground
    this.extendGround(0, W * 2);

    // Player — spritesheet frame 0 = idle
    this.player = this.physics.add.sprite(SPAWN_X, GROUND_Y - 200, 'player', 0);
    this.player.setOrigin(0.5, 1);
    this.player.setDisplaySize(PLAYER_W, PLAYER_H);
    // Physics body fills the full cell so player's head hits blocks above.
    this.player.body.setSize(12, 16);
    this.player.body.setOffset(2, 0);
    this.player.setMaxVelocity(700, 900);
    this.player.body.setGravityY(1800);
    this.player.setDepth(10);

    // Player animations
    this.anims.create({
      key: 'player_walk',
      frames: this.anims.generateFrameNumbers('player', { frames: [1, 2, 3] }),
      frameRate: 10,
      repeat: -1,
    });
    this.anims.create({
      key: 'player_idle',
      frames: [{ key: 'player', frame: 0 }],
      frameRate: 1,
    });
    // Coin spin animation
    this.anims.create({
      key: 'coin_spin',
      frames: this.anims.generateFrameNumbers('coin_anim', { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });
    // Enemy walk
    this.anims.create({
      key: 'enemy_walk',
      frames: this.anims.generateFrameNumbers('enemy', { frames: [0, 1, 2, 3] }),
      frameRate: 6,
      repeat: -1,
    });
    this.anims.create({
      key: 'enemy_tall_walk',
      frames: this.anims.generateFrameNumbers('enemy_tall', { frames: [0, 1, 2, 3] }),
      frameRate: 6,
      repeat: -1,
    });
    this.anims.create({
      key: 'enemy_short_walk',
      frames: this.anims.generateFrameNumbers('enemy_short', { frames: [0, 1, 2, 3] }),
      frameRate: 8,
      repeat: -1,
    });

    // Camera
    this.cameras.main.setBounds(0, 0, 1_000_000, H);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.05, -W * 0.2, 0);
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // Colliders
    this.physics.add.collider(this.player, this.groundGroup);
    this.physics.add.collider(this.player, this.brickGroup, this.onPlayerHitBrick, undefined, this);
    this.physics.add.collider(this.player, this.qblockGroup, this.onPlayerHitQBlock, undefined, this);
    this.physics.add.collider(this.player, this.pipeGroup);

    this.physics.add.collider(this.enemyGroup, this.groundGroup);
    this.physics.add.collider(this.enemyGroup, this.brickGroup);
    this.physics.add.collider(this.enemyGroup, this.qblockGroup);
    this.physics.add.collider(this.enemyGroup, this.pipeGroup);
    this.physics.add.overlap(this.enemyGroup, this.enemyGroup, this.onEnemyVsEnemy, undefined, this);

    this.physics.add.collider(this.mushroomGroup, this.groundGroup);
    this.physics.add.collider(this.mushroomGroup, this.brickGroup);
    this.physics.add.collider(this.mushroomGroup, this.qblockGroup);
    this.physics.add.collider(this.mushroomGroup, this.pipeGroup);

    this.physics.add.collider(this.fireballGroup, this.groundGroup, this.onFireballHitSolid, undefined, this);
    this.physics.add.collider(this.fireballGroup, this.brickGroup, this.onFireballHitSolid, undefined, this);
    this.physics.add.collider(this.fireballGroup, this.qblockGroup, this.onFireballHitSolid, undefined, this);
    this.physics.add.collider(this.fireballGroup, this.pipeGroup, this.onFireballHitSolid, undefined, this);

    this.physics.add.overlap(this.player, this.coinGroup, this.onPlayerCoin, undefined, this);
    this.physics.add.overlap(this.player, this.mushroomGroup, this.onPlayerMushroom, undefined, this);
    this.physics.add.overlap(this.player, this.enemyGroup, this.onPlayerEnemy, undefined, this);
    this.physics.add.overlap(this.fireballGroup, this.enemyGroup, this.onFireballEnemy, undefined, this);
    this.physics.add.overlap(this.player, this.piranhaGroup, this.onPlayerPiranha, undefined, this);
    this.physics.add.overlap(this.player, this.fireGroup, this.onPlayerFire, undefined, this);

    this.physics.add.collider(this.player, this.bridgeGroup, this.onPlayerBridge, undefined, this);
    this.physics.add.collider(this.enemyGroup, this.bridgeGroup);
    this.physics.add.overlap(this.player, this.flagGroup, this.onPlayerFlag, undefined, this);

    this.physics.add.collider(this.player, this.bounceGroup, this.onPlayerBounce, undefined, this);
    this.physics.add.collider(this.enemyGroup, this.bounceGroup);

    // Input
    this.input.keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,F,Z');
    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = {
      space: this.input.keyboard.addKey('SPACE'),
      shift: this.input.keyboard.addKey('SHIFT'),
      f: this.input.keyboard.addKey('F'),
      z: this.input.keyboard.addKey('Z'),
    };

    // Pause bridge: called from index.html when user presses Esc / clicks resume.
    // Pauses the Phaser scene + sound, and asks main to enable click-through.
    (window as any).__agentArcadePause = (shouldPause: boolean) => {
      const ab = (window as any).agentArcade;
      if (shouldPause) {
        this.pauseGame();
      } else {
        this.resumeGame();
      }
      if (ab && ab.setClickThrough) ab.setClickThrough(shouldPause);
      if (ab && ab.setPaused) ab.setPaused(shouldPause);
    };

    // Allow the main process to force-resume (e.g., via global ⌃⌥M).
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

    this.addDecorations();

    this.generateLevel(SPAWN_X + 400, W + 600);
    this.syncLivesToHUD();
    this.loadHighScore();
    this.distanceSinceFlag = 0;
    this.currentLevel = 1;
    this.syncLevelToHUD();
  }

  // ---------- Brick / block textures generated at runtime via Graphics ----------
  private makeBlockTextures() {
    const g = this.add.graphics();

    // Used Q-block (brown/empty) — 16×16 to match source tile size
    g.clear();
    g.fillStyle(0xa56a26); g.fillRect(0, 0, 16, 16);
    g.fillStyle(0x6e4715); g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1);
    g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16);
    g.generateTexture('qblock_used', 16, 16);

    // Pipe body (2 blocks wide)
    g.clear();
    g.fillStyle(0x20a010); g.fillRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0x00680c); g.lineStyle(2, 0x00680c); g.strokeRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0x80e080); g.fillRect(BLOCK / 3 + 4, 0, 4, BLOCK);
    g.generateTexture('pipe_body', BLOCK * 2, BLOCK);

    // Mushroom
    g.clear();
    g.fillStyle(0xd02020); g.fillRect(2, 2, 28, 16);
    g.fillStyle(0xffffff); g.fillRect(8, 6, 6, 6); g.fillRect(18, 6, 6, 6);
    g.fillStyle(0xf0d8a0); g.fillRect(6, 18, 20, 12);
    g.fillStyle(0x000000); g.fillRect(11, 22, 3, 4); g.fillRect(18, 22, 3, 4);
    g.generateTexture('mushroom', 32, 32);

    // Fireball
    g.clear();
    g.fillStyle(0xff8000); g.fillCircle(8, 8, 7);
    g.fillStyle(0xffe080); g.fillCircle(6, 6, 3);
    g.generateTexture('fireball', 16, 16);

    // Fire eruption — organic flame shape with layered colors
    g.clear();
    // Outer flame (dark red)
    g.fillStyle(0xcc2200);
    g.fillEllipse(8, 24, 14, 16);
    g.fillEllipse(8, 14, 10, 14);
    g.fillEllipse(8, 6, 6, 10);
    // Middle flame (orange)
    g.fillStyle(0xff6600);
    g.fillEllipse(8, 26, 10, 12);
    g.fillEllipse(8, 16, 8, 12);
    g.fillEllipse(8, 8, 4, 8);
    // Inner flame (yellow core)
    g.fillStyle(0xffcc00);
    g.fillEllipse(8, 28, 6, 8);
    g.fillEllipse(8, 20, 4, 8);
    // Hot white tip
    g.fillStyle(0xffffaa);
    g.fillEllipse(8, 28, 3, 5);
    g.generateTexture('fire_column', 16, 32);

    // Piranha plant frame 0 (mouth closed)
    g.clear();
    g.fillStyle(0x22aa22);
    g.fillRect(11, 16, 10, 16);
    g.fillStyle(0xdd2020);
    g.fillEllipse(16, 10, 24, 16);
    g.fillStyle(0xffffff);
    g.fillCircle(10, 8, 2); g.fillCircle(16, 6, 2); g.fillCircle(22, 8, 2);
    g.generateTexture('piranha_0', 32, 32);

    // Piranha plant frame 1 (mouth open)
    g.clear();
    g.fillStyle(0x22aa22);
    g.fillRect(11, 18, 10, 14);
    g.fillStyle(0xdd2020);
    g.fillEllipse(16, 10, 26, 18);
    g.fillStyle(0xffffff);
    g.fillCircle(10, 7, 2); g.fillCircle(16, 5, 2); g.fillCircle(22, 7, 2);
    g.fillStyle(0x000000);
    g.fillRect(8, 12, 16, 3);
    g.generateTexture('piranha_1', 32, 32);

    // Power-up glow effect
    g.clear();
    g.fillStyle(0xffdd00, 0.3);
    g.fillCircle(20, 20, 20);
    g.fillStyle(0xffff88, 0.2);
    g.fillCircle(20, 20, 14);
    g.generateTexture('glow', 40, 40);

    // Individual cloud puffs (3 sizes for variety)
    g.clear();
    g.fillStyle(0xffffff);
    g.fillCircle(10, 10, 8); g.fillCircle(20, 8, 10); g.fillCircle(32, 10, 9);
    g.fillCircle(16, 14, 7); g.fillCircle(26, 14, 8);
    g.generateTexture('cloud_sm', 42, 22);

    g.clear();
    g.fillStyle(0xffffff);
    g.fillCircle(14, 14, 12); g.fillCircle(30, 10, 14); g.fillCircle(48, 14, 11);
    g.fillCircle(22, 18, 10); g.fillCircle(38, 18, 12);
    g.generateTexture('cloud_md', 60, 28);

    g.clear();
    g.fillStyle(0xffffff);
    g.fillCircle(16, 16, 14); g.fillCircle(36, 12, 16); g.fillCircle(58, 14, 13);
    g.fillCircle(24, 22, 12); g.fillCircle(46, 20, 14); g.fillCircle(70, 16, 10);
    g.generateTexture('cloud_lg', 82, 32);

    // Green bat enemy — flies in a wave pattern
    g.clear();
    g.fillStyle(0x22aa44);
    g.fillEllipse(8, 9, 8, 8);
    g.fillStyle(0x44dd66);
    g.fillTriangle(1, 6, 6, 8, 3, 12);  // left wing
    g.fillTriangle(15, 6, 10, 8, 13, 12); // right wing
    g.fillStyle(0xff0000);
    g.fillCircle(6, 8, 1); g.fillCircle(10, 8, 1);
    g.generateTexture('bat_0', 16, 16);
    g.clear();
    g.fillStyle(0x22aa44);
    g.fillEllipse(8, 9, 8, 8);
    g.fillStyle(0x44dd66);
    g.fillTriangle(1, 10, 6, 8, 3, 4);  // wings up
    g.fillTriangle(15, 10, 10, 8, 13, 4);
    g.fillStyle(0xff0000);
    g.fillCircle(6, 8, 1); g.fillCircle(10, 8, 1);
    g.generateTexture('bat_1', 16, 16);

    // Warp pipe (lighter green with down arrow)
    g.clear();
    g.fillStyle(0x30c030); g.fillRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0x10a010); g.lineStyle(2, 0x10a010); g.strokeRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0xa0ffa0); g.fillRect(BLOCK / 3 + 4, 0, 4, BLOCK);
    g.fillStyle(0xffffff);
    g.fillTriangle(BLOCK, 4, BLOCK - 6, BLOCK / 2 - 4, BLOCK + 6, BLOCK / 2 - 4);
    g.generateTexture('pipe_warp', BLOCK * 2, BLOCK);

    // Golden pipe (parachute trigger)
    g.clear();
    g.fillStyle(0xdaa520); g.fillRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0xb8860b); g.lineStyle(2, 0xb8860b); g.strokeRect(0, 0, BLOCK * 2, BLOCK);
    g.fillStyle(0xffd700); g.fillRect(BLOCK / 3 + 4, 0, 4, BLOCK);
    g.fillStyle(0xffffff);
    g.fillTriangle(BLOCK, BLOCK / 2 - 2, BLOCK - 5, BLOCK / 2 + 6, BLOCK + 5, BLOCK / 2 + 6);
    g.generateTexture('pipe_gold', BLOCK * 2, BLOCK);

    // Parachute canopy — large dome with red/white stripes and long strings
    g.clear();
    const cw = 64, ch = 80;
    // Dome at top
    g.fillStyle(0xff2020);
    g.fillEllipse(cw / 2, 14, cw - 4, 28);
    // White stripes
    g.fillStyle(0xffffff);
    g.fillRect(8, 4, 8, 20);
    g.fillRect(24, 2, 8, 22);
    g.fillRect(40, 4, 8, 20);
    // Rim
    g.lineStyle(2, 0x880000);
    g.strokeEllipse(cw / 2, 14, cw - 4, 28);
    // Long strings from canopy down to bottom center
    g.lineStyle(1, 0x654321);
    g.lineBetween(6, 24, cw / 2, ch - 2);
    g.lineBetween(cw / 4, 22, cw / 2, ch - 2);
    g.lineBetween(cw / 2, 20, cw / 2, ch - 2);
    g.lineBetween((3 * cw) / 4, 22, cw / 2, ch - 2);
    g.lineBetween(cw - 6, 24, cw / 2, ch - 2);
    g.generateTexture('parachute', cw, ch);

    // Coin frame 0 (circle)
    g.clear();
    g.fillStyle(0xffd24a); g.fillCircle(12, 12, 9);
    g.fillStyle(0xb88a1f); g.fillRect(11, 3, 2, 18);
    g.generateTexture('coin0', 24, 24);
    // Coin frame 1 (thin)
    g.clear();
    g.fillStyle(0xffd24a); g.fillRect(9, 3, 6, 18);
    g.fillStyle(0xb88a1f); g.fillRect(11, 3, 2, 18);
    g.generateTexture('coin1', 24, 24);

    // Water tile — blue gradient with a subtle wave highlight
    g.clear();
    g.fillStyle(0x1a5276); g.fillRect(0, 0, BLOCK, BLOCK);
    g.fillStyle(0x2471a3); g.fillRect(0, 0, BLOCK, BLOCK * 0.3);
    g.fillStyle(0x85c1e9, 0.5); g.fillRect(4, 2, BLOCK * 0.3, 3);
    g.fillStyle(0x85c1e9, 0.4); g.fillRect(BLOCK * 0.55, 6, BLOCK * 0.25, 2);
    g.generateTexture('water', BLOCK, BLOCK);

    // Bounce pad (spring block)
    g.clear();
    g.fillStyle(0xff6600); g.fillRect(0, 0, BLOCK, BLOCK);
    g.fillStyle(0xff9933); g.fillRect(4, 4, BLOCK - 8, BLOCK / 3);
    g.fillStyle(0xcc4400); g.fillRect(0, 0, BLOCK, 2); g.fillRect(0, BLOCK - 2, BLOCK, 2);
    g.fillRect(0, 0, 2, BLOCK); g.fillRect(BLOCK - 2, 0, 2, BLOCK);
    g.fillStyle(0xffcc00);
    g.fillRect(BLOCK / 4, BLOCK / 3, BLOCK / 2, 4);
    g.fillRect(BLOCK / 4, BLOCK / 3 + 8, BLOCK / 2, 4);
    g.generateTexture('bounce_pad', BLOCK, BLOCK);

    g.destroy();
  }

  private addDecorations() {
    // Semi-transparent tiled background — mountains peeking through
    // The image is 320×180, tile it across a wide area with slow parallax
    for (let i = 0; i < 30; i++) {
      this.add.image(i * W * 0.5, H / 2, 'background')
        .setDisplaySize(W * 0.5, H)
        .setAlpha(0.18)
        .setScrollFactor(0.05)
        .setDepth(-5);
    }

    // Hills behind the ground — very subtle
    for (let i = 0; i < 20; i++) {
      const hx = i * 500 + Math.random() * 300;
      const isSmall = Math.random() < 0.5;
      const tex = isSmall ? 'hill_0' : 'hill_1';
      const hh = isSmall ? 64 : 96;
      this.add.image(hx, GROUND_Y - hh / 2 + 10, tex)
        .setDisplaySize(isSmall ? 64 : 64, hh)
        .setAlpha(0.12)
        .setScrollFactor(0.3)
        .setDepth(-2);
    }

    // Bushes at ground level — decorative
    for (let i = 0; i < 25; i++) {
      const bx = i * 400 + Math.random() * 200;
      const isBig = Math.random() < 0.4;
      const tex = isBig ? 'big_bush' : 'small_bush';
      this.add.image(bx, GROUND_Y - 8, tex)
        .setDisplaySize(isBig ? 96 : 64, 32)
        .setAlpha(0.2)
        .setScrollFactor(0.5)
        .setDepth(-1);
    }
  }

  private extendGround(fromX: number, toX: number) {
    for (let x = Math.floor(fromX / BLOCK) * BLOCK; x < toX; x += BLOCK) {
      if (this.isInGap(x + BLOCK / 2)) continue;
      // skip if already there
      const exists = (this.groundGroup.getChildren() as any[]).some((g: any) =>
        Math.abs(g.x - (x + BLOCK / 2)) < 1
      );
      if (exists) continue;
      const g = this.groundGroup.create(x + BLOCK / 2, GROUND_Y + BLOCK / 2, 'grass_block') as any;
      g.setDisplaySize(BLOCK, BLOCK);
      g.refreshBody();
      const BIOME_TINTS = [0xffffff, 0xdec487, 0xb39ddb, 0xb3e5fc];
      g.setTint(BIOME_TINTS[this.currentBiome % 4]);
    }
  }

  private isInGap(wx: number): boolean {
    for (const gap of this.gaps) {
      if (wx >= gap.start && wx < gap.end) return true;
    }
    return false;
  }

  /** Returns true if wx is near any solid obstacle (pipe, brick, qblock, bounce pad). */
  private isNearObstacle(wx: number): boolean {
    const check = (group: any) => {
      const children = group.getChildren() as any[];
      for (const p of children) {
        if (!p.active) continue;
        if (Math.abs(wx - p.x) < BLOCK * 1.2) return true;
      }
      return false;
    };
    return check(this.pipeGroup) || check(this.brickGroup) || check(this.qblockGroup) || check(this.bounceGroup);
  }

  /** Fill a gap with decorative water tiles. */
  private fillWater(gapX: number, gapW: number) {
    const startY = GROUND_Y + BLOCK * 0.1;
    const rows = Math.ceil((H - startY) / BLOCK) + 1;
    // Place water tiles at the exact same grid positions where ground blocks were removed
    for (let gx = Math.floor(gapX / BLOCK) * BLOCK; gx < gapX + gapW; gx += BLOCK) {
      const cx = gx + BLOCK / 2;
      // Only place if this position is inside the gap
      if (!this.isInGap(cx)) continue;
      for (let row = 0; row < rows; row++) {
        const w = this.add.image(cx, startY + row * BLOCK + BLOCK / 2, 'water');
        w.setDisplaySize(BLOCK, BLOCK);
        w.setDepth(-1);
      }
    }
  }

  private generateLevel(lo: number, hi: number) {
    let x = Math.max(lo, this.genX);
    while (x < hi) {
      x += (2 + Math.floor(Math.random() * 5)) * BLOCK;
      const r = Math.random();
      if (r < 0.06) {
        // Coin arch — 5-6 coins in a parabolic arc
        const arcLen = 5 + Math.floor(Math.random() * 2);
        for (let i = 0; i < arcLen; i++) {
          const t = i / (arcLen - 1);
          const arcY = GROUND_Y - BLOCK * 1.5 - Math.sin(t * Math.PI) * BLOCK * 2;
          const c = this.coinGroup.create(x + i * BLOCK + BLOCK / 2, arcY, 'coin0') as any;
          c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
          c.body.setAllowGravity(false);
          c.body.setSize(12, 18);
        }
        x += arcLen * BLOCK;
      } else if (r < 0.14) {
        // Block row with ?-block
        const n = 3 + Math.floor(Math.random() * 2);
        const y = GROUND_Y - BLOCK * 2;
        const qi = Math.floor(Math.random() * n);
        for (let i = 0; i < n; i++) {
          const bx = x + i * BLOCK;
          if (i === qi) {
            const q = this.qblockGroup.create(bx + BLOCK / 2, y + BLOCK / 2, 'qblock_img') as any;
            q.setData('hit', false); q.setData('reward', 'coin');
            q.setDisplaySize(BLOCK, BLOCK);
            q.refreshBody();
          } else {
            const b = this.brickGroup.create(bx + BLOCK / 2, y + BLOCK / 2, 'brown_block') as any;
            b.setDisplaySize(BLOCK, BLOCK);
            b.refreshBody();
          }
        }
        // Coins above block row
        for (let i = 0; i < n; i++) {
          if (Math.random() < 0.4) {
            const c = this.coinGroup.create(x + i * BLOCK + BLOCK / 2, y - BLOCK / 2, 'coin0') as any;
            c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
            c.body.setAllowGravity(false);
            c.body.setSize(12, 18);
          }
        }
        x += n * BLOCK;
        // Enemy patrolling on top of the block row (~60% chance, ground types only)
        if (Math.random() < 0.6) {
          const enemyX = x - Math.floor(n / 2) * BLOCK;
          const e = this.spawnEnemyAt('goomba', enemyX, y - BLOCK, true);
          if (e) {
            e.setVelocityX(0);
            e.setData('patrolAwait', true);
            e.setData('patrolLeft', enemyX - BLOCK * (n / 2 - 0.5));
            e.setData('patrolRight', enemyX + BLOCK * (n / 2 - 0.5));
          }
        }
      } else if (r < 0.19) {
        // Bounce pad — spring block that launches the player
        const pad = this.bounceGroup.create(x + BLOCK / 2, GROUND_Y - BLOCK / 2, 'bounce_pad') as any;
        pad.setDisplaySize(BLOCK, BLOCK);
        pad.refreshBody();
        // Coins high above the pad as reward
        for (let i = 0; i < 3; i++) {
          const c = this.coinGroup.create(x + BLOCK / 2, GROUND_Y - BLOCK * (4 + i), 'coin0') as any;
          c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
          c.body.setAllowGravity(false);
          c.body.setSize(12, 18);
        }
        x += BLOCK * 2;
      } else if (r < 0.27) {
        // Pipe — 1-2 blocks tall (jumpable)
        const pipeBlocks = 1 + Math.floor(Math.random() * 2);
        const ph = pipeBlocks * BLOCK;
        const pw = 2 * BLOCK;
        const py = GROUND_Y - ph;
        const isGold = Math.random() < 0.25;
        const isWarp = !isGold && Math.random() < 0.4;
        let topSeg: any = null;
        for (let yy = py; yy < GROUND_Y; yy += BLOCK) {
          const isTop = yy === py;
          const tex = isTop && isGold ? 'pipe_gold' : isTop && isWarp ? 'pipe_warp' : 'pipe_body';
          const seg = this.pipeGroup.create(x + pw / 2, yy + BLOCK / 2, tex) as any;
          seg.setDisplaySize(BLOCK * 2, BLOCK);
          seg.refreshBody();
          if (isTop) topSeg = seg;
        }
        if (topSeg) {
          if (isWarp) topSeg.setData('warp', true);
          if (isGold) topSeg.setData('gold', true);
        }
        // Piranha plant on regular pipes (~60% chance)
        if (!isWarp && !isGold && Math.random() < 0.6) {
          const p = this.piranhaGroup.create(x + pw / 2, py - 8, 'piranha_0') as any;
          p.setOrigin(0.5, 1);
          p.setDisplaySize(BLOCK * 0.8, BLOCK);
          p.body.setAllowGravity(false);
          p.setData('pipeX', x + pw / 2);
          p.setData('pipeTopY', py);
          p.setData('timer', Math.random() * 4000);
          p.setData('exposed', false);
          p.setVisible(false);
        }
        x += pw;
      } else if (r < 0.37) {
        // Enemy — single (combined enemy types, random pick)
        const types: ('goomba' | 'koopa' | 'rkoopa')[] = ['goomba', 'goomba', 'koopa', 'rkoopa'];
        this.spawnEnemy(types[Math.floor(Math.random() * types.length)], x);
        x += BLOCK * 2;
      } else if (r < 0.42) {
        // Enemy pair — two different enemies spawned close together
        const types: ('goomba' | 'koopa' | 'rkoopa')[] = ['goomba', 'koopa', 'rkoopa'];
        const t1 = types[Math.floor(Math.random() * types.length)];
        let t2 = types[Math.floor(Math.random() * types.length)];
        while (t2 === t1) t2 = types[Math.floor(Math.random() * types.length)];
        this.spawnEnemy(t1, x);
        this.spawnEnemy(t2, x + BLOCK * 2);
        x += BLOCK * 4;
      } else if (r < 0.48) {
        // Combined ?-block — mushroom or coin reward
        const reward = Math.random() < 0.35 ? 'mushroom' : 'coin';
        const q = this.qblockGroup.create(x + BLOCK / 2, GROUND_Y - BLOCK * 2 + BLOCK / 2, 'qblock_img') as any;
        q.setData('hit', false); q.setData('reward', reward);
        q.setDisplaySize(BLOCK, BLOCK);
        q.refreshBody();
        x += BLOCK;
      } else if (r < 0.54) {
        // Ascending staircase with enemy on top (max 3 steps for reachability)
        const h = 2 + Math.floor(Math.random() * 2);
        for (let step = 0; step < h; step++) {
          const b = this.brickGroup.create(
            x + step * BLOCK + BLOCK / 2,
            GROUND_Y - (step + 1) * BLOCK + BLOCK / 2,
            'brown_block'
          ) as any;
          b.setDisplaySize(BLOCK, BLOCK);
          b.refreshBody();
        }
        // 50% chance enemy on the top step
        if (Math.random() < 0.5) {
          const topX = x + (h - 1) * BLOCK + BLOCK / 2;
          const topY = GROUND_Y - h * BLOCK - BLOCK;
          this.spawnEnemyAt('goomba', topX, topY);
        }
        x += h * BLOCK;
      } else if (r < 0.60) {
        // Water gap
        const gapW = (3 + Math.floor(Math.random() * 2)) * BLOCK;
        this.gaps.push({ start: x, end: x + gapW });
        (this.groundGroup.getChildren() as any[]).forEach((g: any) => {
          if (g.x >= x && g.x < x + gapW) g.destroy();
        });
        this.fillWater(x, gapW);
        // 50% chance: fire eruption hazard in the gap
        if (Math.random() < 0.5) {
          const fireX = x + gapW / 2;
          const f = this.fireGroup.create(fireX, GROUND_Y + BLOCK * 2, 'fire_column') as any;
          f.setDisplaySize(BLOCK * 0.8, BLOCK * 2);
          f.setOrigin(0.5, 1);
          f.body.setAllowGravity(false);
          f.setData('baseY', GROUND_Y + BLOCK * 2);
          f.setData('gapX', fireX);
          f.setData('active', false);
          f.setVisible(false);
          f.body.enable = false;
        }
        x += gapW;
      } else if (r < 0.66) {
        // Collapsing bridge over gap
        const bridgeLen = 4 + Math.floor(Math.random() * 4);
        const gapW = bridgeLen * BLOCK;
        this.gaps.push({ start: x, end: x + gapW });
        (this.groundGroup.getChildren() as any[]).forEach((g: any) => {
          if (g.x >= x && g.x < x + gapW) g.destroy();
        });
        this.fillWater(x, gapW);
        for (let i = 0; i < bridgeLen; i++) {
          const bx = x + i * BLOCK + BLOCK / 2;
          const bt = this.bridgeGroup.create(bx, GROUND_Y + BLOCK / 2, 'bridge_tile') as any;
          bt.setDisplaySize(BLOCK, BLOCK);
          bt.refreshBody();
          bt.setData('unstable', Math.random() < 0.4);
          bt.setData('collapsing', false);
        }
        x += gapW;
      } else if (r < 0.72) {
        // Multi-tier platform
        const lowerY = GROUND_Y - BLOCK * 2;
        for (let i = 0; i < 4; i++) {
          if (i === 1) {
            const q = this.qblockGroup.create(x + i * BLOCK + BLOCK / 2, lowerY + BLOCK / 2, 'qblock_img') as any;
            q.setData('hit', false); q.setData('reward', 'coin');
            q.setDisplaySize(BLOCK, BLOCK);
            q.refreshBody();
          } else {
            const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, lowerY + BLOCK / 2, 'brown_block') as any;
            b.setDisplaySize(BLOCK, BLOCK);
            b.refreshBody();
          }
        }
        const upperY = GROUND_Y - BLOCK * 5;
        for (let i = 1; i <= 2; i++) {
          const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, upperY + BLOCK / 2, 'brown_block') as any;
          b.setDisplaySize(BLOCK, BLOCK);
          b.refreshBody();
        }
        const c = this.coinGroup.create(x + 1.5 * BLOCK + BLOCK / 2, upperY - BLOCK / 2, 'coin0') as any;
        c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
        c.body.setAllowGravity(false);
        c.body.setSize(12, 18);
        x += 4 * BLOCK;
      } else if (r < 0.78) {
        // Mixed brick/qblock cluster with enemy
        const clusterLen = 5;
        const clusterY = GROUND_Y - BLOCK * 2;
        const qPositions = new Set<number>();
        const qCount = 1 + Math.floor(Math.random() * 2);
        while (qPositions.size < qCount) {
          qPositions.add(Math.floor(Math.random() * clusterLen));
        }
        for (let i = 0; i < clusterLen; i++) {
          if (qPositions.has(i)) {
            const q = this.qblockGroup.create(x + i * BLOCK + BLOCK / 2, clusterY + BLOCK / 2, 'qblock_img') as any;
            q.setData('hit', false); q.setData('reward', 'coin');
            q.setDisplaySize(BLOCK, BLOCK);
            q.refreshBody();
          } else {
            const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, clusterY + BLOCK / 2, 'brown_block') as any;
            b.setDisplaySize(BLOCK, BLOCK);
            b.refreshBody();
          }
        }
        x += clusterLen * BLOCK;
        // Enemy on top of the cluster
        if (Math.random() < 0.5) {
          this.spawnEnemyAt('goomba', x - 2 * BLOCK, clusterY - BLOCK);
        }
      } else if (r < 0.83) {
        // Elevated bridge with enemy
        const bridgeLen = 4 + Math.floor(Math.random() * 3);
        const bridgeY = GROUND_Y - BLOCK * 2;
        for (let i = 0; i < bridgeLen; i++) {
          const b = this.brickGroup.create(x + i * BLOCK + BLOCK / 2, bridgeY + BLOCK / 2, 'brown_block') as any;
          b.setDisplaySize(BLOCK, BLOCK);
          b.refreshBody();
        }
        // Coins along the bridge
        for (let i = 0; i < bridgeLen; i += 2) {
          const c = this.coinGroup.create(x + i * BLOCK + BLOCK / 2, bridgeY - BLOCK / 2, 'coin0') as any;
          c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
          c.body.setAllowGravity(false);
          c.body.setSize(12, 18);
        }
        this.spawnEnemyAt('goomba', x + BLOCK, bridgeY - BLOCK);
        x += bridgeLen * BLOCK;
      } else if (r < 0.88) {
        // Descending staircase
        const h = 2 + Math.floor(Math.random() * 2);
        for (let step = 0; step < h; step++) {
          const b = this.brickGroup.create(
            x + step * BLOCK + BLOCK / 2,
            GROUND_Y - (h - step) * BLOCK + BLOCK / 2,
            'brown_block'
          ) as any;
          b.setDisplaySize(BLOCK, BLOCK);
          b.refreshBody();
        }
        // Enemy on top
        if (Math.random() < 0.4) {
          this.spawnEnemyAt('goomba', x + BLOCK / 2, GROUND_Y - h * BLOCK - BLOCK);
        }
        x += h * BLOCK;
      } else if (r < 0.94) {
        // Floating coins — zigzag pattern
        const zigLen = 4 + Math.floor(Math.random() * 2);
        for (let i = 0; i < zigLen; i++) {
          const zigY = GROUND_Y - BLOCK * 2 - (i % 2 === 0 ? 0 : BLOCK);
          const c = this.coinGroup.create(x + i * BLOCK + BLOCK / 2, zigY, 'coin0') as any;
          c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
          c.body.setAllowGravity(false);
          c.body.setSize(12, 18);
        }
        x += zigLen * BLOCK;
      } else {
        // Spike gauntlet — spike, platform, spike, platform pattern
        const pairs = 2 + Math.floor(Math.random() * 2); // 2-3 spike-platform pairs
        const spacing = BLOCK * 1.6;
        for (let i = 0; i < pairs * 2 + 1; i++) {
          const sx = x + i * spacing;
          if (i % 2 === 0) {
            // Spike
            const spike = this.add.image(sx + BLOCK / 2, GROUND_Y - BLOCK * 0.3, 'spikes_tile');
            spike.setDisplaySize(BLOCK, BLOCK * 0.6);
            spike.setDepth(2);
            const hitZone = this.fireGroup.create(sx + BLOCK / 2, GROUND_Y - BLOCK * 0.2, 'spikes_tile') as any;
            hitZone.setDisplaySize(BLOCK * 0.9, BLOCK * 0.4);
            hitZone.setAlpha(0);
            hitZone.body.setAllowGravity(false);
            hitZone.body.enable = true;
          } else {
            // Small raised platform to land on between spikes
            const plat = this.groundGroup.create(sx + BLOCK / 2, GROUND_Y - BLOCK * 0.5 + BLOCK / 2, 'grass_block') as any;
            plat.setDisplaySize(BLOCK, BLOCK);
            plat.refreshBody();
            // Coin above platform
            const c = this.coinGroup.create(sx + BLOCK / 2, GROUND_Y - BLOCK * 2, 'coin0') as any;
            c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
            c.body.setAllowGravity(false);
            c.body.setSize(12, 18);
          }
        }
        x += (pairs * 2 + 1) * spacing;
      }
    }
    this.genX = Math.max(this.genX, x);
    this.extendGround(0, this.genX + W);

    // Scatter decorative bushes in the new section
    for (let bx = lo; bx < hi; bx += BLOCK * 6 + Math.floor(Math.random() * BLOCK * 4)) {
      if (this.isInGap(bx)) continue;
      const isBig = Math.random() < 0.3;
      const tex = isBig ? 'big_bush' : 'small_bush';
      const bush = this.add.image(bx, GROUND_Y, tex);
      bush.setDisplaySize(isBig ? BLOCK * 1.5 : BLOCK, BLOCK * 0.5);
      bush.setOrigin(0.5, 1);
      bush.setDepth(1);
      bush.setAlpha(0.8);
    }

    // Scatter ground-level coin trails between obstacles (skip coins near pipes)
    for (let cx = lo; cx < hi; cx += BLOCK * 8 + Math.floor(Math.random() * BLOCK * 6)) {
      if (this.isInGap(cx)) continue;
      if (Math.random() < 0.4) continue; // skip some
      const trailLen = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < trailLen; i++) {
        const coinX = cx + i * BLOCK;
        if (this.isInGap(coinX)) break;
        if (this.isNearObstacle(coinX)) break;
        const c = this.coinGroup.create(coinX + BLOCK / 2, GROUND_Y - BLOCK * 0.7, 'coin0') as any;
        c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
        c.body.setAllowGravity(false);
        c.body.setSize(12, 18);
      }
    }

    // Flag checkpoint every ~2500px
    this.distanceSinceFlag += (hi - lo);
    if (this.distanceSinceFlag > 2500) {
      this.distanceSinceFlag = 0;
      const flagX = this.genX - BLOCK * 2;
      if (!this.isInGap(flagX)) {
        for (let i = 0; i < 3; i++) {
          const pole = this.add.image(flagX, GROUND_Y - i * BLOCK - BLOCK / 2, 'brown_block');
          pole.setDisplaySize(BLOCK * 0.3, BLOCK);
          pole.setDepth(1);
        }
        const flag = this.flagGroup.create(flagX, GROUND_Y - BLOCK * 3 + BLOCK / 2, 'flag_tile') as any;
        flag.setDisplaySize(BLOCK, BLOCK * 1.5);
        flag.setOrigin(0.5, 1);
        flag.refreshBody();
      }
    }
  }

  private spawnEnemy(kind: 'goomba' | 'koopa' | 'rkoopa', x: number) {
    this.spawnEnemyAt(kind, x + BLOCK / 2, GROUND_Y);
  }

  private spawnEnemyAt(kind: 'goomba' | 'koopa' | 'rkoopa', x: number, y: number, groundOnly = false): any {
    let roll = Math.random();
    // When spawning on blocks, re-roll if we get a bat (bats fly away)
    if (groundOnly && roll >= 0.80) roll = Math.random() * 0.80;
    let tex: string;
    let animKey: string;
    let enemyType: string;
    let speed: number;
    let displayH = BLOCK;

    if (roll < 0.30) {
      tex = 'enemy';
      animKey = 'enemy_walk';
      enemyType = 'monster';
      speed = -100;
    } else if (roll < 0.55) {
      tex = 'enemy_short';
      animKey = 'enemy_short_walk';
      enemyType = 'bulldog';
      speed = -140;
    } else if (roll < 0.80) {
      tex = 'enemy_tall';
      animKey = 'enemy_tall_walk';
      enemyType = 'snake';
      speed = -80;
      displayH = BLOCK * 1.5;
    } else {
      tex = 'bat_0';
      animKey = '';
      enemyType = 'bat';
      speed = -120;
    }

    const isBat = enemyType === 'bat';
    const e = this.enemyGroup.create(x, y, tex, 0) as any;
    e.setOrigin(0.5, 1);
    e.setDisplaySize(BLOCK, displayH);
    e.body.setGravityY(isBat ? 0 : 1800);
    e.body.setAllowGravity(!isBat);
    e.setVelocityX(speed);
    e.setBounceX(1);
    e.setCollideWorldBounds(false);
    e.setData('kind', kind);
    e.setData('enemyType', enemyType);
    e.setData('state', 'walk');
    e.setData('timer', 0);
    e.setData('baseY', y);

    if (animKey) {
      e.anims.play(animKey, true);
    }
    return e;
  }

  update(_t: number, dtMs: number) {
    if (this.dead) {
      this.deadTimer -= dtMs;
      this.player.setVelocityX(0);
      if (this.deadTimer <= 0 && !this.gameOverShown) this.respawn();
      return;
    }

    if (this.warping) return;

    if (this.parachuteMode) {
      // Stop camera from following — terrain stays fixed
      this.cameras.main.stopFollow();

      if (this.parachuteSprite) {
        this.parachuteSprite.x = this.player.x;
        const playerH = PLAYER_H;
        this.parachuteSprite.y = this.player.y - playerH + 8;
      }

      // Full directional control with arrow keys
      const camX = this.cameras.main.scrollX;
      if (this.cursors.left.isDown) {
        this.player.setVelocityX(-200);
      } else if (this.cursors.right.isDown) {
        this.player.setVelocityX(200);
      } else {
        this.player.setVelocityX(Math.sin(this.time.now / 1200) * 40);
      }

      if (this.cursors.up.isDown) {
        this.player.setVelocityY(-180);
      } else if (this.cursors.down.isDown) {
        this.player.setVelocityY(300);
      }

      // Keep Player within visible screen
      if (this.player.x < camX + 30) this.player.x = camX + 30;
      if (this.player.x > camX + W - 30) this.player.x = camX + W - 30;
      if (this.player.y < 40) this.player.y = 40;
      this.parachuteTimer += dtMs;
      if (this.parachuteTimer > 1500 && this.parachuteFlyingEnemies.length < 15) {
        this.parachuteTimer = 0;
        const fromLeft = Math.random() < 0.5;
        const camX = this.cameras.main.scrollX;
        const ex = fromLeft ? camX - 20 : camX + W + 20;
        const ey = this.player.y + (Math.random() - 0.3) * 200;
        const fe = this.enemyGroup.create(ex, ey, 'enemy', 0) as any;
        fe.setOrigin(0.5, 0.5);
        fe.setDisplaySize(BLOCK, BLOCK);
        fe.body.setAllowGravity(false);
        fe.setVelocityX(fromLeft ? 150 : -150);
        fe.setData('kind', 'goomba');
        fe.setData('state', 'flying');
        fe.setData('timer', 0);
        this.parachuteFlyingEnemies.push(fe);
      }
      const pCamLeft = this.cameras.main.scrollX;
      this.parachuteFlyingEnemies = this.parachuteFlyingEnemies.filter(e => {
        if (!e.active) return false;
        if (e.x < pCamLeft - 100 || e.x > pCamLeft + W + 100) { e.destroy(); return false; }
        return true;
      });
      const pOnGround = this.player.body.blocked.down || this.player.body.touching.down;
      if (pOnGround && this.player.y >= GROUND_Y - 10) {
        this.endParachute();
      }
      this.player.anims.stop();
      this.player.setFrame(4); // jump frame while parachuting
      if (this.cursors.left.isDown) this.player.flipX = true;
      else if (this.cursors.right.isDown) this.player.flipX = false;
      this.player.setDisplaySize(PLAYER_W, PLAYER_H);

      // Check enemy collisions during parachute
      (this.enemyGroup.getChildren() as any[]).forEach((e: any) => {
        if (!e.active || e.getData('state') === 'dead') return;
        const dx = Math.abs(this.player.x - e.x);
        const dy = this.player.y - e.y;
        if (dx < BLOCK * 0.8 && Math.abs(dy) < BLOCK * 0.8) {
          if (dy < 0) {
            // Player is above enemy — stomp kill
            e.setVelocityY(-300);
            e.flipY = true;
            e.setData('state', 'dead');
            this.time.delayedCall(600, () => { if (e.active) e.destroy(); });
            this.addScore(300, e.x, e.y - 10);
          } else if (this.invincible <= 0) {
            // Enemy hit player from side/below — lose a life
            this.endParachute();
            this.die();
          }
        }
      });

      this.syncScoreToHUD();
      return;
    }

    if (this.invincible > 0) this.invincible -= dtMs * 0.06;
    if (this.shrinkTimer > 0) this.shrinkTimer -= dtMs * 0.06;
    if (this.stompGrace > 0) this.stompGrace -= dtMs * 0.06;
    if (this.fireCooldown > 0) this.fireCooldown -= dtMs * 0.06;

    const running = this.keys.shift.isDown;
    // Powered up = faster speed + higher acceleration
    const speedMult = this.isBig ? 1.5 : 1;
    const maxSpeed = (running ? 320 : 200) * speedMult;
    const accel = (running ? 1100 : 800) * speedMult;

    if (this.cursors.left.isDown) {
      this.player.setAccelerationX(-accel);
      this.facingRight = false;
      if (this.player.body.velocity.x > 0) this.player.setVelocityX(this.player.body.velocity.x * 0.7);
    } else if (this.cursors.right.isDown) {
      this.player.setAccelerationX(accel);
      this.facingRight = true;
      if (this.player.body.velocity.x < 0) this.player.setVelocityX(this.player.body.velocity.x * 0.7);
    } else {
      this.player.setAccelerationX(0);
      const v = this.player.body.velocity.x;
      if (Math.abs(v) < 12) this.player.setVelocityX(0);
      else this.player.setVelocityX(v * 0.9);
    }

    if (this.player.body.velocity.x > maxSpeed) this.player.setVelocityX(maxSpeed);
    if (this.player.body.velocity.x < -maxSpeed) this.player.setVelocityX(-maxSpeed);

    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    const touchingWall = this.player.body.blocked.left || this.player.body.blocked.right;
    if (onGround) {
      this.coyoteTime = 120; // generous coyote time, especially helps near walls
      this.hasDoubleJumped = false;
      this.canDoubleJump = false;
    } else {
      this.coyoteTime = Math.max(0, this.coyoteTime - dtMs);
      if (!this.canDoubleJump && this.coyoteTime <= 0) this.canDoubleJump = true;
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dtMs);

    const jumpKeyDown = this.keys.space.isDown || this.cursors.up.isDown;
    const jumpJustPressed = jumpKeyDown && !this.jumpKeyWasDown;
    this.jumpKeyWasDown = jumpKeyDown;

    if (jumpJustPressed) this.jumpBuffer = 150;

    // Allow jump when on ground OR when pressed against a wall and recently on ground
    const canJump = this.coyoteTime > 0 || (touchingWall && this.coyoteTime > -50);
    if (this.jumpBuffer > 0 && canJump) {
      // Normal jump — higher when powered up
      this.player.setVelocityY(this.isBig ? -950 : -820);
      this.jumpBuffer = 0;
      this.coyoteTime = 0;
      this.sound.play('sfx_jump', { volume: 0.2 });
    } else if (jumpJustPressed && !onGround && this.canDoubleJump && !this.hasDoubleJumped) {
      // Double jump — also boosted when powered
      this.player.setVelocityY(this.isBig ? -800 : -700);
      this.hasDoubleJumped = true;
      this.sound.play('sfx_jump', { volume: 0.15 });
    }

    // Variable jump height: low gravity while ascending and key held.
    if (jumpKeyDown && this.player.body.velocity.y < 0) {
      this.player.body.setGravityY(900);
    } else {
      this.player.body.setGravityY(1800);
    }

    if (this.isBig && this.fireCooldown <= 0 &&
        (Phaser.Input.Keyboard.JustDown(this.keys.f) || Phaser.Input.Keyboard.JustDown(this.keys.z))) {
      this.throwFireball();
      this.fireCooldown = 12;
    }

    const camLeft = this.cameras.main.scrollX;
    if (this.player.x < camLeft) {
      this.player.x = camLeft;
      this.player.setVelocityX(0);
    }

    if (onGround && !this.isInGap(this.player.x)) {
      this.lastSafeX = this.player.x;
    }

    // Warp / golden pipe check — Player must be standing ON TOP of the pipe
    if (onGround && this.cursors.down.isDown && !this.warping) {
      const pipes = this.pipeGroup.getChildren() as any[];
      for (const p of pipes) {
        if (!p.getData('warp') && !p.getData('gold')) continue;
        const pdx = Math.abs(this.player.x - p.x);
        // Player's feet (y with origin 0.5,1) should be at the pipe top edge
        const pipeTop = p.y - BLOCK / 2;
        const feetDelta = Math.abs(this.player.y - pipeTop);
        // Also accept Player standing at ground level next to a short pipe
        if (pdx < BLOCK * 1.5 && feetDelta < BLOCK) {
          if (p.getData('gold') && !this.parachuteMode) {
            this.startParachute(p);
          } else if (p.getData('warp')) {
            this.startWarp(p);
          }
          break;
        }
      }
    }

    if (this.player.y > H + 50) {
      this.die();
      return;
    }

    const edge = this.cameras.main.scrollX + W + 600;
    if (edge > this.genX) this.generateLevel(this.genX, edge);

    const vx = this.player.body.velocity.x;
    const speed = Math.abs(vx);
    // Player-intent direction this frame (from input). Used to detect skid.
    const left = this.cursors.left.isDown;
    const right = this.cursors.right.isDown;
    const intent = right ? 1 : left ? -1 : 0;
    const moveDir = vx > 5 ? 1 : vx < -5 ? -1 : 0;

    // Animation: use Phaser's anims system with the spritesheet.
    const sheetKey = 'player';
    const walkAnim = 'player_walk';

    // Scale — always same size, glow indicates power-up
    this.player.setDisplaySize(PLAYER_W, PLAYER_H);

    if (this.glowSprite) {
      if (this.isBig) {
        this.glowSprite.setVisible(true);
        this.glowSprite.x = this.player.x;
        this.glowSprite.y = this.player.y - PLAYER_H / 2;
        // Pulse the glow
        this.glowSprite.setAlpha(0.35 + Math.sin(this.time.now / 200) * 0.15);
      } else {
        this.glowSprite.setVisible(false);
      }
    }

    // Ensure correct texture
    if (this.player.texture.key !== sheetKey) {
      this.player.setTexture(sheetKey, 0);
    }

    if (!onGround) {
      this.player.anims.stop();
      this.player.setFrame(4); // jump
    } else if (intent !== 0 && moveDir !== 0 && intent !== moveDir && speed > 60) {
      this.player.anims.stop();
      this.player.setFrame(0); // no skid frame in new set, use idle
    } else if (speed > 20) {
      this.player.anims.play(walkAnim, true);
      const animFps = Math.max(6, Math.min(20, speed / 20));
      this.player.anims.msPerFrame = 1000 / animFps;
    } else {
      this.player.anims.stop();
      this.player.setFrame(0); // idle
    }

    // Face the input direction while skidding (so skid sprite looks "back"
    // toward old motion); otherwise face current motion / last facing.
    if (intent !== 0) this.facingRight = intent > 0;
    else if (moveDir !== 0) this.facingRight = moveDir > 0;
    this.player.flipX = !this.facingRight;

    const blink = (this.invincible > 0 || this.shrinkTimer > 0) && Math.floor(this.time.now / 80) % 2 === 0;
    this.player.setVisible(!blink);

    (this.coinGroup.getChildren() as any[]).forEach(c => {
      const i = Math.floor(this.time.now / 120) % 2;
      c.setTexture(i === 0 ? 'coin0' : 'coin1');
      if (c.x < camLeft - 100) c.destroy();
    });

    // Bridge collapse — unstable tiles start falling when player approaches
    (this.bridgeGroup.getChildren() as any[]).forEach((bt: any) => {
      if (!bt.active || !bt.getData('unstable') || bt.getData('collapsing')) return;
      const dx = bt.x - this.player.x;
      // Trigger when player is within 6 blocks ahead or 2 blocks behind
      if (dx < BLOCK * 6 && dx > -BLOCK * 2) {
        bt.setData('collapsing', true);
        // ~1 second shake warning before falling
        this.tweens.add({
          targets: bt,
          x: bt.x + 3,
          duration: 60,
          yoyo: true,
          repeat: 8,
          onComplete: () => {
            bt.body.enable = false;
            this.tweens.add({
              targets: bt,
              y: bt.y + 300,
              alpha: 0,
              duration: 500,
              onComplete: () => bt.destroy(),
            });
          },
        });
      }
    });

    // Fire eruptions — shoot up from gaps when player approaches
    (this.fireGroup.getChildren() as any[]).forEach((f: any) => {
      if (!f.active) return;
      const dx = Math.abs(this.player.x - f.getData('gapX'));
      const baseY = f.getData('baseY');
      const isActive = f.getData('active');
      
      if (dx < BLOCK * 4 && !isActive) {
        // Player approaching — erupt!
        f.setData('active', true);
        f.setVisible(true);
        f.body.enable = true;
        f.y = baseY;
        this.tweens.add({
          targets: f,
          y: GROUND_Y - BLOCK * 2,
          duration: 300,
          ease: 'Quad.easeOut',
          onComplete: () => {
            // Hold briefly then retract
            this.time.delayedCall(800, () => {
              if (!f.active) return;
              this.tweens.add({
                targets: f,
                y: baseY,
                duration: 400,
                onComplete: () => {
                  f.setVisible(false);
                  f.body.enable = false;
                  // Reset after cooldown
                  this.time.delayedCall(2000, () => {
                    if (f.active) f.setData('active', false);
                  });
                },
              });
            });
          },
        });
      }
      
      // Flicker effect while visible
      if (f.visible) {
        f.setAlpha(0.8 + Math.sin(this.time.now / 50) * 0.2);
      }
      
      if (f.x < camLeft - 200) f.destroy();
    });

    // Piranha plant animation
    (this.piranhaGroup.getChildren() as any[]).forEach((p: any) => {
      if (!p.active) return;
      let timer = p.getData('timer') + dtMs;
      const pipeTopY = p.getData('pipeTopY');
      const cycle = 4000;
      const phase = (timer % cycle) / cycle;
      const dx = Math.abs(this.player.x - p.getData('pipeX'));
      if (dx < BLOCK * 2) {
        p.setVisible(false);
        p.body.enable = false;
        p.setData('timer', timer);
        return;
      }
      if (phase < 0.25) {
        const t = phase / 0.25;
        p.y = pipeTopY + BLOCK * (1 - t);
        p.setVisible(true);
        p.body.enable = true;
      } else if (phase < 0.5) {
        p.y = pipeTopY;
        p.setVisible(true);
        p.body.enable = true;
        p.setTexture(Math.floor(timer / 200) % 2 === 0 ? 'piranha_0' : 'piranha_1');
      } else if (phase < 0.75) {
        const t = (phase - 0.5) / 0.25;
        p.y = pipeTopY + BLOCK * t;
        p.setVisible(true);
        p.body.enable = true;
      } else {
        p.setVisible(false);
        p.body.enable = false;
      }
      p.setData('timer', timer);
      if (p.x < camLeft - 200) p.destroy();
    });

    (this.enemyGroup.getChildren() as any[]).forEach(e => this.updateEnemy(e, camLeft));

    (this.mushroomGroup.getChildren() as any[]).forEach(m => {
      if (m.x < camLeft - 100 || m.y > H + 100) m.destroy();
    });

    (this.fireballGroup.getChildren() as any[]).forEach(fb => {
      if (fb.x < camLeft - 100 || fb.x > camLeft + W + 200 || fb.y > H + 50) fb.destroy();
    });
  }

  private updateEnemy(e: any, camLeft: number) {
    if (!e.active) return;
    const state = e.getData('state');
    const kind = e.getData('kind');
    const enemyType = e.getData('enemyType') || 'monster';

    if (e.x < camLeft - BLOCK * 3) { e.destroy(); return; }
    if (e.y > H + 50) { e.destroy(); return; }
    if (!e.body) return;

    // Block-row patrol: idle until player approaches, then bounce within bounds
    if (e.getData('patrolAwait')) {
      if (Math.abs(this.player.x - e.x) < W) {
        e.setData('patrolAwait', false);
        e.setVelocityX(-80);
      } else {
        e.setVelocityX(0);
        return;
      }
    }
    const pLeft = e.getData('patrolLeft');
    if (pLeft !== undefined && pLeft !== null) {
      const pRight = e.getData('patrolRight');
      if (e.x <= pLeft) { e.setVelocityX(80); }
      else if (e.x >= pRight) { e.setVelocityX(-80); }
    }

    if (state === 'walk' || state === 'flying') {
      // Animate based on enemy type
      if (enemyType === 'bat') {
        const frame = Math.floor(this.time.now / 150) % 2;
        e.setTexture(frame === 0 ? 'bat_0' : 'bat_1');
        e.setDisplaySize(BLOCK, BLOCK);
        const baseY = e.getData('baseY') || GROUND_Y - BLOCK * 2;
        e.y = baseY + Math.sin(this.time.now / 400 + e.x * 0.01) * 40;
      }
      // monster, bulldog, snake all use anims — no manual texture swap needed

      if (kind === 'rkoopa' && (e.body.blocked.down || e.body.touching.down)) {
        const ahead = e.x + (e.body.velocity.x > 0 ? BLOCK : -BLOCK);
        if (this.isInGap(ahead)) {
          e.setVelocityX(-e.body.velocity.x);
        }
      }
      e.flipX = e.body.velocity.x > 0;
    } else if (state === 'shell_still') {
      let timer = e.getData('timer') - 1;
      e.setData('timer', timer);
      if (timer <= 0) {
        e.setData('state', 'walk');
        e.setVelocityX(-90);
      }
    }
  }

  private onPlayerHitBrick(_player: any, brick: any) {
    if (!this.player.body.touching.up) return;
    if (Math.abs(brick.x - this.player.x) > BLOCK * 0.55) return;
    this.collectCoinsAbove(brick.x, brick.y);
    this.knockEnemiesAbove(brick.x, brick.y);
    if (this.isBig) {
      brick.destroy();
      this.addScore(50, brick.x, brick.y - 20);
    } else {
      // Small player: bump animation only (no destruction)
      if (!brick.getData('bumping')) {
        brick.setData('bumping', true);
        const origY = brick.y;
        this.tweens.add({
          targets: brick, y: origY - 6, yoyo: true, duration: 80,
          onComplete: () => { brick.y = origY; brick.setData('bumping', false); }
        });
      }
    }
  }

  private onPlayerHitQBlock(_player: any, q: any) {
    if (q.getData('hit')) return;
    if (!this.player.body.touching.up) return;
    if (Math.abs(q.x - this.player.x) > BLOCK * 0.55) return;
    this.collectCoinsAbove(q.x, q.y);
    this.knockEnemiesAbove(q.x, q.y);
    q.setData('hit', true);
    q.setTexture('qblock_used');
    q.setDisplaySize(BLOCK, BLOCK);
    this.tweens.add({ targets: q, y: q.y - 6, yoyo: true, duration: 100 });
    const reward = q.getData('reward');
    if (reward === 'mushroom' && !this.isBig) {
      const m = this.mushroomGroup.create(q.x, q.y - BLOCK, 'mushroom') as any;
      m.body.setSize(28, 28);
      m.setVelocityX(120);
      m.setBounceX(1);
      m.body.setMaxVelocity(200, 600);
    } else {
      this.popCoin(q.x, q.y);
      this.addScore(200, q.x, q.y - 20);
    }
  }

  private popCoin(x: number, y: number) {
    const c = this.add.image(x, y, 'coin0').setDepth(50);
    c.setDisplaySize(BLOCK * 0.7, BLOCK * 0.9);
    this.tweens.add({
      targets: c,
      y: y - BLOCK * 2.2,
      duration: 350,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: c, y: y - BLOCK * 1.6, alpha: 0,
          duration: 200, onComplete: () => c.destroy(),
        });
      },
    });
  }

  private onPlayerCoin(_player: any, c: any) {
    c.destroy();
    this.addScore(100, c.x, c.y);
    this.sound.play('sfx_coin', { volume: 0.2 });
  }

  /** Collect any coins sitting directly above a block (within 1 block). */
  private collectCoinsAbove(blockX: number, blockY: number) {
    (this.coinGroup.getChildren() as any[]).forEach((c: any) => {
      if (!c.active) return;
      const dx = Math.abs(c.x - blockX);
      const dy = blockY - c.y; // coin should be above (positive = above)
      if (dx < BLOCK * 0.7 && dy > 0 && dy < BLOCK * 1.5) {
        // Pop the coin upward then destroy
        this.tweens.add({
          targets: c,
          y: c.y - BLOCK,
          alpha: 0,
          duration: 300,
          onComplete: () => c.destroy(),
        });
        this.addScore(100, c.x, c.y);
      }
    });
  }

  /** Knock out any enemy standing on top of a block that was hit from below. */
  private knockEnemiesAbove(blockX: number, blockY: number) {
    (this.enemyGroup.getChildren() as any[]).forEach((e: any) => {
      if (!e.active) return;
      const dx = Math.abs(e.x - blockX);
      const dy = blockY - e.y; // enemy should be above (positive = above)
      if (dx < BLOCK * 1.0 && dy > 0 && dy < BLOCK * 2) {
        this.addScore(200, e.x, e.y - 10);
        // Launch enemy upward then destroy
        e.setVelocityY(-400);
        e.setVelocityX((Math.random() - 0.5) * 200);
        e.flipY = true;
        e.body.setAllowGravity(true);
        e.setData('state', 'dead');
        this.time.delayedCall(800, () => { if (e.active) e.destroy(); });
      }
    });
  }

  private onPlayerMushroom(_player: any, m: any) {
    m.destroy();
    if (!this.isBig) {
      this.isBig = true;
      this.addScore(1000, this.player.x, this.player.y - 20);
      this.sound.play('sfx_powerup', { volume: 0.3 });
      // Growth flash — briefly golden then normal
      this.player.setTint(0xffdd00);
      this.time.delayedCall(300, () => {
        if (this.isBig) this.player.clearTint();
      });
      if (!this.glowSprite) {
        this.glowSprite = this.add.sprite(this.player.x, this.player.y - PLAYER_H/2, 'glow');
        this.glowSprite.setDisplaySize(PLAYER_W * 1.6, PLAYER_H * 1.6);
        this.glowSprite.setAlpha(0.5);
        this.glowSprite.setDepth(9);
        this.glowSprite.setBlendMode(Phaser.BlendModes.ADD);
      }
    }
  }

  private onPlayerEnemy(_player: any, e: any) {
    if (this.invincible > 0 || this.stompGrace > 0 || this.shrinkTimer > 0) return;
    const state = e.getData('state');
    const kind = e.getData('kind');

    // Powered up = invincible, destroy enemies on contact
    if (this.isBig && state === 'walk') {
      this.killGoomba(e);
      this.addScore(300, e.x, e.y - 20);
      this.invincible = 10;
      return;
    }

    const playerBottom = this.player.y;
    const enemyTop = e.y - e.displayHeight;
    const stomping = this.player.body.velocity.y > 50 &&
                     playerBottom < enemyTop + e.displayHeight * 0.5;

    if (stomping) {
      this.player.setVelocityY(-450);
      this.stompGrace = 25;
      this.sound.play('sfx_stomp', { volume: 0.25 });
      if (kind === 'goomba') {
        this.killGoomba(e);
      } else if (state === 'walk') {
        this.becomeShell(e);
        this.addScore(200, e.x, e.y - 20);
      } else if (state === 'shell_still') {
        const dir = this.player.x < e.x ? 1 : -1;
        e.setData('state', 'shell');
        e.setVelocityX(dir * 400);
        this.addScore(100, e.x, e.y - 20);
      } else if (state === 'shell') {
        e.setData('state', 'shell_still');
        e.setData('timer', 300);
        e.setVelocityX(0);
        this.addScore(100, e.x, e.y - 20);
      }
    } else if (state === 'shell_still') {
      const dir = this.player.x < e.x ? 1 : -1;
      e.setData('state', 'shell');
      e.setVelocityX(dir * 400);
      this.stompGrace = 15;
      this.addScore(100, e.x, e.y - 20);
    } else {
      this.takeHit();
    }
  }

  // Replace the enemy with a shell sprite using the dead frame.
  private becomeShell(e: any) {
    const kind = e.getData('kind');
    const x = e.x;
    e.destroy();
    const shell = this.enemyGroup.create(x, GROUND_Y, 'enemy', 4) as any;
    shell.setOrigin(0.5, 1);
    shell.setDisplaySize(BLOCK, BLOCK * 0.7);
    shell.body.setGravityY(1800);
    shell.body.setAllowGravity(true);
    shell.setVelocityX(0);
    shell.setBounceX(1);
    shell.setCollideWorldBounds(false);
    shell.setData('kind', kind);
    shell.setData('state', 'shell_still');
    shell.setData('timer', 300);
  }

  // Goomba "death": disable the body so nothing collides with it again, fade
  // and shrink it visually, then destroy. No state-machine, no body resizing
  // hacks — this avoids the floating/misaligned-body bugs.
  private killGoomba(e: any) {
    e.setData('state', 'dying');
    e.disableBody(false, false);
    e.anims.stop();
    if (e.getData('enemyType') === 'snake') {
      e.setFrame(4);
      e.setDisplaySize(BLOCK, BLOCK * 0.5); // squished
    } else {
      e.setFrame(4); // dead frame in all strips
    }
    this.addScore(200, e.x, e.y - 20);
    this.tweens.add({
      targets: e,
      scaleY: 0.3,
      alpha: 0,
      duration: 250,
      onComplete: () => e.destroy(),
    });
  }

  private onEnemyVsEnemy(a: any, b: any) {
    const aState = a.getData('state');
    const bState = b.getData('state');
    if (aState === 'shell' && bState !== 'dying' && bState !== 'shell') {
      this.killByShell(b);
    } else if (bState === 'shell' && aState !== 'dying' && aState !== 'shell') {
      this.killByShell(a);
    }
  }

  private killByShell(e: any) {
    if (e.getData('kind') === 'goomba') {
      this.killGoomba(e);
    } else {
      // Koopa hit by shell: knock it offscreen with an upward arc.
      e.setData('state', 'dying');
      e.disableBody(false, false);
      this.addScore(100, e.x, e.y - 20);
      this.tweens.add({
        targets: e, y: e.y - 80, alpha: 0, angle: 360,
        duration: 500, onComplete: () => e.destroy(),
      });
    }
  }

  private onFireballHitSolid(fb: any, _solid: any) {
    if (fb.body.blocked.down) {
      fb.setVelocityY(-350);
    } else {
      fb.destroy();
    }
  }

  private onFireballEnemy(fb: any, e: any) {
    const st = e.getData('state');
    if (st === 'dying') return;
    fb.destroy();
    this.killByShell(e);
  }

  private throwFireball() {
    const dir = this.facingRight ? 1 : -1;
    const fb = this.fireballGroup.create(this.player.x + dir * 20, this.player.y + 20, 'fireball') as any;
    fb.body.setSize(14, 14);
    fb.setVelocityX(dir * 450);
    fb.setVelocityY(-100);
    fb.setBounceY(0.6);
  }

  private takeHit() {
    if (this.isBig) {
      this.isBig = false;
      this.player.clearTint();
      this.shrinkTimer = 60;
      this.sound.play('sfx_hit', { volume: 0.3 });
      if (this.glowSprite) this.glowSprite.setVisible(false);
    } else {
      this.die();
    }
  }

  private die() {
    if (this.dead) return;
    this.lives--;
    this.syncLivesToHUD();
    this.dead = true;
    this.deadTimer = 1200;
    this.sound.play('sfx_die', { volume: 0.4 });
    this.player.setVelocity(0, -500);
    this.player.body.checkCollision.none = true;
    this.isBig = false;
    this.player.clearTint();
    if (this.glowSprite) this.glowSprite.setVisible(false);
    if (this.parachuteMode) this.endParachute();
  }

  private doRespawn() {
    this.dead = false;
    let x = Math.max(this.lastSafeX, this.cameras.main.scrollX + 200);
    while (this.isInGap(x)) x += BLOCK;
    this.player.setPosition(x, GROUND_Y - 100);
    this.player.setVelocity(0, 0);
    this.player.body.checkCollision.none = false;
    this.player.clearTint();
    this.invincible = 90;
    this.shrinkTimer = 0;
    this.stompGrace = 0;
    if (this.glowSprite) this.glowSprite.setVisible(false);
  }

  private respawn() {
    if (this.lives <= 0) {
      // Keep dead=true so update() doesn't run while overlay is showing
      this.player.setVisible(false);
      this.player.setVelocity(0, 0);
      this.player.body.checkCollision.none = true;
      this.showGameOver(this.score, () => {
        this.lives = 3;
        this.score = 0;
        this.syncScoreToHUD();
        this.syncLivesToHUD();
        this.player.setVisible(true);
        this.doRespawn();
      });
      return;
    }
    this.doRespawn();
  }

  private syncLivesToHUD() {
    const el = document.getElementById('lives-value');
    if (el) el.textContent = String(this.lives);
  }

  private syncLevelToHUD() {
    const el = document.getElementById('level-value');
    if (el) el.textContent = String(this.currentLevel);
  }

  private onPlayerBridge(_player: any, _tile: any) {
    // Collision still needed for standing — collapse is handled by proximity in update
  }

  private onPlayerBounce(_player: any, pad: any) {
    if (!this.player.body.touching.down) return;
    this.player.setVelocityY(-1200);
    // Compress animation on the pad
    this.tweens.add({
      targets: pad,
      scaleY: 0.5,
      duration: 100,
      yoyo: true,
      ease: 'Power2',
    });
    this.addScore(50, pad.x, pad.y - 20);
  }

  private onPlayerFlag(_player: any, flag: any) {
    flag.destroy();
    this.currentLevel++;
    this.currentBiome = (this.currentBiome + 1) % 4;
    this.syncLevelToHUD();
    this.addScore(5000, flag.x, flag.y - 30);
    this.sound.play('sfx_flag', { volume: 0.3 });

    const cam = this.cameras.main;
    cam.flash(500, 255, 255, 255, false);

    const txt = this.add.text(this.player.x, this.player.y - 80, `LEVEL ${this.currentLevel}!`, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '24px',
      color: '#ffdd00',
      stroke: '#000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(1000);

    this.tweens.add({
      targets: txt,
      y: txt.y - 60,
      alpha: 0,
      duration: 2000,
      onComplete: () => txt.destroy(),
    });
  }

  private onPlayerPiranha(_player: any, _p: any) {
    if (this.invincible > 0 || this.shrinkTimer > 0) return;
    if (this.isBig) {
      this.isBig = false;
      this.shrinkTimer = 60;
      this.invincible = 90;
      if (this.glowSprite) this.glowSprite.setVisible(false);
    } else {
      this.die();
    }
  }

  private onPlayerFire(_player: any, _f: any) {
    if (this.invincible > 0 || this.shrinkTimer > 0) return;
    if (this.isBig) {
      this.isBig = false;
      this.shrinkTimer = 60;
      this.invincible = 90;
      if (this.glowSprite) this.glowSprite.setVisible(false);
    } else {
      this.die();
    }
  }

  private startWarp(sourcePipe: any) {
    this.warping = true;
    this.player.setVelocity(0, 0);
    this.player.body.setAllowGravity(false);
    this.tweens.add({
      targets: this.player,
      y: sourcePipe.y + BLOCK,
      duration: 500,
      onComplete: () => {
        // Ensure terrain is generated far enough ahead for a destination
        const aheadX = sourcePipe.x + BLOCK * 30;
        if (this.genX < aheadX) {
          this.generateLevel(this.genX, aheadX);
          this.extendGround(this.genX, aheadX + W);
        }

        // Find a warp-eligible pipe well ahead of the source
        const minX = sourcePipe.x + BLOCK * 15;
        const pipes = (this.pipeGroup.getChildren() as any[])
          .filter((p: any) => p.x > minX && !p.getData('warp') && !p.getData('gold'))
          .sort((a: any, b: any) => a.x - b.x);
        // Pick the top segment of the next pipe (lowest y value at that x)
        const dest = pipes[0];
        if (dest) {
          // Find the topmost segment at this pipe's x position
          const topSeg = pipes.filter((p: any) => Math.abs(p.x - dest.x) < BLOCK)
            .sort((a: any, b: any) => a.y - b.y)[0];
          const destTop = topSeg.y - BLOCK / 2;
          this.player.setPosition(topSeg.x, destTop + BLOCK);
          this.player.setVisible(false);
          this.tweens.add({
            targets: this.player,
            y: destTop - 10,
            duration: 400,
            onStart: () => this.player.setVisible(true),
            onComplete: () => {
              this.player.body.setAllowGravity(true);
              this.warping = false;
              this.addScore(200, this.player.x, this.player.y - 20);
            },
          });
        } else {
          // No pipe found — warp the player forward to clear ground
          const landX = sourcePipe.x + BLOCK * 18;
          this.player.setPosition(landX, GROUND_Y - BLOCK);
          this.player.setVisible(true);
          this.player.body.setAllowGravity(true);
          this.warping = false;
          this.addScore(200, this.player.x, this.player.y - 20);
        }
      },
    });
  }

  private startParachute(pipe: any) {
    this.warping = true;
    this.parachuteMode = true;
    this.player.setVelocity(0, 0);
    this.player.body.setAllowGravity(false);
    this.tweens.add({
      targets: this.player,
      y: pipe.y + BLOCK,
      duration: 500,
      onComplete: () => {
        const targetX = this.cameras.main.scrollX + W / 2;
        this.player.setPosition(targetX, 60);
        this.player.setVisible(true);
        this.player.body.setAllowGravity(true);
        this.player.body.setGravityY(52);
        this.player.setMaxVelocity(200, 180);
        this.warping = false;
        this.parachuteSprite = this.add.sprite(this.player.x, this.player.y - 80, 'parachute');
        this.parachuteSprite.setDisplaySize(96, 120);
        this.parachuteSprite.setOrigin(0.5, 1); // bottom-center anchored to player's head
        this.parachuteSprite.setDepth(9);
        for (let i = 0; i < 8; i++) {
          const cx = targetX + (Math.random() - 0.5) * W * 0.6;
          const cy = 100 + Math.random() * (GROUND_Y - 200);
          const c = this.coinGroup.create(cx, cy, 'coin0') as any;
          c.setDisplaySize(BLOCK * 0.5, BLOCK * 0.65);
          c.body.setAllowGravity(false);
          c.body.setSize(12, 18);
          c.setData('parachuteCoin', true);
        }
        this.parachuteTimer = 0;
        this.parachuteFlyingEnemies = [];
      },
    });
  }

  private endParachute() {
    this.parachuteMode = false;
    if (this.parachuteSprite) {
      this.parachuteSprite.destroy();
      this.parachuteSprite = undefined;
    }
    this.player.body.setGravityY(1800);
    this.player.setMaxVelocity(700, 900);
    this.player.setAccelerationX(0);
    // Re-enable camera follow after parachute
    this.cameras.main.startFollow(this.player, true, 0.15, 0.05, -W * 0.2, 0);
    this.parachuteFlyingEnemies.forEach(e => { if (e.active) e.destroy(); });
    this.parachuteFlyingEnemies = [];
    this.addScore(500, this.player.x, this.player.y - 30);
  }
}
