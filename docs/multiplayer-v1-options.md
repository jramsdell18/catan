# Multiplayer V1 architecture decision

**Status:** proposed product/architecture direction for planning — **not locked** until the Durable Object (or chosen Node) runtime spike succeeds.

**Proposed decision:** build **Approach B** (server-authoritative game). Prefer **one Cloudflare Durable Object per room** as the first hosting candidate. Keep the existing host-authoritative LiveKit path only as a local/dogfood transport while the server path is built. If the Workers/DO path fails the spike or team preferences favor conventional Node, fall back to a **thin Node WebSocket room service** or **Colyseus** (peer alternatives—not ranked as “raw WS last”).

**Related roadmap:** [`ROADMAP.md`](../ROADMAP.md), especially A (architecture), B (runtime spike), C1–C3 (shared rules, protocol, and service foundation), D1–D2 (server and client boundaries), and F1–F4 (production hardening).

**Maintained implementation contract:** [`production-architecture.md`](production-architecture.md). This document retains the alternatives and reasoning behind that contract.

**Related code today:** `src/App.jsx` (host `applyAction` + snapshots), `src/game/multiplayerRoom.js`, `src/stream/LiveKitTableCall.jsx` (media + data channel), `netlify/functions/livekit-token.js`, `src/rules/*` (engine + `getPlayerView`).

---

## 1. What we have today

The app already supports a **host-authoritative multiplayer shell** over **LiveKit**:

| Concern | Current behavior |
|--------|-------------------|
| Voice / video | LiveKit room; token minted by Netlify function |
| Game transport | LiveKit **data messages** (`DATA_TOPIC = 'catan-game'`) |
| Authority | **Host browser** runs `applyAction` |
| Non-host actions | `ACTION_REQUEST` → host applies → `GAME_SNAPSHOT` |
| Snapshot payload | **Full engine `game` object** to all clients |
| Privacy | `getPlayerView` used for **UI** when multiplayer mode; **not** enforced on the wire |
| Host gone | Room status → `host-disconnected`; play effectively stops |
| Join | Invite URL + LiveKit room name; must join call to play |

```text
  Non-host                         Host tab                         Everyone
  ────────                         ────────                         ────────
  click ──ACTION_REQUEST──►   applyAction(full game)
                              │
                              └──GAME_SNAPSHOT(full game)──►  setGame(...)
  (same LiveKit room carries A/V tracks + these data packets)
```

So LiveKit is doing **two jobs**: (1) table voice/video, (2) unreliable-ish game bus.

---

## 2. Approach A — Host-authoritative (keep game on LiveKit data)

### Idea

One player’s browser remains the rules server. LiveKit data channel (or another P2P channel) carries lobby + actions + state. Voice/video can stay on LiveKit as today.

### Gameplay flow

1. Host creates / opens room; others join via link/code and claim seats.
2. Host starts game → `createGame` on host only.
3. Any seated player’s action:
   - Host: apply locally + broadcast result.
   - Non-host: send action intent to host; host validates seat/turn, applies, broadcasts.
4. Clients render from received state (ideally **per-seat views**, not full `game`—see must-fix below).

### Must-fix before calling A a real multiplayer release

- **Stop broadcasting full `game`.** Host should send each participant only `getPlayerView(game, seatId)` (plus public lobby metadata). Today every client gets hands, deck order, and hidden VP cards if they inspect network traffic.
- **Command IDs + state version** so retries / reordered packets don’t double-apply.
- **Reconnect:** on rejoin/`HELLO`, host resends that seat’s view + lobby (partially present; harden UX).
- **Join UX:** short room code + clear Create vs Join (LiveKit room naming is opaque for non-devs).
- **Optional voice:** don’t hard-block “play rules” on mic permission if friends only want the board.
- **Host leave policy:** clear “game over / start new room” (true host migration without a server is hard).

### Pros

- **Fastest path** to friends playing: reuses most of `App.jsx` / `multiplayerRoom.js`.
- **No dedicated game process** to host or pay for (beyond what you already pay for LiveKit + static site).
- Same deploy surface as today: static app + token function.

### Cons

- **Host can cheat** (they hold full state and run the RNG).
- **Host tab close / phone sleep** still kills the table unless you build fragile host handoff.
- LiveKit data channel is built for realtime media products, not as a durable game log (size limits, delivery semantics, no first-class “room persistence”).
- Privacy fix is still required; architecture remains “trust the host.”

### When A is the right choice

- Private friend groups, short sessions, ship in days/weeks.
- Explicit product copy: “One player hosts the game on their device.”

---

## 3. Approach B — Server-authoritative game + LiveKit voice only

### Idea

A **game server** owns rooms, seats, full engine state, dice/deck RNG, and `applyAction`. Clients send **commands** and receive **only their `getPlayerView`**. LiveKit is used **only** for voice/video (optional sidecar), keyed by the same room id/code for convenience.

### Gameplay flow

```text
  Clients                         Game server                      LiveKit (optional)
  ───────                         ───────────                      ─────────────────
  join(code) / claimSeat ──────►  lobby state
  start ───────────────────────►  createGame (server RNG)
  action { commandId, ... } ───►  applyAction → version++
                                  │
                                  ├── WS: view(red) ──► red client
                                  ├── WS: view(blue) ─► blue client
                                  └── …
  enable mic ─────────────────────────────────────────► same roomName / code
```

### Must-build for B

| Piece | Role |
|-------|------|
| Room service | Create room → human join code; claim seat; ready; start |
| Authoritative loop | Import shared `src/rules` (`createGame`, `applyAction`, `getPlayerView`) |
| Transport | WebSocket (or equivalent) for commands + seat-scoped state |
| Versions / idempotency | `stateVersion`, `commandId`, reject stale/out-of-turn |
| Client adapter | `requestOrDispatch` always hits server; drop full-snapshot broadcast path |
| Identity | Stable participant id (existing localStorage id is a start) + reconnect to seat |
| LiveKit | Token + join for A/V only; **no** game `DATA_TOPIC` dependency |

### Pros

- Implements the production roadmap's server-authority and wire-privacy requirements.
- No trusted host laptop; any player can leave without “owning” the rules process (with reconnect/abandon policy).
- Cleaner long-term: bots, spectate, rematch, server-side logging, rate limits.
- LiveKit failures don’t desync the board (media is optional).

### Cons

- **New service** to design, deploy, monitor.
- **Ongoing cost** (even if small at low scale)—see §6.
- More engineering before first dogfood (weeks of focused work, not a half-day).

### When B is the right choice

- Public or semi-public tables, “real product” first release, privacy/cheating matter.
- You want host = “who created the room,” not “whose browser is the server.”

---

## 4. Deviation: LiveKit as game bus vs voice-only

### Today (coupled)

| LiveKit feature | Used for game? | Used for media? |
|-----------------|----------------|-----------------|
| Room membership | Yes (who is “at the table”) | Yes |
| Data packets | **Yes — lobby + actions + full snapshots** | No |
| A/V tracks | No | Yes |
| Token endpoint | Required to join anything that needs the room | Same |

**Coupling effects:**

- Gameplay **requires** a successful LiveKit join (token, WebRTC, network).
- Game messages share fate with media infrastructure (outages, client library weight, packet limits).
- “Copy invite” is really “join this LiveKit room,” which conflates seat claim with call setup.
- Scaling/privacy thinking is blurred: media SFU vs game authority are different problems.

### Target with Approach B (decoupled)

| Concern | System |
|---------|--------|
| Who is in the game, seats, turns, board | **Game server + WS** |
| Who can hear/see whom | **LiveKit only** |
| Join code | Owned by **game server**; optionally reuse as LiveKit `roomName` so one code opens both |
| Failure modes | Media down → still place roads; game server down → table frozen (expected) |

### Target with Approach A (partial decoupling)

You *can* keep host authority but still:

- Fix payloads to per-seat views.
- Make voice optional (data-only join if LiveKit allows, or a non-LiveKit fallback for data—awkward).

Full decoupling of transport usually pushes you toward B (or another dedicated realtime channel such as a small WS server), because **someone** has to accept TCP/WebSocket connections for game state if not LiveKit data.

### Practical difference for players

| | LiveKit carries game (today / A) | LiveKit voice-only (B) |
|--|----------------------------------|-------------------------|
| “Join table” | Join call + game in one step | Join **game** first; optional “Start voice” |
| Host closes laptop | Game dies | Game continues (server still up) |
| Inspect network | Full game blob on data channel (today) | Only your view on WS; media separate |
| Offline voice | Can’t play if call stack fails | Can still finish a quiet game |

---

## 5. Where would the server live?

### Already in the repo

| Component | Location | Role |
|-----------|----------|------|
| Static SPA | Netlify (or any static host) via Vite build | UI + Three.js |
| LiveKit token | `netlify/functions/livekit-token.js` | Short-lived JWT for media only |
| LiveKit media | LiveKit Cloud (or self-hosted LiveKit) | SFU for A/V |

There is **no** long-lived game process today.

### Approach A — no new game server

| Piece | Where |
|-------|--------|
| Authority | Host browser |
| Static + token | Netlify (current) |
| Media | LiveKit Cloud |
| Optional later | Still no game VPS unless you add persistence/analytics |

### Approach B — need a long-lived game process

Netlify **Functions** (and similar serverless) are a poor fit as the **sole** game authority: cold starts, short timeouts, no sticky in-memory room across invocations without an external store + realtime gateway.

Reasonable homes for the **game service**:

| Option | Fit | Notes |
|--------|-----|--------|
| **Cloudflare Durable Objects** | **Preferred candidate (spike first)** | One authoritative object per room; serialized commands, WebSockets, durable active-game storage. Confirm rules package + local Wrangler ergonomics before locking. |
| **Thin Node WebSocket service** (Fly / Railway / Render / VPS) | **Peer fallback** | Small HTTP+WS process, one room Map, same command contract. Natural fit for turn-based `applyAction`; less framework than Colyseus. Add Redis/SQLite when deploys must not drop rooms. |
| **Colyseus on Node host** | Peer fallback | Room lifecycle and schemas out of the box; extra dependency if all you need is command → rules → private view. |
| **LiveKit + separate WS on same VPS** | Optional colocation | Still two protocols; game must not use LiveKit data as authority. |
| **Netlify Functions + Redis + managed realtime** | Awkward | Cold starts and no sticky in-memory room without an external WS gateway. |
| **Self-host everything** | Max control | Game Node + LiveKit server on one box; ops burden. |

**Preferred topology if the DO spike passes (B):**

```text
  Netlify             →  static frontend + livekit-token function
  Cloudflare Worker   →  create/join HTTP endpoints + WebSocket upgrade
  Durable Object      →  one authoritative `catan-game` room + active-game storage
  LiveKit Cloud       →  optional voice/video only (existing account)
```

**Fallback topology (thin Node):**

```text
  Netlify             →  static frontend + livekit-token function
  Fly/Railway/etc.    →  `catan-game` Node (REST rooms + WebSocket commands)
  LiveKit Cloud       →  optional voice/video only
```

### Dual-origin deploy note

V1 likely runs the SPA (and LiveKit token mint) on **Netlify** and the game authority on **Cloudflare or a Node host**. Plan for:

- Explicit game API base URL (`VITE_GAME_SERVER_URL` or similar)
- CORS and cookie/token rules for reconnect credentials
- Separate env docs and deploy pipelines for static vs game

Do not assume same-origin WebSockets without a reverse-proxy decision.

Move the pure engine into a small internal workspace package (for example, `packages/rules`) imported by both the web client and room server. Do not make the server depend directly on browser-oriented source layout.

**V1 persistence (public release bar):** persist the active room snapshot after every accepted command so a deploy or process restart does not destroy a game in progress. For the first server-authoritative dogfood vertical slice (`1.0.0-alpha.1`), in-memory rooms are acceptable if the team accepts “deploy ends open tables”; promote durable snapshots before `1.0.0-beta.1`. Completed-game history, analytics, and replay storage remain deferred beyond V1.

---

## 6. Would a server bring additional costs?

### Cost stack comparison (order-of-magnitude, USD, hobby/friends scale)

Exact prices change; treat this as **relative**, not a quote.

| Cost center | Approach A (host auth) | Approach B (game server) |
|-------------|------------------------|---------------------------|
| **Static hosting (Netlify free/pro)** | Already have | Same |
| **LiveKit Cloud** | Already need for voice; **also** carries game data volume | Still need for voice if you keep A/V; **less** data-channel traffic |
| **Game compute** | $0 (host’s device) | Scale-to-zero Durable Objects if CF path; small always-on or scale-to-zero Node instance for thin/Colyseus path |
| **Managed realtime (if used)** | $0 if LiveKit data only | $0 if self WS on VPS/DO; or Ably/etc. if chosen |
| **Database** | $0 for dogfood | DO storage or Redis/SQLite for active games before public beta; history/analytics DB can wait |
| **Bandwidth** | LiveKit media dominates | Media still dominates if cameras on; game WS is tiny (KB per action) |
| **Engineering time** | Lower | Higher (real cost for a small team) |

### LiveKit-specific

- **Media** (mic/camera) is the expensive/variable part of LiveKit, not board state JSON.
- Moving game off LiveKit data **does not remove** LiveKit cost if you keep video tables; it may **slightly reduce** data-message usage (usually minor vs A/V minutes).
- Making **voice optional** can reduce LiveKit bill more than choosing A vs B.

### Hidden / non-dollar costs

| | A | B |
|--|---|---|
| Support burden | “Host must stay online” | Server restarts, room codes, env vars |
| Cheating / privacy trust | Weak | Stronger |
| CI | Multi-browser e2e still needed | + server integration tests |

### Bottom line on cost

- **A:** no new server bill; you already pay (or will pay) for **Netlify + LiveKit** if voice tables are on.
- **B:** adds modest game compute and active-state storage; total infrastructure is still dominated by **video** if everyone enables cameras—not by Catan state sync.
- For a first friends release, **B’s extra hosting cost is usually negligible** next to LiveKit A/V; the real cost is **build time**.

---

## 7. Side-by-side summary

| Dimension | A — Host + LiveKit data | B — Game server + LiveKit voice |
|-----------|-------------------------|----------------------------------|
| Who runs `applyAction` | Host browser | Game server |
| Wire privacy | Must retrofit per-seat views | Natural with `getPlayerView` fan-out |
| Host closes tab | Game at risk | Game continues |
| LiveKit role | Media **and** game bus | Media **only** |
| New infra | No | Yes (WS-capable process) |
| Extra monthly $ | ~$0 beyond current | Small compute + same media |
| Aligns with production roadmap | Partial / temporary | Yes |
| Speed to dogfood | Faster | Slower, sturdier |

---

## 8. V1 decision and architecture

**Product decision (adopt for planning):** Approach **B** — server-authoritative game, LiveKit voice/video only, host is a lobby role not the rules process.

**Hosting decision (provisional):** Cloudflare Durable Objects are the **first spike target**, not a locked platform choice. The **command contract, privacy boundary, and client adapter** stay the same if the runtime becomes thin Node or Colyseus.

Agreed direction for V1:

- An authoritative room process owns seats, full engine state, RNG, command ordering, versions, and (from beta onward) active-game persistence.
- Clients submit commands and receive only their seat-scoped `getPlayerView` plus explicitly public events.
- Joining and playing does **not** require joining LiveKit. Voice/video is an optional sidecar using the same room code when possible.
- The current host-authoritative LiveKit path may remain temporarily for local development and trusted dogfood; it is not a public release target.
- Runtime preference order after the spike:
  1. Cloudflare Durable Object per room (if rules + Wrangler path is clean)
  2. Thin Node HTTP+WS room service (same contract; minimal framework)
  3. Colyseus on Node (if room lifecycle batteries are worth the dependency)

### V1 system shape (preferred candidate)

```text
Browser SPA
  ├── HTTP: create/join room
  ├── WebSocket: commands, acknowledgements, private snapshots
  └── LiveKit: optional voice/video

Cloudflare Worker
  └── route room code to one Durable Object

Durable Object (one per game)
  ├── authoritative rules package
  ├── seat and reconnect tokens
  ├── serialized command processing
  ├── stateVersion + command deduplication
  └── durable active-game snapshot (required before hosted beta)
```

If the fallback Node path is chosen, replace the Worker/DO block with a single `catan-game` process exposing the same HTTP + WebSocket surface.

### Required command contract

Each command carries at least `roomId`, `commandId`, `expectedVersion`, a server-issued seat/session credential, and the rules action. The server acknowledges or rejects every command with its authoritative version. Duplicate command IDs must return the prior result without applying the action twice.

`getPlayerView` is the privacy boundary, but the wire protocol remains an explicit, validated schema rather than an arbitrary serialized engine object. Keep snapshots lean (avoid shipping unbounded full action logs on every update).

### Identity and reconnect

The current local-storage participant ID is a UI convenience, not authentication. On join, the server issues an opaque, unguessable reconnect/seat token. It authorizes reclaiming that seat, submitting commands for it, receiving its private view, and requesting appropriately scoped optional-media access. Full user accounts are not required for V1.

### V1 product scope

**Must for first public-facing multiplayer (toward `1.0.0`):**

- Three or four guests create or join a room using a human-friendly code/link.
- Players claim seats/colors, ready up, and complete the existing full game.
- Refreshing or briefly disconnecting restores the player's seat and current private view.
- Host departure does not stop the game; host is a lobby role, not the rules process.
- Active games survive a service deployment/restart (beta bar; see versioning).
- Voice/video is optional.
- Multi-client tests prove stale, duplicate, unauthorized, and out-of-turn commands are rejected and hidden state never leaks.

**Can slip past first server-authoritative dogfood (`1.0.0-alpha.1`) into `1.0.0-beta.1` / `1.0.0-rc.1` without blocking the vertical slice:**

- Polished rematch UX and ownership rules
- Elaborate leave/abandon policies and long TTL abandoned-room cleanup
- Perfect zero-downtime deploys

Accounts, public matchmaking, spectators, bots, completed-game history, and replay UI are not V1 requirements.

---

## 9. Effort relative to the existing project

Treat all application, engine, UI, and test work currently completed as a **100% baseline**. Estimated **additional** work for a full hosted multiplayer bar (reconnect + privacy tests + dual deploy + optional media):

| Path | Additional work | Resulting project size |
|------|----------------:|-----------------------:|
| Harden current host/LiveKit path only | 10–15% | 110–115% |
| **Authoritative V1 (DO or thin Node)** | **30–45%** | **130–145%** |
| Colyseus authoritative V1 | 35–50% | 135–150% |
| Over-built custom stack (extra frameworks + premature ops) | 45–60% | 145–160% |

Server-authoritative multiplayer is roughly **one-third again** the existing project—not a small patch. **Thin Node and Durable Objects are in the same effort band** if the command contract stays fixed; framework choice matters less than integration and multi-client testing.

### Split effort: dogfood vs release bar

Do **not** plan one calendar blob for “all of §8.” Split by product version:

| Milestone | What “done” means | Planning guidance |
|-----------|-------------------|-------------------|
| **Spike** | `packages/rules` + create room + one successful `applyAction` + private view in the candidate runtime (DO or Node) | Half-day class; **blocks** platform lock-in |
| **`1.0.0-alpha.1`** | End-to-end server-backed game for friends: join code, seats, full rules loop, private views, basic reject paths; dual-origin wiring workable | Several focused sessions after spike; AI-assisted pace may land a **vertical slice** in roughly **one focused day**, but treat **multi-browser sync and deploy** as variance—not a 12-hour guarantee for full §8 |
| **`1.0.0-beta.1`** | Reconnect tokens, durable active-game snapshots, multi-client privacy/turn tests, optional LiveKit | Additional sessions; often comparable effort to the alpha because of flaky e2e and edge cases |
| **`1.0.0-rc.1` / `1.0.0`** | Production-configured release candidate, hosted hardening, rematch/leave polish, ops docs, and abandon TTL | Ops and UX polish; re-estimate after the beta |

Approximate share of the 30–45% band (order-of-magnitude):

| Phase | Relative share of multiplayer work |
|-------|-------------------------------------:|
| Spike + first server-backed full game (`1.0.0-alpha.1`) | ~40–50% |
| Reconnect, persistence, privacy tests, optional media (`1.0.0-beta.1`) | ~30–40% |
| Deploy hardening, rematch/leave, production cleanup (`1.0.0-rc.1`+) | ~15–25% |

These are planning estimates, not delivery guarantees. **Re-estimate after the spike** proves the shared rules package runs correctly in the chosen runtime. The main uncertainty is external deploy config and multi-browser synchronization debugging, not ordinary local rules features.

---

## 10. Versioning strategy

Use **lightweight Semantic Versioning for product releases**, while versioning the network and stored state independently.

### Application releases

- Keep one app version for the web client and game service; do not independently version every internal package.
- Keep the current `0.1.0` package version as the MVP baseline, then use `1.0.0` prerelease identifiers while multiplayer contracts and UX are changing.
- Advance through alpha, beta, and release-candidate builds as the roadmap's release gates are met.
- Tag releases in Git (for example, `v0.1.0`) and expose the version plus Git commit SHA in diagnostics/server logs.
- Declare `1.0.0` when the public full-game experience, reconnect behavior, privacy guarantees, and operational expectations are considered stable.

The repository already identifies the current application as `0.1.0`, although no Git release tag exists yet. Preserve that as the local/host-authoritative baseline and use this progression:

| Version | Meaning |
|---------|---------|
| Current `0.1.0` | Existing local and host-authoritative MVP baseline |
| `1.0.0-alpha.1` | First end-to-end server-authoritative dogfood game |
| `1.0.0-beta.1` | Reconnect, persistence, private-state tests, and optional media complete |
| `1.0.0-rc.1` | Production-configured release candidate |
| `1.0.0` | Supported public V1 |

SemVer is useful for release communication, rollback, and bug reports, but it does not by itself protect connected clients or persisted games.

### Wire protocol version

Every connection/handshake must carry a small integer `protocolVersion`. The server rejects an incompatible client with a clear refresh/update message. Additive message changes can retain the version; incompatible command or snapshot changes increment it.

For a single deployed web client and server, supporting multiple old protocol versions is not initially necessary. The explicit number still prevents a stale browser tab from silently corrupting a room after deployment.

### Persisted-state schema version

Every stored room snapshot must carry a separate `stateSchemaVersion`. On load, the server either migrates a known older schema or refuses it explicitly and records an actionable error. Never assume the application SemVer or protocol version describes storage compatibility.

The internal rules package does not need its own SemVer unless it is published or consumed by independently released applications. Until then, client and server should build from the same repository revision.

---

## 11. Remaining implementation choices

**Blocking before platform lock-in:**

- [ ] **Spike:** run shared `packages/rules` (`createGame` / `applyAction` / `getPlayerView`) in a Durable Object and prove the exit criteria below.
- [ ] Connect two simultaneous clients to one room and send a different private view to each.
- [ ] Accept one versioned command, reject a duplicate/stale command, and confirm it applies exactly once.
- [ ] Persist and restore the room after runtime eviction/restart, including reconnecting a seat token.
- [ ] Exercise the Netlify-to-game-host dual-origin path, including CORS and reconnect-token transport.
- [ ] Run the spike locally and in an automated integration test; record any Wrangler/runtime friction.
- [ ] Compare the result with the thin Node fallback on implementation complexity, local testing, persistence, deployment, and expected operating cost.
- [ ] Confirm runtime: Cloudflare DO vs thin Node vs Colyseus based on spike outcome.

**Planning inputs (can decide during or right after spike):**

- [ ] Room code format and link shape (for example, `?room=K7M2`).
- [ ] Game API base URL / dual-origin strategy (Netlify SPA + game host).
- [ ] Reconnect grace and abandoned-game expiration periods.
- [ ] Rematch ownership and readiness (can defer polish past `1.0.0-alpha.1`).
- [ ] Whether to remove the host-authoritative production path immediately or only after server dogfood succeeds.
- [ ] Dogfood persistence: in-memory OK for `1.0.0-alpha.1` vs durable snapshots from day one.

---

## 12. Doc lifecycle

`ROADMAP.md` is the task and release source of truth; this document records the alternatives and rationale behind that plan. Once the runtime spike locks the platform and the first vertical slice exists, replace the provisional A/B discussion with a durable `docs/multiplayer.md` architecture decision or archive it.

---

## 13. Review notes (planning input)

Consensus from review of the prior “locked DO + ~12h V1” draft:

| Keep | Qualify |
|------|---------|
| Approach B as product V1 | DO is preferred **candidate**, not locked |
| Command contract, seat tokens, protocol/schema versions | Effort hours: use for the **`1.0.0-alpha.1` server-authoritative slice**, not full §8 |
| LiveKit voice-only; optional media | Thin Node is a **peer** fallback, not “raw WS last” |
| `packages/rules` extraction | Dual Netlify + game-host origin is real work |
| Privacy on the wire via `getPlayerView` | Rematch/abandon polish can trail first dogfood |

---

*Proposed multiplayer V1 direction for planning. Implementation not included. Ratify after runtime spike.*
