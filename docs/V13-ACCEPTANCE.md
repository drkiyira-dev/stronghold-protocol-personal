# v13 phase 1 — acceptance record

Game: **卫戍协议：盟约 / Stronghold Protocol: Alliance**. Enhanced Edition is the development label. Review [implementation and visual comparisons](V13-BATTLEFIELD-VISUALS.md) / [中文说明](V13-BATTLEFIELD-VISUALS.zh-CN.md).

## Scope and revision

- Production baseline: main `8d4207ef42ab37ec1d3cff36db9b6c107ed0e3d5`, Sites v12, Public. No production deployment or access change was made.
- Branch: `feat/v13-battlefield-visuals`. Runtime commits: `ae0bd52` and `84d007d`; QA commits `6f00d54`, `41d3fdc` and `1a9e1f2` cover pre-boot mute, bounded/acknowledged reporting and preservation of deliberate unmute. The PR check identifies the exact final review SHA.
- Phase 1 only: original `act2autochess_m03` vent tiles and `act2autochess_m04` deep-water tiles. Combat-feedback additions and additional maps are deferred.
- Native Safari acceptance is complete for the two-map phase 1 scope. Earlier hidden-window attempts were discarded. A new test tab in the actually visible regular Safari window remained visible throughout all six accepted samples; no visibility override or game workaround was used.

## Test environment

Local testing on 2026-11-01: macOS 26.6, Apple M5 (Mac17,4), 24 GiB RAM, Node 26.7.0, Chrome 156.0.8078.47, native Safari 26.6. Tests run one suite at a time. The dedicated QA host serves ordinary static files at localhost; there is no multiplayer server or asset proxy. QA code is excluded from the release.

Native Chrome used a 1710 × 916 CSS-pixel viewport at DPR 2; native Safari used 1710 × 949 at DPR 2. Both loaded existing external operator art without an original 3D scene import. Automated Chromium used 1440 × 900 at DPR 1, with external art blocked. The separate WebGL-disabled case used 1200 × 800. Preview starts are muted before the first interaction. The maintainer subsequently authorized sound: native Safari was explicitly unmuted, and preparation now preserves that manual choice. This QA-only startup policy does not change production audio defaults.

`pmset -g therm` reported no recorded thermal/performance warnings at the initial environment check. This is **not** a temperature reading or proof of no throttling. No temperature, VRAM-byte or GPU-utilization sensor was available to this test. No paid service or new game asset was used.

## Results and coverage

| Check | Result | Evidence / limits |
| --- | --- | --- |
| Unit and local-service tests | 117 cases passed across full run and targeted retries | 115 passed in the final full local run. Two Git-dependent tests hit the host's Xcode-license gate; both passed with the already-installed fallback Git. No license or system setting was changed. |
| Build and distribution integrity | Passed | `npm run build`; `npm run check:dist`: 863 files. |
| Final release archive | Passed | 865 files including hosting config. macOS AppleDouble metadata was rejected on the first archive; repacking with `COPYFILE_DISABLE=1` passed. Local artifact only; no publication. |
| Existing browser regression suites | Passed locally; all 10 suites and all 117 unit cases passed on Linux CI at `41d3fdc` | Save/restore, replay/coach, kit loader, branding, audio, maps, scene import/fallback, v12 menu visuals and battlefield visuals. Includes the QA report-ordering regression described below. Final review SHA/checks are attached to the PR. |
| Battlefield browser regression after indexed-mesh fix | Passed | Both original maps, actual nonempty rendered pixels and moving projected vertices, Low/Medium/High/Static, reduced motion, hidden page, real WebGL loss/restoration, six toggle cycles, original picking, purchase/deployment, R1 → R2 and field teardown. |
| Startup mute browser regression | Passed | The real audio manager is asserted muted before Start. The final targeted suite also checks that preparing a match preserves a deliberate unmute; automated browser audio output remains suppressed. |
| No-WebGL fallback | Passed | Normal purchase/deployment, real combat and settlement to R2 through the upstream DOM field. |
| Native Chrome, both maps | Passed | Visible animated/static comparison; Low/Medium/High; actual R1 combat and R2 settlement, no captured JS errors. |
| Native Chrome settings and recovery | Passed | Static + Low saved across refresh; PREP R2 recovered with health 28, funds 5, Texas and shop. Original operator selection worked. Replay showed 8,720 damage and a recorded skill event; local coach evidence was visible. |
| Native Safari, both maps | Passed | Visible animated/static comparison; Low/Medium/High; actual R1 combat and R2 settlement. High uses 2 vent / 6 water quads; Medium water uses 3; Low/Static releases all. Accepted reports contain no captured JS errors. |
| Native Safari settings and recovery | Passed | Static + Low retained across refresh. Latest PREP R2 restored with health 28, funds 5, deployed Texas and the same shop. Replay retained 8,720 damage, deployment/skill/death events and local coach evidence. Native screenshots remain local. |
| Imported original 3D shader contract | Passed, synthetic | Ambient water/material time stops independently of leak-flash timing; imported-scene mode adds no overlay quads. Full licensed scene artwork was not retested in this phase. |
| Engine/data/save compatibility | Passed | Entire generated `personal/build-info.json` equals retained v12's file. No checkpoint/replay schema or migration change. |

Automated checks do not replace a human playtest. This phase did **not** rerun a complete nine-round campaign, multiplayer/Boss acceptance, phone hardware, prolonged thermal/load testing, or full original 3D asset imports.

## Observed performance

Each map in each native browser used three consecutive samples: Static → High animated → Static, each with 1 s warmup followed by approximately 4 s of sampling. No concurrent heavy test ran during these measurements. Values are display-frame callbacks, upstream renderer timing and managed-resource counts, **not GPU throughput**. The first table is Chrome:

| Map / setting | FPS | Frame p95 ms | CPU median ms | Render median ms | Main JS heap after, MiB | Pixi textures / geometries | Added quads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Vents / Static before | 60.03 | 18.4 | 1.47 | 1.17 | 61.2 | 14 / 32 | 0 |
| Vents / High animated | 60.02 | 18.2 | 1.35 | 1.13 | 68.1 | 14 / 32 | 2 |
| Vents / Static after | 60.01 | 17.5 | 1.27 | 1.05 | 52.1 | 14 / 32 | 0 |
| Water / Static before | 60.02 | 17.6 | 1.16 | 1.14 | 62.9 | 14 / 33 | 0 |
| Water / High animated | 60.02 | 17.6 | 1.16 | 1.16 | 58.7 | 14 / 33 | 6 |
| Water / Static after | 60.00 | 17.6 | 1.19 | 1.12 | 62.3 | 14 / 33 | 0 |

Native Safari, in the visible regular window:

| Map / setting | FPS | Frame p95 ms | CPU median ms | Render median ms | Pixi textures / geometries | Added quads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Vents / Static before | 60.00 | 17 | 1.29 | 0.87 | 17 / 34 | 0 |
| Vents / High animated | 60.00 | 17 | 1.28 | 0.85 | 17 / 34 | 2 |
| Vents / Static after | 60.00 | 17 | 1.45 | 0.85 | 17 / 34 | 0 |
| Water / Static before | 60.00 | 18 | 1.21 | 0.79 | 17 / 32 | 0 |
| Water / High animated | 60.00 | 18 | 1.41 | 0.74 | 17 / 32 | 6 |
| Water / Static after | 60.00 | 17 | 1.31 | 0.79 | 17 / 32 | 0 |

These short samples show no observed frame-rate drop on this machine. They do not establish a long-term memory-leak guarantee. Chrome's heap value is coarse, affected by garbage collection and excludes worker/process/GPU memory. Pixi counts describe that renderer's managed cache, not all GPU allocation. The extension creates **zero extra textures or WebGL contexts** and releases its own quads. GPU bytes/utilization and native Safari heap are unavailable, not zero. Compact measured data: [Chrome](evidence/v13-native-chrome-performance.json), [native Safari](evidence/v13-native-safari-performance.json). Safari's earlier hidden/suspended attempts are excluded, not counted as successful samples.

## Fixes found during acceptance

- Context loss can stop the engine ticker before the next environment step. A canvas context-loss listener now releases owned geometry immediately, with a real loss/restore browser regression.
- The initial projected meshes had changing vertices but no indexed triangles, so they did not visibly draw. Explicit UV/index buffers fix this; the browser test now checks actual nonempty extracted pixels, and comparison screenshots were regenerated.
- Medium steam initially spent its budget on hidden fields. The controller now budgets the focused original vent coordinates; a regression uses hidden and visible vent fixtures.
- QA initially muted only after entering preparation. Preview initialization now persists mute synchronously before client modules run. Its regression preserves other preferences and tolerates corrupt preference JSON.
- Preparation no longer reapplies mute after a tester deliberately enables sound. The real audio-manager regression checks this choice after match setup; the native Safari test also enabled sound before preparing the water map.
- Linux CI exposed a QA race: the page displayed `measured` before its final report reached the receiving process, which still read `measuring`. Completion is now displayed only after the receiver acknowledges that report. The browser suite deliberately delays report acceptance by 150 ms to exercise this ordering; no game runtime change is needed.
- A later PR CI run at `a3c12f3` passed the nine existing browser suites but timed out waiting for zero geometry after WebGL loss; the push CI on that same SHA passed all ten suites. The installed Pixi `ContextSystem` restores automatically on a zero-delay timer: a later RAF/host poll can miss the released state. The regression now records geometry synchronously in the real loss event (after the controller listener), asserts genuine context loss and zero owned meshes, and separately awaits Pixi's real restore event and renewed geometry. It neither synthesizes the event nor races the renderer with a second restore request. This changes only the browser fixture; native acceptance and game runtime are unchanged.

## Review, rollback and rights

Native Safari acceptance is complete. Mark the PR Ready for Review once final-head CI passes, then wait for maintainer review; do not merge or deploy automatically. The workflow triggers on push and pull request, builds/tests and uploads artifacts with read-only repository permissions. It has no production deployment step. Task-owned native browser tabs were closed after acceptance to release rendering resources.

Closing this PR leaves Public v12 unchanged. For a later approved release, retain v12 as the rollback target; reverting the phase 1 commits and rebuilding also restores the previous renderer behavior. No migration is required because engine/data/adapter fingerprints and saved-state schemas are unchanged. v12 recognizes the same optional motion preference.

Original authorship, GPL-3.0-or-later, LICENSE, NOTICE and third-party rights remain unchanged. Public comparison images block external game artwork and show procedural fallback graphics. Native screenshots containing externally loaded artwork remain local; no original asset package is republished. Real Codex contributions retain the verified repository co-author trailer.

## 中文验收摘要

两张代表地图的代码、Chrome 和原生 Safari 真实对局及开关对比均已完成。动态环境沿用原版地形、渲染循环与 v12 画质设置，未改战斗规则、地图池、存档或复盘结构。两浏览器两图均完成 R1 至 R2，短时静态/动态采样约 60 FPS；刷新后设置、休整恢复、复盘和教练检查通过。117 项单元用例、10 组浏览器回归已在 `41d3fdc` 的 Linux CI 全部通过，最终提交以 PR checks 为准。Safari 之前隐藏窗口的采样已排除，改在实际可见窗口的新测试标签完成有效验收。预览启动静音，手动解除后不会在准备对局时再次静音；未改生产默认音频。原生测试标签已关闭以释放资源。生产 v12 保持 Public，不合并、不部署；最终 CI 通过后将 PR 转为 Ready for Review，等待维护者审查。本阶段未重跑九回合、多人大后期、手机实机或完整原版 3D 素材。
