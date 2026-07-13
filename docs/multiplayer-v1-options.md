# Multiplayer V1 architecture decision

**Status:** recommended multiplayer V1 direction, with alternatives retained for context.
**Branch:** `docs/multiplayer-v1-options`  
**Decision:** build a server-authoritative V1 using one Cloudflare Durable Object per game room. Keep the existing host-authoritative path only as a local/dogfood transport while the server path is built. Colyseus is the fallback if a conventional Node runtime is preferred.

**Related roadmap:** TODO milestones M11–M13 (server foundation, realtime private state, ops).  
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

- Matches TODO M11–M12 and the M8 privacy contract on the **wire**.
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
| **Fly.io / Railway / Render / a small VPS** | Good conventional option | Prefer Colyseus over hand-rolling room lifecycle, reconnection, and state synchronization |
| **LiveKit + separate WS on same VPS** | Good | Colocate for low latency; still two protocols |
| **Cloudflare Durable Objects** | **Preferred for V1** | One authoritative object per room; serialized commands, WebSockets, and durable active-game storage |
| **Netlify Functions + Redis/Upstash + something for WS** | Awkward | Need a realtime edge (e.g. Ably, Pusher, Cloudflare) in addition to functions |
| **Self-host everything** | Max control | Game Node + LiveKit server on one box; ops burden |

**Recommended default for this project (B):**

```text
  Netlify             →  static frontend + livekit-token function
  Cloudflare Worker   →  create/join HTTP endpoints + WebSocket upgrade
  Durable Object      →  one authoritative `catan-game` room + active-game storage
  LiveKit Cloud       →  optional voice/video only (existing account)
```

Move the pure engine into a small internal workspace package (for example, `packages/rules`) imported by both the web client and room server. Do not make the server depend directly on browser-oriented source layout.

**V1 persistence:** persist the active room snapshot after every accepted command. A deploy or process restart must not destroy a game in progress. Completed-game history, analytics, and replay storage can remain M13/future work.

---

## 6. Would a server bring additional costs?

### Cost stack comparison (order-of-magnitude, USD, hobby/friends scale)

Exact prices change; treat this as **relative**, not a quote.

| Cost center | Approach A (host auth) | Approach B (game server) |
|-------------|------------------------|---------------------------|
| **Static hosting (Netlify free/pro)** | Already have | Same |
| **LiveKit Cloud** | Already need for voice; **also** carries game data volume | Still need for voice if you keep A/V; **less** data-channel traffic |
| **Game compute** | $0 (host’s device) | Scale-to-zero Durable Objects for the preferred path; a small always-on instance for conventional Node |
| **Managed realtime (if used)** | $0 if LiveKit data only | $0 if self WS on VPS; or Ably/etc. if chosen |
| **Database** | $0 for v1 | Durable Object storage for active games; a separate history/analytics database can wait |
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
| Aligns with M11–12 | Partial / temporary | Yes |
| Speed to dogfood | Faster | Slower, sturdier |

---

## 8. V1 decision and architecture

Build **Approach B** for the product V1:

- One Cloudflare Durable Object is the authoritative owner of each game room.
- The object owns seats, full engine state, RNG, command ordering, versions, and active-game persistence.
- Clients submit commands and receive only their seat-scoped `getPlayerView` plus explicitly public events.
- Joining and playing the game does not require joining LiveKit. Voice/video is an optional sidecar using the same room code.
- The current host-authoritative LiveKit path may remain temporarily for local development and trusted dogfood, but is not a public release target.
- If the Workers runtime proves incompatible with the rules package or team preferences, use Colyseus on a conventional Node host. A raw WebSocket service is the last choice because it requires the most custom lifecycle and recovery code.

### V1 system shape

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
  └── durable active-game snapshot
```

### Required command contract

Each command carries at least `roomId`, `commandId`, `expectedVersion`, a server-issued seat/session credential, and the rules action. The server acknowledges or rejects every command with its authoritative version. Duplicate command IDs must return the prior result without applying the action twice.

`getPlayerView` is the privacy boundary, but the wire protocol remains an explicit, validated schema rather than an arbitrary serialized engine object.

### Identity and reconnect

The current local-storage participant ID is a UI convenience, not authentication. On join, the server issues an opaque, unguessable reconnect/seat token. It authorizes reclaiming that seat, submitting commands for it, receiving its private view, and requesting appropriately scoped optional-media access. Full user accounts are not required for V1.

### V1 product scope

- Three or four guests create or join a room using a human-friendly code/link.
- Players claim seats/colors, ready up, and complete the existing full game.
- Refreshing or briefly disconnecting restores the player's seat and current private view.
- Host departure does not stop the game; host is a lobby role, not the rules process.
- Active games survive a service deployment/restart.
- Voice/video is optional.
- Explicit leave/abandon and rematch behavior is supported.
- Multi-client tests prove stale, duplicate, unauthorized, and out-of-turn commands are rejected and hidden state never leaks.

Accounts, public matchmaking, spectators, bots, completed-game history, and replay UI are not V1 requirements.

---

## 9. Effort relative to the existing project

Treat all application, engine, UI, and test work currently completed as a **100% baseline**. Estimated additional work:

| Path | Additional work | Resulting project size |
|------|----------------:|-----------------------:|
| Harden current host/LiveKit path | 10–15% | 110–115% |
| **Cloudflare authoritative V1** | **30–40%** | **130–140%** |
| Colyseus authoritative V1 | 35–45% | 135–145% |
| Custom Node + raw WebSockets | 45–60% | 145–160% |

The Cloudflare path is approximately one-third as much work as everything completed so far. Based on this repository's demonstrated AI-assisted pace—not traditional solo-engineer estimates—the working expectation is roughly **8–15 focused hours**, with about **12 hours** as the planning target. External deployment configuration and multi-browser synchronization debugging create more uncertainty than ordinary local feature work.

Approximate Cloudflare phases:

| Phase | Relative work |
|-------|--------------:|
| First complete server-backed game | 15–20% |
| Reconnect, persistence, privacy, and multi-client tests | 10–15% |
| Deployment verification and production cleanup | 5–10% |

These are planning estimates, not delivery guarantees. Re-estimate after the first vertical slice proves the shared rules package runs correctly inside a Durable Object.

---

## 10. Versioning strategy

Use **lightweight Semantic Versioning for product releases**, while versioning the network and stored state independently.

### Application releases

- Keep one app version for the web client and game service; do not independently version every internal package.
- Use `0.x.y` while multiplayer contracts and UX are changing rapidly.
- Increment the minor version for a meaningful playable release and patch for compatible fixes.
- Tag releases in Git (for example, `v0.1.0`) and expose the version plus Git commit SHA in diagnostics/server logs.
- Declare `1.0.0` when the public full-game experience, reconnect behavior, privacy guarantees, and operational expectations are considered stable.

Suggested progression:

| Version | Meaning |
|---------|---------|
| `0.1.0` | First end-to-end server-authoritative dogfood game |
| `0.2.0` | Reconnect, persistence, private-state tests, and optional media complete |
| `0.3.0` | Hosted multiplayer beta with operational hardening |
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

- [ ] Confirm Cloudflare Durable Objects after a short rules-package/runtime spike.
- [ ] Choose the room code format and link shape (for example, `?room=K7M2`).
- [ ] Choose reconnect grace and abandoned-game expiration periods.
- [ ] Define rematch ownership and readiness behavior.
- [ ] Decide whether to remove the host-authoritative production path immediately or after server dogfood succeeds.

---

## 12. Doc lifecycle

Once implementation begins, fold this recommendation into a durable `docs/multiplayer.md` architecture and the M11–M13 acceptance criteria. Archive or remove obsolete A/B discussion after the server-backed vertical slice is proven so the roadmap has one source of truth.

---

*Updated from the original A/B discussion into the recommended multiplayer V1 direction. Implementation not included.*
