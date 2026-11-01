# v13 phase 1 — acceptance record

Game: **卫戍协议：盟约 / Stronghold Protocol: Alliance**. Enhanced Edition is the development label. Review [implementation and visual comparisons](V13-BATTLEFIELD-VISUALS.md) / [中文说明](V13-BATTLEFIELD-VISUALS.zh-CN.md).

## Scope and revision

- Production baseline: main `8d4207ef42ab37ec1d3cff36db9b6c107ed0e3d5`, Sites v12, Public. No production deployment or access change was made.
- Branch: `feat/v13-battlefield-visuals`. Runtime commits: `ae0bd52` and `84d007d`; QA commit `6f00d54` adds pre-boot mute and bounded diagnostic reporting. The PR check identifies the exact final review SHA.
- Phase 1 only: original `act2autochess_m03` vent tiles and `act2autochess_m04` deep-water tiles. Combat-feedback additions and additional maps are deferred.
- Native Safari acceptance is **pending**: the controlled private window reported `document.visibilityState === 'hidden'`, so its rendering and frame samples cannot be accepted. Window raising did not resolve this; the maintainer has been asked to bring the test window forward. This is not recorded as a successful Safari test or attributed to a confirmed game defect.

## Test environment

Local testing on 2026-11-01: macOS 26.6, Apple M5 (Mac17,4), 24 GiB RAM, Node 26.7.0, Chrome 156.0.8078.47, native Safari 26.6. Tests run one suite at a time. The dedicated QA host serves ordinary static files at localhost; there is no multiplayer server or asset proxy. QA code is excluded from the release.

Native Chrome used a 1710 × 916 CSS-pixel viewport at DPR 2, with existing external operator art loaded and no original 3D scene import. Automated Chromium used 1440 × 900 at DPR 1, with external art blocked. The separate WebGL-disabled case used 1200 × 800. All later preview starts are muted before the first interaction, as requested.

`pmset -g therm` reported no recorded thermal/performance warnings at the initial environment check. This is **not** a temperature reading or proof of no throttling. No temperature, VRAM-byte or GPU-utilization sensor was available to this test. No paid service or new game asset was used.

## Results and coverage

| Check | Result | Evidence / limits |
| --- | --- | --- |
| Unit and local-service tests | 117 cases passed across full run and targeted retries | 115 passed in the final full local run. Two Git-dependent tests hit the host's Xcode-license gate; both passed with the already-installed fallback Git. No license or system setting was changed. |
| Build and distribution integrity | Passed | `npm run build`; `npm run check:dist`: 863 files. |
| Final release archive | Passed | 865 files including hosting config. macOS AppleDouble metadata was rejected on the first archive; repacking with `COPYFILE_DISABLE=1` passed. Local artifact only; no publication. |
| Existing browser regression suites | Passed locally and on Linux CI at `57fee4e` | Save/restore, replay/coach, kit loader, branding, audio, maps, scene import/fallback and v12 menu visuals. The initial CI then caught the new QA report-ordering race described below; final CI must validate its fix. |
| Battlefield browser regression after indexed-mesh fix | Passed | Both original maps, actual nonempty rendered pixels and moving projected vertices, Low/Medium/High/Static, reduced motion, hidden page, real WebGL loss/restoration, six toggle cycles, original picking, purchase/deployment, R1 → R2 and field teardown. |
| Startup mute browser regression | Passed | The final battlefield rerun passed both maps and no-WebGL settlement; the real audio manager is asserted muted before Start. |
| No-WebGL fallback | Passed | Normal purchase/deployment, real combat and settlement to R2 through the upstream DOM field. |
| Native Chrome, both maps | Passed | Visible animated/static comparison; Low/Medium/High; actual R1 combat and R2 settlement, no captured JS errors. |
| Native Chrome settings and recovery | Passed | Static + Low saved across refresh; PREP R2 recovered with health 28, funds 5, Texas and shop. Original operator selection worked. Replay showed 8,720 damage and a recorded skill event; local coach evidence was visible. |
| Native Safari | Not completed | Hidden-window obstruction described above. No valid Safari FPS or memory result is reported. |
| Imported original 3D shader contract | Passed, synthetic | Ambient water/material time stops independently of leak-flash timing; imported-scene mode adds no overlay quads. Full licensed scene artwork was not retested in this phase. |
| Engine/data/save compatibility | Passed | Entire generated `personal/build-info.json` equals retained v12's file. No checkpoint/replay schema or migration change. |

Automated checks do not replace a human playtest. This phase did **not** rerun a complete nine-round campaign, multiplayer/Boss acceptance, phone hardware, prolonged thermal/load testing, or full original 3D asset imports.

## Observed performance

Each native Chrome map used three consecutive samples: Static → High animated → Static, each with 1 s warmup followed by approximately 4 s of sampling. No concurrent heavy test ran during these measurements. Values are display-frame callbacks, upstream renderer timing and managed-resource counts, **not GPU throughput**.

| Map / setting | FPS | Frame p95 ms | CPU median ms | Render median ms | Main JS heap after, MiB | Pixi textures / geometries | Added quads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Vents / Static before | 60.03 | 18.4 | 1.47 | 1.17 | 61.2 | 14 / 32 | 0 |
| Vents / High animated | 60.02 | 18.2 | 1.35 | 1.13 | 68.1 | 14 / 32 | 2 |
| Vents / Static after | 60.01 | 17.5 | 1.27 | 1.05 | 52.1 | 14 / 32 | 0 |
| Water / Static before | 60.02 | 17.6 | 1.16 | 1.14 | 62.9 | 14 / 33 | 0 |
| Water / High animated | 60.02 | 17.6 | 1.16 | 1.16 | 58.7 | 14 / 33 | 6 |
| Water / Static after | 60.00 | 17.6 | 1.19 | 1.12 | 62.3 | 14 / 33 | 0 |

These short samples show no observed frame-rate drop on this machine. They do not establish a long-term memory-leak guarantee. Chrome's heap value is coarse, affected by garbage collection and excludes worker/process/GPU memory. Pixi counts describe that renderer's managed cache, not all GPU allocation. The extension creates **zero extra textures or WebGL contexts** and releases its own quads. GPU bytes/utilization and native Safari heap are unavailable, not zero. Compact measured data is included in [the performance evidence JSON](evidence/v13-native-chrome-performance.json).

## Fixes found during acceptance

- Context loss can stop the engine ticker before the next environment step. A canvas context-loss listener now releases owned geometry immediately, with a real loss/restore browser regression.
- The initial projected meshes had changing vertices but no indexed triangles, so they did not visibly draw. Explicit UV/index buffers fix this; the browser test now checks actual nonempty extracted pixels, and comparison screenshots were regenerated.
- Medium steam initially spent its budget on hidden fields. The controller now budgets the focused original vent coordinates; a regression uses hidden and visible vent fixtures.
- QA initially muted only after entering preparation. Preview initialization now persists mute synchronously before client modules run. Its regression preserves other preferences and tolerates corrupt preference JSON.
- Linux CI exposed a QA race: the page displayed `measured` before its final report reached the receiving process, which still read `measuring`. Completion is now displayed only after the receiver acknowledges that report. The browser suite deliberately delays report acceptance by 150 ms to exercise this ordering; no game runtime change is needed.

## Review, rollback and rights

Keep this PR in Draft until native Safari acceptance and final CI are complete; do not merge or deploy automatically. The workflow triggers on push and pull request, builds/tests and uploads artifacts with read-only repository permissions. It has no production deployment step.

Closing this PR leaves Public v12 unchanged. For a later approved release, retain v12 as the rollback target; reverting the phase 1 commits and rebuilding also restores the previous renderer behavior. No migration is required because engine/data/adapter fingerprints and saved-state schemas are unchanged. v12 recognizes the same optional motion preference.

Original authorship, GPL-3.0-or-later, LICENSE, NOTICE and third-party rights remain unchanged. Public comparison images block external game artwork and show procedural fallback graphics. Native screenshots containing externally loaded artwork remain local; no original asset package is republished. Real Codex contributions retain the verified repository co-author trailer.

## 中文验收摘要

两张代表地图的代码、Chrome 真实对局及开关对比已完成。动态环境沿用原版地形、渲染循环与 v12 画质设置，未改战斗规则、地图池、存档或复盘结构。Chrome 两图均完成 R1 至 R2，短时静态/动态采样约 60 FPS，刷新后设置及休整恢复通过。117 项单元用例均已通过（两项系统 Git 环境阻断在切换备用 Git 后重测通过）。原生 Safari 仍因窗口被标记隐藏而待验收；暂不标记通过，也不提供虚构的性能数据。预览现在启动即静音。生产 v12 保持 Public，不合并、不部署；Safari 和最终 CI 完成后才将 PR 转为 Ready for Review。
