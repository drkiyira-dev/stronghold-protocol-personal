# Personal Tactical Lab guide

[中文](PERSONAL.zh-CN.md) · [Project README](../README.md)

## Save and upgrade contract

The local engine captures only a manual **PREP** state, before readiness or transition. It includes the shop, board/bench, funds, pools, pending waves and six RNG streams. Combat frames and server rooms are not checkpoints.

The vault retains three automatic snapshots per run, at most 18 total snapshots, and never silently evicts a pinned manual backup. Full storage produces a visible error. Two SHA-256-checked journal slots alternate writes; the newest valid revision wins. A corrupt newest slot falls back to the earlier slot. If both are unreadable, writes stop. Export raw recovery data before repair; explicit import archives the damaged originals before replacing them. A checksum detects accidental corruption, not malicious forgery.

The original `stronghold.personal.prep.v1` key is migrated without deleting it. Engine/rules incompatibility does not delete the snapshot: restore is disabled and export remains available. The envelope has its own version and rejects unknown future formats. Compatible UI/resource changes do not change the rules fingerprint. Intentional rule or engine changes require a reviewed migration or completing/exporting the old run before upgrading.

Use **战术终端 → 存档保险库** to export all backups, pin a snapshot or restore one from the lobby. Import merges rather than replaces existing saves. Different saved identities may require a page reload. Completion clears only the matching active run and retains backups. Browser storage is per origin/profile; clearing it, private browsing expiry or changing hostnames does not provide cloud recovery. Web Locks serialize vault writes where available; avoid concurrently playing the same local run in multiple tabs, particularly on insecure LAN origins without Web Locks.

## Multiplayer backend

```sh
npm run server                         # localhost, port 4174
npm run server -- --host 0.0.0.0        # LAN
npm run server -- --port 4180          # another port
```

Each player opens `http://HOST:PORT/?server=local`. Choose **同盟模拟**, create a room and join using its code. The Node host uses the upstream Lobby/Network/Match services and content-set handshake. The browser uses the existing battle runner and report protocol. Reconnect identities are isolated by server address. Built-in upstream bots are distinct from remote model-driven AI teammates, which are not implemented here.

Rooms remain in RAM while the server runs. This release does not add server checkpoints, original-account synchronization, public matchmaking or anti-cheat guarantees. Browser PREP saves remain for the local engine only. The static Site can connect to an independently hosted **WSS** endpoint through **联机与 AI**; HTTPS pages cannot connect to plain WS/HTTP. For localhost/LAN testing, open the Node-served page itself. No public backend is provisioned automatically.

## Optional model coach

Local tactical rules already work without configuration. For a model coach:

1. Copy `.env.example` to `.env` (ignored by Git).
2. Set `COACH_API_URL` to the full Chat Completions-compatible endpoint, `COACH_API_KEY`, your supported `COACH_MODEL`, and a separate strong `COACH_ACCESS_TOKEN` for this proxy.
3. Restart the server. In **联机与 AI**, set the coach URL to `http://127.0.0.1:4174/api/coach` when using that local page, and enter the proxy access token.
4. Select a replay and click **请大模型分析本场**. The page sends a filtered tactical summary only on that action.

The proxy requires all four settings, validates the token and origin, limits request size/rate, applies a timeout and does not return provider error bodies. The provider key never goes into the browser bundle. The browser holds the proxy token only in memory; the endpoint lasts for the tab session. Requests omit nickname, reconnect token and raw saves. Model responses remain advice, not verified game mechanics or guaranteed results. API usage may incur your provider's charges.

For another browser origin, set `COACH_ALLOWED_ORIGINS` to exact comma-separated origins. If a Node-served page calls a different room/coach host, add its exact origin to `PERSONAL_CONNECT_ORIGINS` as well (page CSP). Use HTTPS/WSS when connecting from the hosted Site. The adapter uses `max_completion_tokens`, `store:false` and the configured model; providers must support those Chat Completions fields. The proxy was tested against an HTTP stub, not a real provider. OpenAI's [Chat Completions API reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) documents that protocol.

## Replay and analysis formats

`stronghold-tactical-replay`, version 1, contains approximately one frame per simulated second, key events, unit metadata, preparation context and the actual battle result. It is a position/health diagram; it cannot resume combat. At most 30 records are retained locally in IndexedDB, with 600 frames, 2,500 events and a 5 MB import limit per record. Export records you want to keep. Background flushes can preserve partial recordings, but closing a page is not a guarantee that its last asynchronous write completed.

Old history imports as summaries. Missing historical metrics display as unknown, not invented zeroes. The local coach derives suggestions from recorded attacks/damage/healing, leaks, deaths, unspent funds and deployment capacity. Zero damage can still be useful blocking/support. Comparisons show differences; even matching seed/round/type/challenge does not establish causation or a future win rate.

## Custom challenges

Import an example from `personal/examples/challenges/` through **自定义挑战**. Supported version-1 fields: `kind`, `version`, `id`, `name`, `description`, `seed`, `difficulty`, and `rules` (`maxDeploy`, `noRefresh`, `noEquipment`, `bannedOperators`). Operator bans use chess IDs from `upstream/data/chess.json`. Unknown fields and script content are rejected.

Enable the challenge from the lobby, then create a solo match. The local host enforces its seed/difficulty and rules and stores them in checkpoints/replays. “恢复标准模拟” clears the selection for the next game. Challenges are local-engine only in this release; server Mods are a separate facility.

## Data-only Mod example

```sh
node upstream/tools/plugin.mjs check personal/examples/personal-lab --strict
mkdir -p plugins
cp -R personal/examples/personal-lab plugins/
npm run server
```

Open `?server=local`, create a room, and select **个人战术实验室** in the upstream room plugin controls. Participants must load its content set before starting. The example adds **实验守卫** and first-round training income of 12. Its stats/name are example additions; it explicitly reuses Matterhorn/角峰's art and behavior kit, not newly created character art. Art remains externally referenced and retains its original rights. Use your own licensed art when building fully original characters.

The example uses `data.add` and declarative DSL, without JavaScript scripts. Installed user plugins live in ignored `plugins/`; the tracked example is in `personal/examples/`. The current browser-local engine does not load server Mods. Consult `upstream/docs/` and `upstream/tools/plugin.mjs` for the upstream plugin contract. Treat engine upgrades as content-compatibility changes and re-run strict checks.

## External assets

`external-assets-build.mjs` generates URL mappings from recorded provenance, voice/audio manifests and atlas dimension metadata. The client retries recorded mirrors where available and adapts atlas text without packaging artwork. Official embedded stats UI images are extracted from the external official stylesheet at runtime. HUD fonts also use external sources; runtime/vendor code remains local. The build reports unmapped paths; **素材状态** probes five representative resources. Neither test covers every external asset. Original rights notices still apply to linked resources.
