# v15 native Safari follow-up

Verified on **2026-11-15**. [中文报告](V15-SAFARI-FOLLOWUP.zh-CN.md).

Base main: `50359b9c65e9cb92ab54622aaa749d7940aa6263`. Branch: `fix/v15-content-loading`. This is Codex-assisted engineering acceptance, not manual player acceptance. Production metadata still reports **Public, version 15**; no merge, deployment or access-permission change was performed. GitHub CI status is reported separately in the associated PR; the local results below do not imply a CI pass.

Tested implementation: `8e39f3464bbb2a01b659ad941ade9f6c6b6c54cb`.

## Environment and method

Native Safari **26.6 (21624.4.5.11.5)** on macOS **26.6**, controlled through Apple's real `safaridriver`; 1280×848 CSS pixels, DPR 2, low quality, static effects and muted audio. One isolated QA window was used, within the four-browser-window limit. Browser work, builds and automated tests ran serially.

Keyboard navigation used native WebDriver input. WebDriver mouse actions did not deliver pointer/click events in this session. Purchases and deployment of two units therefore used real game `g.buy`/`g.move` messages; **native mouse drag remains unverified**. Combat used the actual browser Battle Worker, not a fabricated result.

## Results

| Check | Result and boundary |
| --- | --- |
| Base v15 Rainfall Defense | Loaded, deployed two units and completed the first assault. Reached round 2 PREP with **45 LP, zero leaks**. This battle ran on the base v15 build, not the rebuilt loading fix. |
| Standard-save isolation and restore | The standard vault was exactly unchanged after the assault. After refresh, the standard round 1 save restored through the UI with **2 funds, Gummy held, 25 LP and the same runId**. |
| Actual replay and existing coach | **27 frames, 12 events, 3,300 damage, zero leaks**; `resultReceived: true`, no reported gaps or truncation. The existing coach validated the real recording. |
| Rebuilt loading fix | Rainfall Defense's custom-room/content-ready handshake succeeded after one deliberately injected HTTP **503**, followed by HTTP **200** approximately **610 ms** later. The old v15 standard save also restored with the expected PREP state in the rebuilt branch. This smoke check verifies loading/handshake and restored state, not repeated rendered combat. |
| Automated regressions | **32 passed**: 15 loader checks, 4 focused stage checks and 13 related checks. Expected malformed-save rejection warnings were diagnostic output, not test failures. |
| Build and package completeness | Build passed; `check:dist` passed for **873 files**. This is local artifact validation, not a production deployment. |
| Public production endpoint | Safari failed TLS before the game loaded; curl also returned `SSL_ERROR_SYSCALL` and HTTP `000`. **Online acceptance could not be completed**; no game-level cause or production outage is inferred from this environment. |

The loading fix reuses the pinned upstream **0.3.3** `fetchChecked` implementation through a checked build extraction. It does not upgrade to upstream master **0.4.0** or duplicate the loader algorithm. Serial reads share a **60-second total budget**; the existing frontend **65-second budget** remains unchanged. Cancellation stops requests, response-body reads and retry waits. HTTP error bodies are stopped before retrying. Integrity checks use original bytes, including BOMs. No upstream core, gameplay rule or standard-save format changed.

The local commands, in serial order, were:

```sh
node --test --test-concurrency=1 personal/custom-stage-loading.test.mjs
npm run build
node --test --test-concurrency=1 --test-name-pattern="content load|cancelled|disposing|abandoning" personal/custom-stage.test.mjs
node --test --test-concurrency=1 personal/local-server.test.mjs personal/build-identity.test.mjs personal/checkpoint.test.mjs personal/restore-session.test.mjs
npm run check:dist
```

## Evidence

- [Native battle screenshot](evidence/v15-safari-followup/native-battle.png): base v15 browser combat.
- [Patched stage screenshot](evidence/v15-safari-followup/patched-stage.png): strategy-selection transition after the rebuilt branch's custom room/content-ready handshake; not a settled battlefield image.
- [Patched standard-save screenshot](evidence/v15-safari-followup/patched-standard-restored.png): captured during the loading-field transition, although actual PREP state already matched the old v15 save; not a fully rendered restore image.
- [Machine-readable acceptance record](evidence/v15-safari-followup/acceptance.json).

Transition captures are retained unaltered. The base-build battle evidence and actual round 2 state are distinct from these patched-build state checks. No patched full battle rerun is claimed.

## Resource monitoring and limits

These are whole-machine snapshots, not resource costs attributable to the game:

| Time, JST | CPU idle | Physical memory used | Compressed memory | `memory_pressure` system-wide free |
| --- | ---: | ---: | ---: | ---: |
| 17:19 | 73.69% | 22G | 4.435G | 67% |
| 17:24 | 75.22% | 20G | 4.431G | 67% |

The memory-pressure percentage and physical-memory counters use different accounting. `pmset` reported no thermal/performance warning; actual temperature and GPU counters were unavailable. No temperature, GPU usage, sustained FPS or long-session memory claim is made. The QA window was closed and task-owned preview servers were stopped afterward.

External resources were deliberately CSP-blocked, so screenshots show fallback units. **Portrait, Spine and audio availability were not accepted in this run.** No manual player acceptance, complete campaign, mobile check or Chrome rerun was performed. The remaining native drag and online TLS checks are explicit limitations, not passes.

## Review and rollback

The existing GitHub Actions workflow runs on push and pull requests and has no production-deployment step. Review this focused loading fix and its CI before merging. Rollback is to revert the fix commit and rebuild the prior source; no save migration or backend-state rollback is required. No production release is authorized by this report. Public version 15 remains unchanged. See the [historical v15 acceptance record](V15-ACCEPTANCE.md) for the earlier, separately scoped results.
