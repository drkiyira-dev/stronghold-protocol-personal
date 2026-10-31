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
- Native Safari is **not yet verified for this branch**: the computer-use service timed out attaching to Safari. Prior release Safari results are not reused as proof of these changes. No subjective listening test is claimed.

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

Full original 3D scene packs require upstream's optional client extraction (`tools/local-extract/scenes.py`, `data/local-assets.json`). Those converted meshes/lightmaps/textures are **not bundled in this repository**; our local-assets index still has no such groups. The upstream build URL previously supplied by the maintainer returned HTTP 503 during this audit. No stable, CORS-compatible external scene-pack source was verified, so original scene artwork is **not claimed as integrated**. The upstream procedural board remains playable. Asset URLs or a GPL code license do not transfer Hypergryph/Yostar's third-party asset rights; existing NOTICE/source attribution remains in force. No proprietary binary pack was copied into Git or purchased.

Static Sites still runs the default version. Other versions currently require `?server=local` on the self-hosted service, or an explicitly configured reachable backend. Non-default version rooms have no personal checkpoint persistence; do not promise restart recovery there. The default committed-PREP recovery path remains unchanged. Supporting multiple versions in the static worker safely is separate work, not a reason to bypass content isolation or rewrite the engine.

### Map validation and rollback

New tests compare shipped stage bytes with upstream for all versions, exercise mode-legal map selection and each map's normal/unite/Boss geometry, and check missing/offline/malformed optional scene fallback. Four sequential real WebSocket version runs complete R1 combat/settlement and reach R2 using the original simulator and isolated hosts. Three sequential Chrome runs select the upstream first-season preview, deploy an operator on m05/m06/m07, run actual client simulation and reach R2 with every external asset blocked; no uncaught page errors after the shadow fix. These are automated browser tests, not human acceptance or a complete Boss/nine-round run for every version. Safari remains unverified for this branch.

Final local checks (2026-10-31, macOS, Node 26.7.0, Chrome 156): build passed; **62/62** personal automated tests passed with standalone Git on PATH; **82/82** selected upstream audio/pool/bond, renderer, stage-selection and unite-terrain regressions passed. The complete upstream suite was not run. Tests and browser rooms ran serially. A memory-pressure snapshot reported 65% system-wide free memory; the OS thermal-status API was unavailable, so no temperature measurement is claimed. Native Safari, original scene-pack loading and physical mobile/audio listening acceptance remain open.

Revert the map commit to restore the single-version server configuration and previous renderer adapter, then rebuild/restart the self-hosted service during a maintenance window. Active other-version rooms will end on restart and have no persistent checkpoint; export relevant replay data first. No migration or history rewrite is required. Production Sites is not part of this change. GitHub `verify.yml` runs build/tests on `push` and `pull_request` with read-only repository permission; it contains no deployment step.
