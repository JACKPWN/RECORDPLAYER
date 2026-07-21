const state = {
  tracks: [],
  queue: [],
  history: [],
  currentIndex: null,
  player: null,
  playerReady: false,
  tracksReady: false,
  isPlaying: false,
  errorSkips: 0
};

const elements = {
  status: document.querySelector("#status"),
  title: document.querySelector("#track-title"),
  details: document.querySelector("#track-details"),
  previousButton: document.querySelector("#previous-button"),
  playButton: document.querySelector("#play-button"),
  nextButton: document.querySelector("#next-button"),
  volumeControl: document.querySelector("#volume-control")
};

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

function rebuildQueue() {
  const allIndexes = state.tracks.map((_, index) => index);
  state.queue = shuffle(allIndexes);

  if (
    state.currentIndex !== null &&
    state.queue.length > 1 &&
    state.queue[state.queue.length - 1] === state.currentIndex
  ) {
    [state.queue[0], state.queue[state.queue.length - 1]] = [
      state.queue[state.queue.length - 1],
      state.queue[0]
    ];
  }
}

function getNextRandomIndex() {
  if (state.queue.length === 0) {
    rebuildQueue();
  }

  return state.queue.pop();
}

function setControlsEnabled(enabled) {
  elements.playButton.disabled = !enabled;
  elements.nextButton.disabled = !enabled;
  elements.volumeControl.disabled = !enabled;
  elements.previousButton.disabled = !enabled || state.history.length === 0;
}

function renderTrack(track) {
  elements.title.textContent = track.title;
  elements.details.textContent =
    `${track.artist} — ${track.album} — Track ${track.trackNumber}`;
  elements.status.textContent =
    `${state.tracks.length.toLocaleString()} tracks loaded`;
}

function loadTrack(index, { addToHistory = true, autoplay = true } = {}) {
  if (!state.playerReady || !state.tracksReady) {
    return;
  }

  if (
    addToHistory &&
    state.currentIndex !== null &&
    state.currentIndex !== index
  ) {
    state.history.push(state.currentIndex);
  }

  state.currentIndex = index;

  const track = state.tracks[index];
  renderTrack(track);

  if (autoplay) {
    state.player.loadVideoById(track.youtubeId);
  } else {
    state.player.cueVideoById(track.youtubeId);
  }

  elements.previousButton.disabled = state.history.length === 0;
}

function playRandomTrack() {
  const nextIndex = getNextRandomIndex();
  loadTrack(nextIndex);
}

function playPreviousTrack() {
  const previousIndex = state.history.pop();

  if (previousIndex === undefined) {
    return;
  }

  loadTrack(previousIndex, {
    addToHistory: false,
    autoplay: true
  });

  elements.previousButton.disabled = state.history.length === 0;
}

function togglePlayback() {
  if (!state.playerReady || state.currentIndex === null) {
    return;
  }

  if (state.isPlaying) {
    state.player.pauseVideo();
  } else {
    state.player.playVideo();
  }
}

function handlePlayerStateChange(event) {
  state.isPlaying = event.data === YT.PlayerState.PLAYING;
  elements.playButton.textContent = state.isPlaying ? "Pause" : "Play";

  if (event.data === YT.PlayerState.PLAYING) {
    state.errorSkips = 0;
  }

  if (event.data === YT.PlayerState.ENDED) {
    playRandomTrack();
  }
}

function handlePlayerError() {
  state.errorSkips += 1;

  if (state.errorSkips >= Math.min(state.tracks.length, 10)) {
    elements.status.textContent =
      "Several videos could not be played. Try another track.";
    return;
  }

  elements.status.textContent =
    "This video is unavailable or cannot be embedded. Skipping…";

  window.setTimeout(playRandomTrack, 500);
}

function initializeFirstTrack() {
  if (!state.playerReady || !state.tracksReady) {
    return;
  }

  setControlsEnabled(true);

  const firstIndex = getNextRandomIndex();
  loadTrack(firstIndex, {
    addToHistory: false,
    autoplay: false
  });

  state.player.setVolume(Number(elements.volumeControl.value));
}

async function loadTracks() {
  try {
    const response = await fetch("tracks.json");

    if (!response.ok) {
      throw new Error(`Could not load tracks.json (${response.status})`);
    }

    const tracks = await response.json();

    if (!Array.isArray(tracks) || tracks.length === 0) {
      throw new Error("tracks.json does not contain any tracks.");
    }

    state.tracks = tracks.filter((track) =>
      typeof track.youtubeId === "string" &&
      track.youtubeId.trim().length === 11
    );

    if (state.tracks.length === 0) {
      throw new Error("No valid YouTube IDs were found.");
    }

    state.tracksReady = true;
    rebuildQueue();
    initializeFirstTrack();
  } catch (error) {
    console.error(error);
    elements.status.textContent =
      "Could not load tracks.json. Run the site through a local web server.";
    elements.title.textContent = "Player unavailable";
    elements.details.textContent = error.message;
  }
}

window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
  state.player = new YT.Player("youtube-player", {
    width: "100%",
    height: "100%",
    playerVars: {
      playsinline: 1,
      rel: 0
    },
    events: {
      onReady: () => {
        state.playerReady = true;
        initializeFirstTrack();
      },
      onStateChange: handlePlayerStateChange,
      onError: handlePlayerError
    }
  });
};

elements.previousButton.addEventListener("click", playPreviousTrack);
elements.playButton.addEventListener("click", togglePlayback);
elements.nextButton.addEventListener("click", playRandomTrack);

elements.volumeControl.addEventListener("input", (event) => {
  if (state.playerReady) {
    state.player.setVolume(Number(event.target.value));
  }
});

setControlsEnabled(false);
loadTracks();
