# Architecture Comparison: Visual Diagrams

## 1. Reference Architecture Flow: Server-Authoritative

```
┌─────────────────────────────────────────────────────────────────┐
│                         THE MIND ONLINE                         │
│                    (Reference Implementation)                    │
└─────────────────────────────────────────────────────────────────┘

                          PYTHON BACKEND
                    ┌──────────────────────┐
                    │  Flask + flask-socketio
                    │  (Port 5000, gevent) │
                    │                      │
                    │  ┌────────────────┐  │
                    │  │  MindControl   │  │ (Global Instance)
                    │  │  (Game Manager)│  │
                    │  └────────────────┘  │
                    │        │             │
                    │        ├─► _lobbies_por_lid: {lid → Lobby}
                    │        ├─► _juegos_por_lid:  {lid → Juego}
                    │        └─► _lobby_de:        {player → lid}
                    │                      │
                    │  ┌────────────────┐  │
                    │  │    Juego       │  │ (Authoritative State)
                    │  │   (One per     │  │
                    │  │    game)       │  │
                    │  └────────────────┘  │
                    │        │             │
                    │        ├─► _jugadores: [str]
                    │        ├─► _mesa: int
                    │        ├─► _nivel: int
                    │        ├─► _vidas: int (starts 3)
                    │        ├─► _cartas_por_jugador: {player → [cards]}
                    │        ├─► _premios_vidas: [3, 6, 9]
                    │        └─► _terminado: bool
                    │                      │
                    │     Validation Logic │
                    │     ┌────────────────┴────────────────┐
                    │     │                                 │
                    │  poner_carta()                 subir_nivel()
                    │  • Player exists?              • Cards depleted?
                    │  • Card in hand?               • +1 life at 3,6,9
                    │  • Game not ended?             • Deal new cards
                    │  • Auto-discard ≤ played card
                    │  • Penalty if >1 discarded
                    │                      │
                    └──────────────────────┘
                            ▲
                            │ Socket.io (WebSocket)
                            │ Port 5000
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    ┌───▼────┐          ┌───▼────┐         ┌───▼────┐
    │ Browser│          │ Browser│         │ Browser│
    │ Client1│          │ Client2│         │ Client3│
    │        │          │        │         │        │
    └────────┘          └────────┘         └────────┘
        React               React              React
        App.js              App.js             App.js
        
        Subscribe to:
        • juego_update (state broadcast)
        • juego_iniciado (game started)
        • juego_terminado (game ended)
        • lobby_update (lobby state)
        
        Emit events:
        • poner_carta {carta}
        • subir_nivel
        • juego_estado (request state)
        • etc.
```

### State Flow Sequence: Card Play

```
Player clicks card 5
    │
    ├─► Emit: poner_carta {carta: 5}
    │       (Socket.io to server)
    │
    ▼
Server receives: on_poner_carta()
    │
    ├─► Lookup: player_name, lobby_name from request.sid
    ├─► Call: themind.colocar_carta(lobby_id, player, 5)
    │       └─► Juego.poner_carta(jugador, 5)
    │           ├─ Check player exists
    │           ├─ Check card in hand: 5 ∈ player.cartas
    │           ├─ Auto-discard cards ≤ 5 from ALL players
    │           ├─ If >1 card discarded: _vidas -= 1
    │           └─ Set _mesa = 5
    │
    ├─ Exception? Send error in 'lobby_update'
    │
    └─► Fetch: themind.estado_juego(lobby_id)
            {
              vidas: 3,
              nivel: 1,
              mesa: 5,
              terminado: false,
              jugadores: ['Alice', 'Bob'],
              cartas_por_jugador: {
                'Alice': [7, 9, 12],  (5 was removed by auto-discard)
                'Bob': [8, 11]         (no cards ≤ 5 in his hand)
              }
            }
    │
    └─► Broadcast: socketio.emit('juego_update', state, room=lobby_id)
            │
            ├─► Client1 receives juego_update → setState() → re-render
            ├─► Client2 receives juego_update → setState() → re-render
            └─► Client3 receives juego_update → setState() → re-render

ALL clients now have consistent state (mesa=5, vidas=3)
```

---

## 2. Your Architecture (Hypothetical): Serverless + Client Coordinator

```
┌─────────────────────────────────────────────────────────────────┐
│              YOUR APP (Serverless + Coordinator)                │
│                    (Hypothetical Model)                         │
└─────────────────────────────────────────────────────────────────┘

                    STATELESS RELAY
                 (itty-sockets on edge)
        ┌──────────────────────────────────┐
        │  Routes messages between clients  │
        │  ✓ No game state                  │
        │  ✓ No validation                  │
        │  ✓ Just relay/broadcast           │
        └──────────────────────────────────┘
                       ▲
                       │ WebSocket
                       │
        ┌──────────────┼──────────────────┐
        │              │                  │
    ┌───▼────┐    ┌────▼────┐        ┌───▼────┐
    │ Browser│    │ Browser │        │ Browser│
    │(Master)│    │(Player) │        │(Player)│
    │ Client1│◄──►│ Client2 │        │ Client3│
    │        │    │         │◄──────►│        │
    └────────┘    └─────────┘        └────────┘
        React         React             React
        
        MASTER/COORDINATOR
        (Client 1)
        • Maintains authoritative game state
          ├─ _jugadores: ['Alice', 'Bob']
          ├─ _mesa: 5
          ├─ _nivel: 1
          ├─ _vidas: 3
          ├─ _cartas_por_jugador: {Alice: [7,9], Bob: [8,11]}
          └─ _premios_vidas: [3,6,9]
        
        • Validates card plays
        • Broadcasts state changes
          └─► via relay to other clients
        
        OTHER PLAYERS
        (Clients 2, 3)
        • Mirror the coordinator's state
        • Send action requests to coordinator
        • Trust coordinator for validation
        • Update on broadcast messages
```

### State Flow Sequence: Card Play (Coordinator Model)

```
Player 2 clicks card 8
    │
    ├─► Emit: poner_carta {player: 'Bob', carta: 8}
    │       (WebSocket to relay)
    │
    ▼
Relay receives (dumb routing)
    │
    ├─► Route to COORDINATOR (Master Client 1)
    │
    ▼
COORDINATOR receives: handleCardPlay()
    │
    ├─► Validate: card 8 in Bob's hand?
    ├─► Validate: game not ended?
    ├─► Apply mechanics: auto-discard cards ≤ 8
    ├─► Check: >1 card discarded? Then _vidas -= 1
    ├─► Update local state: _mesa = 8
    │
    └─► Broadcast new state to OTHER clients
            {
              vidas: 3,
              nivel: 1,
              mesa: 8,
              cartas_por_jugador: {
                'Alice': [9, 12],    (7 was auto-discarded)
                'Bob': [11]          (8 was played, others discarded)
              }
            }
    │
    ├─► Emit: state_update {full_state}
    │       (Via relay to all clients)
    │
    ├─► Client2 receives → setState() → re-render
    └─► Client3 receives → setState() → re-render

COORDINATOR's local state is source of truth
Other clients eventually consistent
```

---

## 3. Side-by-Side: Request Flow Timing

### Reference (Server-Authoritative)

```
Time  Client1              Server             Client2
─────────────────────────────────────────────────────────────────
  0   Click card 5
      │
  1   emit poner_carta ──────►
      │                   Process validation
  2   │                   Update Juego object
      │                   Get full state
  3   │                   emit juego_update ◄──────► Client2
      │                   (broadcast to room)
  4   receive juego_update
      setState()
  5   re-render ✓     (UI shows new state)    receive juego_update
                                              setState()
  6                                           re-render ✓

Latency: ~50-200ms (network + server processing)
Guarantee: Both clients have identical state
```

### Your Model (Coordinator-Based)

```
Time  Client2              Coordinator        Client3
─────────────────────────────────────────────────────────────
  0   Click card 8
      │
  1   emit poner_carta ──────►
      │                   (via relay)
  2   │                   Process validation
      │                   Update local state
  3   │                   
      │                   broadcast state_update
  4   │                        │
      │                        ├─────────────► Client3
      │                        │
  5   ◄──────────────────────────────── (via relay)
  6   receive state_update
      setState()
  7   re-render ✓            (UI shows new state)  receive state_update
                                                  setState()
  8                                               re-render ✓

Latency: ~20-100ms (peer-to-peer communication)
Guarantee: Depends on coordinator broadcast correctness
```

---

## 4. Error Handling Comparison

### Reference (Server-Authoritative)

```
Client sends: {carta: 5}
    │
    ▼
Server processes
    │
    ├─ Card 5 NOT in hand?
    │  └─► Exception caught
    │  └─► No state update broadcast
    │  └─► Client's UI remains unchanged (stale)
    │
    ├─ Game already ended?
    │  └─► Exception caught
    │  └─► No state update broadcast
    │
    └─ SUCCESS: Card 5 is valid
       └─► Update state
       └─► Broadcast juego_update
       └─► All clients see new state

Pattern: Server is gatekeeper
         Client trusts server completely
         Invalid actions silently fail
```

### Your Model (Coordinator)

```
Player sends: {carta: 8}
    │
    ▼
Coordinator processes
    │
    ├─ Card 8 NOT in hand?
    │  └─► Validation fails
    │  └─► Don't broadcast
    │  └─► Send error response back
    │  └─► Other clients unaffected
    │
    ├─ Player cheating (claiming hand they don't have)?
    │  └─► Coordinator detects discrepancy
    │  └─► Invalidate action
    │  └─► Optionally penalize / kick player?
    │
    └─ SUCCESS: Card 8 is valid
       └─► Update coordinator's state
       └─► Broadcast to other clients
       └─► Eventually consistent

Pattern: Coordinator is gatekeeper
         Other clients must trust coordinator
         Malicious coordinator = broken game
         (Need anti-cheat mechanisms)
```

---

## 5. Disconnection Scenarios

### Reference (Server-Authoritative)

```
Player1 still connected
    │
    ▼
Player2 network drops (disconnect event)
    │
    ▼
Server on_disconnect():
    │
    ├─► Remove Player2 from lobby
    ├─► Mark game as terminado=True
    ├─► Emit 'juego_terminado' to all in room
    │
    ▼
Player1 receives 'juego_terminado'
    │
    ├─► Navigate back to LobbyView
    ├─► Can start NEW game
    └─► Old game state is lost

Result: FRAGILE
        One player drop = everyone loses
        No recovery mechanism
```

### Your Model (Coordinator)

```
Coordinator (Master) still active
    │
    ▼
Player2 network drops
    │
    ├─► Player2 can't send/receive
    ├─► Coordinator detects absence
    │
    ├─ Option A: Immediately end game (like reference)
    │
    ├─ Option B: Grace period (30-60 seconds)
    │  └─► Wait for Player2 to reconnect
    │  └─► If reconnects: sync coordinator state
    │  └─► If timeout: then end game
    │
    ▼
Player2 reconnects after 10 seconds
    │
    ├─► Receive sync message from coordinator
    ├─► Restore game state
    └─► Continue playing

Result: MORE RESILIENT
        Players can lose connection temporarily
        Can resume without losing progress
        (If you implement recovery logic)
```

---

## 6. Validation Logic Comparison

### Reference: Server Validates

```python
def poner_carta(self, jugador: str, carta: int):
    # 1. Player exists?
    if jugador not in self._cartas_por_jugador:
        raise JugadorInexistenteException()
    
    # 2. Card in hand?
    if carta not in self._cartas_por_jugador[jugador]:
        raise CartaInexistenteException()
    
    # 3. Game not ended?
    if self.terminado():
        raise JuegoTerminadoException()
    
    # 4. Game logic
    descartadas = self._descartar_toda_carta_no_mayor(carta)
    if len(descartadas) > 1:
        self._vidas -= 1
    
    self._mesa = carta

Server has:
✓ Access to all players' hands (true source)
✓ Can't be cheated (client can't fake hand)
✗ All latency funneled through server
```

### Your Model: Coordinator Validates (Local)

```javascript
coordinator.playCard(player, card) {
    // 1. Player exists?
    if (!this.players.includes(player)) throw new Error(...)
    
    // 2. Card in hand?
    if (!this.hands[player].includes(card)) throw new Error(...)
    
    // 3. Game not ended?
    if (this.gameEnded) throw new Error(...)
    
    // 4. Game logic
    let discarded = this.discardCardsLTE(card)
    if (discarded.length > 1) {
        this.lives--
    }
    
    this.mesa = card
    this.broadcast({vidas, mesa, cartas_por_jugador})
}

Coordinator has:
✓ No latency on validation (local)
✓ No server round-trip needed
✗ Must trust that coordinator is honest
✗ Other players can't verify coordinator logic
```

---

## 7. State Consistency Guarantees

### Reference

```
┌─────────────────────────────┐
│   Server (Juego object)     │
│   SINGLE SOURCE OF TRUTH    │
│                             │
│  mesa: 5                    │
│  vidas: 3                   │
│  cartas: {A:[7,9], B:[11]}  │
└─────────────────────────────┘
         ▲
         │ broadcast
         │
    ┌────┴────┬────────┐
    ▼         ▼        ▼
  Client1   Client2  Client3
  (Cache)   (Cache)  (Cache)
  
  mesa: 5   mesa: 5  mesa: 5
  vidas: 3  vidas: 3 vidas: 3
  
Guarantee: STRONG CONSISTENCY
           All clients eventually have same state
           (within network latency)
```

### Your Model

```
┌─────────────────────────────┐
│   Coordinator Client        │
│   AUTHORITATIVE STATE       │
│                             │
│  mesa: 8                    │
│  vidas: 3                   │
│  cartas: {A:[9,12], B:[11]} │
└─────────────────────────────┘
         ▲
         │ broadcast via relay
         │
    ┌────┴────┬────────┐
    ▼         ▼        ▼
 Coordinator Client1  Client2
  (Master)  (Cache)  (Cache)
  
  mesa: 8   mesa: ?  mesa: ?
  vidas: 3  vidas: ? vidas: ?
  
  (waiting for broadcast)

Guarantee: EVENTUAL CONSISTENCY
           Clients converge to coordinator state
           But divergence can happen briefly
           If coordinator state is wrong, all are wrong
```

---

## 8. Reward Schedule (Both Models)

```
BONUS LIVES AT LEVELS
─────────────────────

Start: 3 lives

Level  Completed
─────  ─────────
  1       ✓        (lives: 3)
  2       ✓        (lives: 3)
  3       ✓        (lives: 3 + 1 = 4)  ← BONUS
  4       ✓        (lives: 4)
  5       ✓        (lives: 4)
  6       ✓        (lives: 4 + 1 = 5)  ← BONUS
  7       ✓        (lives: 5)
  8       ✓        (lives: 5)
  9       ✓        (lives: 5 + 1 = 6)  ← BONUS
 10       ✗  LOSE  (no more life bonuses)

premios_vidas = [3, 6, 9]
Hard-coded, not customizable per game
```

---

## 9. Key Decision Points for Your Architecture

```
Questions to Answer:

1. COORDINATOR MASTER
   Q: Is Client1 always the coordinator?
      A1: Yes, sticky coordinator (fragile if Client1 drops)
      A2: Yes, but migrate coordinator on Client1 drop (complex)
      A3: Coordinator is a separate service (defeats serverless goal)
   
2. STATE SYNC ON RECONNECT
   Q: What happens if Client2 reconnects after 30 seconds?
      A1: Send full coordinator state dump (large bandwidth)
      A2: Send delta since last seen (smaller, but complex)
      A3: Restart game (simple, but frustrating)
   
3. CHEATING PREVENTION
   Q: How do you prevent a player from claiming cards they don't have?
      A1: Coordinator is trusted (social contract)
      A2: Cryptographic commitment (complex, overkill)
      A3: Accept cheating as acceptable (design choice)
   
4. BROADCAST MECHANISM
   Q: Who sends the update, coordinator or relay?
      A1: Coordinator sends update, relay broadcasts (relay is dumb)
      A2: Coordinator sends to relay, relay broadcasts (relay routing logic)
      A3: Coordinator sends to each client individually (no fan-out)
   
5. ERROR RECOVERY
   Q: What if a message is lost?
      A1: Coordinator periodically broadcasts full state (redundancy)
      A2: Clients request missing state on mismatch (reactive)
      A3: Accept eventual convergence (optimistic)
```

---

## 10. Summary Table

| Aspect | Reference | Your Model |
|--------|-----------|-----------|
| **State Location** | Server (Python) | Coordinator Client (JS) |
| **Authority** | Server | Coordinator |
| **Validation** | Server-side | Coordinator-side (local) |
| **Broadcast** | Socket.io rooms | Manual relay routing |
| **Consistency** | Strong | Eventual |
| **Latency** | 50-200ms | 20-100ms |
| **Fragility** | High (1 drop → game over) | Medium (depends on recovery) |
| **Cheating** | Prevented | Trust-based |
| **Scaling** | Limited (in-memory server) | Better (stateless relay) |
| **Complexity** | Low | High |
| **Debugging** | Centralized logs | Distributed across clients |

