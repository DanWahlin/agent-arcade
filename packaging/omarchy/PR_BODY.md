Adds **agent-arcade-bin**, a collection of retro arcade games (Space Invaders,
Asteroids, Galaga, Defender and Missile Command style, plus a platformer) that
runs as a transparent always-on-top overlay. It is meant for playing while an
AI coding agent (Copilot CLI, Claude Code, Codex, and so on) is busy. Tauri +
Phaser, MIT licensed, source is public. x86_64 only.

- Repo: https://github.com/DanWahlin/agent-arcade
- Site: https://danwahlin.github.io/agent-arcade
- Releases: https://github.com/DanWahlin/agent-arcade/releases

### How it tracks versions

Not in the AUR. Upstream publishes a `.deb` per release, built by tauri-action
on Ubuntu 22.04, so the package repackages its `usr/` tree. `.omarchy/package.json`
is `{"source": "local", "release_ring": "fast"}` with a declarative `upstream`
block pointing at the GitHub release feed and `"digests": true`, so the sync
reads the SHA-256 GitHub reports for the asset and never downloads it.

### Dependencies

Checked with `ldd` against the shipped binary rather than copied from the
`.deb` control file. The binary links WebKitGTK 4.1, GTK3 and the core GStreamer
libraries; game audio plays through WebKitGTK's GStreamer backend, so the base,
good, bad and libav plugin sets are listed, matching what the `.deb` declares.
`libayatana-appindicator` is dlopen'd for the tray icon.

### Worth flagging

Upstream's desktop file is named `Agent Arcade.desktop` with a space. The
package renames it to `agent-arcade.desktop`; contents are unchanged and
`Exec=agent-arcade` already matches the installed binary.

I'm the upstream author and will maintain this.
