# The Alien Relay client

The Vite/React client connects to the authoritative Socket.IO server. By default it expects that server at `http://localhost:3000`. The client build requires Node.js 20.19+ (or 22.12+); the backend's existing Node.js requirement remains unchanged.

## Run locally

1. In the repository root, start the backend with `npm run dev` (or `npm start`).
2. In a second terminal, run `cd client`, `npm install`, then `npm run dev`.
3. Open the local Vite address printed in that terminal, usually `http://localhost:5173`.
4. To use a different backend, set `VITE_SERVER_URL` in `client/.env.local`, for example `VITE_SERVER_URL=http://localhost:3000`, then restart Vite. Set it to an empty value when the client and Socket.IO server share the same origin.

## Verify live synchronization

Open the client in five browser sessions (regular and private windows work) or across five devices. Create a room in one session, enter its four-character code in the other four, and confirm the room roster updates in every window. The host can start once all five players have joined. Observe the synchronized phase, countdown, and announcements as the match moves through Night, Day, Voting, and Resolution. During an active game, refresh one connected session to confirm that its `sessionStorage` token reconnects the same player and receives a fresh personalized state snapshot.

The session token and room code are held in `sessionStorage`, so they persist across refreshes in the same tab and clear when that tab's browsing session ends. The backend remains authoritative for roles, phase timing, votes, and game outcomes.
