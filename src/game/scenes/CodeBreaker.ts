// CodeBreaker — Wordle-style word puzzle game.
// Guess a 5-letter word in 6 tries. Tiles reveal color-coded hints.
// On-screen QWERTY keyboard tracks letter states.
// All graphics are procedural (Phaser Graphics + Text).

declare const Phaser: any;

import { BaseScene, W, H } from './BaseScene.js';
import type { Star } from './BaseScene.js';
import { ANSWERS, VALID_GUESSES } from './wordlist.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const MAX_GUESSES = 6;
const WORD_LENGTH = 5;

const COLOR_CORRECT = 0x538d4e;   // green
const COLOR_PRESENT = 0xb59f3b;   // yellow
const COLOR_ABSENT  = 0x3a3a3c;   // dark gray
const COLOR_EMPTY   = 0x121213;   // empty tile bg
const COLOR_BORDER  = 0x3a3a3c;   // tile border
const COLOR_ACTIVE  = 0x565758;   // active row border
const COLOR_KEY_BG  = 0x818384;   // keyboard key default
const COLOR_TEXT    = 0xffffff;   // white text

const GUESS_POINTS = [0, 1000, 800, 600, 400, 200, 100]; // index = guess number

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type TileState = 'empty' | 'filled' | 'correct' | 'present' | 'absent';
type KeyState = 'unused' | 'absent' | 'present' | 'correct';

interface Tile {
  bg: any;       // Graphics
  text: any;     // Text
  letter: string;
  state: TileState;
  x: number;
  y: number;
}

interface KeyButton {
  bg: any;
  text: any;
  letter: string;
  state: KeyState;
  x: number;
  y: number;
  w: number;
  h: number;
}

/* ------------------------------------------------------------------ */
/*  Scene                                                              */
/* ------------------------------------------------------------------ */
export class CodeBreakerScene extends BaseScene {
  private tiles: Tile[][] = [];          // [row][col]
  private keys: Map<string, KeyButton> = new Map();
  private stars: Star[] = [];

  private targetWord = '';
  private currentRow = 0;
  private currentCol = 0;
  private currentGuess = '';
  private gameWon = false;
  private gameLost = false;
  private wordNumber = 0;
  private isRevealing = false;          // prevent input during animation
  private shakeTimer = 0;

  // Sizing (calculated in create)
  private tileSize = 0;
  private tileGap = 0;
  private gridStartX = 0;
  private gridStartY = 0;
  private keyW = 0;
  private keyH = 0;
  private keyGap = 0;
  private kbStartX = 0;
  private kbStartY = 0;
  private fontSize = 0;
  private keyFontSize = 0;

  // Message text
  private messageText: any = null;

  constructor() { super('code-breaker'); }
  get displayName() { return 'Code Breaker'; }

  /* ================================================================
     LIFECYCLE
     ================================================================ */

  preload() {
    this.load.audio('cb_key',   '../assets/cosmic-rocks/sounds/sfx_twoTone.ogg');
    this.load.audio('cb_flip',  '../assets/galaxy-blaster/sounds/sfx_laser1.ogg');
    this.load.audio('cb_win',   '../assets/galaxy-blaster/sounds/sfx_shieldUp.ogg');
    this.load.audio('cb_lose',  '../assets/cosmic-rocks/sounds/sfx_lose.ogg');
    this.load.audio('cb_error', '../assets/galaxy-blaster/sounds/sfx_zap.ogg');
  }

  create() {
    this.initBase();
    this.calculateLayout();

    this.score = 0;
    this.lives = MAX_GUESSES;
    this.wordNumber = 0;
    this.gameWon = false;
    this.gameLost = false;
    this.isRevealing = false;
    this.currentRow = 0;
    this.currentCol = 0;
    this.currentGuess = '';
    this.tiles = [];
    this.keys = new Map();
    this.stars = [];

    this.ensureSparkTexture();

    this.stars = this.createStarfield([
      { count: 30, speed: 8,  size: 1,   alpha: 0.15 },
      { count: 15, speed: 15, size: 1.5, alpha: 0.25 },
    ]);

    this.createGrid();
    this.createKeyboard();
    this.setupInput();

    this.syncScoreToHUD();
    this.loadHighScore();
    this.startNewWord();
  }

  update(_t: number, dtMs: number) {
    const dt = Math.min(dtMs, 33);
    this.updateStarfield(this.stars, dt);

    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      if (this.shakeTimer <= 0) {
        // Reset row position after shake
        this.repositionRow(this.currentRow);
      }
    }
  }

  /* ================================================================
     LAYOUT
     ================================================================ */

  private calculateLayout() {
    // Tile grid sizing — fit in upper portion of screen
    const maxTileSize = Math.min(W * 0.08, H * 0.08);
    this.tileSize = Math.max(30, Math.round(maxTileSize));
    this.tileGap = Math.round(this.tileSize * 0.12);
    const gridW = WORD_LENGTH * this.tileSize + (WORD_LENGTH - 1) * this.tileGap;
    const gridH = MAX_GUESSES * this.tileSize + (MAX_GUESSES - 1) * this.tileGap;
    this.gridStartX = (W - gridW) / 2;
    this.gridStartY = H * 0.12;

    // Font sizes
    this.fontSize = Math.round(this.tileSize * 0.55);
    this.keyFontSize = Math.round(this.tileSize * 0.3);

    // Keyboard sizing — fit below grid
    this.keyW = Math.round(this.tileSize * 0.7);
    this.keyH = Math.round(this.tileSize * 0.85);
    this.keyGap = Math.round(this.keyW * 0.1);
    const kbW = 10 * this.keyW + 9 * this.keyGap; // top row has 10 keys
    this.kbStartX = (W - kbW) / 2;
    this.kbStartY = this.gridStartY + gridH + H * 0.06;
  }

  /* ================================================================
     GRID
     ================================================================ */

  private createGrid() {
    for (let row = 0; row < MAX_GUESSES; row++) {
      this.tiles[row] = [];
      for (let col = 0; col < WORD_LENGTH; col++) {
        const x = this.gridStartX + col * (this.tileSize + this.tileGap);
        const y = this.gridStartY + row * (this.tileSize + this.tileGap);

        const bg = this.add.graphics().setDepth(5);
        this.drawTile(bg, x, y, COLOR_EMPTY, COLOR_BORDER);

        const text = this.add.text(
          x + this.tileSize / 2, y + this.tileSize / 2, '',
          {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: `${this.fontSize}px`,
            color: '#ffffff',
            align: 'center',
          }
        ).setOrigin(0.5, 0.5).setDepth(6);

        this.tiles[row][col] = { bg, text, letter: '', state: 'empty', x, y };
      }
    }
  }

  private drawTile(gfx: any, x: number, y: number, fillColor: number, borderColor: number) {
    gfx.clear();
    // Border
    gfx.fillStyle(borderColor, 1);
    gfx.fillRoundedRect(x - 1, y - 1, this.tileSize + 2, this.tileSize + 2, 4);
    // Fill
    gfx.fillStyle(fillColor, 1);
    gfx.fillRoundedRect(x, y, this.tileSize, this.tileSize, 3);
  }

  private repositionRow(row: number) {
    for (let col = 0; col < WORD_LENGTH; col++) {
      const tile = this.tiles[row][col];
      const x = this.gridStartX + col * (this.tileSize + this.tileGap);
      tile.bg.setPosition(0, 0);
      this.drawTile(tile.bg, x, tile.y, this.getTileColor(tile.state), this.getTileBorder(tile.state));
      tile.text.setPosition(x + this.tileSize / 2, tile.y + this.tileSize / 2);
    }
  }

  private getTileColor(state: TileState): number {
    switch (state) {
      case 'correct': return COLOR_CORRECT;
      case 'present': return COLOR_PRESENT;
      case 'absent': return COLOR_ABSENT;
      default: return COLOR_EMPTY;
    }
  }

  private getTileBorder(state: TileState): number {
    switch (state) {
      case 'filled': return COLOR_ACTIVE;
      case 'empty': return COLOR_BORDER;
      default: return this.getTileColor(state);
    }
  }

  /* ================================================================
     KEYBOARD
     ================================================================ */

  private createKeyboard() {
    const rows = [
      ['Q','W','E','R','T','Y','U','I','O','P'],
      ['A','S','D','F','G','H','J','K','L'],
      ['ENTER','Z','X','C','V','B','N','M','⌫'],
    ];

    for (let r = 0; r < rows.length; r++) {
      const rowKeys = rows[r];
      const rowOffset = r === 1 ? this.keyW * 0.5 : (r === 2 ? 0 : 0);
      const rowY = this.kbStartY + r * (this.keyH + this.keyGap);

      // Calculate row width to center it
      let totalW = 0;
      for (const key of rowKeys) {
        const isWide = key === 'ENTER' || key === '⌫';
        totalW += isWide ? this.keyW * 1.5 : this.keyW;
      }
      totalW += (rowKeys.length - 1) * this.keyGap;
      let curX = (W - totalW) / 2;

      for (const key of rowKeys) {
        const isWide = key === 'ENTER' || key === '⌫';
        const w = isWide ? this.keyW * 1.5 : this.keyW;

        const bg = this.add.graphics().setDepth(5);
        this.drawKey(bg, curX, rowY, w, this.keyH, COLOR_KEY_BG);

        const displayText = key === '⌫' ? '⌫' : key;
        const fSize = isWide ? Math.round(this.keyFontSize * 0.7) : this.keyFontSize;
        const text = this.add.text(
          curX + w / 2, rowY + this.keyH / 2, displayText,
          {
            fontFamily: '"Press Start 2P", monospace',
            fontSize: `${fSize}px`,
            color: '#ffffff',
            align: 'center',
          }
        ).setOrigin(0.5, 0.5).setDepth(6);

        const button: KeyButton = { bg, text, letter: key, state: 'unused', x: curX, y: rowY, w, h: this.keyH };
        this.keys.set(key, button);

        // Make clickable
        const hitArea = this.add.rectangle(curX + w / 2, rowY + this.keyH / 2, w, this.keyH)
          .setInteractive({ useHandCursor: true })
          .setDepth(7)
          .setAlpha(0.001); // invisible but clickable
        hitArea.on('pointerdown', () => this.handleKeyPress(key));

        curX += w + this.keyGap;
      }
    }
  }

  private drawKey(gfx: any, x: number, y: number, w: number, h: number, color: number) {
    gfx.clear();
    gfx.fillStyle(color, 1);
    gfx.fillRoundedRect(x, y, w, h, 4);
  }

  private updateKeyColor(letter: string, state: KeyState) {
    const key = this.keys.get(letter);
    if (!key) return;

    // Only upgrade: correct > present > absent > unused
    const priority: Record<KeyState, number> = { unused: 0, absent: 1, present: 2, correct: 3 };
    if (priority[state] <= priority[key.state]) return;

    key.state = state;
    const color = state === 'correct' ? COLOR_CORRECT :
                  state === 'present' ? COLOR_PRESENT :
                  state === 'absent'  ? COLOR_ABSENT : COLOR_KEY_BG;
    this.drawKey(key.bg, key.x, key.y, key.w, key.h, color);
  }

  /* ================================================================
     INPUT
     ================================================================ */

  private setupInput() {
    this.input.keyboard.on('keydown', (event: any) => {
      const key = event.key.toUpperCase();
      if (key === 'ENTER') this.handleKeyPress('ENTER');
      else if (key === 'BACKSPACE') this.handleKeyPress('⌫');
      else if (/^[A-Z]$/.test(key)) this.handleKeyPress(key);
    });
  }

  private handleKeyPress(key: string) {
    if (this.isRevealing || this.gameWon || this.gameLost) return;

    if (key === '⌫') {
      this.deleteLetter();
    } else if (key === 'ENTER') {
      this.submitGuess();
    } else if (/^[A-Z]$/.test(key) && this.currentCol < WORD_LENGTH) {
      this.addLetter(key);
    }
  }

  private addLetter(letter: string) {
    if (this.currentCol >= WORD_LENGTH) return;

    const tile = this.tiles[this.currentRow][this.currentCol];
    tile.letter = letter;
    tile.state = 'filled';
    tile.text.setText(letter);
    this.drawTile(tile.bg, tile.x, tile.y, COLOR_EMPTY, COLOR_ACTIVE);

    // Pop animation
    this.tweens.add({
      targets: [tile.bg, tile.text],
      scaleX: 1.1, scaleY: 1.1,
      duration: 60,
      yoyo: true,
    });

    this.currentCol++;
    this.currentGuess += letter;
  }

  private deleteLetter() {
    if (this.currentCol <= 0) return;
    this.currentCol--;
    this.currentGuess = this.currentGuess.slice(0, -1);

    const tile = this.tiles[this.currentRow][this.currentCol];
    tile.letter = '';
    tile.state = 'empty';
    tile.text.setText('');
    this.drawTile(tile.bg, tile.x, tile.y, COLOR_EMPTY, COLOR_BORDER);
  }

  /* ================================================================
     GUESS LOGIC
     ================================================================ */

  private submitGuess() {
    if (this.currentCol < WORD_LENGTH) {
      this.showMessage('Not enough letters');
      this.shakeRow();
      return;
    }

    const guess = this.currentGuess.toLowerCase();

    if (!VALID_GUESSES.has(guess)) {
      this.showMessage('Not in word list');
      this.shakeRow();
      this.sound.play('cb_error', { volume: 0.2 });
      return;
    }

    this.isRevealing = true;
    const results = this.evaluateGuess(guess);
    this.revealTiles(results);
  }

  private evaluateGuess(guess: string): TileState[] {
    const result: TileState[] = Array(WORD_LENGTH).fill('absent');
    const targetLetters = this.targetWord.split('');
    const guessLetters = guess.split('');
    const used = Array(WORD_LENGTH).fill(false);

    // First pass: find exact matches (green)
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guessLetters[i] === targetLetters[i]) {
        result[i] = 'correct';
        used[i] = true;
      }
    }

    // Second pass: find present letters (yellow)
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (result[i] === 'correct') continue;
      for (let j = 0; j < WORD_LENGTH; j++) {
        if (!used[j] && guessLetters[i] === targetLetters[j]) {
          result[i] = 'present';
          used[j] = true;
          break;
        }
      }
    }

    return result;
  }

  private revealTiles(results: TileState[]) {
    const row = this.currentRow;
    const guess = this.currentGuess;

    // Reveal each tile with a flip animation, one at a time
    for (let col = 0; col < WORD_LENGTH; col++) {
      this.time.delayedCall(col * 300, () => {
        const tile = this.tiles[row][col];

        // Flip: shrink vertically
        this.tweens.add({
          targets: [tile.bg, tile.text],
          scaleY: 0,
          duration: 150,
          onComplete: () => {
            // Change color at midpoint
            tile.state = results[col];
            this.drawTile(tile.bg, tile.x, tile.y, this.getTileColor(tile.state), this.getTileColor(tile.state));

            // Update keyboard color
            const letter = guess[col].toUpperCase();
            const keyState: KeyState = results[col] === 'correct' ? 'correct' :
                                       results[col] === 'present' ? 'present' : 'absent';
            this.updateKeyColor(letter, keyState);

            // Flip back: expand
            this.tweens.add({
              targets: [tile.bg, tile.text],
              scaleY: 1,
              duration: 150,
            });
          }
        });

        this.sound.play('cb_flip', { volume: 0.15 });
      });
    }

    // After all tiles revealed, check win/lose
    this.time.delayedCall(WORD_LENGTH * 300 + 400, () => {
      this.isRevealing = false;
      const isCorrect = results.every(r => r === 'correct');

      if (isCorrect) {
        this.handleWin();
      } else if (this.currentRow >= MAX_GUESSES - 1) {
        this.handleLose();
      } else {
        this.currentRow++;
        this.currentCol = 0;
        this.currentGuess = '';
        this.lives = MAX_GUESSES - this.currentRow;
        this.syncLivesToHUD();
      }
    });
  }

  /* ================================================================
     WIN / LOSE
     ================================================================ */

  private handleWin() {
    this.gameWon = true;
    const guessNum = this.currentRow + 1;
    const points = GUESS_POINTS[guessNum] || 100;
    this.addScore(points, W / 2, this.gridStartY - 20);
    this.sound.play('cb_win', { volume: 0.3 });

    const messages = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
    this.showMessage(messages[guessNum - 1] || 'Nice!');

    // Bounce winning row
    for (let col = 0; col < WORD_LENGTH; col++) {
      const tile = this.tiles[this.currentRow][col];
      this.time.delayedCall(col * 100, () => {
        this.tweens.add({
          targets: [tile.bg, tile.text],
          y: tile.y - 15,
          duration: 200,
          yoyo: true,
          ease: 'Bounce.easeOut',
        });
      });
    }

    // Start new word after delay
    this.time.delayedCall(2500, () => {
      if (this.gameWon) this.startNewWord();
    });
  }

  private handleLose() {
    this.gameLost = true;
    this.sound.play('cb_lose', { volume: 0.3 });
    this.showMessage(this.targetWord.toUpperCase());

    this.time.delayedCall(3000, () => {
      this.showGameOver(this.score, () => {
        this.scene.restart();
      });
    });
  }

  /* ================================================================
     NEW WORD
     ================================================================ */

  private startNewWord() {
    this.wordNumber++;
    this.level = this.wordNumber;
    this.syncLevelToHUD();

    // Pick random word
    this.targetWord = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];

    // Reset grid
    this.currentRow = 0;
    this.currentCol = 0;
    this.currentGuess = '';
    this.gameWon = false;
    this.gameLost = false;
    this.lives = MAX_GUESSES;
    this.syncLivesToHUD();

    // Clear tiles
    for (let row = 0; row < MAX_GUESSES; row++) {
      for (let col = 0; col < WORD_LENGTH; col++) {
        const tile = this.tiles[row][col];
        tile.letter = '';
        tile.state = 'empty';
        tile.text.setText('');
        tile.bg.setScale(1);
        tile.text.setScale(1);
        this.drawTile(tile.bg, tile.x, tile.y, COLOR_EMPTY, COLOR_BORDER);
      }
    }

    // Reset keyboard colors
    for (const [letter, key] of this.keys) {
      if (letter !== 'ENTER' && letter !== '⌫') {
        key.state = 'unused';
        this.drawKey(key.bg, key.x, key.y, key.w, key.h, COLOR_KEY_BG);
      }
    }

    this.showWaveBanner(this.wordNumber);
  }

  /* ================================================================
     UI HELPERS
     ================================================================ */

  private showMessage(text: string) {
    if (this.messageText) this.messageText.destroy();

    this.messageText = this.add.text(W / 2, this.gridStartY - 30, text, {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: `${Math.round(this.fontSize * 0.6)}px`,
      color: '#ffffff',
      backgroundColor: '#1a1a1a',
      padding: { x: 16, y: 8 },
      align: 'center',
    }).setOrigin(0.5, 0.5).setDepth(20);

    this.time.delayedCall(2000, () => {
      if (this.messageText) {
        this.tweens.add({
          targets: this.messageText,
          alpha: 0,
          duration: 300,
          onComplete: () => {
            this.messageText?.destroy();
            this.messageText = null;
          }
        });
      }
    });
  }

  private shakeRow() {
    const row = this.currentRow;
    this.shakeTimer = 300;

    for (let col = 0; col < WORD_LENGTH; col++) {
      const tile = this.tiles[row][col];
      this.tweens.add({
        targets: [tile.bg, tile.text],
        x: { value: '+=8', duration: 50, yoyo: true, repeat: 2, ease: 'Sine.inOut' },
      });
    }
  }

  /* ================================================================
     SHUTDOWN
     ================================================================ */

  shutdown() {
    super.shutdown();
    const banner = document.getElementById('wave-banner');
    if (banner) banner.remove();
    if (this.messageText) {
      this.messageText.destroy();
      this.messageText = null;
    }
  }
}
