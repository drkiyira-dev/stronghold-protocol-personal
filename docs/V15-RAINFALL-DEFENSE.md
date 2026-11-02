# Rainfall Defense — v15 original-stage prototype

[简体中文](V15-RAINFALL-DEFENSE.zh-CN.md)

This is an **unofficial original stage inside Stronghold Protocol: Alliance**, not a replacement for the original game. The development branch does not update the Public v14 site. No deployment workflow is configured: GitHub Actions only builds, tests and uploads verification artifacts on pushes and pull requests.

## Play

Build with `npm run build`, then run `node personal/custom-stage-preview.mjs` and open `http://127.0.0.1:4185/`. The local QA preview mutes sound and blocks external resources to exercise the no-extra-assets fallback; it does not inject a roster, battle result or saved game. Normal builds retain the existing external asset and audio adapters.

Choose **Tactical terminal → Challenges → Rainfall Defense** (战术终端 → 自定义挑战 → 雨夜防线). Start the room, confirm the briefing, choose a strategist, recruit and deploy. The stage uses Alliance (`act2autochess`) and the existing solo simulation economy, operators, skills, equipment and alliances. Difficulty, language, quality and standard-mode preferences are retained outside the fixed custom room. Leave the room to return to standard play.

Three assaults use two entrances that converge on the same defence corridor. Win by completing all three with LP remaining and **at most four cumulative counted leaks**. More than four leaks or ordinary LP defeat ends the challenge. There is no Boss round and no official reward. The fixed seed is `20261102`; reproducibility also requires the same strategist, purchases, placements, facing, equipment and actions.

**Custom-stage saves are disabled.** Refreshing or leaving discards this challenge. Its preparation and settlement never write or clear a standard checkpoint. Standard saves remain available after returning to the lobby. Replays still record each assault and identify the custom content hash, version and run; statistics use upstream's modded-content category, separate from normal achievements and rewards.

## Authored layout and waves

The playable half uses the upstream 19×21 grid; the deployment area is rows 9–12, columns 2–10. The other half is the upstream renderer's mirrored scaffold, not a second playable map. Road, elevated, forbidden, entrance and goal tiles reuse upstream types. The new layout is authored data, not copied map artwork.

```
          columns 2 … 10
row  9    ErrrhrrrS
row 10    #hrhhrhh#
row 11    #hrrrrhh#
row 12    ##rhhrrrS
```

`r`: ground deployment/road; `h`: elevated ranged deployment; `#`: forbidden; `S`: entrance; `E`: goal. Upper route: (9,10) → (11,7) → (11,4) → (9,2). Lower route: (12,10) → (12,7) → (11,4) → (9,2). These are upstream route checkpoints, resolved by its actual Grid pathfinder. Defenders can cover the junction or split between approaches; deployment facing remains significant.

| Assault | Enemies | Pressure |
| --- | --- | --- |
| 1 | 8 existing slimes | Staggered introduction to both lanes |
| 2 | 8 slimes + 4 existing hounds | Faster groups following the initial wave |
| 3 | 8 hounds + 5 slimes + 1 existing heavy defender | Mixed timing and armour pressure |

Spawn times, routes and the original engine's movement multiplier live in the new wave records. Enemy definitions, damage, blocking, skills and equipment calculations are unchanged. Each assault has a 65-second real-time deadline (130 simulation seconds), preserving upstream's timing and end-of-battle handshake.

## Reuse audit and minimal extension

| Capability | Reused implementation | v15 addition |
| --- | --- | --- |
| Content schema and validation | Upstream manifest v2, `data.add`, registry, content sets and hash validation | Data-only plugin under `personal/stages/rainfall-defense/` |
| Map/terrain/pathfinding | Existing stages schema, tile parsing, derived deploy tiles and `Grid.findPath` | One namespaced stage and two checkpoint routes |
| Waves and battle | Existing waves, Match, Battle and browser battle worker | Three namespaced wave records and an inherited solo mode |
| Studio | Existing gameplay authoring and scenario/preview modules | No new editor; JSON and upstream validator are the source of truth |
| Rendering and feedback | Existing Pixi/Three map adapters, camera, textures, ticker and v14 feedback | Bounded rain, haze, ripples and facility lamps on existing layers |
| Content delivery | Upstream `loadContentSet`, `/cs/` manifest and contentReady handshake | Build-generated static files and an allowlisted local-host loader |
| End condition | Upstream settlement and result production | Instance-local check after real settlement; stop at round 3 or leak limit |
| Persistence/statistics | Existing standard vault, modded statistics and replay/coach | Skip custom checkpoint writes; mark provenance and suppress official reward |

The data-only plugin can supply stages, routes, waves and mode records. It does **not** supply the personal browser host's finite three-round/leak-limit lifecycle or a static Studio server. Consequently, installing just the JSON plugin into an unmodified upstream server is not a supported way to run this challenge. The small personal-layer Match adapter is required. There is no second Battle, renderer, pathfinder, AI teammate or editor.

The mode inherits the original solo mode; deep-merged rounds 4–9 and boss weights remain unreachable inherited configuration. The host stops after round 3 and clears unused Boss labels in this custom instance. Standard modes and their eight-map pool are unchanged. Alternate official versions, multiplayer and imported 3D scenes are intentionally unsupported for this original stage.

## Configuration and loading contract

`personal/stages/rainfall-defense/plugin.json` is the upstream manifest. `content.json` contains the actual stage, waves, mode and choice schedule. The stage's `options.originalStage` is the sole metadata source: schema version, release, bilingual names, seed, rounds, maximum leaks, compatible version, disabled save policy and environment preset. Its data is included in the upstream content hash; the generated descriptor is checked against that hashed copy.

`personal/custom-stage-build.mjs` calls upstream's reader, content-set builder and validators, then verifies every route segment with the real pathfinder. Changed records are emitted under `/cs/<hash-prefix>/`; unchanged records retain their existing hashed `/data/` addresses. `personal/custom-stage.mjs` verifies the index, every gameplay file's bytes/hash and the descriptor, rejects scripts, constrains paths and times out failed loads. The local host also advertises upstream's actual vanilla content identity in its welcome handshake. Without that baseline the upstream browser runner intentionally declines custom-content authority, leaving server fallback results without complete client replay statistics. A browser regression requires authoritative combat, three real result receipts and usable coach totals. Room content is published atomically, so clients cannot start with a vanilla mode while custom data is still loading. Failed/cancelled selections never silently substitute an official map.

Environment configuration supports `rain`/`none`, a rain tint and an integer `maxParticles` from 0 to 24. This is an additional cap on the **existing** quality budget, not another quality system. Low/static/reduced motion and hidden/lost-context/ended lifecycle still remove or pause optional geometry. Rain and ripples are cosmetic; all meshes ignore pointer input. No new image, model, audio pack or rendering framework is required.

Future stages should add namespaced content through the same schema, register an explicit entry, validate routes and objectives, and add real-engine/browser acceptance. Do not add unknown stage IDs to standard-save restoration or expand official map pools as a shortcut.

## Verification and limitations

See [the acceptance record](V15-ACCEPTANCE.md). Node engine simulations, automated browser play and native interactive browser acceptance are recorded separately. None is represented as community/player acceptance. This prototype's balance covers a small set of deterministic strategies; it is not a claim that every roster wins.

No production deployment, paid hosting, access-permission change or third-party media redistribution is part of this PR. Existing GPL-3.0-or-later, upstream authorship and third-party rights in LICENSE/NOTICE remain unchanged. The authored configuration and procedural geometry are engineering additions by Dr.Kiriya with Codex collaboration; Arknights entities and upstream code remain credited to their owners.

Rollback before deployment: close the preview and return to main. If a future approved release needs rollback, restore the prior static artifact; this feature has no standard-save migration and no server-side stage state to migrate.
