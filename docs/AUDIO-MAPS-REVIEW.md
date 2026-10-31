# Audio and map reuse review

Development base: `19ab6554ee2e3dc480feaaa8484ec8fde748df4d` (main). No production deployment or access change is part of this work. The upstream source, GPL license and third-party asset notices are retained.

## Audio changes

| Area | Upstream implementation | Enhanced Edition change |
| --- | --- | --- |
| Menu, settings, terminal | Shared buttons have no general sound feedback | Route-scoped click/back/tab cues; settings Escape/backdrop close |
| Buy, refresh, freeze, level-up, sell | `ui/gameActions.js` plays cues after successful ACK; errors have their own cue | Reused; no second optimistic shop sound |
| Select, drag, deploy, retreat | `screens/game.js`, action ACKs and renderer landing cues | Reused |
| Equip and alliances | Equip ACK, bond cues and battle events | Reused; bond output follows prep/battle scope |
| Operator / item merge | Audio assets exist; no matching merge cue call | Observe confirmed preparation-state deltas; item cue requires both a consumed normal item and a new golden counterpart |
| Combat, skills, win/loss, settlement | Phase cues, battle event handler, result screens and voice gate | Reused |
| Mixer and decoding | One Web Audio manager; combined SFX bus; separate BGM/voice | Additional UI gain in that same manager; old `sfx` remains battle volume; old preferences initialize UI volume from `sfx` |

No new audio bank or audio engine. `personal/audio-build.mjs` makes checked build-time adaptations; an upstream source contract mismatch fails the build. UI transition announcements remain UI SFX; combat attack/skill/landing cues use battle SFX. Voice and BGM remain independent. The manager's existing browser gesture unlock, Safari priming, interruption recovery and 64 MiB decoded-buffer budget remain intact.

UI cues are limited to four pending/playing voices, at least 70 ms apart; cold cues older than 450 ms are discarded. These are presentation assumptions, not changes to combat timing or rules. Common small cues warm serially after a user gesture using the existing shared cache. Silent/muted cues do not warm; fetch/decode failure does not block actions. Simultaneous low-priority UI cues may intentionally be suppressed.

## Audio validation

- Six new unit tests: legacy preferences, four mixer channels, gesture initialization, independent zero/mute, burst limits, stale/failed loads, merge deltas and snapshot suppression.
- Chrome 156: settings open/close/Escape, both SFX sliders, preference reload, failed audio request and muted game entry. Repeatable CI uses synthetic PCM; this is not proof that every external recording sounds correct.
- Separate real-origin sampling: click, buy, freeze and battle-start URLs returned HTTP 200; Chrome decoded the real click/back clips and both upstream lobby BGM segments.
- Existing personal suite: 58 passed initially; the Git-ignore test failed because system Git requires an unaccepted Xcode license. That test passed using the already-installed standalone Git. No OS license or global Git setting was changed.
- Existing browser suite passed: checkpoint/vault/replay/coach, 254 kit imports in main/worker, desktop/mobile-layout branding, plus the new audio checks. Tests ran serially.
- Native Safari 26.6 was subsequently verified after the maintainer opened a connectable window: no AudioContext/source before a gesture; running context and 18 decoded real audio files after interaction; independent UI=0 / battle=25% with BGM=60% and voice=80%; mute persisted through reload and entering the lobby started no audible buffers. Menu/backdrop/Escape controls worked. These are actual native Safari observations, not Playwright WebKit or prior release evidence. No subjective listening test is claimed.

## Rollback

Revert the audio commit and rebuild. `uiSfx` is an additive preference, not a save schema field; older code ignores it. Checkpoints, run IDs, replay records, engine rules and tactical-coach inputs are unchanged. Keep production Public and deploy only after explicit maintainer approval.

## Map support

The vendored upstream registry has four official data versions. Previously both the local worker and self-hosted server offered only `act2autochess`. This change enables the upstream version service on the self-hosted server, including its existing content hashes, client data verification, version picker/votes and isolated match host. It does not add a map engine or change data. Other-version processes load lazily with `maxHosts: 1`; switching to another version while that host is occupied can be refused by the upstream capacity guard.

| Map record | Terrain / devices | Before: default version | After: additional self-hosted versions |
| --- | --- | --- | --- |
| `act1autochess_m01` | 战场#01 | Available in its mode pools | Both first-season versions too |
| `act1autochess_m02` | 战场#02 | Available in its mode pools | Both first-season versions too |
| `act1autochess_m03` | 战场#03 | Available in its mode pools | Both first-season versions too |
| `act1autochess_m04` | 活性源石 | Available | Both first-season versions too |
| `act1autochess_m05` | 涨潮 / 特制水上平台 | Inactive in second season | Both first-season HARD pools |
| `act1autochess_m06` | 沙尘暴 / 土石结构 | Inactive in second season | Both first-season NORMAL/HARD pools |
| `act1autochess_m07` | 树丛 | Inactive in second season | Both first-season HARD pools |
| `act2autochess_m01` | 源石流发生装置 | Available | Second-season upper-half version too |
| `act2autochess_m02` | 沼泽控制 | Available | Second-season upper-half version too |
| `act2autochess_m03` | 排气格栅 | Available | Second-season upper-half version too |
| `act2autochess_m04` | 涨潮控制 | Available | Second-season upper-half version too |
| `act1autochess_escaped_single` | Legacy single-player unite record | Not in random map pools | Kept unchanged |
| `act1autochess_escaped_multi` | Legacy two-player unite record | Not in random map pools | Kept unchanged |

There are **11 distinct normal map IDs and two legacy escaped records**, not 13 newly playable maps. Current upstream unite combat continues on the match's selected stage; Boss/normal/unite are views of the same coordinate system. No duplicate geometry, pathfinding, collision or terrain engine was added.

Official mode pools are unchanged (single and multiplayer equivalents use the same map sets):

- `act2autochess`: FUNNY/training = first-season m01; NORMAL = m01–04 plus second-season m01–04; HARD/ABYSS exclude first-season m01.
- `act2autochess@V2_1`: same map sets, but no ABYSS mode.
- `act1autochess` and `act1autochess@V1_1`: training = m01; FUNNY = m01–04; NORMAL = m01–04,m06; HARD = m03–07.

Thus repeated m01 in the default nine-round FUNNY mode is an upstream rule, not a missing-map defect. We do not force other maps into that mode. The three other official versions keep upstream's **preview** warning about inferred bounty behavior, some numbers and six enemies' attack wind-ups.

### Assets and remaining gaps

Terrain/device rendering already exists in the upstream renderer. Shared external artwork continues to use the recorded asset origins and existing fallback. A failed optional shadow image exposed an unhandled Pixi autoload rejection; the `personal/maps-build.mjs` adapter explicitly owns and catches that load while retaining the upstream procedural shadow and cosmetic fallback.

Original scene artwork is now available through an **opt-in self-hosted bridge** (`npm run server -- --scene-assets`). It uses the converted art already published in the [upstream v0.3.3 full release](https://github.com/sganggs/Stronghold-Protocol/releases/tag/v0.3.3), rather than extracting another client or implementing another renderer. The committed catalog contains only the original manifest metadata and ZIP directory offsets for 242 board/scene files, including all 11 normal scenes, shared textures, lightmaps, water, gates and device meshes. Art binaries stay external and are not committed or written to a server disk cache.

The old supplied build returned HTTP 503. A newer upstream-linked host served scene files, but neither it nor the release asset endpoint supplied browser CORS headers. Direct static hotlinking therefore remains unsuitable. The bridge reads exact byte ranges from one pinned release asset (861,090,941 bytes in total, **never fetched whole**), accepts only the known GitHub release redirect host, validates response range/length, ZIP entry identity, bounded decompression, decoded length and CRC32. CRC detects corruption; it is not a claim of independent cryptographic authentication. Remote reads/decompression are serial; duplicate requests coalesce; the LRU cache is 16 MiB, each file/range at most 8 MiB, and at most 48 reads queue. Failures trigger a 30-second source cooldown, return uncached 503s and retain upstream fallbacks. The route serves only catalogued public art with no credentials, never arbitrary URLs, filesystem paths or room data.

`personal/scene-catalog-build.mjs` is an explicit metadata refresh command, separate from normal builds; it reads about 5 MiB of ZIP directory and 22 KiB of compressed manifest. A source update requires a reviewed catalog change. `personal/scene-assets.mjs` adapts transport only; `board3d/load.js`, `BoardScene`, coordinates, picking, collision, enemy routes, stage selection and game rules are unchanged.

Static builds keep an empty optional-art manifest unless `PERSONAL_SCENE_ORIGIN=https://YOUR-ASSET-SERVER` is explicitly set to a provisioned HTTPS bridge. This only writes asset URLs; it does not create hosting, enable multiplayer, deploy Sites or change access permissions. No such public asset service was provisioned in this task. The current production site therefore remains unchanged. Source uptime, GitHub rate limits, cold-loading latency and third-party resource rights remain limitations. URLs and GPL code do not transfer Hypergryph/Yostar's art rights; existing NOTICE and upstream attribution remain intact.

Static Sites still runs the default version. Other versions currently require `?server=local` on the self-hosted service, or an explicitly configured reachable backend. Non-default version rooms have no personal checkpoint persistence; do not promise restart recovery there. The default committed-PREP recovery path remains unchanged. Supporting multiple versions in the static worker safely is separate work, not a reason to bypass content isolation or rewrite the engine.

### Map validation and rollback

New tests compare shipped stage bytes with upstream for all versions, exercise mode-legal map selection and each map's normal/unite/Boss geometry, and check missing/offline/malformed optional scene fallback. Four sequential real WebSocket version runs complete R1 combat/settlement and reach R2 using the original simulator and isolated hosts. Three sequential Chrome runs select the upstream first-season preview, deploy an operator on m05/m06/m07, run actual client simulation and reach R2 with every external asset blocked; no uncaught page errors after the shadow fix. These are automated browser tests, not human acceptance or a complete Boss/nine-round run for every version.

The earlier baseline checks (2026-10-31, macOS, Node 26.7.0, Chrome 156) passed build, 62 personal tests and 82 selected upstream audio/pool/bond, renderer, stage-selection and unite-terrain regressions. The complete upstream suite was not run. Supplemental scene/Safari results are recorded below. Physical mobile/audio listening acceptance remains open; no hardware temperature measurement is claimed.

### Supplemental native Safari and original-art acceptance

- Safari 26.6 and Chrome 156 loaded the real m05 scene: 22 chunks, 57,498 vertices, 7 color/emission textures and its lightmap; the existing 3D renderer drew 18,073 triangles. Both deployed an operator, ran the real simulator, settled R1 and reached R2 with no uncaught script errors or WebGL loss. Each requested 47 scene resources, all HTTP 200; bridge cache was about 8.6 MiB. Safari also displayed real external operator artwork. Chrome's focused scene run deliberately blocked unrelated artwork.
- Chrome additionally completed m06 (16 chunks, 51,839 vertices) and m07 (14 chunks, 51,758 vertices), each with six color/emission textures, its lightmap, legal deployment and R2 settlement. Both had 46 successful scene requests and no uncaught errors or WebGL loss.
- Native Safari's failed-source run returned 503 for 15 scene requests and one audio request. The audio buffer resolved to null with a running AudioContext, the procedural board remained usable, and deployment/combat/settlement reached R2 without uncaught errors. The original-art and failed-source runs were separate fresh private windows, closed afterward.
- Reproducible browser harness: `node personal/scenes.browser.mjs` injects failed scene/audio requests; `--live` uses upstream art; `--manual --live` exposes the same test-only overlay for native Safari. Select first-season V1_1, then use its prepare/fight buttons. The overlay drives legal network actions and observes the original renderer; it is never copied to `dist`. This is instrumented acceptance, not a claim that a human manually played the whole match.
- Source audit: `node personal/scene-assets-live.mjs` passed all **11/11** scene JSON/mesh pairs using the upstream parser and checked their referenced textures/lightmaps against the catalog. This verifies mesh integrity and references, not every texture pixel or each later/Boss phase.
- Six new deterministic test groups cover the catalog, strict ranges/redirects, truncated/corrupt assets, decompression limits, coalescing/serialization/cache/queue/cooldown, HTTP methods/unknown paths/uncached failures, and the opt-in host boundary. All six passed. The default browser suite includes scene-source failure regression without external downloads. Live source checks are explicit and remain outside CI to avoid flaky external dependencies.
- The complete local personal suite passed **67/67** before the final opt-in-boundary test was added; the subsequent focused scene suite passed **6/6**, including that additional test. Tests ran serially. A memory-pressure sample during native scene validation reported 56% system-wide free memory; no temperature or sustained performance benchmark is claimed.
- The complete local browser suite passed after the scene changes: checkpoint/vault/replay/coach checks, all 254 kit imports in main/worker, desktop/mobile-layout branding, audio, three offline-map battles, and the additional scene/audio 503 battle. The added Chrome 503 run reached R2 with 16 expected failed resource responses and no uncaught errors. This does not replace the still-open physical-device or full per-version campaign acceptance.

Revert the scene follow-up commit, omit `--scene-assets`, or rebuild without `PERSONAL_SCENE_ORIGIN` to restore procedural-only optional art. This does not migrate saves or change replay/coach schemas. Stop/restart a self-hosted server only with awareness of its existing room persistence limits.

Revert the map commit to restore the single-version server configuration and previous renderer adapter, then rebuild/restart the self-hosted service during a maintenance window. Active other-version rooms will end on restart and have no persistent checkpoint; export relevant replay data first. No migration or history rewrite is required. Production Sites is not part of this change. GitHub `verify.yml` runs build/tests on `push` and `pull_request` with read-only repository permission; it contains no deployment step.
