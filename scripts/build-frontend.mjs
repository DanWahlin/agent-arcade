import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const copy = (source, destination) => {
  mkdirSync(destination.substring(0, destination.lastIndexOf('/')), { recursive: true });
  cpSync(source, destination, { recursive: true });
};

const removeSourceMaps = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      removeSourceMaps(path);
    } else if (entry.name.endsWith('.map')) {
      rmSync(path);
    }
  }
};

if (process.argv[2] === 'clean') {
  rmSync('dist/game', { recursive: true, force: true });
  rmSync('dist/assets', { recursive: true, force: true });
} else if (process.argv[2] === 'canvas') {
  const extensionRoot = '.github/extensions/arcade-canvas';
  rmSync(`${extensionRoot}/game`, { recursive: true, force: true });
  rmSync(`${extensionRoot}/assets`, { recursive: true, force: true });
  copy('dist/game', `${extensionRoot}/game`);
  copy('dist/assets', `${extensionRoot}/assets`);
  copy('docs/images/agent-arcade-banner-v3.png', `${extensionRoot}/assets/preview.png`);
  copy('docs/images/agent-arcade-background.webp', `${extensionRoot}/assets/canvas-background.webp`);
  removeSourceMaps(`${extensionRoot}/game`);
} else {
  rmSync('dist/assets', { recursive: true, force: true });
  mkdirSync('dist/game', { recursive: true });
  copy('src/game/index.html', 'dist/game/index.html');
  copy('src/game/hud.js', 'dist/game/hud.js');
  copy('node_modules/phaser/dist/phaser.min.js', 'dist/game/phaser.min.js');
  copy('assets', 'dist/assets');
}
