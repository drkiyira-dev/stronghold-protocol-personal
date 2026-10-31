# PR #5 — pre-merge audio and map acceptance

Date: 2026-10-31. Game: **卫戍协议：盟约 / Stronghold Protocol: Alliance**. Enhanced Edition is the development identifier. Base main: `19ab6554ee2e3dc480feaaa8484ec8fde748df4d`; this follow-up starts from PR revision `e63d86224da5a5fefc4c40c9f6b952c23f777e8a`. License fix: `df2fc1a`; audio regressions: `e0f9367`; scene regressions: `e87f807`. The PR records the final tested head and CI run.

This is code merge acceptance, not permission to deploy or redistribute third-party game art. Sites remains **Public, active, v7**, confirmed through a read-only query. No production deployment, main merge, access change, paid service or public art upload was performed.

## Changes in this follow-up

- Add regression coverage for all 16 warmed UI/merge cues before the first gesture; four-channel volume and mute persistence; bad ZIP and incompatible-hash imports; and catalog change/rollback with retained or evicted art.
- Fix a static-package omission: the existing NOTICE linked upstream notices that were not included in `dist/`. Copy the original upstream notices and GPL text unchanged, include the bundled worker's SES/Acorn/Endo license supplements, and link the current source repository and third-party notices from the existing terminal overview. Unit tests compare the copied bytes; browser tests check the links and HTTP responses.
- Add a local-only QA control to capture actual audio preferences. It is excluded from production output.

No upstream source, game rules, map selection, operators, renderer, audio engine, save schema, replay schema or coach logic changed in this follow-up.

## Static Sites map boundary

The default static Worker uses `act2autochess`. Its **eight existing maps remain playable without additional art**, using the upstream procedural board and terrain/device behavior. Importing optional original scene art changes presentation, not map pools, coordinates, deployment, routes or collisions.

| Scene | Terrain / identity | Default static game pool, without imported art | Optional original 3D scene after valid local import |
| --- | --- | --- | --- |
| `act1autochess_m01` | 战场 #01 | Yes, subject to mode | Loaded successfully |
| `act1autochess_m02` | 战场 #02 | Yes, subject to mode | Loaded successfully |
| `act1autochess_m03` | 战场 #03 | Yes, subject to mode | Loaded successfully |
| `act1autochess_m04` | 活性源石 | Yes, subject to mode | Loaded successfully |
| `act1autochess_m05` | 涨潮 / 特制水上平台 | No; existing first-season self-hosted HARD pool | Asset loading verified; import does not unlock the match |
| `act1autochess_m06` | 沙尘暴 / 土石结构 | No; existing first-season self-hosted NORMAL/HARD pools | Asset loading verified; import does not unlock the match |
| `act1autochess_m07` | 树丛 | No; existing first-season self-hosted HARD pool | Asset loading verified; import does not unlock the match |
| `act2autochess_m01` | 源石流发生装置 | Yes, subject to mode | Loaded successfully |
| `act2autochess_m02` | 沼泽控制 | Yes, subject to mode | Loaded successfully |
| `act2autochess_m03` | 排气格栅 | Yes, subject to mode | Loaded successfully |
| `act2autochess_m04` | 涨潮控制 | Yes, subject to mode | Loaded successfully |

For the default version, NORMAL includes the eight maps; HARD/ABYSS exclude act1 m01; FUNNY uses act1 m01. Existing upstream mode/version previews remain authoritative. The two legacy escaped/unite records are not part of these 11 ordinary scenes.

**0/11 verified direct-hotlink original 3D paths; 11/11 verified conditional browser-import paths.** The reviewed HTTPS scene host and final GitHub release response lack browser CORS permission. Do not advertise all 11 as selectable static matches or zero-import original backgrounds. Source sizes, formats, checksums and response headers are in the [static scene audit](STATIC-SCENES-REVIEW.md) and its [machine-readable evidence](scene-static-source-audit.json).

## Audio acceptance

The existing manager creates/unlocks its context only after a pointer, click, touch or key gesture. All added cues use that manager. A page reload is not a gesture, even when a remembered session skips the title. The first Start click unlocks queued lobby music; an additional unrelated click is not required. This follows [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/); no browser protection is bypassed.

The four buses are BGM, UI SFX, battle SFX and voice, with a global mute. UI cues retain the 70 ms spacing, four-voice bound, 450 ms cold-cue expiry and shared decoded-buffer budget. Existing shop/action ACKs, battle events and voices remain upstream implementations. Fetch/decode failure returns a missing buffer and does not block an action. Synthetic CI audio tests routing/activation; real HTTPS audio was separately decoded in both browsers. Subjective sound quality and every individual external recording are not claimed as tested.

## Validation results

Environment: macOS, Node 26.7.0, Playwright 1.62.1 / installed Chrome 156.0.8078.47, and **native Safari 26.6**, not Playwright WebKit. Tests ran serially, one test browser/task at a time; scenes used low quality. No hardware temperature measurement or physical mobile result is claimed. The installed standalone Git was used without accepting/changing the system Xcode license.

| Check | Result / evidence |
| --- | --- |
| Final static build | Pass; 17,098 external mappings, 710 atlas adapters, zero unmapped entries |
| Complete personal automated suite | Pass: **75/75**, 0 failures, 106.9 seconds |
| Complete browser suite | Pass: all eight serial browser scripts, including missing replay metrics, run identity, save migration/rollback, coach citations, all 254 kit imports in main/worker, desktop/mobile-landscape, audio, three first-season map battles, source-503 fallback and the no-import static match through R2 |
| Chrome four-channel/mute regression | Pass: BGM 20%, voice 40%, UI 35%, battle 25% retained after reload; muted gesture started no non-silent buffers; unmute resumed; first Start BGM and failed-audio entry passed |
| Native Safari settings | Pass: actual slider clicks saved four 50% values; reload retained them and mute; muted gesture had master gain 0 and zero non-silent starts. UI unmute + reload retained false and restored master gain 1 |
| Native Safari real external audio | Pass: HTTPS click MP3 decoded to 0.45954 seconds; running AudioContext and non-silent buffer starts observed after interaction; missing MP3 returned null |
| Native Safari import/cache/version rejection | Pass: previous valid import remained across reload and reopening the normal test window; 178 cache keys including aliases/index, 177 asset keys. Invalid ZIP showed its error. A one-file incompatible ZIP reported accepted 0 / rejected 1 and left those cache entries intact |
| Native Safari original 3D | Pass: all 11 scene packs and the independently hashed tile table loaded after the rejection checks; act1 m01 rendered 17 chunks / 6 color textures / 2 lightmaps; legal deployment, combat and R2 settlement completed with no captured uncaught error or WebGL loss |
| Chrome fresh valid import / eviction | Pass: 171 files accepted, 0 rejected; reload retained all 11 scene packs and the tile table. Bad ZIP/hash imports preserved cache. Original m01 rendering/deployment/combat reached R2, with 0 scene-art requests to the static server and no uncaught error/WebGL loss. Explicit eviction + reload restored the empty-cache fallback |
| Catalog changes / rollback | Pass: new geometry hash cannot reuse old geometry; restoring the old catalog can use retained bytes; evicted bytes yield procedural fallback, not an incompatible scene |
| Static notice/source distribution | Pass in unit and desktop/mobile browser checks: unchanged original notice bytes, supplement files, source links and HTTP 200 rather than HTML fallthrough |
| Native Safari private-window persistence | Known limitation from the preceding PR audit: imported cache was empty after reload; playable fallback reached R2. Not accepted for persistent imported art |
| New revision on actual Sites HTTPS | Not executed: requires explicit deployment approval; localhost secure-context testing is not that deployment |
| Physical mobile, all-map full campaigns/Boss, subjective listening | Not executed in this follow-up; do not equate loader checks with complete player acceptance |

Evidence is kept locally in ignored `.cache/verification/`: `pr5-merge-build.log`, `pr5-merge-unit.log`, `pr5-merge-browser.log`, `pr5-merge-chrome-live.log`, `static-scenes-chrome-live.json`, `pr5-merge-safari-muted.json`, `pr5-merge-safari-unmuted.json`, `pr5-merge-safari-cache-before.json`, `pr5-merge-safari-live.json`, and the corresponding native screenshots. The final CI run uploads automated browser reports, not protected game-art fixtures. The [earlier review](AUDIO-MAPS-REVIEW.md) separately records self-hosted version/map tests and selected upstream regressions; those are not new static-hosting results.

## Import lifecycle and rights

Reuse the upstream title-screen importer, service worker, Cache Storage, asset store and 3D loaders. No importer or renderer was duplicated. Use a regular browser window, import a matching pack the user lawfully holds, then reload. QA used 171 verified files (54.62 MiB before GPU decoding), not the complete 861 MB release; whole-release import performance is unverified. Private fixtures remained outside the preview document root and were never published.

Content-hash keys distinguish versions. Both JSON and geometry must exist before a scene is advertised. Original old-version cleanup retains current raw/encoded aliases; cleanup/eviction can require reimport after a rollback. Corrupt ZIPs and mismatched bytes produce the original visible failure/count messages and do not overwrite valid content. Storage denial, worker failure, absent/partial imports and evicted art preserve fallback. Art caches are separate from player progress; no save migration or destructive reset is part of this PR.

Code remains GPL-3.0-or-later with the existing notices, upstream authorship and GPL section 7 permission relating to Spine. That permission does not waive Spine's own license. The static artifact now includes the previously omitted linked notices and bundled dependency supplements. Complete corresponding source remains in the current public repository; original source remains credited to [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol).

Scene provenance is the pinned [upstream v0.3.3 release](https://github.com/sganggs/Stronghold-Protocol/releases/tag/v0.3.3); audio uses the existing [ArknightsAssets2 source](https://github.com/ArknightsAssets/ArknightsAssets2). Public downloads and CORS headers do not establish permission to redistribute copyrighted game materials. No new game-asset authorization was established by this audit. Names, recordings, textures and models remain subject to their respective Hypergryph/Yostar/other owners' rights, outside the code's GPL grant. No public mirror, paid CDN or server was provisioned. This code review is not clearance to redistribute protected assets.

## Remaining limits, decision and rollback

- **P1 if promised as a feature:** zero-import original 3D hotlinking is unavailable; the documented default is procedural, with optional local art. This is not a merge blocker for that scoped feature.
- **P2:** Safari private-window cache persistence is not accepted; use a normal window. Browser storage eviction can affect any browser and requires reimport, not loss of player saves.
- **P2 / existing scope:** alternate-version self-hosted rooms still lack Enhanced Edition restart checkpoints. Do not promise default-version recovery guarantees for those previews.
- **Release validation pending:** actual Sites HTTPS service-worker scope, cache headers and approved-version smoke checks; physical devices and complete per-map campaigns. No production update is authorized by this report.

The final local build, automated suite, complete browser suite and separate real-asset browser runs passed. No blocking defect was identified for the documented optional-art scope. Recommendation: mark PR #5 Ready for Review once its exact-head CI is green (linked in the PR). Maintainer review and explicit deployment approval remain separate.

The GitHub workflow runs on push and pull_request with read-only repository contents permission and **no deployment step**. Reverting the PR's commits and rebuilding restores the previous code; `uiSfx` is additive and older code ignores it. Save, replay and coach formats remain unchanged. Imported art can stay cached; no purge is required, and missing old bytes fall back safely. Preserve the current v7 artifact before any separately approved deployment. Keep the original license-distribution fix in any future distributed artifact.

Reproduce serially: `npm run build`, `npm test`, `npm run test:browser`, then optionally `node personal/static-scenes.browser.mjs --live` with privately prepared matching fixtures. For native Safari use `node personal/static-scenes-preview.mjs`; complete the actual Start action before the QA prepare/fight controls. Close the owned test window and server before starting another browser/test task.
