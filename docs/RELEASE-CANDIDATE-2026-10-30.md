# Enhanced Edition — Release Candidate assessment, 2026-10-30

[简体中文](RELEASE-CANDIDATE-2026-10-30.zh-CN.md)

## Decision and source

**HOLD. This is an acceptance report, not release approval.** Recommend **`v1.2.0-rc.1`** as the next candidate name after the gates below are addressed. No tag, release, deployment, access change or paid resource was created.

| Item | Value |
| --- | --- |
| Tested `main` | [`f990e72b3c409290cbb8cfaa3a20c4c967c6ebb8`](https://github.com/drkiyira-dev/stronghold-protocol-personal/commit/f990e72b3c409290cbb8cfaa3a20c4c967c6ebb8) |
| Imported upstream | `f07b8965061bbc311ad7aa815879b09264a1e47d`, Stronghold-Protocol 0.3.3 |
| Reporting branch | `test/enhanced-rc-acceptance` |
| Runtime changes in this assessment | None; README naming, reports and evidence metadata only |
| Production | Untouched; the local build is not a production acceptance result |

Remote `main` was checked again while preparing this report and still pointed to the tested SHA. The report commit is a documentation descendant of that SHA, not a different tested engine. Exact generated build fingerprints are in [acceptance.json](rc/2026-10-30/acceptance.json).

This remains an unofficial enhanced derivative of **Stronghold Protocol: Alliance**, based on [sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol). Original authorship, game rules, GPL-3.0-or-later and third-party rights are preserved. Codex performed this engineering acceptance under the maintainer's direction; it is **not independent human-player acceptance**.

## Environment and resource interruption

- macOS 26.6, build 25G72; 24 GiB physical memory.
- Node.js 26.7.0; SQLite 3.53.4; Playwright 1.62.1 for the existing regression scripts.
- Real installed Chrome 156.0.8078.47; real Safari 26.6, SafariDriver version 21624.4.5.11.5. Safari was operated through its native UI, not replaced with Playwright WebKit.
- Chrome gameplay viewport: 1710 × 930 CSS pixels at the later checkpoints. No physical phone or second physical computer was used.
- Local self-hosted preview at `127.0.0.1:4184`; disposable encrypted state directories. Remote mode used `?server=local`. Public external asset URLs were allowed during actual gameplay.
- Upstream development dependencies were installed with `npm --prefix upstream ci --ignore-scripts`, preserving the source/lockfiles and avoiding vendor postinstall rewrites. The fallback Git binary was used because system Git requested Xcode license setup.

At **2026-10-30 23:37 JST / 14:37 UTC**, the maintainer reported memory pressure and CPU thermal throttling. The solo battle was paused, owned browser test tabs and both local test servers were shut down, and no further heavy checks were started. No owned Node QA workload remained in the process check. `memory_pressure -Q` then reported 69% system-wide free memory. `pmset` returned no recorded thermal/performance warning data; **this does not establish a CPU temperature or disprove the maintainer's observation**. Peak memory, temperatures and throttling were not instrumented.

The test strategy allowed overlapping workloads and is unsuitable for another local run under these conditions. Remaining work should use one heavy workload at a time, one browser gameplay session at a time, and bounded test concurrency. Remaining coverage is explicitly incomplete below.

## Executed checks

| Check | Outcome | Scope and evidence |
| --- | --- | --- |
| Fresh `npm run build` | PASS | 17,098 external mappings; 710 atlas adapters; 0 unmapped entries. `build.log`. Coverage of addresses is not a reachability check. |
| `npm test` | PASS | 52 passed, 0 failed/skipped; 24,645.586 ms. `personal-tests.log`. |
| Full `npm --prefix upstream test` | FAIL | 10,170 tests, 656 suites: 10,067 passed, 6 failed, 97 skipped; 1,126,797.314 ms. Skipped tests, including opt-in browser coverage, were not executed. |
| Targeted serial rerun of failed areas | FAIL | 10 selected/related tests: 7 passed, 3 failed. The two timing benchmarks and SIGTERM timeout case passed this time. The three remaining assertions are listed below. |
| Upstream golden comparisons | PASS | 288 scenarios: roster 49, bonds 46, fields 22, matches 21, stand-ins 10, DIY 140. 498,200 ms, 4 workers; no fixtures updated. |
| Initial `npm run test:browser` | FAIL | Reliability script timed out at its restore-button click (`personal/reliability.browser.mjs:87`); controls remained disabled while engine metadata was loading. The chained enhanced script did not run in that invocation. |
| Reliability browser reruns | PASS, intermittent failure remains open | A diagnostic copy with extra failure-only logging passed all 7 checks; a subsequent unmodified reliability script also passed all 7. Cause of the first failure was not isolated. |
| Separate `node personal/enhanced.browser.mjs` | PASS | 13 checks: legacy migration, concurrent writes, quota/abort atomicity, rollback/undo, old-tab conflicts/reconciliation, citations/seek, 161-event pagination, modal controls, mocked model evidence validation/cancellation, English/theme/narrow viewport. |
| Actual Chrome solo play | PARTIAL | Completed rounds 1–8 and entered round 9/Boss combat. Final settlement/history was not verified before the resource stop. |
| Two independent protocol clients | PASS within protocol scope | Original 14-round cooperative standard mode completed with victory, with a round-3 reconnect and round-6 server SIGKILL/restart recovery. Two original AI teammates were present. |
| Safari + Chrome independent browsers | PARTIAL / Safari failure observed | Different browser storage/identities joined one room; ready state synchronized and round 1 began. Safari render and kit-load errors prevent sign-off. No full browser multiplayer campaign completed. |
| Live external asset samples | PASS for the samples | Eight direct HTTP requests returned 200; real Chrome gameplay displayed external Spine units, portraits, terrain and the Boss. Details below. |
| Controlled external-resource failure UI | NOT EXECUTED | An isolated 503 fixture was prepared but no browser exercised it before shutdown. Directly fetching a mirror is not proof of automatic fallback. |
| Mobile key gameplay flows | NOT EXECUTED | Only the existing synthetic narrow-viewport terminal regression ran; no fresh mobile gameplay/device acceptance. |

The browser regression scripts intentionally block external assets and mock model-provider calls. Their success is separate from real asset loading, real game campaigns and human acceptance. No paid model endpoint was called.

## Gameplay, replay and recovery observations

### Actual solo browser campaign

The local Worker campaign used AC-1 standard mode, strategy 华法琳, stage `act1autochess_m01`, with normal shop/deploy/ready controls. No test commands, fabricated victories, edited funds, altered combat timings or changed rules were used. Recruiting, shop upgrades through level 6, unit swaps and facing selection worked. The campaign retained 28 life through round 7, had 22 life at round-9 preparation, and entered the final battle against 阿利斯泰尔，帝国余晖.

During round 3, opening the terminal exposed an unsettled replay with unknown totals shown as `—`, not zero, and an explicit missing-settlement explanation. The real exported record has `quality.resultReceived=false`, `truncated=false`, no recorded gaps and zero dropped counters. This validates the observed incomplete record; it does not prove every battle is complete. Truncation indicators and legacy unknown-quality handling were exercised by the separate synthetic browser regression.

The round-3 combat was interrupted by a page reload. The UI restored the last preparation checkpoint. Two **UI-exported actual saves** compared equal for every gameplay-state field after excluding the deliberately renewed `state.match.battlePrefix`; round and `runId` were unchanged:

`run_6bba99ec641d762932ea6e38dc85add4`

The resumed round was replayed through normal gameplay. This proves recovery to preparation, **not resumption of a combat frame**. Same-attempt recording completeness and the eventual ninth-round result were not fully audited. At the resource stop, round 9 was paused with 20 life and approximately 284k/285k Boss health remaining; no victory or final settlement is claimed. Closing the test tab terminates that in-flight simulation; continuing later must use the round-9 preparation save.

### Multiplayer protocol campaign

The QA harness ran two independently authenticated WebSocket clients with the upstream paced SimClient at its normal 2× speed, plus two unchanged upstream AI teammates. It submitted legal room/shop/deploy/ready actions and used the original simulation. It did not inject settlement, enable autoplay or change rules. These were two software clients on **one computer**, not two human players or LAN devices.

- Round 3: client B's socket was terminated and reconnected with the original credential; its player identity remained the same.
- Round 6: the server was killed during combat with `SIGKILL` and restarted with the same encrypted state. Both clients reauthenticated and encountered the consent barrier. `runId` stayed stable, epoch changed, and the stored committed checkpoint matched before/after restart after transport/connection normalization. Both players consented before continuation.
- **Rollback boundary:** the latest committed PREP; all in-flight combat and operations/settlement not included in that commit are discarded. This comparison verifies the retained committed snapshot, not a frame-by-frame equality assertion over live client state.
- Round 14: actual `m.result` reported `victory=true`, `roundsPassed=14`, `mode_multi_funny`, seed `2083033013`, Boss ID `boss_3`. Both client players remained alive. The AI teammates were part of the victory; this is not evidence of a two-human, no-AI Boss clear.

The original standard solo mode ends at round 9; standard cooperative mode has its final assault at round 14. The harness followed the original cooperative schedule. Separate real Chrome/Safari clients only covered room entry, readiness and the initial match, with the Safari limitations below.

### Migration and rollback matrix

| Operation | Result | Limit |
| --- | --- | --- |
| Legacy originals/v2 journals remain readable and exportable | PASS, automated | Exact originals retained; fixtures, not every historical user save. |
| Browser IndexedDB legacy migration | PASS, browser regression | Exact snapshot preserved; external assets blocked. |
| Migration catalogue rollback and undo | PASS, browser regression | Both generations retained; not a downgrade of arbitrary game rules. |
| Quota failure, aborted transactions, concurrent tabs and stale-tab reconciliation | PASS, automated/browser | Previous committed data and archived sources retained. |
| Incompatible/future/tampered saves | PASS, automated rejection paths | Remain blocked/exportable as applicable; no universal cross-version migration promise. |
| Real round-3 save/restore | PASS | Same `runId` and gameplay state; new transport prefix; PREP only. |
| Encrypted backend backup, interrupted commit, stale epochs, settlement barrier | PASS, 52-test suite | Controlled fixtures and real process tests; not production disaster recovery. |
| Mid-combat server restart in the full campaign | PASS | Returned to committed round-6 PREP, then reached the actual final result. |
| Deploy a new executable and downgrade to the old production build | NOT EXECUTED | Production was not modified. Vault migration rollback does not prove executable downgrade compatibility. |

## Assets and browser compatibility

The eight samples were 艾丝黛尔's front `.skel` (102,163 bytes), `.atlas` (5,647), `.png` (81,139), Novecento OTF (45,356), Bender OTF (52,536), two act1autochess MP3s (1,138,773 each), and an avatar from the jsDelivr mirror (72,652). URLs, response types, signatures and SHA-256 values are recorded in [asset-http-samples.json](rc/2026-10-30/asset-http-samples.json). PNG/OpenType/MP3 signatures matched their formats. macOS `afinfo` recognized both audio samples as stereo 44.1 kHz MP3, approximately 71.16 seconds each. This verifies file readability, not human listening quality or every voice cue.

Real Chrome screenshots showed multiple animated operator models, including 艾丝黛尔、惊蛰、白面鸮、百炼嘉维尔、夕 and 远牙, as well as the final Boss. This is a sample, not verification of all 17,098 URLs, every animation/skin, regional connectivity, cache eviction or offline play. The browser-observed inventory included external fonts and audio requests; a request listing alone is not proof of successful playback.

**Safari remains unqualified.** Its native accessibility tree showed a connected, progressing room, while an initial screenshot showed a blank game area. The Web Inspector displayed 16 `[content] failed to load kits/ops/...` entries (including Kroos alter, Ptilopsis, Gavial alter and `ver-diy.js`) plus source-map errors. The tactical terminal later rendered, with some underlying HUD visible. No root cause was established: neither an ESM initialization explanation nor a capture/compositor explanation is verified. No safe minimal runtime fix was made before the thermal stop. Chromium's queried error/warning log was empty at the corresponding check.

Desktop Chrome has substantial partial gameplay coverage. Real Safari has partial navigation/room coverage and an unresolved failure. Physical mobile Safari/Chrome, mobile combat dragging/facing, mobile reload/reconnect, and a full cross-browser multiplayer Boss campaign remain untested.

## Defects, risks and release gates

| ID | Severity | Evidence and disposition |
| --- | --- | --- |
| RC-01 | P1, provisional browser blocker | Safari blank-view observation plus kit-load errors. Reproduce under a cooled, isolated session; confirm every required kit initializes and real combat renders before qualifying Safari. Cause unresolved. |
| RC-02 | P2, repeatable test failure | `upstream/test/plugins/manifest.test.js:137` and `registry.test.js:195`: deeply nested JSON diagnostic expected `"manifest": […] is not 2`, received a clipped run of `[` characters. Reproduced on Node 26.7.0; impacts diagnostic assertions. No gameplay regression established. |
| RC-03 | P2, repeatable integration assertion | `upstream/test/plugins/registry.test.js:377`: `plugins/README.md` was ignored where the test expected inclusion. The enclosing repository's unanchored `plugins/` ignore rule affects the nested tree. No rule or test expectation was changed to make the suite green. |
| RC-04 | P2, intermittent readiness failure | Initial restore-button browser timeout while engine version was loading; diagnostic and original reruns passed. Initial failure remains part of the evidence. |
| RC-05 | P2, resource-sensitive verification | Initial SIGTERM ceiling and two simulation performance assertions failed; serial reruns passed (worst case 62.8 µs/tick; Boss best 103.6 µs/tick against a 500 µs bar). Contention is a hypothesis, not a measured temperature diagnosis. |
| RC-06 | Operational risk | Maintainer reported memory pressure/thermal throttling. Stop conditions were honored; no calibrated resource budget or sustained-device profile is available. |

**Blocking acceptance gaps:** the current build's complete nine-round browser settlement/history/replay check; Safari qualification; actual mobile key flows; controlled external-resource degradation; and actual two-browser late/Boss recovery UI. Existing protocol and fixture tests cannot close these gaps. The remaining upstream assertions and intermittent browser failure also require a maintainer-approved resolution or explicit, narrowly justified waiver before an all-green RC claim.

No runtime fix was committed: the browser issue was not isolated sufficiently for a safe minimal change. The next steps are ordered, not authorization to resume heavy work now:

1. Establish a cool, bounded test environment; run one workload at a time.
2. Reproduce RC-01 and RC-04 in isolation; if a release-blocking bug is confirmed, make the smallest personal-layer fix and add its regression test.
3. Complete round-9 settlement, all-round replay/export and save-retention checks on the final executable SHA.
4. Complete actual two-browser late/Boss/recovery consent and mobile interaction checks; exercise the asset-failure fixture and verify fallback visually.
5. Resolve/waive RC-02/03 with exact scope, rerun appropriate affected checks, then request the maintainer's release decision. Any executable change requires a new fingerprint and relevant revalidation.

## Reversibility and evidence

This submission changes documentation/evidence metadata only. Reverting its documentation commit does not change game state or the deployed site. Before a later executable deployment, retain the previous `dist/`, export browser saves, and take a consistent server backup with its recovery key stored privately. Restore into a separate state directory for verification; preserve both data generations. A previous executable may reject a newer fingerprint, so a deployment rollback must not overwrite the only copy of newer saves.

Source-independent local evidence is retained under `.cache/rc-2026-10-30/`; [evidence-manifest.json](rc/2026-10-30/evidence-manifest.json) records filenames, sizes and SHA-256 digests. A local uncompressed ZIP preserves logs, screenshots, selected QA exports and the exact disposable harness scripts. It excludes encrypted room databases, recovery keys, raw downloaded art/audio and unrelated browser data. Raw artifacts are not published to Git; the committed report and summaries remain reviewable without claiming the local screenshots are public assets. The harness's URL-encoded filesystem-path artifact was relocated into the intended ignored directory after its process exited.

The raw failed first-run logs are retained alongside successful reruns. Historical README victories are labeled historical and do not count toward this RC. Current outward naming is **Enhanced Edition**; `personal/`, save keys, package identifiers and historical Personal Edition reports remain unchanged. Real maintainer Git identity and the repository's verified `Co-authored-by: Codex <noreply@openai.com>` trailer apply to this documentation contribution; existing history is not rewritten.
