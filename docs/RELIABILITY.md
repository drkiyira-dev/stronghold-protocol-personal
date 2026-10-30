# Replay and PREP save reliability patch

[中文](RELIABILITY.zh-CN.md) · [Design](ENHANCED-DESIGN.zh-CN.md)

This patch addresses the first correctness work from the audit of main `9a96d85`. Changes are in `personal/`; upstream rules, operators, engine, plugins and AI teammates are unchanged. No production deployment is included.

## Behavior

- Missing results or individual metrics remain `null`, display as **—**, and remain unknown in the optional coach proxy. Explicit zero stays zero. A missing personal identity does not fall back to other players' results. Missing attacks/damage/healing cannot trigger the zero-contribution rule; missing final duration cannot produce a fabricated DPS.
- Recordings track dropped frames, events, frame units and unit metadata. A final result does not clear their truncation flag. The terminal separates result receipt from sampling limits, and old records without quality metadata show **unknown completeness**. Known final totals remain usable even when sampled playback was truncated. Existing v1 comparisons are descriptive: a matching seed cannot prove a controlled experiment without engine/content provenance.
- New local matches receive an independent run ID that does not consume gameplay RNG. Checkpoints preserve it across changed room codes. Automatic retention and completion use that identity, so a different run with the same fixed seed cannot clear current progress.
- Old payload-v1 and vault-v2 files remain readable and exportable. Their previous grouping is resolved before replacing the room code and then preserved. The patch does not infer links between historical groups already split by earlier restores, nor reconstruct distinctions absent from old files. Optional metadata does not relax engine/rules compatibility checks.
- Selecting a save no longer makes it active immediately. The worker must confirm a successfully restored PREP checkpoint, then the vault must save it. Rejected, mismatched, duplicate, timed-out or stale confirmations cannot activate a candidate. Cross-identity reloads stage only the candidate ID; failed restoration retains previous active progress. Restore-attempt tags prevent late automatic frames from bypassing this check. Failure to save the optional challenge preference after successful restoration is reported separately.

Saves remain **local single-player PREP checkpoints**, not arbitrary combat saves. Browser-storage limits, origin/profile scope and existing multi-tab limitations still apply. This is not the planned general migration/rollback system or transactional vault-v3 implementation.

Multiplayer rooms still live in backend memory. The agreed next persistence stage is recovery to the latest committed **multiplayer PREP checkpoint**, with explicit rollback of subsequent progress. That server persistence is not implemented by this patch. The integrated terminal and evidence-reference coach remain later tasks; current UI changes only make reliability status visible.

## Verification and reproduction

Regression cases cover the defects found during the audit. The complete personal suite passed **38 tests**: real Worker combat/round progression, original and fixed-seed challenge restore, legacy snapshots, wrong-stage restore cleanup, stable identity and retention, actual final-result cleanup, optional coach HTTP stubs, two real WS players/reconnect, and original Mod loading. The isolated browser script passed all **7 check groups**, including the post-commit preference-write failure case.

```sh
npm ci
npm --prefix upstream ci --omit=dev
npm run build
npm test
```

The optional browser integration script uses Playwright supplied by the development environment and installed Chrome. With Playwright resolvable as a package, run:

```sh
node personal/reliability.browser.mjs
```

Alternatively set `PLAYWRIGHT_MODULE` to its installed `index.mjs` path; `BROWSER_CHANNEL` defaults to `chrome`. The script starts an ephemeral localhost server, creates a fresh browser profile, and checks unknown/zero rendering, truncation and legacy labels, failed cross-identity restoration, confirmed activation, optional-preference write failure, and repeated restoration with unchanged run ID/state. It writes its JSON report and screenshots under ignored `.cache/verification/`, then closes the browser and server. External artwork requests are deliberately blocked, so this check does not validate resource availability.

This patch does not claim a fresh nine-round browser playthrough, server-restart recovery, complete multiplayer replay coverage, or a real model-provider invocation. The audit documents remain a historical baseline, not a claim that every listed defect still exists after this patch. Development and these tests were performed with OpenAI Codex assistance; actual commits retain the maintainer's identity and the verified Codex co-author trailer.
