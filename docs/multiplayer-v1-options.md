# Multiplayer v1 options (temporary design note)

**Status:** temporary working document for product/architecture discussion.  
**Branch:** `docs/multiplayer-v1-options`  
**Not** a commitment to ship either path as written; capture A vs B so we can choose deliberately.

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
| **Fly.io / Railway / Render / a small VPS** | Good default | One Node process: HTTP + WebSocket, in-memory rooms for v1 |
| **LiveKit + separate WS on same VPS** | Good | Colocate for low latency; still two protocols |
| **Cloudflare Durable Objects / PartyKit-style** | Possible | Strong for rooms + WS; different programming model |
| **Netlify Functions + Redis/Upstash + something for WS** | Awkward | Need a realtime edge (e.g. Ably, Pusher, Cloudflare) in addition to functions |
| **Self-host everything** | Max control | Game Node + LiveKit server on one box; ops burden |

**Recommended default for this project (B):**

```text
  Netlify          →  static frontend + livekit-token function
  Fly/Railway/etc. →  `catan-game` Node service (WS + REST rooms)
  LiveKit Cloud    →  voice/video only (existing account)
```

Share rules code by importing `src/rules` from the same monorepo (build step that bundles rules for the server) or a tiny internal package.

**v1 persistence:** in-memory rooms are enough for dogfood; lose rooms on deploy. M13 (Redis/SQLite) when you care about reconnect across deploys.

---

## 6. Would a server bring additional costs?

### Cost stack comparison (order-of-magnitude, USD, hobby/friends scale)

Exact prices change; treat this as **relative**, not a quote.

| Cost center | Approach A (host auth) | Approach B (game server) |
|-------------|------------------------|---------------------------|
| **Static hosting (Netlify free/pro)** | Already have | Same |
| **LiveKit Cloud** | Already need for voice; **also** carries game data volume | Still need for voice if you keep A/V; **less** data-channel traffic |
| **Game compute** | $0 (host’s device) | Small always-on or scale-to-zero instance: often **~$0–15/mo** hobby; more if always-on multi-region |
| **Managed realtime (if used)** | $0 if LiveKit data only | $0 if self WS on VPS; or Ably/etc. if chosen |
| **Database** | $0 for v1 | $0 in-memory v1; later Redis ~few $/mo |
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
- **B:** adds a **small** always-on or hobby game instance cost; total infra is still dominated by **video** if everyone enables cameras—not by Catan state sync.
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

## 8. Suggested decision framing

Ask:

1. Is v1 **friends-only with a trusted host**, or **anyone at a URL with real privacy**?
2. Is **“host must keep the tab open”** acceptable product copy?
3. Do we want LiveKit failure to **block the board**?
4. Are we willing to run **one small Node service** for 12+ months?

**Heuristic:**

- Need playable tables **this sprint** with friends who trust each other → **A + privacy fix + join codes**, mark as interim.
- Need a **first public “real” release** → **B**, LiveKit voice optional/sidecar, Netlify static + small game host.

Hybrid (valid): ship A for dogfood, design client command API so swapping host for server is a transport change, not a UI rewrite.

---

## 9. Open questions (fill when choosing)

- [ ] A, B, or A-then-B?
- [ ] Voice required vs optional at join?
- [ ] Join code format (e.g. 6 chars) and link shape (`?room=K7M2`)?
- [ ] Game host provider preference (Fly / Railway / other)?
- [ ] In-memory only for v1, or Redis from day one?
- [ ] Spectator seats in v1?
- [ ] Host transfer in A, or only “room closed”?

---

## 10. Doc lifecycle

This file is **temporary**. When a path is chosen:

1. Fold the decision into a short durable note (e.g. `docs/multiplayer.md`) or TODO M11 preamble.
2. Delete or archive this options doc so it doesn’t fork the roadmap.

---

*Generated for discussion on branch `docs/multiplayer-v1-options`. Implementation not included.*
