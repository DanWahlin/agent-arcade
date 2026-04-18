# 🥷 Agent Break

A stress-relief retro platformer that runs as a transparent overlay on your desktop. Play while waiting for your AI agents (Copilot CLI, Claude Code, Codex) to finish thinking.

Built with Electron + Phaser 3 + TypeScript.

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

Sprite assets: [Simple Platformer 16](https://juhosprite.itch.io/simple-platformer-16) by JuhoSprite
