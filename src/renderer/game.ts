// Agent Break — game bootstrap and scene registry.
// Each mini-game is a Phaser Scene extending BaseScene.

import { W, H } from './scenes/BaseScene.js';
import { PixelNinjaScene } from './scenes/PixelNinja.js';

declare const Phaser: any;

// Registry of available games
const GAMES = [
  { key: 'pixel-ninja', scene: PixelNinjaScene, label: '🥷 Pixel Ninja' },
  // Future: { key: 'galaga', scene: GalagaScene, label: '🚀 Galaga' },
  // Future: { key: 'pitfall', scene: PitfallScene, label: '🌴 Pitfall' },
];

let currentGameKey = 'pixel-ninja';

const game = new Phaser.Game({
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

// Expose game switcher for the HUD dropdown
(window as any).__agentBreakSwitchGame = (key: string) => {
  const entry = GAMES.find(g => g.key === key);
  if (!entry || key === currentGameKey) return;

  // Stop current scene, start new one
  game.scene.stop(currentGameKey);
  game.scene.start(key);
  currentGameKey = key;

  // Update HUD title
  const titleEl = document.getElementById('hud-title');
  if (titleEl) titleEl.textContent = entry.label;
};

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
    (window as any).__agentBreakSwitchGame(sel.value);
  });
}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', populateGameSelector);
} else {
  populateGameSelector();
}
