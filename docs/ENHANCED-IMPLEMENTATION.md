# Enhanced Edition: implemented preview and recovery contract

[简体中文](ENHANCED-IMPLEMENTATION.zh-CN.md) · [README](../README.md) · [Original design](ENHANCED-DESIGN.zh-CN.md)

This review branch continues the reliability patch based on main `9a96d85`. It does not deploy the production Site. It preserves the upstream engine, operators, rules, built-in AI, plugin system and Studio; no tracked file under `upstream/` was changed in this implementation. Original attribution, GPL and third-party rights remain intact.

## Implemented scope

| Area | Implemented behavior | Boundary |
| --- | --- | --- |
| Build contract | Checked upstream file lock; exact adapter anchors; upstream, personal engine-adapter and content hashes; build/test CI | Updating the locked upstream requires deliberate review. CI does not deploy. |
| Terminal | One launcher; overview, replay, vault, challenges, network and resources; original theme variables; tab navigation, Escape, focus return and owned pause leases | Core navigation follows the original language setting; detailed help and analysis remain primarily Chinese. Multiplayer is not paused. |
| Replay v2 | Stable event IDs, source/version context, gap markers, separate attempt IDs, immutable first result receipt, all retained events paginated | Still capped at 600 frames / 2,500 events / 30 records. This is sampled client observation, not authoritative full-field video. Chunked storage is not implemented. |
| Coach 2.0 | Each rule card cites facts/events and distinguishes observation, hypothesis and adjustment; evidence opens the source metric or nearest sample | Unknown values remain unknown. Personal casualties require personal ownership. Field leak events do not prove personal leakage. No causal or win-rate claim. |
| Optional model | Numeric summary and request-local references; whole-response citation validation; timeout/cancel/stale-response handling | Referenced text can still be wrong. Validation proves reference membership, not the truth of a model's reasoning. No real provider was used for verification. |
| Vault v3 | IndexedDB transactions across tabs, original-byte backup, migration receipts, directory rollback/undo, explicit old-tab conflict archival | Container migration only; no arbitrary engine/data migration. Browser deletion or a different origin/profile still needs an exported backup. |
| Room recovery R1 | Opt-in local SQLite, committed cooperative PREP, authentication, all-member consent, new transport epoch, settlement barrier and durable completion/abandonment | No mid-combat continuation, distributed failover, original-site account sync or remote model teammate. |

The existing missing-data, truncation and stable `runId` fixes remain. Restoring a local or server checkpoint changes transport battle IDs to reject reports from the abandoned attempt; it preserves the logical run identity, gameplay seed and RNG state.

## Local save migration and rollback

The first successful v3 transaction retains the old localStorage keys, their exact text and a SHA-256 digest in the IndexedDB record. Those keys are not overwritten. The validated v2 journal representation remains inside v3, so normal export/import stays compatible with the existing vault format. Unknown engine/rules versions remain exportable and are refused for restoration.

Imports are candidates only. A matching Worker restoration acknowledgement and successful vault transaction are both required before activation. An aborted transaction or quota error leaves the previous committed directory active. Receipts include the checkpoint run, round and state digest; they are diagnostic history, not a cryptographic anti-cheat log.

From the lobby, **Save vault → migration rollback** selects the directory retained before the first migration. **Undo** restores the directory saved before that rollback. Neither operation switches engine binaries or resumes a combat frame. Before changing builds, export ordinary backups and raw recovery data. The raw diagnostic export includes migration originals and conflict archives; it is not accepted by the ordinary snapshot importer.

If an old client writes its legacy keys, new writes stop. Close the old client, export raw recovery data and explicitly choose **archive the conflict and continue the current progress**. This retains the complete old write without activating it. Up to three such archives are retained; reaching the limit refuses another reconciliation rather than deleting archives. Transactions prevent lost storage updates; they do not merge two independently played branches of the same run.

## Enable R1 on a self-hosted server

Use the tested Node.js **26.7.0** runtime. Its SQLite is **3.53.4**. The implementation requires SQLite 3.51.3 or a release at least 3.53.0 and refuses older/withdrawn branches. This follows the published [SQLite WAL fixes](https://www.sqlite.org/releaselog/3_51_3.html) and [3.53.0 release notes](https://www.sqlite.org/releaselog/3_53_0.html).

```sh
npm ci
npm --prefix upstream ci --omit=dev
npm run build
npm run server -- --host 0.0.0.0 --state-dir .personal-state
```

Alternatively set `PERSONAL_STATE_DIR`. Use a private directory on a local filesystem. It contains `rooms.sqlite`, its live WAL files and `recovery.key`. Payloads, including reconnect credentials, use AES-256-GCM. The key must be retained with the database in backups; losing it prevents recovery. The key is stored beside the database, so file permissions and backup access remain significant. WAL with FULL synchronization provides a transaction boundary, not a guarantee against every disk or filesystem failure.

Without this option, the original process-memory room behavior remains available. `/api/personal/info` advertises whether R1 is configured. R1 requires the default cooperative rules, no gameplay plugins or alternate version, no test mode or remote AI, stable PREP and enhanced-client negotiation by every human. Original built-in AI may be included once its preparation decisions finish. Rehearsals, active fields, takeover/autoplay and unsupported combinations cannot be captured as stable checkpoints. A room with a committed checkpoint stops at PREP if a required commit or negotiation fails.

For a different frontend origin, configure exact `PERSONAL_ALLOWED_ORIGINS` for recovery HTTP requests and `PERSONAL_CONNECT_ORIGINS` for the served page's CSP. Existing coach origin settings are separate. Static Sites need a separately hosted HTTPS/WSS backend; they cannot run SQLite or a room process themselves.

### Exact rollback range

The recoverable point is the **latest successfully committed PREP revision**, including all players, shared pools, stocks, wave schedule, ready decisions and RNG streams. A pre-combat commit is a barrier before entering combat. A crash can discard uncommitted preparation actions, the current combat and any settlement not durably committed after that point. It never resumes the previous combat frame.

After restart, the original reconnect token must match the restored identity. Human reconnection records in a saved checkpoint expire after the recorded 24-hour window; expired/incompatible/corrupt rooms are isolated and retained, not guessed into a new game. The room waits with its timer stopped while all humans accept the shown checkpoint round/revision and rollback range. Offline time does not advance the restored PREP timer. A new epoch rejects old commands; fresh battle IDs reject reports from abandoned combat attempts.

Final result messages are held until the completion record commits. A temporary write failure retries while retaining the previous checkpoint. A completed record replays the original settlement to the authenticated reconnecting player instead of reopening PREP. Permanently leaving a persisted room first commits an abandonment record: during pending recovery the room closes; during ordinary play the remaining room continues without recovery. A failed abandonment write refuses that departure. Expired credentials are not revived by restarting.

### Backup and restore

Stop the room server, then run:

```sh
node personal/backup-rooms.mjs .personal-state ./room-backup-2026-10-30
```

The destination must be new. The command uses SQLite's backup API and copies the key; the backup has no active writer lease. It refuses to open a live writer's state directory. To restore, retain the original directory, keep the original server stopped and launch the **matching code/content build** with `--state-dir ./room-backup-2026-10-30`, on the same address players previously used. Do not overwrite the only database copy or copy just the main SQLite file out of a live WAL database. No network backup/admin endpoint is exposed.

## Verification and remaining release gates

Codex ran the following locally on October 30, 2026:

- `npm run build`: locked-source and adapter checks passed.
- `npm test`: **52 tests passed**. Includes real local combat; two WS players through combat to PREP 2; SIGKILL/restart; death during a transaction; all-member recovery; forged/stale requests; blocked settlement then retry; encrypted backup restoration; abandonment and corrupted-row isolation.
- `npm run test:browser`: **7 reliability checks + 13 enhanced checks passed** in isolated Chrome. Includes real IndexedDB transactions, two tabs, abort/quota faults, rollback/undo, old-tab conflict handling, evidence links, event pagination, modal behavior, theme/core language controls, a 390 px viewport and stale-model rejection.
- Model calls used stubs; external art was blocked in these browser fixtures. These runs do not establish live-provider or external asset availability.

The browser scripts generate JSON reports and screenshots under ignored `.cache/verification/`. CI uses pinned Playwright and uploads those artifacts; it has no production credentials or deployment step.

Remaining priorities: (1) a fresh complete nine-round browser run and multiplayer late/boss-round coverage before production consideration; (2) chunked recordings and richer field/sequence completeness; (3) full terminal localization and original settlement/history entry points; (4) explicitly reviewed engine/data migration fixtures; (5) broader official-version/plugin recovery matrices and R2, if separately designed. This implementation does not mark every item in the original plan complete. Production publication still requires explicit approval of a concrete release candidate.
