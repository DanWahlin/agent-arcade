<p align="center">
  <img src="images/agent-arcade-banner-v3.webp" alt="Agent Arcade" />
</p>

# 🕹️🚀 Agent Arcade 

A stress-relief retro platformer that runs as a transparent overlay on your desktop. Play while waiting for your AI agents (Copilot CLI, Claude Code, Codex, etc.) to finish thinking and doing their work. Built with Tauri + Phaser + TypeScript.

Agent Arcade was inspired by [Aman](https://x.com/Amank1412) and his [Desktop Mario project](https://github.com/bxf1001g/desktop_mario). I wanted something that could run on Mac, Windows, and Linux, so I built it with Tauri + Phaser + TypeScript.

## How This Was Made

Idea ➡ Reality in less than 24 hours. I used [GitHub Copilot CLI](https://github.com/github/copilot-cli) (there's a [free course on it here](https://github.com/github/copilot-cli-for-beginners)), and it helped me quickly scaffold the initial Tauri + Phaser + TypeScript project structure. From there I worked with copilot to plan the game mechanics and overall structure. I told it the overall goals and it iteratively built out the game mechanics, integrated the sprite assets, and added the overlay functionality.

## Installing Agent Arcade

Visit the [releases page](https://github.com/DanWahlin/agent-arcade/releases) and download the installer for your OS.

### 🍎 macOS

1. Download the `.dmg` file and open it
2. Drag **Agent Arcade** to your Applications folder
3. **Important:** The app is not code-signed, so macOS will block it on first launch. Open Terminal and run:
   ```
   sudo xattr -rd com.apple.quarantine /Applications/Agent\ Arcade.app
   ```
4. Open Agent Arcade from your Applications folder

### 🪟 Windows

Download and run the `.msi` installer.

### 🐧 Linux

Download the `.AppImage` (universal) or `.deb` (Debian/Ubuntu) package.

## Controls

### 🥷 Ninja Runner

| Key | Action |
|-----|--------|
| <kbd>←</kbd> <kbd>→</kbd> | Move |
| <kbd>Space</kbd> / <kbd>↑</kbd> | Jump (press twice for double jump) |
| <kbd>Shift</kbd> | Run |
| <kbd>F</kbd> / <kbd>Z</kbd> | Fire (when powered up) |
| <kbd>↓</kbd> | Enter warp/golden pipes |

### 🚀 Galaxy Shooter

| Key | Action |
|-----|--------|
| <kbd>←</kbd> <kbd>→</kbd> | Move |
| <kbd>Space</kbd> | Fire |

### ☄️ Cosmic Rocks

| Key | Action |
|-----|--------|
| <kbd>←</kbd> <kbd>→</kbd> | Rotate |
| <kbd>↑</kbd> | Thrust |
| <kbd>Space</kbd> | Fire |

### General

| Key | Action |
|-----|--------|
| <kbd>Esc</kbd> | Pause / Resume |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>M</kbd> | Toggle visibility (all platforms) |
| <kbd>⌘Q</kbd> (Mac) / <kbd>Ctrl+Q</kbd> (Win/Linux) | Quit |

## Building Installers

```bash
npm run dist:mac    # macOS (.dmg + .zip)
npm run dist:win    # Windows (.exe)
npm run dist:linux  # Linux (.AppImage + .deb)
```

Or push a version tag to trigger the CI/CD pipeline:

```bash
git tag v0.2.0
git push origin v0.2.0
```

## Credits

Initially inspired by [Aman](https://x.com/Amank1412) and his [Desktop Mario project](https://github.com/bxf1001g/desktop_mario/releases).

Sprite assets: [Simple Platformer 16](https://juhosprite.itch.io/simple-platformer-16) by JuhoSprite

Space shooter assets: [Space Shooter Redux](https://opengameart.org/content/space-shooter-redux) by Kenney.nl

Galaga-style game mechanics: [WesleyEdwards/galaga](https://github.com/WesleyEdwards/galaga) by Wesley Edwards

Asteroids-style game mechanics: [phaser3-typescript](https://github.com/digitsensitive/phaser3-typescript) by digitsensitive

Retro game sound effects: ["Retro game sound effects"](https://opengameart.org/content/retro-game-sound-effects) by Vircon32 (Carra), published at OpenGameArt under license [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)
