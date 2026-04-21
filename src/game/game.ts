// Agent Arcade — game bootstrap and scene registry.
// Each mini-game is a Phaser Scene extending BaseScene.

import { W, H, refreshDimensions } from './scenes/BaseScene.js';
import { NinjaRunnerScene } from './scenes/NinjaRunner.js';
import { GalaxyBlasterScene } from './scenes/GalaxyBlaster.js';
import { CosmicRocksScene } from './scenes/CosmicRocks.js';
import { AlienOnslaughtScene } from './scenes/AlienOnslaught.js';

declare const Phaser: any;

// Registry of available games
const GAMES = [
  { key: 'cosmic-rocks', scene: CosmicRocksScene, label: '☄️ Cosmic Rocks' },
  { key: 'alien-onslaught', scene: AlienOnslaughtScene, label: '👾 Alien Onslaught' },
  { key: 'galaxy-blaster', scene: GalaxyBlasterScene, label: '🚀 Galaxy Blaster' },
  { key: 'ninja-runner', scene: NinjaRunnerScene, label: '🥷 Ninja Runner' },
];

let currentGameKey: string;
try {
  // Migrate localStorage from old "galaxy-shooter" name
  const lastGame = localStorage.getItem('agentArcade_lastGame');
  if (lastGame === 'galaxy-shooter') localStorage.setItem('agentArcade_lastGame', 'galaxy-blaster');
  const oldHi = localStorage.getItem('agentArcade_hi_galaxy-shooter');
  if (oldHi) {
    localStorage.setItem('agentArcade_hi_galaxy-blaster', oldHi);
    localStorage.removeItem('agentArcade_hi_galaxy-shooter');
  }
  currentGameKey = localStorage.getItem('agentArcade_lastGame') || 'ninja-runner';
}
catch { currentGameKey = 'ninja-runner'; }
// Validate stored key exists in registry
if (!GAMES.find(g => g.key === currentGameKey)) currentGameKey = 'ninja-runner';

// Create the Phaser game once the window is full-screen.
// Tauri's Rust backend resizes the window after setup — we listen for the
// `resize` event so we create the game at the correct dimensions.
let game: any = null;

function initGame() {
  refreshDimensions();

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    transparent: true,
    backgroundColor: 'rgba(0,0,0,0)',
    scene: GAMES.map(g => g.scene),
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 1800 }, debug: false },
    },
    render: { pixelArt: true, antialias: false, transparent: true },
    fps: { target: 60 },
  });

  // Expose game instance for Playwright testing (no production impact)
  (window as any).__phaserGame = game;

  // Start the saved game (stop the default first scene if it's different)
  if (currentGameKey !== GAMES[0].key) {
    game.events.once('ready', () => {
      game.scene.stop(GAMES[0].key);
      game.scene.start(currentGameKey);
    });
  }

  setupGameSwitcher();
}

function setupGameSwitcher() {
  // Expose game switcher for the HUD dropdown
  (window as any).__agentArcadeSwitchGame = (key: string) => {
    const entry = GAMES.find(g => g.key === key);
    if (!entry || key === currentGameKey) return;

    // If paused, unpause first
    const hud = document.getElementById('hud');
    if (hud && hud.classList.contains('paused')) {
      hud.classList.remove('paused');
      document.body.classList.remove('paused');
      const ab = (window as any).agentArcade;
      if (ab && ab.setClickThrough) ab.setClickThrough(false);
      if (ab && ab.setPaused) ab.setPaused(false);
    }

    // Stop current scene, start new one
    game.scene.stop(currentGameKey);
    game.scene.start(key);
    currentGameKey = key;
    try { localStorage.setItem('agentArcade_lastGame', key); } catch { /* ignore */ }

    // Re-enable click-through and focus the game canvas
    const ab = (window as any).agentArcade;
    if (ab && ab.setClickThrough) ab.setClickThrough(true);
    const sel = document.getElementById('game-select') as HTMLSelectElement | null;
    if (sel) sel.blur();
    game.canvas.focus();
  };
}

// Listen for window resize events from Tauri.
// On first resize that looks full-screen, create the game.
// On later resizes (e.g. monitor change), resize the canvas.
// Pause/resume shrinks/expands the window — we must NOT update game
// dimensions when the window shrinks to HUD-only size, and must NOT
// restart the scene when expanding back from a pause.
let resizeDebounce: number | null = null;
window.addEventListener('resize', () => {
  if (resizeDebounce) clearTimeout(resizeDebounce);
  resizeDebounce = window.setTimeout(() => {
    const newW = window.innerWidth;
    const newH = window.innerHeight;

    if (!game && newW > 800 && newH > 400) {
      // First time: window is now full-screen — create the game
      refreshDimensions();
      initGame();
    } else if (game && newH > 400) {
      // Full-screen resize (could be unpause expand or genuine resize).
      // Update dimensions and resize the canvas, but never restart the
      // scene — the resume system handles unpause, and a simple resize
      // is enough for monitor/display changes.
      refreshDimensions();
      game.scale.resize(W, H);
    }
    // If newH <= 400 (pause shrink to HUD), skip entirely —
    // keep W/H at full-screen values so the paused game state stays valid.
  }, 150) as unknown as number;
});

// Populate game selector dropdown
function populateGameSelector() {
  const sel = document.getElementById('game-select') as HTMLSelectElement | null;
  if (!sel) return;
  sel.innerHTML = '';
  GAMES.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.key;
    opt.textContent = g.label;
    if (g.key === currentGameKey) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => {
    (window as any).__agentArcadeSwitchGame(sel.value);
  });

}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', populateGameSelector);
} else {
  populateGameSelector();
}

// If the window is already full-screen (e.g. Playwright tests or fast Tauri
// init), create the game immediately since no resize event will fire.
setTimeout(() => {
  if (!game && window.innerWidth > 800 && window.innerHeight > 400) {
    refreshDimensions();
    initGame();
  }
}, 200);
