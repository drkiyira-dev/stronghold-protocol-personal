# Stronghold Protocol: Alliance — Personal Edition

**English** | [简体中文](README.zh-CN.md)

**This is a derivative of [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) 0.3.3, not an original game built from scratch or an official Hypergryph project.**

Maintained by [drkiyira-dev](https://github.com/drkiyira-dev), this project adapts the upstream game into a personal, single-player browser edition. It retains the upstream operators, skills, alliances, equipment, strategies, shop, difficulties, and automatic combat logic, while adding a browser-hosted engine, preparation-phase saves, and deployment optimizations. Thanks to the upstream author and contributors.

The source code is licensed under **GPL-3.0-or-later (GNU GPL version 3 or any later version)**, consistent with upstream. See [LICENSE](LICENSE) for the terms and [NOTICE.md](NOTICE.md) for attribution and asset notices. Characters, artwork, music, and game data do not become GPL-licensed merely because the code is open source.

## Codex development and testing disclosure

**The code added or modified for this personal edition was written by OpenAI Codex under the maintainer's direction. Its added regression tests were also written and run by Codex.** Codex performed the automated checks, browser gameplay testing, debugging, and deployment verification documented below.

This attribution covers this derivative's additions and changes. The upstream game engine, original implementation, and existing upstream tests remain the work of their respective authors and contributors.

## Run locally

Requirements: Node.js 22+ and Python 3. The upstream installation step prepares browser dependencies such as PixiJS and Preact.

```sh
npm ci
npm --prefix upstream ci --omit=dev
python3 personal/cache-visual-assets.py
python3 personal/cache-audio-fonts.py
npm run build
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/), enter a Doctor name, and choose Start → Solo Simulation → Difficulty → Start Simulation. In the Chinese UI, these controls are 「开始 → 独立模拟 → 难度 → 开始模拟」. A wide desktop window or landscape display works best.

The repository does not bundle the portraits, models, or audio required at runtime; upstream documentation screenshots and rules data retain their original notices. The first asset download is approximately 400 MB. Sources are recorded in `personal/*source-map.json`. Download scripts reuse existing files; subsequent source changes only require another `npm run build`.

## Changes in this edition

- Runs the upstream Lobby, Network, and Match components in a browser Worker, so solo simulation does not depend on the original site's game server.
- Reconnects after an idle title screen or a connection timeout while preserving the current solo room and identity.
- Automatically saves during preparation in the current browser. Reopening the lobby offers 「继续上次休整」 (resume the last preparation phase). Leaving during combat restores the latest preparation save rather than an individual combat frame.
- Preserves the board, bench, funds, shop, alliances, equipment, stock, scheduled enemy waves, and six random-number streams. Incompatible data or engine versions are rejected on restore.
- Automatically pauses solo combat when the page goes into the background, retaining the original controls and confirmation dialogs.
- Transfers skeleton animations with lossless gzip compression; the browser restores the original bytes before handing them to the renderer.
- Serves Spine models, avatars, UI assets, background music, UI sounds, and basic combat sounds from this site. To fit the Sites 256 MiB upload limit, portraits and tutorial images load on demand from recorded public asset sources. Local originals remain in `.cache/art-originals/`. Full operator voice packs and all dedicated combat sounds are not bundled.
- Uses the recorded match's mode to recover missing round limits when reopening older battle reports, fixing standard solo results that incorrectly displayed `9/14` instead of `9/9`.

Only solo simulation is available. Multiplayer alliances, remote AI, and account synchronization with the original site are not implemented. Combat follows the upstream implementation, which is an unofficial fan recreation and may differ from the official mode. Simulation runs independently of the original game server; saves and settings stay in the current browser, while portraits and tutorial images require access to their public asset sources.

## Development entry points

- `upstream/data/`: rules data for operators, equipment, alliances, enemies, and waves. Follow the upstream data-generation workflow when changing it.
- `upstream/server/sim/content/`: operator skills, alliances, and related combat behavior.
- `upstream/public/js/`: upstream UI and rendering logic, including the battle-report fix.
- `personal/`: this edition's browser host, autosave, asset adaptation, build scripts, and regression tests.

The imported source is kept in `upstream/` to make changes and future upstream updates easier to track. Most personal-edition changes live in `personal/`. The development source is public; this does not change the private hosted site's access permissions.

## Verification

After installing dependencies and preparing assets as above:

```sh
npm run build
npm test
```

The personal tests cover recruitment, deployment, real combat settlement, progression to the next round, and checkpoint restoration of the board, stock, shop, random state, and subsequent battle results. They also cover reconnect handling, lossless skeleton transport, browser module dependencies, and historical battle-report round limits.

**Verification performed by Codex on October 30, 2026:**

- Completed the standard solo simulation through all nine rounds and defeated the final leader, finishing with **25/25 life**.
- Checked final settlement, return to the lobby, saved history, refresh persistence, and removal of the completed run's preparation save.
- Reproduced and fixed the historical report's `9/14` display, then verified the deployed version shows **`9/9`** for the existing saved victory.
- Passed **140 relevant upstream/regression tests** and the **10-test personal-edition suite**. These suites overlap; the counts are reported separately.

These checks document the tested flow, not exhaustive coverage of every operator, difficulty, or team composition.

`personal/迁移研究.md` contains migration research and references. `dist/` is generated output and is not committed to Git.

## License and credits

Code: **GPL-3.0-or-later**. Game characters and assets remain the property of their respective rights holders. See [NOTICE.md](NOTICE.md), [LICENSE](LICENSE), and the upstream notices. This project is intended for personal, non-commercial simulation.
