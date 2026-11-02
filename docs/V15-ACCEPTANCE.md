# v15 Rainfall Defense acceptance record

Status: reviewable prototype; local verification completed on **2026-11-02**. **Not approved for deployment**. Public Sites v14 is unchanged.

Base main: `2818c1329a4dd6e9e6165d2ea976440d85b78b8f`. Branch: `feat/v15-custom-stage`. Tests and browser interaction are Codex-assisted engineering acceptance, not community/player acceptance.

Implementation commit: `fbc4c4053ceb1f3e883d2cbfef38bc2388f5fbe9` (the tested code; the subsequent documentation commit adds this report, evidence and the window-limit policy).

## Environment and method

- macOS 26.6, Apple Silicon; Node 26.7.0.
- Installed Chrome 156.0.8078.74; native Safari 26.6 (21624.4.5.11.5).
- Local static preview on `127.0.0.1:4185`, independent QA storage. Automated checks use separate ephemeral origins and browser contexts.
- Tests run serially. Preview audio is muted. External image/Spine/audio/font endpoints are intentionally blocked: screenshots show procedural fallback tokens, not missing files that must be bundled or redistributed.
- No production deployment, secret, Public permission, upstream core/rule or third-party media changes.

## Corrections found during acceptance

The original local host lacked the vanilla content identity required by upstream's custom-content authority gate. The client could display combat but would not submit an authoritative result; host fallback eventually settled the assault while the client replay lacked totals. The fix generates the actual upstream identity and supplies it through the existing Lobby welcome protocol. Regression coverage now requires authoritative browser combat, real per-assault result receipts, replay/coach totals and the same runId across all three assaults.

New original-stage records are excluded from the legacy-history summary importer so the terminal opens real per-assault recordings. Existing records are not rewritten or deleted. Loading also verifies descriptor metadata against hashed stage data, rejects corrupt resources, discards late cancelled selections and publishes the custom room atomically.

Native Safari also exposed a departure bug: the upstream abandon action sends `g.leave` before `room.leave`, so clearing content only on a successful `room.leave` retained the original stage for the next standard room. Both departure paths now clear the stage after the upstream queue resolves. A protocol regression, browser UI regression and native Safari retest cover this; Safari now displays the standard nine-round briefing after abandoning.

## Coverage

Commands were executed sequentially, with native QA pages stopped before automated browser work.

| Check | Result |
| --- | --- |
| Build and release artifact completeness | `npm run build`, `check:dist` and `check:artifact` passed; 873 manifest files and 875 archive entries including hosting metadata. macOS packaging used `COPYFILE_DISABLE=1`; the checker correctly rejected an initial archive containing AppleDouble metadata. The checked package was not uploaded/deployed. |
| Full serial Node regressions | **135/135 passed**, 0 failed/skipped; Node 26.7.0, `--test-concurrency=1`, 193.5 s. Loopback-server tests required the permitted local-network execution context. |
| Upstream plugin validation | `node upstream/tools/plugin.mjs check personal/stages/rainfall-defense --strict --json`: loadable; zero problems/warnings. |
| Original-stage automated browser regression | `node personal/custom-stage.browser.mjs` passed: actual local Match + browser Battle Worker, three-assault victory with zero leaks, empty-defence defeat with 8 leaks, abandon/return paths, standard vault equality after victory/defeat/reload, three complete per-assault replays with the same runId/content hash, isolated unofficial statistics, and zero uncaught page errors. |
| All existing browser suites | Included in the PR CI sequence; not repeated locally in this shortened final pass. |
| Native Chrome interactive acceptance | After the identity fix: rounds 1–2 completed with zero leaks; round 3 preparation reached. Round 2 replay received its real result: damage 8,400, healing 0, leaks 0, populated events/operator totals. Stopped before round 3 combat at the maintainer's request. |
| Native Safari interactive acceptance | Original-stage entry/briefing, actual purchase, drag/deploy/facing, select, retreat/redeploy, low/static settings and first assault passed (round 2 PREP, 25 LP, zero leaks). Departure fix retested separately on the final build: abandon → lobby → standard nine-round room. No full Safari campaign claimed. |

The maintainer explicitly shortened native playthrough scope once useful coverage was obtained. An earlier Chrome three-round clear preceded the authority fix and exposed incomplete replay totals; it is **not** counted as a final-build full native acceptance. The final full victory/defeat checks below are automated browser/engine evidence, distinct from these native UI observations.

The final automated script opens **Tactical terminal → Overview** before checking the preserved continue button. An earlier script incorrectly searched for that button in the lobby without opening its existing parent panel; this was a test-path correction, not a game-layout change.

## Evidence and measured performance

| Evidence | Method / scope |
| --- | --- |
| [Map](evidence/v15/chrome-map.jpg), [round 2 combat](evidence/v15/chrome-combat-r2.jpg), [round 2 replay](evidence/v15/chrome-replay-r2.jpg) | Native Chrome UI, Amiya strategy; post-authority-fix recordings |
| [Round 2 preparation](evidence/v15/safari-round2-preparation.jpg) | Native Safari after completing the first assault in low/static mode |
| [Standard nine-round return](evidence/v15/safari-standard-return.jpg) | Native Safari, final departure fix |
| [Victory](evidence/v15/automated-victory.png), [defeat](evidence/v15/automated-defeat.png) | Automated Chrome, real Battle Worker; **not a manual playthrough** |
| [Machine-readable run](evidence/v15/automated-browser.json) | Final automated campaign, replay quality and performance samples |

The automated victory used Goliath and normal player commands, not injected battle outcomes. Actual replay totals for rounds 1/2/3 were 3,300 / 8,400 / 16,763 damage, with zero leaks; all three received results and had no reported gaps, truncation or dropped samples.

Performance sampling used headless installed Chrome, 1440×900, DPR 1, preparation only, external assets blocked. Each setting had 60 warm-up frames followed by 120 samples; high was measured before low/static in the same page.

| Setting | Mean FPS | Mean frame ms | Optional environment meshes | Main-thread JS heap at sample end |
| --- | ---: | ---: | ---: | ---: |
| High / dynamic | 60.0025 | 16.6666 | 22 | 73,117,834 bytes |
| Low / static | 60.0050 | 16.6655 | 0 | 90,192,686 bytes |

Heap readings exclude workers and GPU memory and were not normalized by garbage collection; the sequential values do not measure the retained cost of the weather layer. These short preparation samples do not establish long-session memory stability or combat/device performance. No native Safari FPS or GPU-memory measurement is claimed.

A post-test system sample at 14:19 JST reported CPU 7.12% user + 14.24% system (78.62% idle), 23 GB physical memory used and about 4 GB compressed. A subsequent `memory_pressure -Q` reported 69% system-wide free memory (a different, reclaimability-aware metric from `top`'s raw unused memory). These are whole-machine figures, not memory attributable to this game. The two native QA windows were closed after testing. The maintainer's new limit is recorded in `AGENTS.md`: at most four browser windows, prefer one, serial tests, and CPU/memory monitoring before continuing under pressure.

## Scope and limitations

- Only the Alliance local solo mode and procedural map are supported for this stage. No original-stage multiplayer, other official-version support, imported 3D scene, mobile-device acceptance or new Studio editor is claimed.
- Stage saves are deliberately disabled; refresh or exit ends the challenge. The browser regression creates a real standard preparation checkpoint and checks that custom victory, defeat and refresh preserve the entire vault record byte-for-byte. Original stage statistics use upstream's unofficial content category and earn no official reward.
- Fixed-seed replayability requires the same player actions. Node tests use real upstream Match/Battle campaigns (repeat, alternate recruitment order, empty-defence failure). Their outcomes are not described as manual browser clears.
- Performance measurements are short, local samples under specified conditions, not a general device guarantee. System CPU temperature and GPU memory counters are unavailable through the permitted environment; no temperature or GPU-memory figure is inferred. Optional atmosphere uses the existing ticker/atlas and at most 24 meshes, with low/static/lost-context/hidden/end cleanup tests.
- Normal build asset URLs and sound adapters are preserved. This QA's blocked external resources do not verify availability of every existing portrait, model, sound or external host.
- Balance is a prototype, not exhaustive proof across all strategists, rosters or deployments.

## Review and rollback

See [design and reuse boundaries](V15-RAINFALL-DEFENSE.md) ([中文](V15-RAINFALL-DEFENSE.zh-CN.md)). GitHub Actions triggers on push/PR and contains no deployment step. Review/merge and production deployment remain separate maintainer decisions. Before deployment, rollback is simply closing the preview and returning to main; after a separately approved release, use the prior static artifact. No standard-save migration or production backend state change is introduced.
