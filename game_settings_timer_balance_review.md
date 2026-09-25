# Timer Defaults & Room Configuration Review: The Relay

In real-time social deduction games, timer configurations are not just quality-of-life settings; they directly impact game balance, psychological tension, and information leak prevention. Below is an analysis of each phase timer, room setting, and recommended defaults for *The Relay*.

---

### 1. Phase Duration & Timing Side-Channels

#### A. Night Phase (`nightDurationSeconds`)
* **Recommended Default:** `15` to `20` seconds.
* **The "Timing Attack" Problem:** In traditional deduction games, if the server transitions immediately when an action is received, players can deduce who acted based on typing indicators, tab focus, or phase length (e.g., *"The night only lasted 2 seconds, and Player X was the only one with high ping"*).
* **Architectural Rule:** The Night phase must **always run its full duration** regardless of when `night:infect` is received, or when `chainActive === false` (phantom night). This guarantees zero timing side-channels.

#### B. Day Discussion Phase (`dayDurationSeconds`)
* **Recommended Default:** `90` seconds (scalable by player count: e.g., 60s for 5 players, 120s for 8+ players).
* **Rationale:** 90 seconds gives enough room for accusatory rounds, defending alibis, and analyzing voting history without dragging the lobby into fatigue.
* **Host Control:** Allow the room host to select between `60s` (Blitz), `90s` (Standard), and `150s` (Strategic).

#### C. Voting Phase (`votingDurationSeconds`)
* **Recommended Default:** `30` seconds.
* **Early Transition Condition:** Unlike the Night phase, early transition *is desirable* during voting once all living players have submitted a vote (`voteCount === livingPlayerCount`). This keeps match pacing brisk.

#### D. Resolution Phase (`resolutionDurationSeconds`)
* **Recommended Default:** `6` seconds.
* **Rationale:** A brief dramatic pause displaying who was exiled, whether anyone was exiled (tie/skip), and their fate before the lights abruptly drop for the next Night phase.

---

### 2. Disconnection & Reconnect Grace Period

* **Instant Drop vs. Grace Period:** If a player disconnects, immediately killing them can prematurely snap the chain if they happen to be the `latestAlienId` during a brief network stutter.
* **Recommendation:**
  * **Lobby Phase:** Immediate removal and host migration.
  * **Active Game:** Mark player as `isDisconnected = true` and start a `reconnectGracePeriod` of `20` seconds.
  * If the reconnect window expires without the socket re-authenticating, transition their state to `isAlive = false`.
  * If that expired player was `latestAlienId`, sever the chain (`chainActive = false`).

---

### 3. Simulation & Development Acceleration (`FAST_TEST_MODE`)

* When running automated verification scripts (`test-client.js`), waiting 90 seconds for Day and 30 seconds for Voting makes testing tedious.
* **Recommendation:** Implement a configuration flag (`FAST_TEST_MODE = true` or `NODE_ENV === 'test'`) that overrides all timers to `1`–`2` seconds so the full cycle executes in under 10 seconds during test runs.

---

### 4. Summary Configuration Matrix

| Setting | Default Value | Min / Max Range | Configurable by Host? |
| :--- | :--- | :--- | :--- |
| `minPlayers` | `5` | `5` – `12` | Fixed (Hard requirement) |
| `nightDurationSeconds` | `20` | Fixed duration (anti-timing) | Optional (`15s`, `20s`, `30s`) |
| `dayDurationSeconds` | `90` | `45s` – `180s` | Yes |
| `votingDurationSeconds` | `30` | `15s` – `60s` | Yes |
| `resolutionDurationSeconds`| `6` | `4s` – `10s` | No |
| `reconnectGraceSeconds` | `20` | `10s` – `45s` | No |
| `anonymousVoting` | `false` | `true` / `false` | Yes (shows/hides voter identities during tally) |