# Static scene resources — PR #5 review

Audit date: 2026-10-31. Development identifier: Enhanced Edition. The game remains **卫戍协议：盟约 / Stronghold Protocol: Alliance**.

See the subsequent [PR #5 pre-merge acceptance](PR5-MERGE-ACCEPTANCE.md) for the final checks, default/imported map distinction, license packaging repair and review decision. The revision-specific results below are retained as audit history.

Code revision: `8b8e24d5da806404d117e607da359fbff1e48d8c` (base main: `19ab6554ee2e3dc480feaaa8484ec8fde748df4d`). This extends the earlier [audio/map review](AUDIO-MAPS-REVIEW.md); its self-hosted bridge results are **not** static-hosting results.

## Decision

- **0/11 scenes can currently be hotlinked directly from the verified external sources into Sites.** HTTPS is available, but the converted art host and final GitHub release download lack CORS permission.
- **11/11 have a verified static-browser import path.** Reuse the original title-screen importer, SHA-based validation, Cache Storage, service worker, asset store and 3D loader. No second renderer or ZIP importer was created.
- The static Worker still supports its existing second-season pool: act1 m01–m04 and act2 m01–m04. act1 m05–m07 are asset-load verified, but their first-season matches still require the existing self-hosted version support. Importing art never changes a map pool or game rules.
- Production was only inspected. Sites reports **Public, active, live version 7**; the existing HTTPS homepage returned 200. No new Sites version, deployment, permission change or paid service was created.

## Source, format, size and rights

Primary source: the [upstream v0.3.3 full release](https://github.com/sganggs/Stronghold-Protocol/releases/tag/v0.3.3), release asset `673357309`, full ZIP size **861,090,941 bytes**. Its already-converted scene JSON, packed geometry, textures and OBJ files match the vendored original loader. The original extraction pipeline is `upstream/tools/local-extract/fetch_scenes.py` / `scenes.py`; official Unity bundles are extraction inputs, not browser-ready scene packs.

The existing directory catalog covers 242 alternatives. The import manifest needs **171 unique files, 57,268,217 decoded bytes (54.62 MiB)** and 37,489,150 compressed ZIP-entry bytes. The audit fetched these files serially with bounded ranges, validated ZIP CRC and calculated full SHA-256. It did not fetch the complete ZIP. `scene-import-catalog.json` records hashes, sizes and references only. The importer follows upstream's first-16-hex SHA-256 URL convention. Hashes verify bytes against this reviewed catalog; they do not grant copyright permission or independently authenticate the original game publisher.

Formats: 71 WEBP (16,030,178 bytes); 48 PNG (12,027,362 bytes); 24 JSON (207,355 bytes); 17 OBJ (157,522 bytes); 11 BIN (28,845,800 bytes).

The table counts each scene's JSON, geometry, lightmaps/environment and referenced shared scene textures. Rows overlap and must not be summed. The shared board/device inventory is another **81 files / 12,787,039 bytes**, already included in the unique total. These are file sizes, not decoded GPU memory estimates.

| Scene | Dependency files | Bytes | Chunks / lightmaps | Direct external Sites fetch | Static load conditions |
| --- | ---: | ---: | --- | --- | --- |
| `act1autochess_m01` | 17 | 6,415,314 | 17 / 2 | No | Yes, with local import |
| `act1autochess_m02` | 17 | 6,287,574 | 19 / 2 | No | Yes, with local import |
| `act1autochess_m03` | 16 | 6,353,017 | 15 / 1 | No | Yes, with local import |
| `act1autochess_m04` | 16 | 6,337,846 | 16 / 1 | No | Yes, with local import |
| `act1autochess_m05` | 17 | 6,579,376 | 22 / 1 | No | Yes, with local import |
| `act1autochess_m06` | 16 | 6,298,219 | 16 / 1 | No | Yes, with local import |
| `act1autochess_m07` | 16 | 6,258,160 | 14 / 1 | No | Yes, with local import |
| `act2autochess_m01` | 18 | 9,900,032 | 19 / 2 | No | Yes, with local import |
| `act2autochess_m02` | 20 | 7,132,151 | 36 / 5 | No | Yes, with local import |
| `act2autochess_m03` | 16 | 6,500,917 | 21 / 2 | No | Yes, with local import |
| `act2autochess_m04` | 18 | 6,540,344 | 26 / 2 | No | Yes, with local import |

All Arknights names, game art, models and audio retain their original third-party rights (Hypergryph / Yostar and the respective owners). Public availability is not permission to redistribute. GPL covers the applicable source code, not these game assets. [LICENSE](../LICENSE), [NOTICE](../NOTICE.md), upstream credit and Codex attribution are retained. No protected art was committed or added to the static preview. The optional QA fixtures remain under ignored `.cache/`, outside its document root, and are selected by the local browser file picker; they are not uploaded.

## HTTPS, CORS and cache findings

Requests used the current Sites URL as the `Origin` header where applicable. The compact machine-readable evidence is [scene-static-source-audit.json](scene-static-source-audit.json); signed GitHub redirect URLs are deliberately omitted.

| Source | Observed response | CORS | Cache behavior / consequence |
| --- | --- | --- | --- |
| Upstream converted manifest / scene JSON / binary / board WebP at `weishuxieyiwangye.cn:8443` | HTTPS 200, valid TLS in this environment | No `Access-Control-Allow-Origin` | Versioned URLs, one-year immutable caching; unavailable to cross-origin fetch/WebGL textures |
| GitHub release API → release-assets host | HTTPS 302 → exact 206 range | API `*`; final asset has no ACAO | The redirect does not make final bytes readable by a static browser |
| Existing UI click and battle-deploy MP3s on `raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2` | HTTPS 200, `audio/mpeg`; 8,194 / 22,822 bytes | `*` | `max-age=300`, ETag; current adapter can decode them directly |
| Old `weishuxieyi.icu` root | HTTPS 200, 20-byte HTML response | No ACAO | `no-store`; this does not establish a usable current scene source |
| Current production | HTTPS 200 | Same-origin page | `max-age=0, must-revalidate`; inspected without mutation |

Native Safari and Chrome cross-origin fetch probes for converted JSON and WebP failed with `TypeError`, consistent with the missing server CORS headers. Real external UI MP3 loading succeeded in both browsers. No opaque `no-cors` responses, disabled browser security or public CORS proxy are used.

The import manifest is revalidated (`no-cache`) and derived renderer responses are not stored. Imported assets use immutable content-hash keys in the existing upstream cache. A cancelled import cannot advertise a scene unless its JSON and geometry are both present. Missing storage, a failed worker registration, absent imports and evicted art keep the original fallback.

## Repairs

1. Restore the existing import button hidden by the personal-layer stylesheet; keep the bulk-download action hidden. Add a normal-window/reload hint in all existing UI locales.
2. Supply the original importer and its old-version pruning operation with a complete, verified scene manifest. The renderer sees only entries present in this browser; optional self-hosted manifests remain usable.
3. Resolve `tiles.json` through its manifest entry in the existing 2D/3D loaders. Its content hash differs from the diffuse texture hash, so deriving a sibling URL was incorrect.
4. Keep both raw and URI-encoded cache keys for hash-verified scene filenames. The original renderer encodes bracketed texture names; without an alias two imported textures still fell through to the missing static URL. Pruning retains both verified keys.

All adaptations live under `personal/` and are applied to build output with checked replacement contracts. The upstream tree, geometry, picking, route/collision logic, rule values, map selection, saves, replay schema and coach logic are unchanged.

## Browser and automated acceptance

Environment: macOS, Node 26.7.0, Playwright 1.62.1 with installed Chrome 156, and native Safari 26.6. All local test tasks ran serially; the preview used low graphics quality. No physical mobile device, subjective listening or hardware temperature measurement is claimed.

- Build passed: 17,098 external asset mappings, 710 atlas adapters, no unmapped atlas entries. The complete serial personal unit suite passed **72/72** (108 seconds), including four new static-import regression groups. The original upstream full test suite was not rerun.

- **Chrome static-only live test:** the original importer accepted all 171 matching files and rejected none. After reload, the original loaders parsed all 11 scenes, decoded their textures/lightmaps and loaded the independently hashed board tile table. No scene-art request reached the static file server. The m01 scene rendered with 17 chunks, six color textures, two lightmaps and 17,811 triangles; legal deployment/combat reached R2 with no uncaught error or WebGL loss. Real external UI audio decoded to 0.45954 seconds and started after interaction; a missing MP3 returned null. Explicit cache eviction followed by reload restored the no-import fallback.
- **Native Safari, regular window:** the same 171-file import retained 178 cache keys after reload (including aliases/index). All 11 scenes and board tiles loaded from cache. The real m01 scene rendered the same 17,811 triangles; deployment/combat reached R2 with no uncaught error or WebGL loss. The external click MP3 decoded and its buffer started through a running AudioContext after a gesture, with UI=40%, battle=25%, BGM/voice=0; missing audio returned null. Reload, R2 checkpoint restoration, replay and tactical-coach navigation worked; restored HP/funds were 26/5. These are native Safari observations, not Playwright WebKit.
- **Fallback and compatibility:** the offline static regression covers original importer/prune/worker handling of encoded filenames, empty-cache manifests, and a real browser-local match through R2. Existing browser checks passed for missing replay metrics, truncation, run identity, save migration/rollback, coach citations, all 254 kit imports in main/worker, audio controls, and desktop/mobile-landscape layout including the restored import button. The three offline first-season map battles and scene/audio-503 battle reached R2.
- The full browser command initially found a QA-only mistake: its new ranged-operator branch assumed a nonexistent deployment list. The probe now uses upstream's ground tiles, which `canPlace` permits for both ranged and melee units; the corrected static regression passed. No game placement rule changed.
- The first full unit run invoked system Git, whose unaccepted Xcode license caused the repository hygiene test to fail. That isolated test passed with the already-installed standalone Git; no system license or global setting was changed. The clean complete rerun is recorded above.

Local evidence stays in ignored `.cache/verification/`: `static-scenes-chrome-live.json`, `static-scenes-safari-live.json`, `static-scenes-safari-private-fallback.json`, corresponding local screenshots, and `static-scenes-safari-restored.jpg`. The importer was exercised with a reduced 171-file ZIP assembled from verified upstream bytes, not by importing the complete 861 MB release. This bounded test limits memory use and does not claim whole-release import performance. Screenshots and protected art fixtures are not published in this repository.

A Safari 26.6 **private-window limitation remains**: after a successful 171-file import, reloading this localhost preview yielded zero cache entries (despite a nonzero storage estimate). A normal window retained all entries and loaded all scenes after reload. This is an observed environment-specific limitation, not a claim about every Safari version or a diagnosed WebKit root cause. The private-window fallback completed deployment, combat and R2 settlement without uncaught errors. Use a regular window for imported art; the UI and documentation state that recommendation. No privacy setting is weakened and no private-mode fingerprinting is added.

## Reproduction and independent preview

Run commands **serially**:

```sh
npm run build
npm test
npm run test:browser
node personal/scene-static-audit.mjs
# Explicit network/private-fixture audit only; not a normal build or CI step:
node personal/scene-import-catalog-build.mjs --fixtures
(cd .cache/scene-import-fixture && zip -qr0 ../scene-import-fixture.zip Stronghold-Protocol)
node personal/static-scenes.browser.mjs --live
# Native Safari / manual inspection:
node personal/static-scenes-preview.mjs
```

The isolated preview is `.cache/static-scenes-preview/`, served at `http://127.0.0.1:4179/?board=3d` in manual mode. It contains only static code/metadata and a QA overlay, plus a report-only endpoint. There are **no WebSocket rooms or scene/audio proxies**. Select the private fixture ZIP through the unchanged upstream importer, reload in a normal window, then use the overlay to inspect scenes and run a legal solo FUNNY match. The map is chosen by the original rule pool; the overlay does not alter the seed, funds, enemy stats or deployment coordinates. Close owned test windows and the preview after testing to reduce load.

This is localhost secure-context browser acceptance with real external HTTPS audio and CORS probes, **not a deployment of this revision to a new Sites HTTPS URL**. Every Sites deployment would affect a published site; no such deployment was authorized. A real hosted revision remains to be checked after explicit approval, including its service-worker scope, hosting headers and cache behavior.

## Known limits, deployment and rollback

- External hotlinking remains blocked (P1 if advertising zero-import original 3D art). A future source needs both appropriate rights and browser CORS; no server/CDN purchase or public rehosting is proposed by this change.
- Safari private-window import persistence is not accepted (P2; safe playable fallback). Low-storage eviction may require reimport in any browser.
- Asset loading for all 11 scenes is not a full 11-map campaign or human playtest. Only the named representative static match is rendered and played through R2 here; full per-version/Boss and physical-mobile acceptance are not claimed.
- A matching v0.3.3 file is required; changed bytes are rejected. Do not silently update the catalog during normal builds. Local manifests and art caches are independent of player progress; this change does not migrate saves.
- The CI workflow runs build/test on pushes and PRs, with read-only repository permission; it contains no deployment step. Keep production Public and unchanged until maintenance review and explicit deployment approval.

Recommendation: review the static-import path as an **optional** feature with these limits. Do not claim direct external scene hosting is solved. After approval, retain the current production artifact and perform the remaining HTTPS checks on the approved deployment. To roll back code, revert this follow-up and rebuild from the previous approved revision; the existing `--scene-assets` opt-in bridge is independent. No save rewrite or cache purge is needed. Imported bytes can remain harmlessly cached; players may use the upstream cache-clear action if desired.
