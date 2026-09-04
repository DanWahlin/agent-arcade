# Omarchy packaging

`agent-arcade-bin/` is the package directory submitted to the
[Omarchy Package Repository](https://github.com/omacom/omarchy-pkgs) (OPR).
It repackages the released `.deb` from GitHub. Once merged, Omarchy users install
with:

```bash
omarchy pkg add agent-arcade-bin
```

The same PKGBUILD also works on any Arch-based system without the OPR:

```bash
cd packaging/omarchy/agent-arcade-bin
makepkg -si
```

## How releases flow

Nothing extra is needed at release time. The OPR build system reads
`.omarchy/package.json`, watches this repo's GitHub releases, and after the
24 hour `min_release_age` window rewrites `pkgver` and the checksum in the OPR
copy of the PKGBUILD from the digest GitHub reports for the `.deb` asset.

Two things must stay stable for that to keep working:

- The `.deb` asset name must match `Agent.Arcade_{pkgver}_amd64.deb`.
- Release tags must be `v<pkgver>`.

## Submitting or updating the OPR copy

The OPR keeps its own copy of the PKGBUILD under `pkgbuilds/agent-arcade-bin/`.
Open a PR there when the packaging itself changes (dependencies, install steps,
metadata). Version bumps do not need a PR.

```bash
gh repo fork omacom/omarchy-pkgs --clone /tmp/omarchy-pkgs
cp -r packaging/omarchy/agent-arcade-bin /tmp/omarchy-pkgs/pkgbuilds/
rm /tmp/omarchy-pkgs/pkgbuilds/agent-arcade-bin/.gitignore
cd /tmp/omarchy-pkgs && git checkout -b agent-arcade-bin
git add pkgbuilds/agent-arcade-bin && git commit -m "Add agent-arcade-bin to the fast ring"
gh pr create --fill --body-file /path/to/agent-arcade/packaging/omarchy/PR_BODY.md
```

## Local verification

```bash
cd packaging/omarchy/agent-arcade-bin
makepkg -sfi                      # build and install
namcap PKGBUILD *.pkg.tar.zst     # lint (pacman -S namcap)
```
