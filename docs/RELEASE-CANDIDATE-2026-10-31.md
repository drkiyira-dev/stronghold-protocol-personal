# Enhanced Edition — RC fix verification, 2026-10-31

[简体中文](RELEASE-CANDIDATE-2026-10-31.zh-CN.md) · [Original assessment](RELEASE-CANDIDATE-2026-10-30.md)

Later two-browser, mobile-emulation and asset checks are recorded in the [browser acceptance follow-up](RC-BROWSER-ACCEPTANCE-2026-10-31.md). The scope and results below describe the earlier fix pass.

## Decision and source

**HOLD pending the remaining acceptance gates.** The Safari kit-initialization defect and the three repeatable test failures have been fixed. The interrupted solo campaign now has a ninth-round result, final settlement, replay exports and retained history. This is a continuation of the original assessment, not a replacement for its failed-run evidence or independent human-player acceptance.

| Item | Value |
| --- | --- |
| Base `main` | `f990e72b3c409290cbb8cfaa3a20c4c967c6ebb8` |
| Tested fix source | [`46c41ed953632b06393b70d601b2069d2c0b391a`](https://github.com/drkiyira-dev/stronghold-protocol-personal/commit/46c41ed953632b06393b70d601b2069d2c0b391a) |
| Review branch | `test/enhanced-rc-acceptance`, draft PR #3 |
| Imported upstream | `f07b8965061bbc311ad7aa815879b09264a1e47d`, version 0.3.3 |
| Candidate recommendation | `v1.2.0-rc.1` after approval; no tag or release created |
| Production | Unchanged; no deployment, key or access changes |

Environment: macOS 26.6 (25G72), 24 GiB RAM, Node 26.7.0, Playwright 1.62.1, installed Chrome 156.0.8078.47 and native Safari 26.6. Safari was operated through its native UI, not emulated by Playwright WebKit. Tests ran serially; Node test files used `--test-concurrency=1`. Only one browser gameplay session was open at a time. QA origins used the original low graphics setting. The attempted `nice` priority change was denied in the sandbox, so no scheduler-priority reduction is claimed. Free-memory samples were 73%, 71% and 69%; there was no calibrated temperature or peak-memory measurement. Owned game tabs and the local preview server were closed after verification.

## Minimal fixes and regression coverage

| Finding | Change | Verification |
| --- | --- | --- |
| RC-01: Safari skips required kits | `personal/build.mjs` initializes `shared/tier4.js` before the registry starts concurrent imports. Only the generated browser copy changes; upstream runtime and rules remain intact. | New `personal/kit-loader.browser.mjs` compares the complete browser registry with upstream in the main thread and a fresh module Worker. Native Safari baseline failed with 214 keys and 16 module-load errors per context. Patched Safari and Chromium each loaded all 254 keys with no errors in both contexts. |
| RC-02: two deep-JSON diagnostic assertions fail on Node 26 | Accept the exact bounded JSON diagnostic produced without recursive serializer overflow, while retaining the existing fallback alternative. No production parser change. | Both affected plugin suites pass. A new cyclic-array/object case guarantees that the unserializable fallback remains exercised; normal-value diagnostics remain checked. |
| RC-03: root ignore rule hides upstream plugin sources | Anchor the root rule as `/plugins/`. | Existing upstream release/ignore assertion passes. New personal regression verifies root private plugins remain ignored and upstream README, templates and source files remain trackable. |

An isolated Safari diagnostic exposed `ReferenceError: Cannot access 'withDefaults' before initialization` in tier-4 imports and `ver-diy.js`. The static dependency import removes that reproduced initialization-order failure. This establishes the kit failure's cause and repair; it does not prove that the previous single blank-view observation had only that cause. Native Safari now displayed external operator models, accepted shop purchases and drag/facing deployment, completed round 1 with 28 life, entered round 2 and wrote a PREP checkpoint. Its in-game diagnostic panel reported **0 recorded errors**. Full Safari late-game and multiplayer qualification remain separate gates.

The new browser script is appended to `npm run test:browser`, after the existing scripts. Each browser closes before the next starts. Run these commands separately, after the preceding command finishes:

```sh
npm run build
node --test --test-concurrency=1 upstream/test/plugins/manifest.test.js upstream/test/plugins/registry.test.js personal/repository.test.mjs
node --test --test-concurrency=1 personal/*.test.mjs
node personal/reliability.browser.mjs
node personal/enhanced.browser.mjs
node personal/kit-loader.browser.mjs
# Close Chromium gameplay tabs before opening the printed URL in native Safari:
node personal/kit-loader.browser.mjs --manual
```

`--manual --baseline` serves the unmodified upstream registry as a negative control; it is expected to fail on the tested Safari. `RC_KIT_REPORT=/absolute/path/report.json` retains a machine-readable browser result. The harness also asserts that the generated registry differs only by the helper import.

## Results obtained on the fix

| Check | Status | Evidence / boundary |
| --- | --- | --- |
| Fresh build | PASS | 17,098 external mappings, 710 atlas adapters, 0 unmapped entries. |
| Affected plugin suites + ignore regression | PASS | 27 passed, 0 failed/skipped, 5,585 ms. |
| Full personal suite, serial | PASS | 53 passed, 0 failed/skipped, 57,983 ms. Includes the ignore regression also counted above. |
| Existing reliability browser script | PASS | 7 checks. The historical readiness timeout remains unexplained, not erased by this pass. |
| Existing enhanced browser script | PASS | 13 checks, including migration/rollback, concurrent writes, quota/abort protection, citations and narrow terminal layout. |
| Native Safari and Chromium kit regression | PASS | Each: 254 main-thread + 254 Worker registry keys; no skipped modules. |
| Safari real gameplay | PASS for smoke scope | Restore R1 → purchases → deployment/facing → actual combat → R2/PREP save; models visible, diagnostics 0. |
| Chrome R9 continuation and defeat settlement | PASS for this path | Actual final battle completed, final result persisted after reload. Details below. |
| Full upstream suite and golden scenarios | NOT RERUN on fix | Preserve October 30 results: full suite had 6 failures/97 skips; 288 golden scenarios passed. Three remaining serial failures are repaired and their affected suites now pass; this is not a fresh all-green full-suite claim. |
| Full browser multiplayer, real mobile, controlled asset failure | NOT EXECUTED in this follow-up | Prior protocol/fixture coverage does not substitute for these UI checks. |

Existing browser fixtures block external assets and mock model calls. Native gameplay uses actual external resources. No paid endpoint was called. The initial failing baseline and the intermediate assertion-development failure are retained beside the successful final logs.

## Nine-round campaign, replay and save verification

This is the **same campaign across two builds**: rounds 1–8 were played on the original tested `main`; round 9 was restored and completed on the fix. It is not a fresh uninterrupted nine-round campaign entirely on the new commit.

- Restored via the vault from the latest R9 PREP checkpoint: 22 life, rather than the interrupted combat's 20 life. The lobby shortcut was absent, but compatible vault saves were available and restored successfully.
- `runId` remained `run_6bba99ec641d762932ea6e38dc85add4`. UI-exported before/after saves match in all gameplay-state fields except the deliberately renewed `state.match.battlePrefix`. Engine/data fingerprints are unchanged.
- R9 completed in **defeat**, with life 0. Final detail correctly says **8/9 rounds passed**, 108 kills, Boss damage 570, total damage displayed as 39.1万 and +100 certifications. This is a completed final battle and failure-settlement check, **not a 9/9 victory**.
- Reloading the browser retained one completed match in history and the same 8/9 result/details. No duplicate match or lost result was observed. Queried Chrome error/warning logs were empty.
- Exported the completed recordings for every round 1–9. All have the same run ID, `resultReceived=true`, `truncated=false`, `partial=false`. Frame/event counts are recorded in [acceptance.json](rc/2026-10-31/acceptance.json). These flags mean the sampled recorder did not hit its limits, not that every simulation frame was recorded.
- The earlier interrupted R3/R9 attempts remain separate incomplete records with unknown totals (`—`), rather than fabricated zeros. R9 has 281 sampled frames and 36 events; its replay totals show damage 5,613, healing 14, leaks 2 and deaths 4.
- Coach fact navigation displayed the actual `result.perPlayer[self].unitStats[4].attacks` source with value 0. Selecting the 106.9-second leak event moved to the nearest sampled frame at 107 seconds. The coach export is retained locally.

Save boundaries remain PREP-only. The serial suite and browser checks revalidated legacy migration, retention of original snapshots, catalogue rollback/undo and failure atomicity. Actual R9 restore provides evidence of compatibility for this import-order fix. It is not a universal migration or executable-downgrade guarantee. The prior multiplayer restart evidence still means **latest committed PREP**, with subsequent operations, combat and uncommitted settlement discarded; multiplayer persistence was not changed or rerun in this follow-up.

## Remaining risks and release gates

| Item | Severity / disposition |
| --- | --- |
| Safari kit initialization / three repeatable assertions | Fixed with the regressions above. Broader Safari qualification is incomplete. |
| RC-04 intermittent restore readiness timeout | P2, open; latest serial script passes. Isolate or obtain an explicit narrow waiver before an all-green claim. |
| RC-05 timing-sensitive failures / RC-06 thermal pressure | P2 / operational; historical serial reruns passed, but no sustained-device performance qualification exists. Continue one workload at a time. |
| Fresh all-nine-round run on one final executable, including victory UI | Not performed. The completed cross-build defeat path closes the interrupted final-settlement check only. |
| Actual two-browser late/Boss, reconnect and restart-consent UI | Not performed; protocol coverage remains historical and does not qualify the UI. |
| Physical mobile key actions and controlled external-resource fallback UI | Not performed; retain as release gates. |

Keep `HOLD` until the maintainer resolves or explicitly accepts the remaining scope. No large feature work, game-rule changes, author-credit changes or license changes are included.

## Rollback and evidence

Reverting `46c41ed` and rebuilding removes this compatibility patch without a save-schema change, but would reintroduce the reproduced Safari failure. Engine/data compatibility fingerprints stay equal because game rules and the serialized state contract are unchanged; they are **not byte hashes of the whole distribution**. The generated registry's own SHA-256 and tested source SHA are recorded in the follow-up [acceptance.json](rc/2026-10-31/acceptance.json). Executable downgrade/deployment rollback has not been exercised on production.

The original report and its evidence are preserved. New logs, screenshots and UI exports live in the ignored `.cache/rc-fixes-2026-10-30/` directory (named for the start date), with a local uncompressed evidence ZIP. Only sanitized result summaries and the [SHA-256 manifest](rc/2026-10-31/evidence-manifest.json) are committed. Raw saves, browser screenshots, server state/keys and downloaded third-party assets are not published. Codex authored the fixes, regression tests and this report under Dr.Kiriya's direction, retaining the maintainer's Git identity and the verified co-author trailer.
