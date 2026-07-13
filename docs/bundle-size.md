# Production bundle size

The local client currently ships Three.js for the interactive board and LiveKit for table audio/video. The July 2026 production build is approximately 1.33 MB of minified JavaScript (about 359 KB gzip), plus board texture assets.

This is an accepted pre-multiplayer tradeoff: both runtimes are part of the primary table experience, and eager loading avoids interaction delays during local play. Vite's warning threshold is set to 1.4 MB to reflect the measured budget rather than hiding unexpected growth.

Before the hosted multiplayer release, revisit route-level lazy loading for table calling, modern texture formats, and explicit vendor chunks. Treat a main JavaScript increase beyond the configured budget as a build warning requiring review.
