# CineSync Club Plus — Watch Together, Anywhere 🎬

A dark, cinematic, real-time watch-party web app built as a club selection project. The focus is not just a video player: it gives a group a shared room, a common playback timeline, live conversation, crowd reactions, queue-building, and polls.

## Features

- **Room codes + invite links:** create a private room and share its code or URL.
- **Synchronized YouTube playback:** the host controls the shared playback state; late joiners are cued to the room's current position.
- **Drift correction:** guests compare local time with the host's broadcast and seek when drift is over 300 ms, aiming to bring corrected drift below 500 ms.
- **Live chat + system messages:** messages update instantly through Socket.IO.
- **Live emoji reactions:** reactions float over the video area.
- **Shared playlist:** curated suggestions, typo-tolerant search, genre filters, custom YouTube videos, and host-controlled playback.
- **Room polls + prediction polls:** launch group votes, see live counts/percentages, and use a one-click movie-ending prediction poll.
- **Host transfer:** the room host can hand over playback control.
- **Diagnostics:** live sync-health dashboard with measured client/server round-trip ping, observed playback drift, connection state, participant count, and a recent-ping sparkline. A `/health` endpoint is also included.
- **Room-aware movie matchmaker:** choose a mood and genre; recommendations are scored from the room's submitted preferences and shared votes. It is a transparent rules-based recommender, not an external AI service, and needs no API key.
- **Popcorn Trivia:** host-led rounds, server-validated answers, per-user scoring, and a live top-three leaderboard.
- **Responsive interface:** laptop and mobile layouts.

## Run it locally

You need Node.js 18+ and npm.

```bash
cd cinesync-watch-party
npm install
npm start
```

Open **http://localhost:3000**. Create a room, then open the invite URL in a second browser or incognito window and join with a different nickname to demonstrate multi-user behavior. For a local multi-user test, both windows should use the same room code. To test on separate devices on the same Wi-Fi, use the host computer's local IP and port `3000` (firewall permitting).

## Deploy (quick route)

This app needs a persistent Node server because Socket.IO handles the real-time events; GitHub Pages alone cannot host the backend. Push the project to GitHub, then deploy the repository as a **Node web service** on a host that supports WebSockets (for example, Render or Railway). Set the start command to `npm start`. If the platform assigns `PORT`, the server already reads it.

## Demo script (90–120 seconds)

1. Create a room and show its room code/invite button.
2. Open the invite in another browser, join with a different nickname, and switch to the **People** tab.
3. From the host, start playback or pause/seek. Explain that the host's state is broadcast over Socket.IO and guests correct drift when it exceeds 650 ms.
4. Send a message and tap a reaction to show live updates.
5. Add a recommendation to the playlist, then play a queued video as host.
6. Set different moods/genres in the Matchmaker from each browser; cast room votes and watch recommendations rerank.
7. Start Popcorn Trivia as host, answer from the guest, and show score updates.
8. Launch the prediction poll, vote from each browser, and show live results.
9. Show the live sync-health panel, then transfer the host role to the second participant.
10. Open `/health` to show that the server is running.

## Engineering notes and honest limitations

- This is a functional **MVP/demo build**, not a production media platform. YouTube embedding permissions vary by video, and some videos may refuse to play when embedded; use public, embeddable trailers for the demo.
- The health panel measures this browser's client/server round-trip ping and its observed local-player drift against the latest room timeline. The requested `≤250 ms p95` playback-control propagation and `≤500 ms` corrected drift should still be measured in real multi-device testing; the panel is diagnostic, not proof of a benchmark.
- The guest corrects when observed drift exceeds 300 ms, aiming for the requested `≤500 ms` post-correction range. Verify actual post-correction drift with multiple real browsers before claiming the benchmark as proven.
- Rooms are in-memory for this demo. Restarting the server clears them. A production version should add persistence, authentication/rate limiting, stronger room authorization, moderation, telemetry, and a distributed adapter if horizontally scaled.
- No credentials or API keys are needed. The embedded player loads the official YouTube IFrame API.

## Architecture

```text
Browser UI (HTML/CSS/JS)
        │
        ├── YouTube IFrame API  ← local playback / seeking
        │
        └── Socket.IO events
              │
          Node.js + Express
              │
       In-memory room state
       ├── host + participants
       ├── media timeline + sync
       ├── chat + reactions
       ├── shared playlist
       ├── polls + prediction votes
       ├── room preferences + match votes
       └── trivia rounds + scores
```

## Key events

| Event | Purpose |
|---|---|
| `room:join` | Join/create a room and receive current state |
| `room:state` | Broadcast people, queue, poll, and room state |
| `media:update` / `media:sync` | Broadcast host playback timeline and playing state |
| `chat:send` / `chat:new` | Live room chat |
| `reaction:send` / `reaction:new` | Live emoji reactions |
| `playlist:add` / `playlist:play` | Queue a video and let host start it |
| `poll:create` / `poll:vote` | Run a live poll or ending prediction |
| `matchmaker:preference` / `matchmaker:vote` | Share mood/genre preferences and vote for room recommendations |
| `trivia:start` / `trivia:next` / `trivia:answer` | Host rounds, validate answers and update scores |
| `host:transfer` | Hand over control |
| `latency:ping` | Measure client/server round-trip time |

## Before submitting

- Run through the demo script once.
- Test 2–3 browsers and record the observed ping/drift values.
- Replace the demo video list with videos that are confirmed embeddable.
- Add your own team/name to the footer or README if your club asks for attribution.
