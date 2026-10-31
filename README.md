# 卫戍协议：盟约 / Stronghold Protocol: Alliance

**English** | [简体中文](README.zh-CN.md)

**An unofficial derivative of [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) 0.3.3, maintained by [drkiyira-dev](https://github.com/drkiyira-dev).** This is not an original game built from scratch or an official Hypergryph project. The upstream operators, skills, alliances, shop and combat simulation remain the foundation. Thanks to the original author and contributors.

Code: **GPL-3.0-or-later**, consistent with upstream. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). Game characters, artwork, music and data retain their respective rights and are not relicensed by this repository.

This is an unofficial, non-commercial fan derivative and is not affiliated with the official Arknights project.

## AI-Assisted Development

This Enhanced Edition is developed and maintained by Dr.Kiriya with substantial engineering assistance from OpenAI Codex.

Codex has assisted with browser-based engine adaptation, save-state persistence, asset optimization, testing, and deployment workflows.

The project is based on the original Stronghold-Protocol repository. Original authorship and third-party intellectual property rights remain with their respective owners.

## Codex disclosure

**The Enhanced Edition's additions and modifications were written by OpenAI Codex under the maintainer's direction. Its added tests were also written and run by Codex, including automated regression checks, browser gameplay checks, debugging and deployment verification.** This credit does not apply to the upstream implementation or its existing tests.

See [contribution attribution](CONTRIBUTING.md) for the verified Codex co-author identity and the policy for future commits.

## Run

Use **Node.js 26.7.0**, the runtime used for the SQLite recovery backend and RC checks. The three remaining serial-test failures are fixed; the full upstream suite has not been rerun on the fix. See the [RC follow-up](docs/RELEASE-CANDIDATE-2026-10-31.md). No bulk artwork download is needed for the current build.

```sh
npm ci
npm --prefix upstream ci --omit=dev
npm run build
npm run server
```

- Open [http://127.0.0.1:4174/](http://127.0.0.1:4174/) for the browser-local solo engine.
- Open [http://127.0.0.1:4174/?server=local](http://127.0.0.1:4174/?server=local) for rooms hosted by the running Node server.
- LAN: run `npm run server -- --host 0.0.0.0`, then open `http://YOUR_LAN_IP:4174/?server=local` on each device. Share the room code.

The [hosted Site](https://blackshore-protocol-kiriya.fluffymelon1026.chatgpt.site/) is **Public** and must remain publicly accessible during development. Repository changes and RC release holds do not authorize closing, deleting or restricting it. A static deployment serves `dist/` and does not itself run a room server. The live deployment and this development branch can contain different versions.

Production deployment requires the maintainer's **explicit approval**, separately from PR review or merge. Do not deploy an unreviewed development branch. The current GitHub workflow runs verification on `push` and `pull_request`; it has no deployment step. See the [deployment audit and PR #3 review](docs/PR3-REVIEW-2026-10-31.md) for the checked scope, limitations and rollback procedure.

## Enhanced development preview

Open **「战术终端」** in the game:

- **Save vault v3:** atomic IndexedDB transactions, retained legacy originals, checksummed snapshots, migration rollback/undo and old-tab conflict archival. Imports remain candidates until the engine confirms restoration. Completed runs retain their backups.
- **Replay v2:** stable event references, sampled positions/health, paginated events, explicit missing/truncated/interrupted data, operator statistics and conservative comparisons. Same-seed retries have separate recordings; v1 remains readable.
- **Tactical coach 2.0:** local observations, hypotheses and proposed adjustments cite facts or recorded events. Click a citation to inspect its source. Optional model cards must reference evidence from the selected battle; provider keys stay on the server.
- **Custom challenges:** fixed seeds, deployment limits, banned operators, no-refresh/no-equipment rules and JSON import/export. Challenge results are separated from standard achievements.
- **Multiplayer foundation:** the original room protocol, shared match state, cooperative rooms and identity reconnect through the self-hosted backend. A data-only sample Mod adds a training operator and first-round income.
- **External resources:** art, Spine models, music, sounds and voice paths resolve to recorded external addresses, with atlas adaptation and available mirrors. The build contains 17,098 resource mappings and 710 atlas metadata adapters. Mapping coverage is not proof that every upstream URL is reachable.

**Saves are preparation-phase checkpoints, not arbitrary-time saves.** Leaving during combat returns to the last preparation checkpoint. An incompatible engine or rules fingerprint keeps the old save exportable but blocks restoration; this is not a promise that every future engine version can resume every old match. Export important progress before an upgrade or clearing browser data.

**The hosted default is still local solo play.** Multiplayer requires a running self-hosted server. Rooms remain in memory by default. Opt into **committed PREP recovery** with `--state-dir .personal-state`: supported default cooperative rooms can resume after a restart, using existing reconnect credentials and consent from every human member. Operations, combat and uncommitted settlement after that checkpoint roll back. Original-site accounts and remote AI teammates are not integrated. The optional LLM coach analyzes results; it does not control teammates. Local PREP saves do not persist server rooms.

Replays retain up to 30 records, with at most 600 sampled frames and 2,500 key events per battle. They are schematic playback, not full video or a resumable simulation. Earlier battle history imports as summaries only. External assets require network access and may be unavailable if their hosts change.

## Guides and development

The game is **卫戍协议：盟约 / Stronghold Protocol: Alliance**. **Enhanced Edition** identifies this development edition, not a different game name. Internal `personal/` paths, package identifiers, save keys and dated historical reports retain their existing identifiers for compatibility and traceability.

The [implementation report](docs/ENHANCED-IMPLEMENTATION.md) ([中文](docs/ENHANCED-IMPLEMENTATION.zh-CN.md)) describes the enhancements, recovery boundaries and remaining work. They have **not been deployed to production**.

The next-phase [design and audit](docs/ENHANCED-DESIGN.zh-CN.md) preserve the original game, engine, plugins, Studio and AI teammates. The first reliability patch fixes unknown replay metrics, visible recording truncation, stable save-run identity and activation only after a confirmed restore. See the [patch scope and verification](docs/RELIABILITY.md). These source changes do not authorize or perform a production deployment.

See **[setup, saves, coach, challenges and Mods](docs/PERSONAL.md)** ([中文](docs/PERSONAL.zh-CN.md)).

- `personal/`: browser host, save vault, tactical terminal, external asset adaptation, backend and tests.
- `upstream/`: imported implementation, rules data and original documentation. Follow upstream data-generation and plugin workflows.
- `personal/examples/`: importable challenge packages and a data-only Mod example.
- `dist/`: generated output, not committed. Historical asset-cache scripts are optional maintenance tools and are no longer required by the build.

## Verification

```sh
npm run build
npm test
node upstream/tools/plugin.mjs check personal/examples/personal-lab --strict
# Optional browser checks (installed Chrome):
npm run test:browser
```

`npm test` runs test files one at a time. Run build, automated tests and browser suites sequentially on resource-constrained machines; the browser command also runs its suites sequentially.

**Current RC assessment: HOLD — not approved for release.** The latest [browser acceptance report](docs/RC-BROWSER-ACCEPTANCE-2026-10-31.md) ([中文](docs/RC-BROWSER-ACCEPTANCE-2026-10-31.zh-CN.md)) records Chrome + native Safari completing all 14 cooperative rounds with Boss victory, live reconnect, R9 committed-PREP crash recovery with both-client consent, and completed-match restart without duplicate history. Real external asset samples, mirror retry and a full-Spine-outage battle passed. Mobile emulation covered menus, recruitment, battle/replay and PREP restore, but touch drag/facing remains unverified and two UI overlaps were found; physical devices were explicitly deferred.

The [earlier fix verification](docs/RELEASE-CANDIDATE-2026-10-31.md) preserves the Safari/three-test fixes and serial automated results. The original solo campaign completed R9 defeat across two builds (8/9 passed); a fresh nine-round solo run on the fix and a new full upstream/golden run were not performed. The intermittent readiness timeout remains unexplained. The [original assessment](docs/RELEASE-CANDIDATE-2026-10-30.md) retains failed-run evidence. Tests ran serially; owned QA tabs/servers are closed. Production was not updated.

Historical Codex verification (these results do not replace the current RC assessment):

- Enhanced preview: **52 automated tests** and **20 local browser checks** passed, including real process termination/restart, interrupted commits, settlement barriers, encrypted backup restoration, concurrent IndexedDB writes, migration rollback and evidence navigation. Browser assets were blocked and model calls mocked; this is not a new nine-round or production acceptance run. CI verifies builds/tests and contains no deployment step.

- Reliability patch: **38 personal regression tests passed**, including the new missing-data, truncation, run-identity, legacy restore, failed-write and late-acknowledgement cases. Browser checks use an isolated localhost server and synthetic fixtures; see the patch report. The full nine-round browser run was not repeated for this patch.

- Version 1.1: **27 personal regression tests passed**, including save migration/corruption/quota cases, real local combat and challenge restore, two WebSocket players with reconnect and progression to round 2, Mod composition, replay validation and the optional coach proxy. Model-provider calls were mocked; no paid model was called.
- Version 1.1 browser: completed a real battle, inspected its 2,025-damage replay and local advice, exported the record, and refreshed/restored round 2. External Spine character models were visually verified.
- Previous release: completed all **9 rounds**, defeated the final leader with **25/25 life**, and verified final settlement/history, including the `9/14` → `9/9` historical-report fix. That release passed 140 relevant upstream/regression tests and 10 personal tests (overlapping suites). The entire nine-round run was not repeated for 1.1.

These checks cover the documented scenarios, not every operator, asset, difficulty or combination. Research and source references remain in `personal/迁移研究.md`.
