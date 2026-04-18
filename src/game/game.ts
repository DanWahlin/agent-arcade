// Agent Arcade — game bootstrap and scene registry.
// Each mini-game is a Phaser Scene extending BaseScene.

import { W, H } from './scenes/BaseScene.js';
import { AgentNinjaScene } from './scenes/AgentNinja.js';
import { AgentGalaxyScene } from './scenes/AgentGalaxy.js';

declare const Phaser: any;

// Registry of available games
const GAMES = [
  { key: 'agent-ninja', scene: AgentNinjaScene, label: '🥷 Agent Ninja' },
  { key: 'agent-galaxy', scene: AgentGalaxyScene, label: '🚀 Agent Galaxy' },
];

let currentGameKey: string;
try { currentGameKey = localStorage.getItem('agentArcade_lastGame') || 'agent-ninja'; }
catch { currentGameKey = 'agent-ninja'; }
// Validate stored key exists in registry
if (!GAMES.find(g => g.key === currentGameKey)) currentGameKey = 'agent-ninja';

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

// Start the saved game (stop the default first scene if it's different)
if (currentGameKey !== GAMES[0].key) {
  game.events.once('ready', () => {
    game.scene.stop(GAMES[0].key);
    game.scene.start(currentGameKey);
  });
}

// Expose game switcher for the HUD dropdown
(window as any).__agentArcadeSwitchGame = (key: string) => {
  const entry = GAMES.find(g => g.key === key);
  if (!entry || key === currentGameKey) return;

  // Stop current scene, start new one
  game.scene.stop(currentGameKey);
  game.scene.start(key);
  currentGameKey = key;
  try { localStorage.setItem('agentArcade_lastGame', key); } catch { /* ignore */ }
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
    (window as any).__agentArcadeSwitchGame(sel.value);
  });

}

// Wait for DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', populateGameSelector);
} else {
  populateGameSelector();
}
