# Project Specification: The Relay (Social Deduction Game)

## 1. Executive Summary & Core Concept

**The Relay** is a real-time multiplayer social deduction web game for 5–12 players. Unlike traditional hidden-role games (*Mafia*, *Among Us*) where the evil team shares complete information and operates collectively, *The Relay* models the antagonist faction as an **asymmetric, unidirectional linked list (Relay Chain)**.

### The Lore & Theme
A crew of humans is operating an isolated outpost. An alien organism has infiltrated the habitat. The humans seek to identify and exile all alien infiltrators to Mars via unanimous or majority vote. The aliens win by equalizing or outnumbering the human crew, or by converting the entire base.

---

## 2. Core Game Rules & Mechanics

### 2.1 Factions and Roles
* **Humans:** Uninformed majority. Humans do not know anyone's role and must deduce identities through speech, behavior, voting patterns, and infection timelines.
* **Aliens:** Informed minority—**with strictly limited horizon:**
  * **The Patient Zero (Alpha Alien):** One player randomly chosen at the start of Round 1.
  * **Relayed Aliens:** Converted humans.

### 2.2 The Relay Chain (The Unidirectional Linked List)
The infection mechanism follows a strict relay rule: $A \to B \to C \to D$.
1. **The Tip of the Spear:** In any given Night phase, **only the most recently infected alien** (`latestAlienId`) has the ability and duty to infect a new player.
2. **Asymmetric Knowledge (One-Way Vision):**
   * An infector ($A$) knows the exact identity of the player they personally infected ($B$).
   * The victim ($B$) is informed that they are now an Alien, but **they do not know who infected them**.
   * $B$ only discovers who they infect next ($C$).
   * $A$ does not automatically learn who $B$ chooses to infect ($C$).
3. **Chain Breaking Condition 1: The Collision Rule**
   * If the active infector attempts to infect a player who is **already an Alien**, the infection fails.
   * **Consequence:** The Relay Chain snaps permanently (`chainActive = false`). The aliens lose all future infection abilities for the remainder of the game. Aliens must now survive purely through deception and voting manipulation.
4. **Chain Breaking Condition 2: Elimination of the Spear Tip**
   * If the humans vote out the player who is currently the `latestAlienId`, the infection sequence is severed.
   * **Consequence:** The chain breaks permanently (`chainActive = false`). Previous aliens cannot inherit or reactivate the infection capability.

### 2.3 Win / Loss Conditions
* **Human Victory:** All Aliens are eliminated (voted out / exiled to Mars).
* **Alien Victory:** 
  * Total Living Aliens $\ge$ Total Living Humans (Parity/Majority), OR
  * Every living player in the match has been infected.

---

## 3. Technology Stack & System Architecture

### 3.1 Stack Selection
* **Backend:** Node.js + Express + `Socket.io`
  * *Rationale:* Event-driven architecture, native support for socket rooms, automatic reconnects, and lightweight in-memory state tracking.
* **Frontend:** React (Bootstrapped via Vite) + Tailwind CSS + Lucide React
  * *Rationale:* Single-Page Application (SPA) eliminating SSR hydration mismatches with persistent WebSockets. Client-side state reflects server events instantaneously.
* **State Management:** Authoritative Server Model.
  * All state transitions, timers, role assignments, and resolution calculations run exclusively on the Node.js server.
  * Clients receive a **sanitized, perspective-specific projection** of the game state to prevent client-side memory inspection / packet-sniffing exploits.

### 3.2 System Architecture Diagram
```
+-------------------------------------------------------+
|                 Node.js Game Engine                   |
|                                                       |
|  +--------------------+      +---------------------+  |
|  |   Room Manager     | <--> |   Finite State      |  |
|  | (In-Memory Rooms)  |      |   Machine (FSM)     |  |
|  +--------------------+      +---------------------+  |
|            ^                            |             |
|            | Socket.io Events           | Broadcast   |
|            v                            v             |
|  +-------------------------------------------------+  |
|  |     Data Sanitizer / Perspective Filter         |  |
|  +-------------------------------------------------+  |
+---------------------------+---------------------------+
                            |
           WebSocket Transports (JSON Payloads)
                            |
            +---------------+---------------+
            v                               v
+-----------------------+       +-----------------------+
|  Vite React Client A  |       |  Vite React Client B  |
| (Human: Redacted View)|       | (Alien: Tail Target)  |
+-----------------------+       +-----------------------+
```

---

## 4. Authoritative State Machine & Data Models

### 4.1 Game Phases (FSM)
1. `LOBBY`: Players join using a 4-letter room code. Host can customize turn timers and start game (min 5 players).
2. `NIGHT`: Base goes dark.
   * Only `latestAlienId` has active interactive UI controls to select an infection target.
   * All other players see a waiting screen with ambient tension.
   * If `chainActive === false`, Night phase completes a brief dummy countdown (5s) to avoid revealing the chain is broken.
3. `DAY`: Habitat lights turn on.
   * Server announces whether a new infection succeeded (or silently increments alien count, without revealing who was infected).
   * Open discussion period with a real-time countdown timer.
4. `VOTING`: Players cast a vote for one suspect or choose to `SKIP`.
   * Real-time indicators of who has voted (without revealing the target until voting closes).
5. `RESOLUTION`: Votes are tallied.
   * Player with plurality (and exceeding skips) is exiled.
   * Server checks if the exiled player was the `latestAlienId` (triggering chain break if true).
   * Server evaluates Win/Loss conditions.
   * If no end condition is met, cycles back to `NIGHT`.
6. `GAME_OVER`: Final screen revealing all roles, the full infection chain timeline, and match statistics.

### 4.2 TypeScript Data Schemas

```typescript
export type GamePhase = 
  | 'LOBBY' 
  | 'NIGHT' 
  | 'DAY' 
  | 'VOTING' 
  | 'RESOLUTION' 
  | 'GAME_OVER';

export type Role = 'HUMAN' | 'ALIEN';

export interface Player {
  id: string;               // Socket ID or persistent session ID
  name: string;
  isHost: boolean;
  isAlive: boolean;
  role: Role;               // Kept secret on server
  infectedTargetId: string | null; // The exact player this alien infected
  votedFor: string | null;  // Player ID voted for or 'SKIP'
}

export interface GameRoom {
  roomId: string;
  phase: GamePhase;
  roundNumber: number;
  timer: number;
  chainActive: boolean;
  alphaAlienId: string | null;
  latestAlienId: string | null;
  players: Record<string, Player>;
  lastExiledPlayerId: string | null;
  winner: 'HUMANS' | 'ALIENS' | null;
  settings: {
    minPlayers: number;
    maxPlayers: number;
    nightDurationSeconds: number;
    dayDurationSeconds: number;
    votingDurationSeconds: number;
    resolutionDurationSeconds: number;
    reconnectGraceSeconds: number;
  };
}

// Client-Sanitized State Payload
export interface PublicPlayerView {
  id: string;
  name: string;
  isHost: boolean;
  isAlive: boolean;
  isDisconnected: boolean;
  hasVoted: boolean;        // In voting phase: true/false
}

export interface ClientGameState {
  roomId: string;
  phase: GamePhase;
  roundNumber: number;
  timer: number;
  settings: GameRoom['settings'];
  players: PublicPlayerView[];
  myPlayerId: string;
  myRole: Role;
  myInfectedTarget: { id: string; name: string } | null; // Only populated for Aliens who infected someone
  canInfectTonight: boolean;  // True ONLY if player === latestAlienId && chainActive && phase === 'NIGHT'
  hasSubmittedInfection: boolean; // Personal flag for the active relay tip only
  lastExiled: { id: string; name: string; role: Role; voteCount: number } | null; // Revealed on exile; aggregate only
  winner: 'HUMANS' | 'ALIENS' | null;
}
```

---

## 5. Network Protocol & Event Matrix

### 5.1 Client to Server (`socket.on`)
| Event Name | Payload | Precondition | Description |
| :--- | :--- | :--- | :--- |
| `room:create` | `{ playerName: string }` | None | Initializes a new room; sender becomes host. |
| `room:join` | `{ roomId: string, playerName: string }` | Room exists & Phase is `LOBBY` | Connects player to the lobby. |
| `room:update_settings` | `{ settings: Partial<RoomSettings> }` | Host & Phase is `LOBBY` | Updates the night, day, and voting durations. |
| `game:start` | None | Sender is host & count $\ge$ 5 | Chooses Alpha Alien, sets round 1, begins `NIGHT`. |
| `night:infect` | `{ targetPlayerId: string }` | Phase is `NIGHT` & sender is `latestAlienId` | Submits infection choice. |
| `vote:cast` | `{ targetPlayerId: string \| 'SKIP' }` | Phase is `VOTING` & sender is alive | Registers sender's vote. |

### 5.2 Server to Client (`socket.emit` / `io.to().emit`)
| Event Name | Target | Payload | Description |
| :--- | :--- | :--- | :--- |
| `game:state_sync` | Individual Socket | `ClientGameState` | Fully sanitized perspective update. Dispatched on any phase change or state delta. |
| `room:error` | Individual Socket | `{ message: string }` | Displays error toast/modal (e.g., "Room full", "Invalid action"). |
| `game:announcement` | Room Broadcast | `{ text: string, type: 'info' \| 'alert' }` | Narrative events (e.g., "Dawn breaks over the base..."). |

---

## 6. Critical Edge Cases & Implementation Guardrails

### 6.1 Strict Anti-Cheat & Fog of War
* **Zero Role Leaks:** The backend must NEVER broadcast the full `players` map containing `role` properties. Every state emission must pass through `sanitizeStateForPlayer(room, socketId)`.
* **No Night Timing Side-Channels:** If the Relay Chain is broken (`chainActive === false`), the server must still run a simulated Night timer so humans cannot deduce that the aliens have lost their infection power based on instantaneous Night-to-Day transitions.

### 6.2 Disconnections & Timeouts
* **Latest Alien Inactivity:** If the `latestAlienId` fails to select a target before the Night timer expires, the night ends with zero infections. The chain remains active with that same player as the tip for the following night.
* **Host Migration:** If the room host disconnects, the server automatically promotes the next oldest connected player.
* **Disconnection during match:** If a player disconnects, their status changes to dead/disconnected. If the disconnected player was `latestAlienId`, the chain breaks.

### 6.3 Voting Tie Resolution
* If the highest vote count is tied between two or more players, or if `SKIP` ties/exceeds the highest player vote, **no one is exiled**. The game proceeds directly to the next Night phase.
