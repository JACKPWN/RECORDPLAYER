const state = {
  tracks: [],
  queue: [],
  history: [],

  currentIndex: null,

  player: null,
  playerReady: false,
  tracksReady: false,
  initialized: false,

  isPlaying: false,
  errorSkips: 0
};


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const elements = {
  status: document.querySelector("#status"),
  title: document.querySelector("#track-title"),
  details: document.querySelector("#track-details"),

  previousButton: document.querySelector("#previous-button"),
  playButton: document.querySelector("#play-button"),
  nextButton: document.querySelector("#next-button"),

  volumeControl: document.querySelector("#volume-control"),

  trackList: document.querySelector("#track-list"),
  trackCount: document.querySelector("#track-count"),
  trackSearch: document.querySelector("#track-search")
};


/* =========================================================
   HELPERS
   ========================================================= */

function shuffle(items) {
  const copy = [...items];

  for (
    let index = copy.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex =
      Math.floor(Math.random() * (index + 1));

    [
      copy[index],
      copy[randomIndex]
    ] = [
      copy[randomIndex],
      copy[index]
    ];
  }

  return copy;
}


function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}


/* =========================================================
   RANDOM QUEUE
   ========================================================= */

function rebuildQueue() {
  const allIndexes =
    state.tracks.map((_, index) => index);

  state.queue = shuffle(allIndexes);

  /*
   * Random Next uses pop(), so the final item in the
   * array is actually the next track.
   *
   * Prevent the current song from immediately repeating.
   */

  if (
    state.currentIndex !== null &&
    state.queue.length > 1 &&
    state.queue[state.queue.length - 1] ===
      state.currentIndex
  ) {
    [
      state.queue[0],
      state.queue[state.queue.length - 1]
    ] = [
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


/* =========================================================
   CONTROLS
   ========================================================= */

function setControlsEnabled(enabled) {
  elements.playButton.disabled = !enabled;
  elements.nextButton.disabled = !enabled;

  elements.previousButton.disabled =
    !enabled ||
    state.history.length === 0;

  /*
   * Volume intentionally stays enabled.
   *
   * It can be positioned before YouTube finishes loading,
   * and its value will be applied when the player is ready.
   */
}


/* =========================================================
   CURRENT TRACK DISPLAY
   ========================================================= */

function renderTrack(track) {
  elements.title.textContent =
    track.title || "Unknown Track";

  const artist =
    track.artist || "Unknown Artist";

  const album =
    track.album || "Unknown Album";

  const trackNumber =
    track.trackNumber ?? "?";

  elements.details.textContent =
    `${artist} — ${album} — Track ${trackNumber}`;

  elements.status.textContent =
    `${state.tracks.length.toLocaleString()} tracks loaded`;
}


/* =========================================================
   TRACK LIBRARY
   ========================================================= */

function renderTrackList(tracks = state.tracks) {
  elements.trackList.innerHTML = "";

  const fragment =
    document.createDocumentFragment();

  tracks.forEach((track) => {
    /*
     * Filtered arrays still contain references to the
     * original objects, so this returns their true index.
     */

    const originalIndex =
      state.tracks.indexOf(track);

    const button =
      document.createElement("button");

    button.type = "button";
    button.className = "track-row";

    button.dataset.trackIndex =
      String(originalIndex);

    button.setAttribute("role", "listitem");


    /* Song title */

    const title =
      document.createElement("span");

    title.className =
      "track-row-title";

    title.textContent =
      track.title || "Unknown Track";


    /* Artist / album */

    const meta =
      document.createElement("span");

    meta.className =
      "track-row-meta";

    const artist =
      track.artist || "Unknown Artist";

    const album =
      track.album || "Unknown Album";

    meta.textContent =
      `${artist} · ${album}`;


    button.append(title, meta);


    /* Highlight current song */

    if (
      originalIndex ===
      state.currentIndex
    ) {
      button.classList.add("is-active");

      button.setAttribute(
        "aria-current",
        "true"
      );
    }


    /* Select song */

    button.addEventListener(
      "click",
      () => {
        loadTrack(originalIndex, {
          addToHistory: true,
          autoplay: true,
          scrollIntoView: true
        });
      }
    );


    fragment.appendChild(button);
  });


  elements.trackList.appendChild(fragment);


  /* Track count */

  if (
    tracks.length === state.tracks.length
  ) {
    elements.trackCount.textContent =
      `${state.tracks.length.toLocaleString()} tracks`;
  } else {
    elements.trackCount.textContent =
      `${tracks.length.toLocaleString()} / ` +
      `${state.tracks.length.toLocaleString()} tracks`;
  }
}


/* =========================================================
   ACTIVE TRACK HIGHLIGHT
   ========================================================= */

function highlightCurrentTrack({
  scrollIntoView = false
} = {}) {

  const rows =
    elements.trackList.querySelectorAll(
      ".track-row"
    );

  let activeRow = null;

  rows.forEach((row) => {
    const index =
      Number(row.dataset.trackIndex);

    const isCurrent =
      index === state.currentIndex;

    row.classList.toggle(
      "is-active",
      isCurrent
    );

    if (isCurrent) {
      row.setAttribute(
        "aria-current",
        "true"
      );

      activeRow = row;
    } else {
      row.removeAttribute(
        "aria-current"
      );
    }
  });


  if (
    scrollIntoView &&
    activeRow
  ) {
    activeRow.scrollIntoView({
      block: "nearest"
    });
  }
}


/* =========================================================
   LIBRARY SEARCH
   ========================================================= */

function searchTracks() {
  const query =
    normalizeText(
      elements.trackSearch.value
    );

  if (!query) {
    renderTrackList(
      state.tracks
    );

    return;
  }


  const filteredTracks =
    state.tracks.filter((track) => {

      const searchableText = [
        track.title,
        track.artist,
        track.album,
        track.trackNumber
      ]
        .map(normalizeText)
        .join(" ");

      return searchableText.includes(query);
    });


  renderTrackList(filteredTracks);
}


/* =========================================================
   LOAD TRACK
   ========================================================= */

function loadTrack(
  index,
  {
    addToHistory = true,
    autoplay = true,
    scrollIntoView = true
  } = {}
) {

  if (
    !state.playerReady ||
    !state.tracksReady
  ) {
    return;
  }


  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= state.tracks.length
  ) {
    console.warn(
      "Invalid track index:",
      index
    );

    return;
  }


  if (
    addToHistory &&
    state.currentIndex !== null &&
    state.currentIndex !== index
  ) {
    state.history.push(
      state.currentIndex
    );
  }


  state.currentIndex = index;


  /*
   * Remove manually selected/current track from random
   * queue so Random Next does not immediately choose it.
   */

  state.queue =
    state.queue.filter(
      (queuedIndex) =>
        queuedIndex !== index
    );


  const track =
    state.tracks[index];


  renderTrack(track);


  highlightCurrentTrack({
    scrollIntoView
  });


  if (autoplay) {
    state.player.loadVideoById(
      track.youtubeId
    );
  } else {
    state.player.cueVideoById(
      track.youtubeId
    );
  }


  elements.previousButton.disabled =
    state.history.length === 0;
}


/* =========================================================
   RANDOM NEXT
   ========================================================= */

function playRandomTrack() {
  if (
    !state.playerReady ||
    !state.tracksReady ||
    state.tracks.length === 0
  ) {
    return;
  }

  const nextIndex =
    getNextRandomIndex();

  loadTrack(nextIndex, {
    addToHistory: true,
    autoplay: true,
    scrollIntoView: true
  });
}


/* =========================================================
   PREVIOUS
   ========================================================= */

function playPreviousTrack() {
  const previousIndex =
    state.history.pop();

  if (
    previousIndex === undefined
  ) {
    return;
  }


  loadTrack(previousIndex, {
    addToHistory: false,
    autoplay: true,
    scrollIntoView: true
  });


  elements.previousButton.disabled =
    state.history.length === 0;
}


/* =========================================================
   PLAY / PAUSE
   ========================================================= */

function togglePlayback() {
  if (
    !state.playerReady ||
    state.currentIndex === null
  ) {
    return;
  }


  if (state.isPlaying) {
    state.player.pauseVideo();
  } else {
    state.player.playVideo();
  }
}


/* =========================================================
   VOLUME
   ========================================================= */

function updateVolume() {
  /*
   * Let the user move the slider even before YouTube
   * finishes initializing.
   *
   * Once ready, the current slider value is applied.
   */

  if (
    !state.playerReady ||
    !state.player
  ) {
    return;
  }


  const rawValue =
    Number(
      elements.volumeControl.value
    );


  const volume =
    Math.max(
      0,
      Math.min(
        100,
        Number.isFinite(rawValue)
          ? rawValue
          : 70
      )
    );


  state.player.setVolume(volume);


  /*
   * Treat volume 0 as mute.
   */

  if (volume === 0) {
    state.player.mute();
    return;
  }


  /*
   * Moving volume above 0 unmutes the player.
   */

  if (state.player.isMuted()) {
    state.player.unMute();
  }
}


/* =========================================================
   YOUTUBE PLAYER STATE
   ========================================================= */

function handlePlayerStateChange(event) {
  state.isPlaying =
    event.data ===
    YT.PlayerState.PLAYING;


  elements.playButton.textContent =
    state.isPlaying
      ? "Pause"
      : "Play";


  if (
    event.data ===
    YT.PlayerState.PLAYING
  ) {
    state.errorSkips = 0;
  }


  if (
    event.data ===
    YT.PlayerState.ENDED
  ) {
    playRandomTrack();
  }
}


/* =========================================================
   VIDEO ERROR
   ========================================================= */

function handlePlayerError() {
  state.errorSkips += 1;


  if (
    state.errorSkips >=
    Math.min(
      state.tracks.length,
      10
    )
  ) {
    elements.status.textContent =
      "Several videos could not be played. Try another track.";

    return;
  }


  elements.status.textContent =
    "This video is unavailable or cannot be embedded. Skipping…";


  window.setTimeout(
    playRandomTrack,
    500
  );
}


/* =========================================================
   INITIAL TRACK
   ========================================================= */

function initializeFirstTrack() {
  if (
    !state.playerReady ||
    !state.tracksReady ||
    state.initialized
  ) {
    return;
  }


  state.initialized = true;


  setControlsEnabled(true);


  const firstIndex =
    getNextRandomIndex();


  loadTrack(firstIndex, {
    addToHistory: false,
    autoplay: false,
    scrollIntoView: true
  });


  updateVolume();
}


/* =========================================================
   LOAD TRACK DATABASE
   ========================================================= */

async function loadTracks() {
  try {

    const response =
      await fetch("tracks.json");


    if (!response.ok) {
      throw new Error(
        `Could not load tracks.json (${response.status})`
      );
    }


    const tracks =
      await response.json();


    if (
      !Array.isArray(tracks) ||
      tracks.length === 0
    ) {
      throw new Error(
        "tracks.json does not contain any tracks."
      );
    }


    state.tracks =
      tracks.filter((track) =>
        typeof track.youtubeId === "string" &&
        track.youtubeId.trim().length === 11
      );


    if (
      state.tracks.length === 0
    ) {
      throw new Error(
        "No valid YouTube IDs were found."
      );
    }


    state.tracksReady = true;


    rebuildQueue();


    /*
     * Populate library immediately, even if YouTube
     * is still loading.
     */

    renderTrackList();


    initializeFirstTrack();

  } catch (error) {

    console.error(error);


    elements.status.textContent =
      "Could not load tracks.json. Run the site through a local web server.";


    elements.title.textContent =
      "Player unavailable";


    elements.details.textContent =
      error.message;


    elements.trackCount.textContent =
      "Unavailable";
  }
}


/* =========================================================
   YOUTUBE API INITIALIZATION
   ========================================================= */

window.onYouTubeIframeAPIReady =
  function onYouTubeIframeAPIReady() {

    state.player =
      new YT.Player(
        "youtube-player",
        {
          width: "100%",
          height: "100%",

          playerVars: {
            playsinline: 1,
            rel: 0
          },

          events: {

            onReady: () => {
              state.playerReady = true;

              /*
               * Apply slider position to YouTube as soon
               * as the player exists.
               */

              updateVolume();

              initializeFirstTrack();
            },

            onStateChange:
              handlePlayerStateChange,

            onError:
              handlePlayerError
          }
        }
      );
  };


/* =========================================================
   EVENT LISTENERS
   ========================================================= */

elements.previousButton.addEventListener(
  "click",
  playPreviousTrack
);


elements.playButton.addEventListener(
  "click",
  togglePlayback
);


elements.nextButton.addEventListener(
  "click",
  playRandomTrack
);


/*
 * input = immediate dragging response
 * change = backup for browsers/input methods that trigger
 * change at the end of interaction
 */

elements.volumeControl.addEventListener(
  "input",
  updateVolume
);


elements.volumeControl.addEventListener(
  "change",
  updateVolume
);


elements.trackSearch.addEventListener(
  "input",
  searchTracks
);


/* =========================================================
   START
   ========================================================= */

setControlsEnabled(false);

loadTracks();
