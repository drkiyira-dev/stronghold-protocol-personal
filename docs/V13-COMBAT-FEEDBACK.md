# v13 phase 2 — combat interaction feedback

Development branch: `feat/v13-combat-feedback`, based on main `0cfe27307301ac9d971b02a5de0ef8433c669a89`. Runtime/test commit: `1785843`; native QA wait fix: `2f538d8`. This change is for review; the Public Sites v13 deployment is unchanged.

## What changes

| Interaction | Feedback and source of truth |
| --- | --- |
| Deploy / reposition | A brief mint tile confirmation follows a committed PREP board change. The original landing, Spine animation, sound and 220 ms movement tween remain in charge. The adapter uses the existing board coordinate transform, including mirrored fields, and ignores speculative drag/held positions. |
| Select | The original underframe keeps its action buttons and range overlay. Its decorative SVG re-enters when the selected UID changes, with mint corners and a restrained 180 ms transition. No button remount, focus steal or new click target. |
| Retreat | A hollow blue outline fades at the vacated tile only after the same piece is confirmed in hand/temp. Sale, death, rejected commands and duplicate snapshots do not impersonate retreat. |
| Skill | A short gold tile emphasis follows a timely allied `skill` activation in the real presentation event stream. Existing official and plugin effects take precedence; no second skill burst, audio call or Spine clip is introduced. Skill-off, repeated activation and late catch-up events do not retrigger it. |
| Settlement | The existing result dialog uses a 220 ms entry / 200 ms exit, immediately readable text and no extra sweep. Original result calculation, tone, display duration, phase progression and pointer transparency are unchanged. |

## Implementation boundaries

- All runtime additions are in `personal/`. Build adapters check exact upstream seams and fail on drift. No vendored upstream source, map pool, operator data, simulation rule or save schema is changed.
- `CombatFeedback` reuses `TileField.setHighlights`, its terrain projection and existing Pixi graphics. It creates no new texture, canvas, WebGL context, animation loop, audio source or asset request.
- High quality allows at most **4** concurrent cue groups; Medium allows **2**; Low allows **0**. Deployment/move/retreat cues last **320 ms**; skill emphasis lasts **420 ms**. These are presentation durations, never command delays.
- The v12 motion preference, system reduced motion and hidden-page state gate the additions. Context loss, phase/stage/player changes and teardown clear owned cues. A cosmetic error disables this extension without throwing into the game loop.
- Initial restore/reconnect state establishes a baseline instead of replaying success animations. Hidden/static updates still advance the comparison baseline, so returning to the page does not replay stale changes.
- Existing legal/illegal deployment highlights, damage/healing numbers, animations, saved replays and coach inputs retain upstream behavior. No second quality or replay system is introduced.

## Local acceptance

The QA server is `node personal/battlefield-preview.mjs --combat` on `127.0.0.1:4183`. It loads a plain static build and uses the existing fixed-seed HARD QA challenge and normal worker requests, without injected units or simulation events. QA helpers/probes are never copied into `dist`. The phase-2 preview blocks external resources by CSP so screenshots contain shipped procedural graphics rather than newly redistributed game art. Its isolated startup is muted; production audio preferences are not changed.

Tested on 2026-11-01: macOS 26.6, Apple M5 / 24 GiB; Node 26.7.0; Chrome 156.0.8078.47 and **native Safari 26.6**. Automated Chrome used 1440 × 900; native screenshots are 3420 × 2002 including browser chrome. Each native run used its own private window; ordinary windows and production saves were untouched. Build, suites, Chrome and Safari were run serially. Owned test windows and the preview server were closed afterwards.

| Check | Result / scope |
| --- | --- |
| Build and static artifact integrity | Passed; 864 files. The clean-checkout test also verifies regenerated dependencies and deliberate missing-install failures. |
| Personal unit regressions | 125 cases covered: initial complete run had 121/123 pass and two system-Git/Xcode-license failures; both passed with bundled Git. The two subsequent cue-slot / suspended-RAF cases and their affected suite passed separately. No system license was accepted or changed. |
| Full automated browser command | All 11 serial suites passed. Includes save/restore and run identity, replay/coach, kits, branding, audio, map/scene fallback, menu/environment motion, WebGL loss and no-WebGL play. The final cue-slot fix was rebuilt and its 7-case unit suite plus focused combat browser suite rerun successfully. |
| Focused real Chrome renderer | Original selection/retreat button, confirmed deploy/move, rejected command, Static/reduced motion, genuine Texas skill, terrain highlight, actual result dialog, R2 PREP and teardown passed. [Machine-readable evidence](evidence/v13-phase2-automated.json). |
| Native Chrome | Selected via original tile picking; used original retreat button, redeployed/moved through normal worker requests, disabled/enabled motion, observed a genuine ally skill and result transition, reached R2 PREP. |
| Native Safari | Same interaction / real skill / settlement path passed to R2. Also checked Low → Medium → High: budgets 0 → 2 → 4, with no new move cue at Low and a real move cue at Medium. No recorded page errors. |
| Existing rules and saves | `upstream/`, worker/simulation adapters, checkpoint schema and engine-identity inputs are unchanged from base. Existing save/replay/coach regressions passed. This is not arbitrary-time save support. |

### Screenshots

Native screenshots below show actual game controls and result UI. Right-hand panels are **local QA only**; their counters update when sampled, so a panel can display the preceding sample while the live game continues. The procedural unit markers intentionally demonstrate external-art failure fallback.

| Browser | Selected / animated | Static comparison | Actual settlement |
| --- | --- | --- | --- |
| Chrome | [Screenshot](images/v13-phase2-native-chrome-selected.jpg) | [Screenshot](images/v13-phase2-native-chrome-static.jpg) | [Screenshot](images/v13-phase2-native-chrome-settlement.jpg) |
| Native Safari | [Screenshot](images/v13-phase2-native-safari-selected.jpg) | [Screenshot](images/v13-phase2-native-safari-static.jpg) | [Screenshot](images/v13-phase2-native-safari-settlement.jpg) |

Short-lived cues captured by the serial automated Chrome run: [deployment](images/v13-phase2-deploy.jpg), [retreat](images/v13-phase2-retreat.jpg), [actual skill activation](images/v13-phase2-skill.jpg).

### Observed performance and limitations

Each visible R2 PREP sample lasts approximately 4 seconds, after a 1-second setting transition, with one operator on Tidal Control. These are brief idle-board comparisons, **not** a worst-case battle stress test or a long-term leak proof. Native data, resource counters and the rejected hidden-window attempt are retained in [the evidence record](evidence/v13-phase2-native.json).

| Browser | Static before FPS / frame p95 | Animated FPS / frame p95 | Static after FPS / frame p95 |
| --- | --- | --- | --- |
| Chrome | 60.00 / 17.60 ms | 59.99 / 17.60 ms | 60.02 / 17.60 ms |
| Native Safari | 59.99 / 17.00 ms | 60.00 / 17.00 ms | 60.00 / 17.00 ms |

The first Chrome performance attempt was suspended while its window was hidden and is excluded. After the maintainer brought the window forward, all three samples reported visible/focused state. The QA inspector was fixed to finish its wait even when RAF is suspended; its regression deliberately suspends RAF and verifies that the report retains the actual zero budget. Gameplay did not require a visibility workaround.

System memory-free observations ranged from 46% to 57% during this task. Temperature, GPU memory/utilization and Safari JS heap were not available; they are **unknown**, not zero. No claim of a measured CPU temperature or long-duration thermal stability is made.

Remaining scope: no new full nine-round run, multiplayer/Boss run or physical mobile test in this phase. Imported original 3D art and every official/plugin skill were not newly loaded; precedence and mirrored coordinate behavior have focused regression coverage. Existing upstream effects remain upstream-controlled; Static/Low turns off the added confirmations and the adapted selection/result transitions, not original gameplay telegraphs. Automated acceptance does not replace a player's full campaign acceptance.

## Review and rollback

No merge, deployment, access permission, hosting binding or production save is changed by this branch. The workflow runs verification on `push` / `pull_request` with read-only repository permissions; it contains no deployment job. Revert the phase-2 commits and rebuild to remove the extension. No save migration or rollback migration is needed: engine/content identity and save formats are unchanged.

GPL-3.0, upstream authorship, `LICENSE`, `NOTICE` and third-party rights remain intact. No third-party game asset or new dependency is bundled. Actual Codex-assisted commits retain `Co-authored-by: Codex <noreply@openai.com>`.

## 中文摘要

本阶段复用上游落地、移动、技能与结算机制，在扩展层增加明确且克制的战斗反馈。提示依据已提交的状态及真实技能事件，失败操作、重复状态和恢复初始状态不会误报成功。低画质、静态模式和系统减少动态效果会关闭新增装饰；不改变操作时序、战斗数值或存档格式。当前 Public Sites v13 保持不变，需维护者另行批准合并和部署。
