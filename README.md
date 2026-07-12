# Catan Multiplayer Starter

Simple React starter for a local multiplayer Catan-style game.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. The first screen asks for the number of players and prints the confirmed player count into the game setup space.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates a production build in `dist/`.
- `npm run preview` serves the production build locally.

## Project layout

```text
src/
  components/
    BoardPreview.jsx
    PlayerSetup.jsx
  App.jsx
  main.jsx
  styles.css
```

The UI is mobile-first so it has a reasonable starting point for small screens before adding more game features.
