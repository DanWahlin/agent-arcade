# 🥷 Agent Arcade

A stress-relief retro platformer that runs as a transparent overlay on your desktop. Play while waiting for your AI agents (Copilot CLI, Claude Code, Codex) to finish thinking and doing their work. Built with Electron + Phaser 3 + TypeScript.

Agent Arcade was inspired by [Aman](https://x.com/Amank1412) and his [Desktop Mario project](https://github.com/bxf1001g/desktop_mario). I wanted something that could also run on Mac and Linux, so I built it with Electron + Phaser 3 + TypeScript.

## How This Was Made

Idea ➡ RealiI started up [GitHub Copilot CLI](https://github.com/github/copilot-cli) (there's a [free course on it here](https://github.com/github/copilot-cli-for-beginners)), and it helped me quickly scaffold the initial Electron + Phaser 3 + TypeScript project structure. From there, I told it the overall goals and it iteratively built out the game mechanics, integrated the sprite assets, and added the overlay functionality. 

## Getting Started

```bash
npm install
npm start
```

## Controls

| Key | Action |
|-----|--------|
| ← → | Move |
| Space / ↑ | Jump (press twice for double jump) |
| Shift | Run |
| F / Z | Fire (when powered up) |
| ↓ | Enter warp/golden pipes |
| Esc | Pause |
| ⌃⌥M | Toggle visibility |
| ⌘Q | Quit |

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

Inspired by [Aman](https://x.com/Amank1412) and his [Desktop Mario project](https://github.com/bxf1001g/desktop_mario/releases).

Sprite assets: [Simple Platformer 16](https://juhosprite.itch.io/simple-platformer-16) by JuhoSprite

Space shooter assets: [Space Shooter Redux](https://opengameart.org/content/space-shooter-redux) by Kenney.nl

Galaga game mechanics: [WesleyEdwards/galaga](https://github.com/WesleyEdwards/galaga) by Wesley Edwards
