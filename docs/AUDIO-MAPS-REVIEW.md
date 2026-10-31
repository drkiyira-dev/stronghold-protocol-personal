# Audio and map reuse review

Development base: `19ab6554ee2e3dc480feaaa8484ec8fde748df4d` (main). No production deployment or access change is part of this work. The upstream source, GPL license and third-party asset notices are retained.

## Audio changes

| Area | Upstream implementation | Enhanced Edition change |
| --- | --- | --- |
| Menu, settings, terminal | Shared buttons have no general sound feedback | Route-scoped click/back/tab cues; settings Escape/backdrop close |
| Buy, refresh, freeze, level-up, sell | `ui/gameActions.js` plays cues after successful ACK; errors have their own cue | Reused; no second optimistic shop sound |
| Select, drag, deploy, retreat | `screens/game.js`, action ACKs and renderer landing cues | Reused |
| Equip and alliances | Equip ACK, bond cues and battle events | Reused; bond output follows prep/battle scope |
| Operator / item merge | Audio assets exist; no matching merge cue call | Observe confirmed preparation-state deltas; item cue requires both a consumed normal item and a new golden counterpart |
| Combat, skills, win/loss, settlement | Phase cues, battle event handler, result screens and voice gate | Reused |
| Mixer and decoding | One Web Audio manager; combined SFX bus; separate BGM/voice | Additional UI gain in that same manager; old `sfx` remains battle volume; old preferences initialize UI volume from `sfx` |

No new audio bank or audio engine. `personal/audio-build.mjs` makes checked build-time adaptations; an upstream source contract mismatch fails the build. UI transition announcements remain UI SFX; combat attack/skill/landing cues use battle SFX. Voice and BGM remain independent. The manager's existing browser gesture unlock, Safari priming, interruption recovery and 64 MiB decoded-buffer budget remain intact.

UI cues are limited to four pending/playing voices, at least 70 ms apart; cold cues older than 450 ms are discarded. These are presentation assumptions, not changes to combat timing or rules. Common small cues warm serially after a user gesture using the existing shared cache. Silent/muted cues do not warm; fetch/decode failure does not block actions. Simultaneous low-priority UI cues may intentionally be suppressed.

## Audio validation

- Six new unit tests: legacy preferences, four mixer channels, gesture initialization, independent zero/mute, burst limits, stale/failed loads, merge deltas and snapshot suppression.
- Chrome 156: settings open/close/Escape, both SFX sliders, preference reload, failed audio request and muted game entry. Repeatable CI uses synthetic PCM; this is not proof that every external recording sounds correct.
- Separate real-origin sampling: click, buy, freeze and battle-start URLs returned HTTP 200; Chrome decoded the real click/back clips and both upstream lobby BGM segments.
- Existing personal suite: 58 passed initially; the Git-ignore test failed because system Git requires an unaccepted Xcode license. That test passed using the already-installed standalone Git. No OS license or global Git setting was changed.
- Existing browser suite passed: checkpoint/vault/replay/coach, 254 kit imports in main/worker, desktop/mobile-layout branding, plus the new audio checks. Tests ran serially.
- Native Safari is **not yet verified for this branch**: the computer-use service timed out attaching to Safari. Prior release Safari results are not reused as proof of these changes. No subjective listening test is claimed.

## Rollback

Revert the audio commit and rebuild. `uiSfx` is an additive preference, not a save schema field; older code ignores it. Checkpoints, run IDs, replay records, engine rules and tactical-coach inputs are unchanged. Keep production Public and deploy only after explicit maintainer approval.
