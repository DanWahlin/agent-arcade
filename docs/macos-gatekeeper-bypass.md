# macOS Gatekeeper Bypass Solutions for Unsigned Tauri Apps

## Executive Summary

macOS Gatekeeper blocks unsigned/un-notarized apps by default, and Apple has progressively tightened restrictions through Ventura → Sonoma → Sequoia. There are **6 viable approaches** for users to open unsigned apps, but **only Apple notarization ($99/year)** provides a seamless experience. For open-source/free distribution, the best options are the `xattr` terminal command and the System Settings bypass. Ad-hoc code signing can help but does NOT avoid Gatekeeper warnings.

## All Available Solutions

### 1. `xattr` Terminal Command (Most Reliable Free Option)

Remove the quarantine flag that Gatekeeper checks:

```bash
# Recommended — recursive delete of quarantine attribute
sudo xattr -rd com.apple.quarantine /Applications/Agent\ Arcade.app
```

**Variants:**
| Command | When to Use |
|---------|-------------|
| `xattr -d com.apple.quarantine App.app` | Single file, no sudo needed |
| `xattr -dr com.apple.quarantine App.app` | Recursive (all files in bundle) |
| `sudo xattr -rd com.apple.quarantine App.app` | If permission denied on above |
| `xattr -cr App.app` | Clears ALL extended attributes (nuclear option) |

**Reliability:** Works on all macOS versions including Sequoia[^1]. The `-r` flag is important because the quarantine attribute can be on nested files inside the `.app` bundle, not just the top level.

---

### 2. System Settings → Privacy & Security (GUI Method)

1. Try to open the app (it will be blocked)
2. Open **System Settings → Privacy & Security**
3. Scroll to the bottom — you'll see "Agent Arcade.app was blocked from use because it is not from an identified developer"
4. Click **Open Anyway**
5. Enter your password

**Reliability:** Works on macOS Ventura, Sonoma, and Sequoia[^2]. The "Open Anyway" button only appears after you've attempted to open the blocked app.

---

### 3. Right-Click → Open (Simplest but Inconsistent)

1. Right-click (or Control-click) the app in Finder
2. Select **Open** from the context menu
3. Click **Open** in the warning dialog

**Reliability:** Works on many macOS versions but has become inconsistent on Sequoia for apps downloaded via browsers[^3]. Some users report it doesn't show the "Open" option for completely unsigned apps.

---

### 4. Ad-Hoc Code Signing (Developer Workaround)

Sign the app with an ad-hoc identity (no Apple account needed):

```bash
codesign --deep --force --sign - "Agent Arcade.app"
```

**What this does:** Creates a valid code signature using a local identity (`-`). The app is "signed" but not by a recognized Apple certificate.

**Limitation:** Users still get Gatekeeper warnings — ad-hoc signing does NOT bypass Gatekeeper[^4]. However, it can help with certain macOS security checks that reject completely unsigned binaries.

**Tauri note:** Tauri v2 performs ad-hoc signing by default when no `signingIdentity` is configured, so the release builds may already have this[^5].

---

### 5. Disable Gatekeeper Globally via `spctl` (Power Users Only)

```bash
sudo spctl --master-disable
```

**macOS Sequoia change:** This command alone no longer works. You must[^6]:
1. Open **System Settings → Privacy & Security** (keep it open)
2. Run `sudo spctl --master-disable` in Terminal
3. Navigate away from Privacy & Security, then back
4. The "Anywhere" option appears at the bottom — click it

**Re-enable:** `sudo spctl --master-enable`

**Warning:** This disables Gatekeeper for ALL apps — not recommended for most users. Apple has signaled this approach may be fully removed in future macOS versions.

---

### 6. Apple Notarization (Only Seamless Solution — $99/year)

The only way to make the app open without ANY warnings:

1. Enroll in [Apple Developer Program](https://developer.apple.com/programs/) ($99/year)
2. Create a "Developer ID Application" certificate
3. Sign the app with that certificate
4. Submit to Apple's notarization service
5. Staple the notarization ticket to the app

**Automation with Tauri + GitHub Actions:**
- Use [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action) with signing secrets
- Store certificate as base64 in GitHub Secrets
- Set environment variables: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`

---

### 7. Homebrew Cask Distribution (Technical Users)

Distribute via Homebrew, which handles downloads differently:

```ruby
cask "agent-arcade" do
  version "0.1.0"
  sha256 "abc123..."
  url "https://github.com/DanWahlin/agent-arcade/releases/download/v#{version}/Agent-Arcade_#{version}_universal.dmg"
  name "Agent Arcade"
  homepage "https://github.com/DanWahlin/agent-arcade"
  app "Agent Arcade.app"
end
```

**Benefit:** Homebrew can bypass some quarantine checks during install. Users run `brew install --cask agent-arcade`.

**Limitation:** Only practical for technical users who already have Homebrew installed.

---

## Comparison Matrix

| Solution | User-Friendly | Works on Sequoia | No Apple Account | No Terminal | Permanent |
|----------|:---:|:---:|:---:|:---:|:---:|
| xattr command | ❌ | ✅ | ✅ | ❌ | ✅ |
| System Settings bypass | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| Right-click → Open | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Ad-hoc signing | ❌ | ✅ | ✅ | ❌ | N/A (build-time) |
| spctl disable | ❌ | ⚠️ | ✅ | ❌ | Until re-enabled |
| Apple notarization | ✅ | ✅ | ❌ ($99/yr) | ✅ | ✅ |
| Homebrew cask | ❌ | ✅ | ✅ | ❌ | ✅ |

## Recommendation for Agent Arcade

**Short-term (free):** Provide clear instructions with multiple options ordered by ease:
1. System Settings → Privacy & Security → Open Anyway (GUI users)
2. `sudo xattr -rd com.apple.quarantine` (Terminal users)
3. Right-click → Open (if it works on their macOS version)

**Long-term:** If the project grows, invest in the $99/year Apple Developer account for notarization. The Tauri + GitHub Actions pipeline can fully automate it.

## Confidence Assessment

- **High confidence:** `xattr` and System Settings methods work on all current macOS versions
- **High confidence:** Apple notarization is the only way to avoid warnings entirely
- **Medium confidence:** Right-click → Open is inconsistent on Sequoia for browser downloads
- **High confidence:** `spctl --master-disable` workflow changed in Sequoia and may be deprecated

## Footnotes

[^1]: Multiple community confirmations that `xattr -rd` works on Sequoia — [Apple Community Discussion](https://discussions.apple.com/thread/258273935)
[^2]: Apple Support: [Safely open apps on your Mac](https://support.apple.com/en-us/HT202491)
[^3]: Reports of inconsistency in macOS Sequoia for completely unsigned apps downloaded via Safari/Chrome
[^4]: Ad-hoc signing creates a valid signature but is not tied to an Apple-issued certificate, so Gatekeeper still flags it
[^5]: Tauri uses ad-hoc signing by default when `signingIdentity` is null — [Tauri macOS signing docs](https://tauri.app/distribute/sign/macos/)
[^6]: macOS Sequoia spctl changes — [iBoysoft Guide](https://iboysoft.com/tips/how-to-disable-gatekeeper-macos-sequoia.html), [macReports](https://macreports.com/how-to-disable-gatekeeper-on-mac-and-enable-the-anywhere-option-for-installing-any-software/)
