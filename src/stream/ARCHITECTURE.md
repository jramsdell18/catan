# LiveKit integration architecture

The `stream` directory connects a browser to the current LiveKit table. `LiveKitTableCall.jsx` owns the SDK lifecycle and reports network/media state back to `App.jsx`.

## Current flow

```mermaid
sequenceDiagram
    participant App as App.jsx
    participant Call as LiveKitTableCall
    participant Token as Netlify token function
    participant LK as LiveKit Cloud

    Call->>Token: room + participant metadata
    Token-->>Call: signed access token + server URL
    Call->>LK: connect
    LK-->>Call: participants, speakers, media, data
    Call-->>App: local participant, presence, game messages
    App->>Call: outbound lobby/game message
```

## Responsibilities

- Create or recover the current room identity/invite link (`?room=catan-table-<id>`; the tab that generated it is the host).
- Show the name-only join card; colors are picked afterwards in the lobby (`StartGameOverlay`).
- Request a short-lived token without exposing the LiveKit secret.
- Connect/disconnect the LiveKit `Room` and clean up event handlers/tracks.
- Publish camera and microphone only after the host confirms the local color (`publishMedia`), and subscribe to others' tracks.
- Leave the call when the app signals it (`leaveSignal`, e.g. lobby full).
- Attach subscribed audio and render player video bubbles.
- Map LiveKit participants to game seats using the lobby's seat assignments (legacy token metadata as a fallback). Empty seats render no bubble.
- Publish and decode the current `catan-game` data topic.
- Report connection, participant, and active-speaker state through callbacks.

Display name, participant ID, and hosted-room hints use `localStorage` for refresh convenience. They are not secure authentication credentials.

## Current coupling and planned boundary

Today LiveKit carries both media and host-authoritative game traffic. That makes joining LiveKit a gameplay requirement and means the host browser remains the rules process.

For production V1, gameplay moves to a dedicated server transport. This directory then becomes an optional media adapter: a player can join and finish a game without connecting to LiveKit. Game commands, seat credentials, persistence, and private views must not depend on this component.

Keep LiveKit SDK details here rather than spreading room or media lifecycle code across game controls.
