(() => {
  const $ = id => document.getElementById(id);
  const socket = io({ transports: ['websocket', 'polling'] });
  const colors = ['#f2a65a', '#91c7b1', '#b4a7ff', '#ff8d9d', '#85bdf2', '#e6cf6a'];
  const catalog = [
    { title: 'Interstellar', subtitle: 'The impossible journey', videoId: 'zSWdZVtXT7E', genre: 'Sci-Fi', year: '2014', length: '2h 49m', description: 'A journey beyond the stars.', mark: 'I' },
    { title: 'Spider-Man: Across the Spider-Verse', subtitle: 'Miles goes beyond', videoId: 'shW9i6k8cB0', genre: 'Animation', year: '2023', length: '2h 20m', description: 'Leap into a whole new dimension.', mark: 'SP' },
    { title: 'Dune: Part Two', subtitle: 'Destiny is written in sand', videoId: 'Way9eso7i8g', genre: 'Sci-Fi', year: '2024', length: '2h 46m', description: 'The desert has a destiny.', mark: 'D' },
    { title: 'The Shawshank Redemption', subtitle: 'Hope can set you free', videoId: 'NmzuHjWmXOc', genre: 'Drama', year: '1994', length: '2h 22m', description: 'A little hope goes a long way.', mark: 'SR' },
    { title: 'Everything Everywhere All at Once', subtitle: 'Nothing makes sense. All at once.', videoId: 'wxN1T1uxQ2g', genre: 'Drama', year: '2022', length: '2h 19m', description: 'One family. Infinite possibilities.', mark: 'EE' },
    { title: 'The Mitchells vs. the Machines', subtitle: 'Family is a little glitchy', videoId: '_ak5dFt8Ar0', genre: 'Animation', year: '2021', length: '1h 54m', description: 'The weirdest family saves the world.', mark: 'MV' }
  ];
  const moodTags = {
    'zSWdZVtXT7E': ['Mind-bending', 'Emotional', 'Adventurous'],
    'shW9i6k8cB0': ['Adventurous', 'Funny', 'Feel-good'],
    'Way9eso7i8g': ['Intense', 'Adventurous', 'Mind-bending'],
    'NmzuHjWmXOc': ['Emotional', 'Inspiring', 'Cozy'],
    'wxN1T1uxQ2g': ['Mind-bending', 'Funny', 'Emotional'],
    '_ak5dFt8Ar0': ['Funny', 'Feel-good', 'Adventurous', 'Cozy']
  };
  let joined = false;
  let myId = null;
  let myName = 'Guest';
  let state = null;
  let player = null;
  let ytApiReady = false;
  let playerReady = false;
  let activeGenre = 'All';
  let activeTab = 'chat';
  let lastMediaId = '';
  let lastChatCount = 0;
  let lastRenderedMessageIds = new Set();
  let toastTimer = null;
  let lastPingAt = 0;
  let pingValue = null;
  let driftValue = null;
  let pingHistory = [];
  let latencyIntervals = [];
  let triviaFeedback = null;
  let lastHostSyncAt = 0;
  let pendingMedia = null;
  let playerApplyingRemote = false;
  let lastRemotePlayState = null;

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }
  function initials(name) { return (String(name || 'G').trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2) || 'G').toUpperCase(); }
  function isHost() { return !!state && state.hostId === myId; }
  function formatTime(timestamp) {
    const date = new Date(timestamp || Date.now());
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function videoIdFromInput(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/i);
    if (match) return match[1];
    return /^[\w-]{11}$/.test(raw) ? raw : '';
  }
  function roomLink() { return `${location.origin}${location.pathname}?room=${encodeURIComponent(state?.code || '')}`; }

  function enterParty(name, roomCode) {
    myName = name.trim().slice(0, 24) || 'Guest';
    $('lobbyError').textContent = '';
    socket.emit('room:join', { name: myName, roomCode }, result => {
      if (!result?.ok) {
        $('lobbyError').textContent = result?.error || 'Could not enter that room. Try again.';
        return;
      }
      joined = true;
      myId = result.socketId;
      state = result.state;
      pingValue = null;
      driftValue = null;
      pingHistory = [];
      triviaFeedback = null;
      lastHostSyncAt = 0;
      $('lobby').classList.add('hidden');
      $('party').classList.remove('hidden');
      $('myAvatar').textContent = initials(myName);
      $('myAvatar').style.background = colors[(myName.charCodeAt(0) || 0) % colors.length];
      document.title = `CineSync · ${state.code}`;
      renderAll();
      if (ytApiReady) createPlayer();
      else showToast('Room ready — warming up the projector…');
      startLatencyProbe();
      history.replaceState({}, '', `${location.pathname}?room=${encodeURIComponent(state.code)}`);
    });
  }
  function createRoomCode() { return Math.random().toString(36).slice(2, 7).toUpperCase(); }

  $('createRoom').addEventListener('click', () => enterParty($('guestName').value, createRoomCode()));
  $('joinRoom').addEventListener('click', () => {
    const code = $('roomCode').value.trim().toUpperCase();
    if (!code) { $('lobbyError').textContent = 'Enter the room code your friend shared.'; $('roomCode').focus(); return; }
    enterParty($('guestName').value, code);
  });
  $('guestName').addEventListener('keydown', e => { if (e.key === 'Enter') $('createRoom').click(); });
  $('roomCode').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^a-z0-9]/ig, '').toUpperCase(); });
  const queryParams = new URLSearchParams(location.search);
  if (queryParams.get('room')) $('roomCode').value = queryParams.get('room').slice(0, 8).toUpperCase();

  window.onYouTubeIframeAPIReady = function () {
    ytApiReady = true;
    if (joined && !player) createPlayer();
  };

  function createPlayer() {
    if (player || !ytApiReady || !$('ytPlayer')) return;
    player = new YT.Player('ytPlayer', {
      width: '100%', height: '100%', videoId: state?.media?.videoId || catalog[0].videoId,
      playerVars: { autoplay: 0, controls: 1, rel: 0, modestbranding: 1, playsinline: 1, origin: location.origin },
      events: {
        onReady: () => {
          playerReady = true;
          $('playerFallback').classList.add('is-hidden');
          $('playPause').disabled = false;
          $('syncStatus').textContent = 'SYNC ENGINE ONLINE';
          pendingMedia = state?.media || pendingMedia;
          if (pendingMedia) applyRemoteMedia(pendingMedia, true);
          renderAll();
          showToast(isHost() ? 'You’re the host. You have the remote.' : 'You’re in. Grab some popcorn.');
        },
        onStateChange: event => {
          if (!joined || !state || !playerReady || !isHost() || playerApplyingRemote) return;
          if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.BUFFERING || event.data === YT.PlayerState.ENDED) {
            const playing = event.data === YT.PlayerState.PLAYING;
            const currentTime = safeCurrentTime();
            state.media.playing = playing;
            state.media.currentTime = currentTime;
            state.media.updatedAt = Date.now();
            socket.emit('media:update', { videoId: getPlayerVideoId() || state.media.videoId, title: currentTitle(), playing, currentTime });
            refreshMediaUi();
          }
        },
        onError: event => {
          if (event.data === 101 || event.data === 150) showToast('This video does not allow embedding. Try another YouTube trailer.');
          else if (event.data === 2) showToast('That YouTube video ID looks invalid. Try another one.');
        }
      }
    });
  }
  function safeCurrentTime() { try { return player && typeof player.getCurrentTime === 'function' ? player.getCurrentTime() || 0 : 0; } catch { return 0; } }
  function getPlayerVideoId() { try { return player?.getVideoData?.().video_id || ''; } catch { return ''; } }
  function currentTitle() { return $('currentTitle').childNodes[0]?.textContent?.trim() || state?.media?.title || 'Shared screening'; }
  function applyRemoteMedia(media, force = false) {
    if (!media) return;
    pendingMedia = media;
    if (!playerReady || !player || !joined) return;
    if (isHost() && !force) return;
    const currentId = getPlayerVideoId();
    const newVideo = media.videoId && currentId !== media.videoId;
    const targetTime = Math.max(0, media.currentTime + (media.playing ? (Date.now() - (media.updatedAt || Date.now())) / 1000 : 0));
    if (newVideo || force) {
      playerApplyingRemote = true;
      lastMediaId = media.videoId;
      if (media.playing) player.loadVideoById({ videoId: media.videoId, startSeconds: targetTime });
      else player.cueVideoById({ videoId: media.videoId, startSeconds: targetTime });
      setTimeout(() => { playerApplyingRemote = false; }, 900);
      lastRemotePlayState = media.playing;
      return;
    }
    const currentState = player.getPlayerState?.();
    const playingNow = currentState === YT.PlayerState.PLAYING || currentState === YT.PlayerState.BUFFERING;
    if (media.playing !== lastRemotePlayState || (media.playing && !playingNow) || (!media.playing && playingNow)) {
      playerApplyingRemote = true;
      if (media.playing) player.playVideo(); else player.pauseVideo();
      setTimeout(() => { playerApplyingRemote = false; }, 500);
      lastRemotePlayState = media.playing;
    }
    const drift = safeCurrentTime() - targetTime;
    driftValue = Math.round(Math.abs(drift) * 1000);
    if (Math.abs(drift) > 0.3) {
      playerApplyingRemote = true;
      player.seekTo(targetTime, true);
      setTimeout(() => { playerApplyingRemote = false; }, 300);
      $('driftMeter').textContent = `DRIFT ${driftValue}ms · FIXED`;
    } else {
      $('driftMeter').textContent = `DRIFT ${driftValue}ms · OK`;
    }
    updateHealthDashboard();
    refreshMediaUi();
  }

  socket.on('room:state', nextState => {
    if (!joined || !nextState) return;
    state = nextState;
    renderAll();
    if (state.media && state.media.videoId !== lastMediaId) lastMediaId = state.media.videoId;
    if (!isHost()) applyRemoteMedia(state.media);
    else if (playerReady && getPlayerVideoId() !== state.media.videoId) applyHostLoadedMedia(state.media);
  });
  function applyHostLoadedMedia(media) {
    if (!playerReady || !player || !media || media.videoId === getPlayerVideoId()) return;
    playerApplyingRemote = true;
    player.cueVideoById({ videoId: media.videoId, startSeconds: media.currentTime || 0 });
    setTimeout(() => { playerApplyingRemote = false; }, 700);
  }
  socket.on('media:sync', media => {
    if (!joined || !state) return;
    state.media = media;
    $('currentTitle').childNodes[0] && ($('currentTitle').childNodes[0].textContent = media.title || 'Shared screening ');
    if (!isHost()) applyRemoteMedia(media);
    refreshMediaUi();
  });
  socket.on('chat:new', message => {
    if (!state) return;
    state.messages = [...(state.messages || []), message].slice(-70);
    renderChat(true);
    $('chatCount').textContent = String(Math.max(0, (state.messages || []).filter(m => !m.system).length));
  });
  socket.on('reaction:new', item => {
    animateReaction(item.emoji, item.name);
    $('lastReaction').textContent = `${(item.name || 'SOMEONE').toUpperCase()} SENT ${item.emoji}`;
  });
  socket.on('latency:pong', packet => {
    if (packet?.sentAt) {
      pingValue = Math.max(0, Date.now() - packet.sentAt);
      pingHistory.push(pingValue);
      pingHistory = pingHistory.slice(-18);
      $('latency').textContent = pingValue;
      $('onlineLabel').textContent = pingValue < 250 ? '● ONLINE' : '● CONNECTED';
      updateHealthDashboard();
    }
  });
  socket.on('disconnect', () => { if (joined) { $('onlineLabel').textContent = '○ RECONNECTING'; $('syncStatus').textContent = 'RECONNECTING TO ROOM…'; updateHealthDashboard(); } });
  socket.on('connect', () => { if (joined) { $('onlineLabel').textContent = '● BACK ONLINE'; updateHealthDashboard(); } });

  function startLatencyProbe() {
    latencyIntervals.forEach(clearInterval);
    latencyIntervals = [];
    const ping = () => { if (!joined || !socket.connected) return; lastPingAt = Date.now(); socket.emit('latency:ping', lastPingAt); };
    ping();
    latencyIntervals.push(setInterval(ping, 5000));
    latencyIntervals.push(setInterval(() => {
      if (!joined || !state) return;
      if (playerReady && isHost()) {
        const now = Date.now();
        if (now - lastHostSyncAt > 3500) {
          lastHostSyncAt = now;
          socket.emit('media:update', { videoId: getPlayerVideoId() || state.media.videoId, title: currentTitle(), playing: player.getPlayerState() === YT.PlayerState.PLAYING, currentTime: safeCurrentTime() });
        }
      } else if (playerReady && pendingMedia) {
        applyRemoteMedia({ ...pendingMedia, updatedAt: pendingMedia.updatedAt || Date.now() });
      }
      updateHealthDashboard();
    }, 2000));
    updateHealthDashboard();
  }

  function renderAll() {
    if (!state) return;
    $('topRoomName').textContent = `ROOM ${state.code}`;
    $('watchingCount').textContent = state.users.length;
    $('peopleCount').textContent = state.users.length;
    $('peopleSubhead').textContent = `${state.users.length} / 20`;
    $('queueCount').textContent = state.playlist.length;
    $('chatCount').textContent = String(state.messages.filter(m => !m.system).length);
    $('currentTitle').innerHTML = `${escapeHtml(state.media.title || 'Shared screening')} <span class="host-tag">${isHost() ? 'HOST PICK' : 'ROOM SCREENING'}</span>`;
    const playing = !!state.media.playing;
    $('mediaState').textContent = playing ? 'NOW PLAYING TOGETHER' : 'READY WHEN YOU ARE';
    $('playPause').innerHTML = `${playing ? 'Ⅱ' : '▶'} <span>${playing ? 'Pause together' : 'Play together'}</span>`;
    $('playPause').disabled = !isHost() || !playerReady;
    $('hostNote').textContent = isHost() ? 'You have the remote' : `${state.users.find(u => u.id === state.hostId)?.name || 'Host'} has the remote`;
    $('startPoll').disabled = !isHost();
    $('syncStatus').textContent = playerReady ? 'SYNC ENGINE ONLINE' : 'SYNC ENGINE STANDBY';
    renderMovies();
    renderPlaylist();
    renderPeople();
    renderChat(false);
    renderPoll();
    renderMatchmaker();
    renderTrivia();
    updateHealthDashboard();
    $('triviaStart').disabled = !isHost();
    $('startPrediction').disabled = !isHost();
    if (!playerReady) $('playerFallback').classList.remove('is-hidden');
  }
  function refreshMediaUi() {
    if (!state) return;
    const playing = !!state.media.playing;
    $('mediaState').textContent = playing ? 'NOW PLAYING TOGETHER' : 'READY WHEN YOU ARE';
    $('playPause').innerHTML = `${playing ? 'Ⅱ' : '▶'} <span>${playing ? 'Pause together' : 'Play together'}</span>`;
  }
  function fuzzyScore(query, text) {
    query = query.toLowerCase().trim(); text = text.toLowerCase();
    if (!query) return 1;
    if (text.includes(query)) return 2 + query.length / Math.max(1, text.length);
    const tokens = text.split(/\W+/);
    if (tokens.some(t => t.startsWith(query))) return 1.6;
    if (query.length > 2 && tokens.some(t => editDistance(query, t) <= (query.length > 6 ? 2 : 1))) return 1;
    return 0;
  }
  function editDistance(a, b) {
    const dp = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  }
  function renderMovies() {
    const query = $('movieSearch').value;
    const filtered = catalog.map(m => ({ ...m, score: fuzzyScore(query, `${m.title} ${m.subtitle} ${m.genre} ${m.year}`) })).filter(m => m.score > 0 && (activeGenre === 'All' || m.genre === activeGenre)).sort((a, b) => b.score - a.score);
    $('movieResults').innerHTML = filtered.slice(0, 5).map((movie, index) => `
      <article class="movie-result" data-movie="${escapeHtml(movie.videoId)}" tabindex="0" role="button" aria-label="Add ${escapeHtml(movie.title)} to the queue">
        <div class="poster-thumb"><img loading="lazy" alt="" src="https://img.youtube.com/vi/${encodeURIComponent(movie.videoId)}/mqdefault.jpg" onerror="this.style.display='none'" /><span>${escapeHtml(movie.mark)}</span></div>
        <div><b>${escapeHtml(movie.title)}</b><small>${escapeHtml(movie.genre)} · ${escapeHtml(movie.year)}</small><span class="result-add">＋ Add to queue</span></div>
      </article>`).join('') || '<p class="empty-results">No match yet. Try a shorter title, another genre, or add a YouTube video.</p>';
    document.querySelectorAll('[data-movie]').forEach(card => {
      const add = () => {
        const movie = catalog.find(item => item.videoId === card.dataset.movie);
        if (!movie) return;
        socket.emit('playlist:add', { title: movie.title, videoId: movie.videoId, subtitle: movie.subtitle, genre: movie.genre, year: movie.year });
        showToast(`Added ${movie.title} to the queue`);
      };
      card.addEventListener('click', add);
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(); } });
    });
  }
  document.querySelectorAll('.genre-chip').forEach(button => button.addEventListener('click', () => {
    activeGenre = button.dataset.genre;
    document.querySelectorAll('.genre-chip').forEach(b => b.classList.toggle('active', b === button));
    renderMovies();
  }));
  $('movieSearch').addEventListener('input', renderMovies);

  function renderPlaylist() {
    $('playlist').innerHTML = state.playlist.map((item, index) => `
      <div class="playlist-item"><span class="queue-index">${String(index + 1).padStart(2, '0')}</span><div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.addedBy || 'CineSync')} · ${escapeHtml(item.genre || 'Community pick')}</small></div>${isHost() ? `<button class="queue-play" title="Play ${escapeHtml(item.title)}" data-playlist-id="${escapeHtml(item.id)}">▶</button>` : '<span class="queue-owner">QUEUED</span>'}</div>`).join('') || '<p class="empty-results">The queue is empty. Add a movie from Discover.</p>';
    document.querySelectorAll('[data-playlist-id]').forEach(btn => btn.addEventListener('click', () => socket.emit('playlist:play', { id: btn.dataset.playlistId })));
  }
  function renderPeople() {
    $('participants').innerHTML = state.users.map((user, index) => {
      const host = user.id === state.hostId;
      const self = user.id === myId;
      return `<div class="participant"><div class="participant-avatar" style="background:${escapeHtml(user.color || colors[index % colors.length])}">${escapeHtml(initials(user.name))}</div><div class="participant-info"><b>${escapeHtml(user.name)}${self ? ' (you)' : ''}</b><small>${host ? 'Running the remote' : 'Here for the vibes'}</small></div>${host ? '<span class="host-badge">♛ HOST</span>' : isHost() ? `<button class="make-host" data-make-host="${escapeHtml(user.id)}">Make host</button>` : ''}</div>`;
    }).join('');
    document.querySelectorAll('[data-make-host]').forEach(btn => btn.addEventListener('click', () => {
      if (confirm('Pass playback control to this person?')) socket.emit('host:transfer', { userId: btn.dataset.makeHost });
    }));
  }
  function renderChat(scrollToBottom = false) {
    if (!state) return;
    const messages = state.messages || [];
    const oldScrollHeight = $('chatMessages').scrollHeight;
    const shouldStick = scrollToBottom || $('chatMessages').scrollHeight - $('chatMessages').scrollTop - $('chatMessages').clientHeight < 80;
    $('chatMessages').innerHTML = messages.slice(-70).map(message => {
      if (message.system) return `<div class="message system">${escapeHtml(message.text)}</div>`;
      const index = (message.name?.charCodeAt(0) || 0) % colors.length;
      return `<div class="message"><div class="message-avatar" style="background:${colors[index]}">${escapeHtml(initials(message.name))}</div><div class="message-body"><div class="message-meta"><b>${escapeHtml(message.name || 'Guest')}</b><time>${formatTime(message.at)}</time></div><div class="message-text">${escapeHtml(message.text)}</div></div></div>`;
    }).join('');
    if (shouldStick) $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    lastChatCount = messages.length;
  }
  function renderPoll() {
    const poll = state.poll;
    if (!poll) {
      $('pollContent').innerHTML = `<div class="poll-empty"><span>✳</span><b>Settle it democratically.</b><p>What should the group watch next?</p><button id="createPollInline" class="text-action" ${isHost() ? '' : 'disabled'}>Start a quick poll ↗</button></div>`;
      $('createPollInline').addEventListener('click', openPollDialog);
      return;
    }
    const myVote = poll.votes?.[myId];
    const total = poll.results.reduce((sum, result) => sum + result.count, 0);
    $('pollContent').innerHTML = `<div class="poll-content-prompt">${escapeHtml(poll.prompt)}</div>${poll.results.map((result, index) => { const pct = total ? Math.round(result.count / total * 100) : 0; return `<button class="poll-choice ${myVote === index ? 'selected' : ''}" data-vote="${index}"><span class="poll-bar" style="width:${pct}%"></span><span class="poll-choice-text"><span>${escapeHtml(result.option)}</span><span>${pct}% · ${result.count}</span></span></button>`; }).join('')}<div class="poll-footer"><span>${total} VOTE${total === 1 ? '' : 'S'} CAST</span>${isHost() ? '<button class="text-action" id="closePoll">Close poll ×</button>' : '<span>YOU CAN CHANGE YOUR VOTE</span>'}</div>`;
    document.querySelectorAll('[data-vote]').forEach(button => button.addEventListener('click', () => socket.emit('poll:vote', { index: Number(button.dataset.vote) })));
    if (isHost()) $('closePoll').addEventListener('click', () => socket.emit('poll:close'));
  }

  function renderMatchmaker() {
    if (!state) return;
    const me = state.users.find(user => user.id === myId);
    if (me?.preferences) {
      $('matchMood').value = me.preferences.mood || 'Mind-bending';
      $('matchGenre').value = me.preferences.genre || 'All';
    }
    const usersWithPrefs = state.users.filter(user => user.preferences);
    $('matchRoomSummary').textContent = `${usersWithPrefs.length} of ${state.users.length} room ${state.users.length === 1 ? 'member has' : 'members have'} shared a vibe`;
    const voteCounts = {};
    Object.values(state.matchVotes || {}).forEach(videoId => voteCounts[videoId] = (voteCounts[videoId] || 0) + 1);
    const prefs = usersWithPrefs.map(user => user.preferences);
    const scored = catalog.map(movie => {
      const tags = moodTags[movie.videoId] || [];
      let score = 0;
      let matchedMoods = 0;
      let matchedGenres = 0;
      prefs.forEach(pref => {
        if (pref.mood && tags.includes(pref.mood)) { score += 3; matchedMoods++; }
        if (pref.genre && pref.genre !== 'All' && pref.genre === movie.genre) { score += 2; matchedGenres++; }
      });
      const votes = voteCounts[movie.videoId] || 0;
      score += votes * 4;
      return { ...movie, score, votes, matchedMoods, matchedGenres };
    }).sort((a, b) => b.score - a.score || b.votes - a.votes || a.title.localeCompare(b.title)).slice(0, 3);
    $('matchResults').innerHTML = scored.map((movie, index) => {
      const myVote = state.matchVotes?.[myId] === movie.videoId;
      const isQueued = state.playlist.some(item => item.videoId === movie.videoId);
      const reason = movie.votes ? `${movie.votes} room vote${movie.votes === 1 ? '' : 's'} · ` : '';
      return `<article class="match-result"><div class="match-rank">0${index + 1}</div><div class="match-result-copy"><b>${escapeHtml(movie.title)}</b><span>${escapeHtml(movie.genre)} · ${reason}${movie.matchedMoods} mood · ${movie.matchedGenres} genre matches</span><div class="match-actions"><button data-match-vote="${escapeHtml(movie.videoId)}" class="match-vote ${myVote ? 'selected' : ''}">${myVote ? '✓ Your vote' : `♡ Vote · ${movie.votes}`}</button><button data-match-queue="${escapeHtml(movie.videoId)}" class="match-queue" ${isQueued ? 'disabled' : ''}>${isQueued ? 'Queued ✓' : '＋ Queue'}</button></div></div></article>`;
    }).join('');
    document.querySelectorAll('[data-match-vote]').forEach(button => button.addEventListener('click', () => socket.emit('matchmaker:vote', { videoId: button.dataset.matchVote })));
    document.querySelectorAll('[data-match-queue]').forEach(button => button.addEventListener('click', () => {
      const movie = catalog.find(item => item.videoId === button.dataset.matchQueue);
      if (!movie) return;
      socket.emit('playlist:add', { title: movie.title, videoId: movie.videoId, subtitle: movie.subtitle, genre: movie.genre, year: movie.year });
      showToast(`Match sent to the queue: ${movie.title}`);
    }));
  }

  function renderTrivia() {
    if (!state) return;
    const trivia = state.trivia;
    const answered = !!trivia && (trivia.answeredIds || []).includes(myId);
    if (!trivia) {
      $('triviaContent').innerHTML = `<p class="trivia-empty">Put your film knowledge on the big screen. Correct answers earn points for your room profile.</p><p class="trivia-status">${isHost() ? 'You are hosting. Start a round for everyone.' : 'Waiting for the host to start a round.'}</p>`;
      $('triviaStart').textContent = 'Start trivia ↗';
    } else {
      const choices = trivia.options.map((option, index) => `<button class="trivia-choice" data-trivia-answer="${index}" ${answered ? 'disabled' : ''}><span class="choice-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(option)}</span></button>`).join('');
      const feedback = triviaFeedback?.roundId === trivia.id ? `<div class="trivia-feedback ${triviaFeedback.correct ? 'correct' : 'incorrect'}">${triviaFeedback.correct ? 'Correct! +1 point.' : `Not quite — the answer was ${escapeHtml(trivia.options[triviaFeedback.correctIndex] || '')}.`} ${escapeHtml(triviaFeedback.explanation || '')}</div>` : '';
      $('triviaContent').innerHTML = `<div class="trivia-roundline"><span>ROUND ${trivia.round}</span><span>${trivia.answerCount} / ${state.users.length} ANSWERED</span></div><h4 class="trivia-question">${escapeHtml(trivia.question)}</h4><div class="trivia-choices">${choices}</div>${answered ? (feedback || '<p class="trivia-status">Answer locked — waiting for the next round.</p>') : '<p class="trivia-status">Choose once. Trust your movie instincts.</p>'}`;
      $('triviaStart').textContent = 'Reveal + next ↗';
      document.querySelectorAll('[data-trivia-answer]').forEach(button => button.addEventListener('click', () => {
        if (!state?.trivia) return;
        socket.emit('trivia:answer', { roundId: state.trivia.id, index: Number(button.dataset.triviaAnswer) });
      }));
    }
    $('triviaStart').disabled = !isHost();
    $('triviaLeaderboard').innerHTML = `<div class="leaderboard-title">ROOM LEADERBOARD</div>${[...state.users].sort((a, b) => (b.score || 0) - (a.score || 0) || a.name.localeCompare(b.name)).slice(0, 3).map((user, index) => `<div class="leaderboard-row"><span class="leaderboard-place">${index + 1}</span><span>${escapeHtml(user.name)}${user.id === myId ? ' · YOU' : ''}</span><b>${user.score || 0} pt</b></div>`).join('') || '<p class="trivia-status">Scores appear after the first round.</p>'}`;
  }

  function updateHealthDashboard() {
    if (!$('healthBadge')) return;
    // Sample local player time against the latest room timeline for an up-to-date drift estimate.
    if (playerReady && joined && state?.media && player && getPlayerVideoId() === state.media.videoId) {
      const targetTime = Math.max(0, Number(state.media.currentTime || 0) + (state.media.playing ? (Date.now() - Number(state.media.updatedAt || Date.now())) / 1000 : 0));
      driftValue = Math.round(Math.abs(safeCurrentTime() - targetTime) * 1000);
      $('driftMeter').textContent = `DRIFT ${driftValue}ms · ${driftValue <= 500 ? 'OK' : 'CHECK'}`;
    }
    const connected = socket.connected;
    $('healthBadge').textContent = connected ? '● CONNECTED' : '○ RECONNECTING';
    $('healthBadge').classList.toggle('is-offline', !connected);
    $('healthPing').textContent = pingValue === null ? '—' : String(pingValue);
    $('healthPingState').textContent = pingValue === null ? 'Waiting for probe' : pingValue < 120 ? 'Low round-trip time' : pingValue < 250 ? 'Moderate round-trip time' : 'High round-trip time';
    $('healthDrift').textContent = driftValue === null ? '—' : String(driftValue);
    $('healthDriftState').textContent = !playerReady ? 'Waiting for player' : driftValue === null ? 'Timeline unavailable' : driftValue <= 300 ? 'Tightly aligned' : driftValue <= 500 ? 'Within 500 ms goal' : 'Resync recommended';
    $('healthPeople').textContent = state ? String(state.users.length) : '—';
    $('healthRoom').textContent = state ? `Room ${state.code} · up to 20` : 'Room not ready';
    const isSynced = connected && playerReady && driftValue !== null && driftValue <= 500;
    $('healthSync').textContent = !connected ? 'OFFLINE' : !playerReady ? 'LOADING' : isSynced ? 'ALIGNED' : 'CHECKING';
    $('healthSyncState').textContent = !connected ? 'Socket disconnected' : !playerReady ? 'Waiting for YouTube player' : isSynced ? 'Observed drift ≤500 ms' : 'Observed drift above goal or measuring';
    $('pingSparkline').innerHTML = pingHistory.map(value => {
      const max = Math.max(100, ...pingHistory);
      return `<span class="ping-bar ${value >= 250 ? 'slow' : ''}" style="height:${Math.max(8, Math.round((value / max) * 38))}px" title="${value} ms"></span>`;
    }).join('');
    if (pingHistory.length) {
      const min = Math.min(...pingHistory), max = Math.max(...pingHistory);
      $('healthPingRange').textContent = `${min}–${max} ms range`;
    } else $('healthPingRange').textContent = 'No samples yet';
  }

  socket.on('trivia:answer-result', result => {
    if (!result || !state?.trivia || result.roundId !== state.trivia.id) return;
    triviaFeedback = result;
    if (!result.alreadyAnswered) showToast(result.correct ? 'Correct answer! +1 point 🍿' : 'Not this time — keep playing!');
    renderTrivia();
  });
  socket.on('trivia:reveal', packet => {
    const previous = state?.trivia;
    if (previous && previous.id === packet.roundId) showToast(`Last answer: ${previous.options[packet.correctIndex]}`);
  });

  $('playPause').addEventListener('click', () => {
    if (!isHost() || !playerReady) return showToast('Ask the host to pass you the remote.');
    const playing = player.getPlayerState() === YT.PlayerState.PLAYING;
    if (playing) player.pauseVideo(); else player.playVideo();
  });
  $('resync').addEventListener('click', () => {
    if (!state?.media) return;
    if (isHost() && playerReady) {
      const currentTime = safeCurrentTime();
      socket.emit('media:update', { videoId: getPlayerVideoId() || state.media.videoId, title: currentTitle(), playing: player.getPlayerState() === YT.PlayerState.PLAYING, currentTime });
      showToast('Room timing broadcast refreshed.');
    } else {
      applyRemoteMedia(state.media, true);
      showToast('Checking your playback against the room…');
    }
  });
  $('saveMatchPrefs').addEventListener('click', () => {
    if (!joined) return;
    socket.emit('matchmaker:preference', { mood: $('matchMood').value, genre: $('matchGenre').value });
    showToast('Vibe shared with the room — re-ranking the group picks.');
  });
  $('triviaStart').addEventListener('click', () => {
    if (!isHost()) return showToast('Ask the host to start the trivia round.');
    socket.emit(state?.trivia ? 'trivia:next' : 'trivia:start');
  });
  $('startPrediction').addEventListener('click', () => {
    if (!isHost()) return showToast('Only the host can start a prediction poll.');
    socket.emit('poll:create', { prompt: 'Predict the ending — what is the room expecting?', options: ['Happy ending', 'Plot twist', 'Heartbreak', 'Cliffhanger'] });
    showToast('Prediction poll launched. Lock in your theory!');
    $('pollPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Immersive cinema mode: hides the side panels so the screening gets the spotlight.
  $('cinemaMode').addEventListener('click', () => {
    const enabled = document.body.classList.toggle('cinema-mode');
    $('cinemaMode').classList.toggle('active', enabled);
    $('cinemaMode').innerHTML = enabled ? '▣ <span>Exit focus</span>' : '▣ <span>Focus mode</span>';
    showToast(enabled ? 'Cinema mode on — all eyes on the screen.' : 'Back to the full screening room.');
  });

  // Spoiler shield blurs message bodies locally; click again to reveal them.
  $('spoilerShield').addEventListener('click', () => {
    const enabled = $('chatMessages').classList.toggle('spoilers-hidden');
    $('spoilerShield').setAttribute('aria-pressed', String(enabled));
    $('spoilerShield').classList.toggle('active', enabled);
    $('spoilerShield').textContent = enabled ? '◉ Reveal chat' : '◉ Spoiler shield';
    showToast(enabled ? 'Spoiler shield on — message text hidden on this screen.' : 'Chat messages revealed.');
  });

  $('copyInvite').addEventListener('click', copyInvite);
  $('peopleInvite').addEventListener('click', copyInvite);
  function copyInvite() {
    const text = `${roomLink()} — Join my CineSync room with code ${state?.code || ''}`;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => showToast('Invite link copied. Send it to the group!')).catch(() => fallbackCopy(text));
    else fallbackCopy(text);
  }
  function fallbackCopy(text) { window.prompt('Copy this CineSync invite:', text); }
  $('leaveRoom').addEventListener('click', () => {
    joined = false;
    if (player) { try { player.destroy(); } catch {} player = null; playerReady = false; }
    latencyIntervals.forEach(clearInterval); latencyIntervals = [];
    socket.disconnect();
    $('party').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    state = null;
    showToast('You left the screening. See you at the next one.');
    setTimeout(() => socket.connect(), 200);
    history.replaceState({}, '', location.pathname);
  });

  $('chatForm').addEventListener('submit', event => {
    event.preventDefault();
    const text = $('chatInput').value.trim();
    if (!text) return;
    socket.emit('chat:send', { text });
    $('chatInput').value = '';
  });
  document.querySelectorAll('[data-chat]').forEach(button => button.addEventListener('click', () => socket.emit('chat:send', { text: button.dataset.chat })));
  document.querySelectorAll('[data-emoji]').forEach(button => button.addEventListener('click', () => socket.emit('reaction:send', { emoji: button.dataset.emoji })));
  function animateReaction(emoji, name) {
    const layer = $('reactionFloats');
    const element = document.createElement('span');
    element.className = 'floating-reaction'; element.textContent = emoji;
    element.style.left = `${12 + Math.random() * 76}%`;
    element.style.animationDuration = `${1.9 + Math.random() * .9}s`;
    element.title = name || 'A room reaction';
    layer.appendChild(element);
    setTimeout(() => element.remove(), 3000);
  }
  document.querySelectorAll('.social-tab').forEach(button => button.addEventListener('click', () => {
    activeTab = button.dataset.tab;
    document.querySelectorAll('.social-tab').forEach(tab => tab.classList.toggle('active', tab === button));
    $('chatTab').classList.toggle('hidden', activeTab !== 'chat');
    $('peopleTab').classList.toggle('hidden', activeTab !== 'people');
  }));

  $('addCustomMovie').addEventListener('click', () => $('customMovieDialog').showModal());
  $('cancelCustom').addEventListener('click', () => $('customMovieDialog').close());
  $('customMovieForm').addEventListener('submit', event => {
    event.preventDefault();
    const title = $('customTitle').value.trim();
    const videoId = videoIdFromInput($('customYoutube').value);
    if (!videoId) { showToast('That URL did not look right. Paste a YouTube video link or 11-character ID.'); return; }
    socket.emit('playlist:add', { title, videoId, subtitle: 'Community pick', genre: 'Custom pick' });
    $('customMovieDialog').close(); $('customTitle').value = ''; $('customYoutube').value = '';
    showToast(`Queued: ${title}`);
  });
  function openPollDialog() {
    if (!isHost()) return showToast('Only the host can start a poll in this demo.');
    $('pollDialog').showModal();
  }
  $('startPoll').addEventListener('click', openPollDialog);
  $('createPollInline').addEventListener('click', openPollDialog);
  $('cancelPoll').addEventListener('click', () => $('pollDialog').close());
  $('pollForm').addEventListener('submit', event => {
    event.preventDefault();
    const options = [...document.querySelectorAll('.poll-option-input')].map(input => input.value.trim()).filter(Boolean);
    if (options.length < 2) return showToast('Add at least two poll options.');
    socket.emit('poll:create', { prompt: $('pollQuestion').value.trim(), options });
    $('pollDialog').close(); showToast('Poll launched. Let democracy cook.');
  });

  // Deep-link flow: keeps the invite URL join-ready without silently joining as an unnamed user.
  if (queryParams.get('room')) setTimeout(() => $('guestName').focus(), 120);
  window.addEventListener('beforeunload', () => { if (joined) socket.emit('room:leave'); latencyIntervals.forEach(clearInterval); });
})();
