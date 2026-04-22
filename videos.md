# Agent Arcade Video Series

A 3-part video series showing how Agent Arcade was built using GitHub Copilot CLI. Each video is under 5 minutes and focuses on a distinct phase of the project.

---

## Video 1: Build a Game That Runs ON TOP of YOUR Desktop — Agent Arcade

**Duration:** ~4.5 minutes  
**Focus:** The core concept, Electron-to-Tauri migration, and solving the click-through problem.

### Script

**[0:00–0:30] Hook and concept**

"You know that feeling when you're waiting for your AI agent to finish a task and you've got nothing to do but stare at the terminal? I wanted to build a little retro arcade game that runs as a transparent overlay right on my desktop. Something I could play between tasks without losing sight of what my agents are doing. That idea became Agent Arcade."

Show: Agent Arcade running transparently over VS Code with a terminal visible underneath.

**[0:30–1:15] Starting with Copilot CLI**

"I built the whole thing using GitHub Copilot CLI. The first version used Electron because I needed a transparent, always-on-top window that worked on Mac, Windows, and Linux - it fit that well. I told Copilot CLI the concept and it scaffolded the project, set up Phaser as the game engine, and got a basic platformer running. Once that was working, I wanted a smaller footprint, so I asked Copilot CLI to investigate migrating to Tauri v2 — which uses Rust for the backend instead of Node."

Show: Copilot CLI session starting the Tauri migration. Show the prompt: "I'd like to use Tauri for Electron (rust version) instead of what we're using now."
- Initial commit — [fa9d3ea](https://github.com/DanWahlin/agent-arcade/commit/fa9d3ea) — `git checkout fa9d3ea`
  > Prompt: `I'd like to get a build created for this project that can run on my Mac.`
- Modular scene architecture + Phaser — [44309dd](https://github.com/DanWahlin/agent-arcade/commit/44309dd) — `git checkout 44309dd`
  > Prompt: `We currently support Mario. But, I'd like to support other games too like Galaga and Pitfall. So, we'll need to structure the code to be modular to support various options we come up with.`
- Migrate from Electron to Tauri v2 — [3fa0321](https://github.com/DanWahlin/agent-arcade/commit/3fa0321) — `git checkout 3fa0321`
  > Prompt: `I'd like to use Tauri for Electron (rust version) instead of what we're using now. I think we'll have to write a file in rust to make that happen but investigate the docs using Context7.`

**[1:15–2:30] The click-through problem**

"The migration itself was smooth — Copilot CLI scaffolded the entire Rust backend and updated the frontend bridge in one session. But then I hit the hardest problem of the project: click-through. In Electron, mouse events pass through transparent pixels automatically. Tauri is all-or-nothing - at least from what I know today. Clicks either go through entirely or they don't. I needed the game to be click-through while running, but interactive when paused so you could use the HUD."

"This was probably 20+ back-and-forth turns with Copilot CLI. We tried disabling click-through when paused, a global Escape shortcut, the `rdev` crate for global input — that one crashed on my machine for some reason. I kept pasting screenshots showing what was broken: 'I can't interact with any programs,' 'I'm completely blocked when paused.' Each time, Copilot CLI would try a different approach."

"The solution that stuck was a combination: normal keydown for pausing, a global OS-level shortcut for unpausing, and — here's the key — shrinking the window down to just the HUD bar when paused. No full-screen overlay blocking your other apps."

Show: Side-by-side of running state (full transparent overlay) vs. paused state (small HUD bar at top). Show clicking through to apps underneath while paused.
- Fix pause/unpause with global Escape shortcut — [8b12521](https://github.com/DanWahlin/agent-arcade/commit/8b12521) — `git checkout 8b12521`
  > Prompt: `Once I give focus to an app I don't seem to be able to unpause. For example, I'm typing here and even if I click elsewhere in VS Code, esc does nothing.`
- Shrink-to-HUD-bar solution — [582ebb7](https://github.com/DanWahlin/agent-arcade/commit/582ebb7) — `git checkout 582ebb7`
  > Prompt: `I'm completely blocked when the app is paused. I can't interact with the app behind it. I had to quit the app to come back here to type.`
- Enable HUD interaction via cursor polling — [c5c7e29](https://github.com/DanWahlin/agent-arcade/commit/c5c7e29) — `git checkout c5c7e29`
  > Prompt: `So do we have any way to allow a user to click on the hud when in game mode?`

**[2:30–3:30] Building the games**

"With the shell working, I built three games. Ninja Runner came first — I described a Mario-style platformer and Copilot CLI built procedural level generation with platforms, pipes, coins, enemies, water gaps, even a parachute mechanic. The workflow was: play, screenshot what's wrong, paste it into the conversation, describe the fix, test. 'The coins shouldn't be placed in front of a pipe.' 'The water needs to be lower.' Screenshot, describe, fix, test."

"Galaxy Shooter went through the biggest evolution. I pointed Copilot CLI at a reference Galaga implementation and said 'make it play like this.' That triggered a full rewrite with distance-based path following, five enemy states, and Bézier curve attack paths. Cosmic Rocks came together fast since Asteroids is a well-known formula."

Show: Quick montage of all three games running. Show a screenshot being pasted into Copilot CLI with a description of the issue.
- Replace Nintendo sprites with free JuhoSprite assets — [1b2067f](https://github.com/DanWahlin/agent-arcade/commit/1b2067f) — `git checkout 1b2067f`
  > Prompt: `Those look to be all official Nintendo images. Would you agree?`
- Galaga gameplay rewrite — [152938f](https://github.com/DanWahlin/agent-arcade/commit/152938f) — `git checkout 152938f`
  > Prompt: `We need to completely redo the game play. Base everything you do for pixel galaxy on this repo: https://github.com/WesleyEdwards/galaga`
- Add Cosmic Rocks (Asteroids-style) — [8b83e49](https://github.com/DanWahlin/agent-arcade/commit/8b83e49) — `git checkout 8b83e49`
  > Prompt: `I'd like to integrate the asteroids game from here (it's built on phaser) into the app. https://github.com/digitsensitive/phaser3-typescript/tree/master/src/games/asteroid`
- Sound effects + polish — [2883289](https://github.com/DanWahlin/agent-arcade/commit/2883289) — `git checkout 2883289`
  > Prompt: `Are there any explosion sounds we can use when I hit a ship in the pixel galaxy game?`

**[3:30–4:15] What made it work**

"A few things made this process effective. Screenshots in prompts were huge — describing a visual bug in words is slow, but pasting an image and saying 'this is wrong' is fast and precise. I also used the Context7 MCP server to give Copilot CLI access to the Phaser and Tauri docs, which helped it resolve issues that would have taken much longer otherwise. And knowing when to pivot saved real time — when the click-through approach wasn't working after many attempts, switching to the resize-on-pause approach solved it in one turn."

Show: Context7 MCP server providing Phaser docs. Show the moment where the resize approach is tried.

**[4:15–4:30] Transition**

"In the next video, I'll show how we went from a working app to a polished product with a website, CI/CD, and cross-platform releases — all without leaving the terminal."

---

## Video 2: Ship Your App to Mac, Windows, and Linux with One Command

**Duration:** ~4.5 minutes  
**Focus:** Building the GitHub Pages site, CI/CD workflows, and the release process.

### Script

**[0:00–0:20] Recap and setup**

"In the last video I showed how Agent Arcade was built — a transparent desktop overlay with three retro games. Now I need to ship it. That means a website, CI/CD for Mac, Windows, and Linux builds, and a release process. All done through GitHub Copilot CLI."

**[0:20–1:30] Building the website**

"For the website, I told Copilot CLI: 'Create a GitHub Pages website that matches the agent-arcade-banner image. Same info as the README but make it look amazingly awesome.' It generated a single-page static site with a starfield background and game cards."

"Then came the iteration. 'The navbar isn't working at all' — turns out the CSS and JS were never wired up. 'Hard to read the Download text' — contrast fix on the gold gradient. 'This is too busy, kind of messy' — I pasted a screenshot and Copilot CLI cleaned it up. 'When I mouse over Download it completely goes away' — hover style bug. Every fix followed the same loop: screenshot, describe, fix."

"I also tried something interesting here — I used multiple AI models. The session ran primarily on Claude Opus, but I pulled in GPT for design feedback. Sometimes a second perspective is what gets you unstuck."

Show: The website being built iteratively. Show before/after of the messy version vs. cleaned up version. Show the model switcher in Copilot CLI.
- GitHub Pages site + deploy workflow — [83ac45a](https://github.com/DanWahlin/agent-arcade/commit/83ac45a) — `git checkout 83ac45a`
  > Prompt: `I'd like to create a GitHub Pages website that is based on the overall look and feel of the agent-arcade-banner-v3.png image. It should provide the same info as in the readme, but make it look amazingly awesome.`
- Redesign homepage with GIF carousel, lightbox — [1098687](https://github.com/DanWahlin/agent-arcade/commit/1098687) — `git checkout 1098687`
  > Prompt: `This is too busy — kind of messy. Clean it up. [screenshot]`

**[1:30–2:45] CI/CD with GitHub Actions**

"For CI/CD, Copilot CLI wrote two GitHub Actions workflows. The first builds installers for macOS, Windows, and Linux whenever I push a version tag. It uses the Tauri build action to produce a universal macOS binary, an MSI for Windows, and AppImage plus .deb for Linux. Then it creates a GitHub Release with download links and instructions — including the `xattr` workaround for unsigned macOS apps."

"The second workflow auto-deploys the website whenever files in the `docs/` folder change on main. Edit, commit, push, and it's live."

"These workflows needed iteration too. The Windows build required a properly formatted .ico file. The initial version still referenced Electron's build commands. I pointed Copilot CLI at the GitHub Actions logs directly and it identified and fixed the issues."

Show: The GitHub Actions workflow running. Show the release page with platform-specific installers. Show pointing Copilot CLI at CI logs.
- First CI/CD workflow (Electron era) — [afbe445](https://github.com/DanWahlin/agent-arcade/commit/afbe445) — `git checkout afbe445`
  > Prompt: `Since this is an Electron app, can we create a CI/CD process that generates an installable app for Windows/Mac/Linux?`
- Updated CI for Tauri — [1925ebf](https://github.com/DanWahlin/agent-arcade/commit/1925ebf) — `git checkout 1925ebf`
  > Prompt: `It looks like our CI/CD workflow is failing. Analyze that and fix it.`

**[2:45–3:45] The release script**

"To tie it all together, Copilot CLI built a release script. One command — `npm run release 0.3.0` — bumps the version in package.json, the Tauri config, and the Rust Cargo.toml, generates a changelog using git-cliff, commits everything, creates a git tag, and pushes. CI picks it up from there and builds the installers automatically."

"This matters because Tauri apps have version numbers in three different config files, and if they're out of sync your installer filenames are wrong. The script handles that coordination so you never have to think about it."

Show: Running the release command. Show the three config files being updated. Show the GitHub Release being created with installers.
- Add release script — [34e3b80](https://github.com/DanWahlin/agent-arcade/commit/34e3b80) — `git checkout 34e3b80`
  > Prompt: `Can we change all of the asset names in releases to start with "agent-arcade_" so they're all consistent?`
- Add git-cliff changelog generation — [02cccb5](https://github.com/DanWahlin/agent-arcade/commit/02cccb5) — `git checkout 02cccb5`
  > Prompt: `What would Mac/Linux/Windows download for the release? I only see Assets but no download aside from source.`
- v0.3.0 release — [1787a3d](https://github.com/DanWahlin/agent-arcade/commit/1787a3d) — `git checkout 1787a3d`

**[3:45–4:20] Ongoing iteration**

"The project kept evolving after the initial release. I added a settings dialog with a background transparency slider and custom keybinding picker. I added an auto-updater so players get notified of new versions. I even added a fourth game — Alien Onslaught — by reviewing a community pull request with Copilot CLI and tuning the Space Invaders mechanics to match the original game."

"Each of these features was a Copilot CLI session. Some were 2 turns, some were 200+. The pattern was always the same: describe what I want, iterate on what I see, ship it."

Show: Settings dialog. Update notification banner. Alien Onslaught gameplay.
- Settings dialog (239-turn session) — [82041d7](https://github.com/DanWahlin/agent-arcade/commit/82041d7) — `git checkout 82041d7`
  > Prompt: `I'd like to add a settings icon onto the hud. When clicked, it would pop up a settings dialog with the following: Background transparency level (1-100) slider, Enable audio on/off toggle.`
- Auto-updater plugin — [800237a](https://github.com/DanWahlin/agent-arcade/commit/800237a) — `git checkout 800237a`
- Alien Onslaught via community PR — [6501f4e](https://github.com/DanWahlin/agent-arcade/commit/6501f4e) — `git checkout 6501f4e`

**[4:20–4:30] Transition**

"In the final video, I'll share the lessons learned and the workflow patterns that made all of this possible."

---

## Video 3: 430 Turns, 3 Games, 1 Weekend — What You Can Learn Building with AI

**Duration:** ~4.5 minutes  
**Focus:** Practical patterns, tips, and workflow insights from building a real project with Copilot CLI.

### Script

**[0:00–0:20] Setup**

"I built Agent Arcade — three games, a desktop overlay app, a website, and cross-platform CI/CD — over a weekend across 430+ conversation turns. Here's what I learned about working with AI coding agents on a real project."

**[0:20–1:15] Lesson 1: Screenshots are your best prompt**

"The single most effective technique was pasting screenshots directly into the conversation. When I said 'the water needs to be lower' with a screenshot attached, Copilot CLI could see exactly what I meant. When I said 'I'm completely blocked when paused,' the screenshot showed the transparent overlay trapping all my clicks. For visual work — games, websites, UIs — this is faster and more precise than trying to describe the problem in words."

"This isn't just for bugs. I used screenshots to show Copilot CLI what a reference game looked like, what the spacing should be between UI elements, and what the final website should feel like. If you can show it, show it."

Show: Montage of screenshots being pasted with short descriptions. Show the before/after results.
- Visual effects and platform polish (screenshot-driven) — [4237c2c](https://github.com/DanWahlin/agent-arcade/commit/4237c2c) — `git checkout 4237c2c`
  > Prompt: `The water used in pixel ninja is pretty good. But, it's a little too high and not taking up the full empty area. [screenshot]`
- Homepage redesign from screenshot feedback — [1098687](https://github.com/DanWahlin/agent-arcade/commit/1098687) — `git checkout 1098687`
  > Prompt: `This is too busy — kind of messy. Clean it up. [screenshot]`

**[1:15–2:00] Lesson 2: Know when to pivot**

"The click-through problem took 20+ turns before I found the right approach. The resize-on-pause solution worked in one turn. Looking back, I spent too long trying to make the first approach work."

"This happened again with Galaxy Shooter. The initial enemy movement system wasn't giving me the Galaga feel I wanted. After enough rounds of troubleshooting, I tried a completely different approach — distance-based path following instead of frame-based animation — and it worked immediately."

"The pattern: if you're past 5-6 attempts on the same approach and it's not converging, step back and try something fundamentally different. Tell the agent 'let's try a different approach entirely.' Don't be afraid to throw out what's not working."

Show: The sequence of failed click-through attempts followed by the successful resize approach.
- Pivot: shrink-to-HUD-bar instead of click-through toggle — [582ebb7](https://github.com/DanWahlin/agent-arcade/commit/582ebb7) — `git checkout 582ebb7`
  > Prompt: `I'm completely blocked when the app is paused. I can't interact with the app behind it. I had to quit the app to come back here to type.`
- Pivot: Galaga full rewrite with distance-based paths — [152938f](https://github.com/DanWahlin/agent-arcade/commit/152938f) — `git checkout 152938f`
  > Prompt: `NO — it doesn't match at all. Not even close. It's worse than before. Are you directly porting from the example? If so, should we just not use Phaser for this one?`

**[2:00–2:45] Lesson 3: Session management matters**

"Copilot CLI remembers context within a conversation, which is powerful. I could say 'the same issue from earlier' and it knew what I meant. But too much context about different features can actually make things worse — the agent starts confusing which problem it's solving."

"I learned to use `/clear` and `/new` deliberately. One session for the Tauri migration. A separate session for the website. A fresh session when adding the settings dialog. Each session had a clear scope and didn't carry baggage from unrelated work."

"I also found that the AGENTS.md file — a project description that Copilot CLI reads automatically — saved enormous time on session startup. Instead of re-explaining the tech stack and project structure every time, the agent already knew."

Show: Multiple Copilot CLI sessions with clear scopes. Show the AGENTS.md file.
- AGENTS.md for persistent project context — [11bc2af](https://github.com/DanWahlin/agent-arcade/commit/11bc2af) — `git checkout 11bc2af`

**[2:45–3:30] Lesson 4: Use multiple models and MCP servers**

"Different models have different strengths. I used Claude Opus for deep implementation work — the Rust backend, complex game mechanics, debugging. I used GPT for design perspective on the website. Having both options in the same tool meant I could switch based on the task."

"MCP servers were the other multiplier. Context7 gave Copilot CLI access to the latest Phaser and Tauri documentation, which was critical since both frameworks move fast. Without that context, the agent would have been working from outdated knowledge and I'd have spent more time correcting mistakes."

Show: Switching models in Copilot CLI. Show Context7 providing relevant Phaser docs mid-conversation.
- Multi-model website design — [83ac45a](https://github.com/DanWahlin/agent-arcade/commit/83ac45a) — `git checkout 83ac45a`
  > Prompt: `I'd like to create a GitHub Pages website that is based on the overall look and feel of the agent-arcade-banner-v3.png image. It should provide the same info as in the readme, but make it look amazingly awesome.`

**[3:30–4:15] Lesson 5: The screenshot-describe-fix-test loop**

"If I had to distill the entire experience into one workflow, it's this: play, screenshot, describe, fix, test. That loop powered every game mechanic, every UI fix, every CSS adjustment. It works because it's fast — you're showing the agent exactly what you see, telling it exactly what's wrong in a sentence or two, and testing the fix immediately."

"The key is keeping each turn tight. Don't write paragraphs. Paste the screenshot, write one sentence, and let the agent work. If it's not right, do another turn. This project had 430+ turns across 7 sessions, but most individual turns were under 30 seconds of my time."

Show: A rapid sequence of the screenshot-describe-fix-test loop across different features.
- Asset cleanup driven by iteration — [5d1f4aa](https://github.com/DanWahlin/agent-arcade/commit/5d1f4aa) — `git checkout 5d1f4aa`
  > Prompt: `We need to organize the assets by game. It's a mess as it currently is. Move assets used by each game into the appropriate sub folder.`
- Community PR reviewed and tuned with Copilot CLI — [6501f4e](https://github.com/DanWahlin/agent-arcade/commit/6501f4e) — `git checkout 6501f4e`

**[4:15–4:30] Closing**

"Agent Arcade started as a weekend project to kill time between AI agent tasks. It turned into a real app with cross-platform builds and a growing set of games. The source code is on GitHub if you want to try it or contribute. And if you want to see what GitHub Copilot CLI can do, the link is in the description. Happy coding — and happy gaming."

Show: Agent Arcade running with all games. GitHub repo link. Copilot CLI link.
- Blog post — [469fb41](https://github.com/DanWahlin/agent-arcade/commit/469fb41) — `git checkout 469fb41`
