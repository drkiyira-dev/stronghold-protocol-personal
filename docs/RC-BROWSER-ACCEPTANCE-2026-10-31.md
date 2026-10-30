# Enhanced Edition — RC browser acceptance, 2026-10-31

[简体中文](RC-BROWSER-ACCEPTANCE-2026-10-31.zh-CN.md) · [Earlier fix verification](RELEASE-CANDIDATE-2026-10-31.md) · [Structured results](rc/2026-10-31/browser-acceptance.json)

## Decision and source

**HOLD for maintainer review.** The two-browser campaign, late-game/Boss reconnect, committed-PREP recovery and controlled asset-failure checks passed in the scope below. Mobile emulation is only partially qualified. No new release-blocking product defect was established, and this follow-up changes documentation/evidence only. No production deployment, tag, release, key or access change was made.

| Item | Value |
| --- | --- |
| Tested checkout | `9dde56149866026ee6aaeca23249ecfe786dffae` |
| Executable fix source | `46c41ed953632b06393b70d601b2069d2c0b391a`; reused its verified build, no new application build in this pass |
| Base/current main at review | `f990e72b3c409290cbb8cfaa3a20c4c967c6ebb8` |
| Upstream import | `f07b8965061bbc311ad7aa815879b09264a1e47d`, 0.3.3 |
| Review | Draft [PR #3](https://github.com/drkiyira-dev/stronghold-protocol-personal/pull/3), `test/enhanced-rc-acceptance`; not merged |
| Recommended candidate | `v1.2.0-rc.1`, only after maintainer approval |

Codex performed these UI operations and wrote the QA fixtures/report under Dr.Kiriya's direction. This is engineering acceptance, not independent human-player acceptance. Original rules, operators, engine, AI teammates, GPL and third-party notices remain unchanged.

## Environment and execution limits

macOS 26.6 (25G72), 24 GiB RAM, Node 26.7.0, Playwright 1.62.1, installed Chrome 156.0.8078.47 and **native Safari 26.6**, not Playwright WebKit. Scenarios ran serially: two independent browser clients only during the multiplayer scenario, then one Chrome client for mobile and asset checks. The room server and static previews listened on loopback. No second physical device or LAN/WAN was tested. Both human seats were operated by Codex on this Mac; two original AI teammates filled the other seats.

QA origins used the original low graphics preset. Free-memory samples were 73%, 67%, 66%, 65%, 62%, and 63% after cleanup; these are snapshots, not peak measurements. `pmset -g therm` failed to provide thermal readings, so no temperature or absence-of-throttling claim is made. No concurrent build/test suite was run during gameplay. Owned test tabs and servers were closed; temporary device emulation and DevTools were turned off.

## Coverage matrix

| Check | Outcome | Evidence and boundary |
| --- | --- | --- |
| Chrome + native Safari cooperative campaign | PASS | All 14 scheduled rounds, final Boss victory, same executable throughout; R9 intentionally replayed after crash recovery. |
| Ordinary disconnect/reconnect | PASS | Safari tab closed during R3; identity rejoined R4 while Chrome continued. |
| Late/Boss disconnect/reconnect | PASS | Safari disconnected and rejoined during `FINAL_ASSAULT`, before Boss completion. |
| Server crash and checkpoint recovery | PASS | SIGKILL during R9 combat; restored committed R9 PREP revision 83, preserved runId and gameplay state; consent barrier verified. |
| Completed-match server restart | PASS | Revision 107 remained complete, no active room resurrected; both clients retained one history entry and unchanged displayed awards. |
| Replay across recovery | PASS for sampled records | Old R9 attempt records a disconnect gap; replayed R9 has a distinct battle ID and same runId. Final Boss recording has settlement and no recording-cap truncation. |
| Mobile portrait/landscape and menus | PARTIAL | Chrome iPhone 16 preset, 393×852 / 852×393; portrait rotation prompt, landscape menus, strategy and two-tap recruitment worked. Two UI defects below. |
| Mobile battle/replay/PREP restore | PASS for assisted smoke scope | R1 completed with no deployed units; R2/PREP restored at 24 life, same runId/state. Keyboard assistance was used for some controls. |
| Mobile touch drag/facing | NOT VERIFIED | Native drag produced window-control errors; tab drag timed out. No successful touch deployment is claimed, nor is a game drag defect established. |
| Physical iOS/Android | NOT EXECUTED | Explicitly outside this pass by maintainer choice; a Chrome preset is not iOS Safari. |
| Real external asset samples | PASS | Seven serial checks: skeleton bytes, normalized atlas, texture decode, audio decode, font load, fetch retry and image retry. |
| All Spine candidates unavailable | PASS for R1 smoke | Controlled HTTP 503 for mapped Spine addresses; portrait pieces supported recruit, drag/facing, combat, settlement, replay and R2 save. |
| Full upstream/golden/automated suites | NOT RERUN here | No executable change. Preserve the earlier reports and their failures; this is not a new all-green full-suite claim. |

The earlier fix pass recorded 53 personal tests, 27 affected tests (one overlaps), 20 existing browser checks and complete 254-key main-thread/Worker registries. The original solo campaign completed R9 in defeat, with 8/9 rounds passed, across the old main and the fix. **A fresh nine-round solo run entirely on the fix remains unperformed.** This new cooperative 14/14 victory verifies its own final-result path, not a substitute solo run or every difficulty/hidden Boss.

## Multiplayer, rollback and final settlement

The original UI mode was **标准模拟 AC-1**: internal `mode_multi_funny` / `FUNNY`, stage `act1autochess_m01`, Boss `boss_4` (盐风主教昆图斯), seed 78786244. Internal `FUNNY` must not be mistaken for a different UI difficulty. Original purchases, deployment/facing, upgrades, ready controls and AI teammates were used; no stats, timers, seed or rules were rewritten.

- Run: `run_32f75347a7fa51d8cc10c7bec33081fb`. Both browsers displayed **14/14 victory**, team life **97**. Durable completion revision **107** recorded `errors: 0` and two human final-result frames.
- SIGKILL occurred during R9 combat after committed PREP revision **83**. On restart both clients returned to R9 PREP with a new recovery epoch. The state comparison differed only in `battlePrefix`, human connection flags and the two AI emote timestamps rebased by **43,409 ms**, exactly matching the restored clock-origin shift. All gameplay fields matched after those runtime-only normalizations.
- With only Chrome consenting, the match stayed in PREP, revision 83, awaiting Safari. A ready-state change attempt did not advance the checkpoint or combat. Only after Safari acknowledged the displayed rollback scope did R9 restart, revision 85, from the beginning.
- The recovery boundary is **the latest committed PREP**, not a combat frame. Later operations, in-progress combat and uncommitted settlement are discarded. A disconnected client may finish its local simulation and record a result; that does not mean the server committed that progress.
- During the final Boss, the observer recorded Safari connected → disconnected → connected, all in `FINAL_ASSAULT`; screenshots show return to the live Boss fight. Chrome continued throughout. This distinguishes live reconnect from server-crash PREP rollback.
- After completion, another server restart loaded no active room. Both clients received the completed result and returned to the lobby. History remained **one** victory each, with the same displayed level/experience/trophies; no duplicate completion or old PREP resurrection was observed.

This exercises the SQLite persistence and consent UI on one local server. Distributed failover, simultaneous competing hosts, LAN faults, unsupported room modes and long-term recovery-key backup are not qualified.

## Replay and mobile save evidence

The pre-crash R9 recording and retried R9 recording both retain the campaign runId and equal result objects. They have different battle IDs. The former has `quality.gaps: ["disconnect"]`; its local simulator still received a result. The latter has no gap. Both contain 95 sampled frames and 40 events. The final R14 record contains **143 frames / 93 events**, `resultReceived: true`, `truncated: false`, no gaps and zero dropped counts. These are bounded sampled records, not every simulation frame. View-switch/disconnect gaps in other multiplayer records were not presented as complete recordings.

Mobile emulation completed R1 without deployed units and reached R2 with 24 life. Two units remained on the bench. The UI-exported R2 saves before and after reload/vault restore preserve `run_5a6757165a9059c88e329429c7bfc79c`; all serialized gameplay state matches except the renewed `state.match.battlePrefix`. This tests restoration, not a schema migration. Migration, catalogue rollback/undo and incompatible-fingerprint rejection retain the earlier automated evidence; no new migration or production executable rollback was performed here.

## External resources and failure injection

The isolated probe imported the unchanged `personal/external-assets.mjs` adapter and exercised real external URLs, sequentially. 凯尔希's skeleton returned 139,125 bytes; its atlas normalized successfully and its texture decoded at 512×512. The opening BGM decoded to two channels, 48 kHz, 71.111 seconds; this is decoding evidence, not an auditory quality assessment. Bender loaded through `FontFace`. A controlled first-request 503 then resolved through the real jsDelivr portrait mirror for both fetch and image-element retry; the latter decoded at 180×360. Exact URLs/checksums are in the structured results.

A separate game scenario substituted local 503 endpoints for **all candidates of mapped Spine resources**, leaving non-Spine assets external. Allies and enemies rendered as portrait pieces. Two operators were bought and deployed with facing; R1 cleared **4/4**, `errors: 0`, reached R2 with 28 life and generated a PREP save. Its completed replay has damage **9,075**, 46 sampled frames, 8 events, no gaps/truncation and zero dropped counts. Fixture logs contain 147 failure responses across 12 requested paths; this includes retries and model recreation and is not a production-network performance measurement.

This is representative coverage, not validation of all 17,098 URLs or all 710 atlas adapters. Offline boot, every audio/font failure, CORS variants, slow-network timeout behavior and every mirror remain untested. The optional official statistics stylesheet returned HTTP 403 during mobile loading; gameplay continued. Network failure evidence is separate from the limited browser console query, which returned no entries.

## Known issues and release gates

| Item | Severity / disposition |
| --- | --- |
| RC-04 intermittent restore readiness timeout | P2, still unexplained. Earlier serial rerun passed; this pass does not resolve its cause. |
| RC-07 homepage touch-target overlap | P2, reproduced in 852×393 coarse-pointer mode. The 16×16 settings button has a 44×44 pseudo-element, and hit-testing its center selects the adjacent fullscreen button. Keyboard activation was the test workaround. Source: upstream `public/css/devices.css` touch-target/title rules. No upstream CSS was changed. |
| RC-08 floating terminal overlaps lobby action | P2, mobile screenshot shows the terminal button covering the right portion of “开始模拟”; its left portion remained usable. Defer to terminal UI work, not a rule/engine change. |
| RC-09 optional statistics stylesheet HTTP 403 | P3, external cosmetic-resource risk; no gameplay blocker observed. |
| Touch drag/facing and actual devices | Qualification gap, not a confirmed product defect. Complete a working touch-driver/physical-device pass before claiming full mobile support. Physical-device checks were explicitly deferred for this pass. |
| Full-suite, new nine-round solo and broader network/mode coverage | Not newly executed; retain the stated scope instead of converting partial evidence to PASS. |
| RC-06 thermal pressure | Operational concern; continue serial low-load checks. No reliable temperature measurements are available. |

No new confirmed P0/P1 defect required a product fix in this pass. **HOLD remains** until the maintainer reviews the open readiness failure, partial mobile qualification and suite/campaign scope, and explicitly decides whether to accept a narrower RC. Keep production unchanged pending that decision.

## Evidence and attribution

The [result summary](rc/2026-10-31/browser-acceptance.json) and [SHA-256 manifest](rc/2026-10-31/browser-evidence-manifest.json) are committed. Raw screenshots, UI exports, observer logs and QA fixtures remain in ignored `.cache/rc-browser-2026-10-31/` and a local evidence ZIP. Room databases, recovery keys, browser chrome/screenshots and third-party image/audio bytes are not published. The ZIP excludes the private room-state directory. Historical reports are retained and linked, not overwritten with later passes.

No application files changed, so no new product regression test is claimed. Documentation checks validate JSON, evidence hashes, local links and the diff. The report commit retains the maintainer author identity and the real `Co-authored-by: Codex <noreply@openai.com>` trailer without rewriting history.
