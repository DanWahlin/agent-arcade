# Changelog

All notable changes to Agent Arcade.
## [0.2.0] - 2026-04-21

### 🚀 Features & Improvements

- Add asset references for space shooter and platformer resources
- Add macOS quarantine command and update tagline in release notes
- Update README to refine project description and add new gameplay video
- Add Windows SmartScreen instructions to release notes
- Add Linux AppImage chmod instructions to release notes
- Add blog for now
- Add webp image
- Add AGENTS.md with project overview, repository structure, tech stack, and CI/CD details
- Update installation instructions and add local running guide in README.md
- Enhance gameplay mechanics in CosmicRocks and NinjaRunner scenes
- Refactor invincibility duration in tests, update player position checks, and implement HUD logic
- Add git-cliff changelog generation and update release workflow

### 🐛 Bug Fixes

- Fix hero tagline to fit on one line
- Fix margin
- Update .gitignore to include blog.md and fix GitHub Copilot CLI link in README
- Fix image format in blog.md for Agent Arcade banner
- Rename game, fix icons

### 🔧 Refactoring

- Rename asset folders to match game names

### 📚 Documentation

- Update homepage tagline: remove 'stress-relief'
- Update README and HTML files: refine descriptions, update Phaser version, and remove unnecessary tagline
- Redesign homepage with GIF carousel, lightbox, responsive layout
- Update README to include GitHub Copilot CLI in project description
- Update README to include website link for easier access
- Update webpage

### ⚙️ CI/CD & Build

- Reduce section spacing by half

### 📦 Updates

- Update copyright holder in LICENSE file to Dan Wahlin
- Update GIF assets for agent arcade visuals
- Update text
- Bump version to 0.2.0

### 💼 Other

- Change order of elements
- Revise blog content for clarity and detail on project development and artwork generation
## [0.1.0] - 2026-04-20

### 🚀 Features & Improvements

- Add CI/CD: GitHub Actions build for Windows/Mac/Linux
- Add README with controls, build instructions, and sprite credits
- Improve release: organize downloads by platform, exclude blockmaps
- Add AgentDrift scene: Implement Asteroids-style space shooter with ship controls, asteroids, bullets, and UFO enemy mechanics
- Add pause UX: shrink to HUD bar, close button, reduce glow
- Rename games, add sounds, UI improvements
- Add Ninja Runner sounds, draggable HUD, UI polish
- Add Ninja Runner sound effects, fix pause overlay, tighten hitbox
- Heart extra-life, enhanced sounds, fire glow, safe respawn
- Add icon.ico and icon.icns to bundle icon list
- Add GitHub Pages site and deploy workflow
- Add visual effects, platform variety, Playwright tests, and bug fixes
- Add minimize button to hide app and update HUD styles
- Add mute toggle, Galaxy Shooter spritesheet swap, and meteor hazards

### 🐛 Bug Fixes

- Code review fixes: localStorage safety, leaderboard dedup, DRY respawn
- Fix CI: set Linux .deb maintainer in electron-builder config
- Fix code review issues: security, memory leaks, cross-platform
- Fix CI/CD: set electron-builder output to build/, disable auto-publish
- Fix pause/unpause with global Escape shortcut
- Fix code review issues and update CI for Tauri
- Fix icon.ico and icon.icns to use proper formats
- Fix: gate RunEvent::Reopen behind target_os macos (Linux build fix)

### 🔧 Refactoring

- Rename to Agent Arcade + gameplay polish
- Major update: Galaga gameplay, asset cleanup, rename, Phaser 4

### 📚 Documentation

- Standardize release asset names and update README controls

### 🎨 Styling

- Initial commit: Agent Break - Mario-style desktop overlay game

### 📦 Updates

- Replace Nintendo sprites with free JuhoSprite assets + major upgrades
- Update macOS install instructions: use sudo xattr -rd for Gatekeeper bypass

### 💼 Other

- Modular scene architecture + gameplay features
- Migrate from Electron to Tauri v2
- Enable HUD interaction during gameplay via cursor polling
- Restore help button, always-visible close button, UI tweaks
- Tighten hero tagline line-height
