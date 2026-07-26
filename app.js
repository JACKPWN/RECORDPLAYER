const STORAGE_KEY = "momPopVinylPlayer";


/* =========================================================
   STATE
   ========================================================= */

const state = {
  tracks: [],

  queue: [],

  history: [],

  failedIndexes:
    new Set(),

  currentIndex: null,

  player: null,

  playerReady: false,

  youtubeApiReady: false,

  playerRequested: false,

  useNoCookieHost: false,

  identityRetryDone: false,

  tracksReady: false,

  initialized: false,

  isPlaying: false,

  shuffle: true,

  savedYoutubeId: null,

  consecutiveErrors: 0
};



/* =========================================================
   DOM
   ========================================================= */

const elements = {

  status:
    document.querySelector(
      "#status"
    ),

  title:
    document.querySelector(
      "#track-title"
    ),

  details:
    document.querySelector(
      "#track-details"
    ),

  previousButton:
    document.querySelector(
      "#previous-button"
    ),

  playButton:
    document.querySelector(
      "#play-button"
    ),

  nextButton:
    document.querySelector(
      "#next-button"
    ),

  shuffleButton:
    document.querySelector(
      "#shuffle-button"
    ),

  volumeControl:
    document.querySelector(
      "#volume-control"
    ),

  trackList:
    document.querySelector(
      "#track-list"
    ),

  trackCount:
    document.querySelector(
      "#track-count"
    ),

  trackSearch:
    document.querySelector(
      "#track-search"
    ),

  playerCard:
    document.querySelector(
      ".player-card"
    ),

  volumeValue:
    document.querySelector(
      "#volume-value"
    )
};



/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function shuffle(items) {

  const copy =
    [...items];


  for (
    let index =
      copy.length - 1;

    index > 0;

    index -= 1
  ) {

    const randomIndex =
      Math.floor(
        Math.random() *
        (index + 1)
      );


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

  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase();

}



function clampVolume(value) {

  const number =
    Number(value);


  return Number.isFinite(number)
    ? Math.max(
        0,
        Math.min(
          100,
          number
        )
      )
    : 70;

}



function getPageOrigin() {

  if (
    window.location.protocol ===
      "http:" ||

    window.location.protocol ===
      "https:"
  ) {

    return window.location.origin;

  }


  return "https://jackpwn.github.io";

}



function getWidgetReferrer() {

  if (
    window.location.protocol ===
      "http:" ||

    window.location.protocol ===
      "https:"
  ) {

    return window.location.href;

  }


  return "https://jackpwn.github.io/RECORDPLAYER/";

}



function setPlayerIframeIdentity() {

  if (
    !state.player ||
    typeof state.player.getIframe !==
      "function"
  ) {

    return;

  }


  const iframe =
    state.player.getIframe();


  if (!iframe) {

    return;

  }


  iframe.referrerPolicy =
    "strict-origin-when-cross-origin";


  iframe.setAttribute(
    "referrerpolicy",
    "strict-origin-when-cross-origin"
  );


  iframe.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  );

}



function getInitialEmbedVideoId() {

  if (state.savedYoutubeId) {

    const savedTrack =
      state.tracks.find(
        (track) =>
          track.youtubeId ===
            state.savedYoutubeId
      );


    if (savedTrack) {

      return savedTrack.youtubeId;

    }

  }


  return state.tracks[0]?.youtubeId || "";

}



function createYouTubeIframe(
  youtubeId
) {
function resetYouTubeMount() {

  const currentNode =
    document.querySelector(
      "#youtube-player"
    );


  if (!currentNode) {

    return null;

  }


  const parameters =
    new URLSearchParams({
      enablejsapi: "1",
      controls: "1",
      playsinline: "1",
      rel: "0",
      origin: getPageOrigin(),
      widget_referrer: getWidgetReferrer()
    });


  const iframe =
    document.createElement(
      "iframe"
  const wrap =
    document.querySelector(
      ".video-wrap"
    );


  iframe.id =
    "youtube-player";
  if (!currentNode) {

    if (wrap) {

  iframe.title =
    "YouTube music player";
      const mount =
        document.createElement(
          "div"
        );


  iframe.width =
    "100%";
      mount.id =
        "youtube-player";


  iframe.height =
    "100%";
      wrap.appendChild(
        mount
      );

    }

  iframe.src =
    `https://www.youtube.com/embed/${youtubeId}?${parameters}`;

    return;

  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  }


  iframe.allowFullscreen =
    true;
  const mount =
    document.createElement(
      "div"
    );


  iframe.referrerPolicy =
    "strict-origin-when-cross-origin";
  mount.id =
    "youtube-player";


  iframe.setAttribute(
    "referrerpolicy",
    "strict-origin-when-cross-origin"
  );


  currentNode.replaceWith(
    iframe
    mount
  );


  return iframe;

}



function formatTrackDetails(track) {

  const artist =
    track.artist ||
    "Unknown Artist";


  const album =
    track.album ||
    "Unknown Album";


  const trackNumber =
    track.trackNumber ??
    "?";


  return `${artist} — ${album} — Track ${trackNumber}`;

}



function syncVolumeReadout(volume) {

  elements.volumeValue.textContent =
    `${volume}%`;

}



function syncReceiverPlayback(
  playing
) {

  state.isPlaying =
    playing;


  elements.playerCard
    .classList
    .toggle(
      "is-playing",
      playing
    );


  elements.playButton.textContent =
    playing
      ? "Pause"
      : "Play";

}



/* =========================================================
   LOCAL STORAGE
   ========================================================= */

function loadPreferences() {

  try {

    const saved =
      JSON.parse(
        localStorage.getItem(
          STORAGE_KEY
        ) || "{}"
      );


    elements.volumeControl.value =
      String(
        clampVolume(
          saved.volume
        )
      );


    state.shuffle =
      typeof saved.shuffle ===
      "boolean"
        ? saved.shuffle
        : true;


    state.savedYoutubeId =
      typeof saved.youtubeId ===
      "string"
        ? saved.youtubeId
        : null;

  } catch (error) {

    console.warn(
      "Could not read saved player settings.",
      error
    );


    elements.volumeControl.value =
      "70";

  }


  updateShuffleButton();

}



function savePreferences() {

  try {

    localStorage.setItem(

      STORAGE_KEY,

      JSON.stringify({

        volume:
          clampVolume(
            elements
              .volumeControl
              .value
          ),

        youtubeId:
          state.savedYoutubeId,

        shuffle:
          state.shuffle

      })

    );

  } catch (error) {

    console.warn(
      "Could not save player settings.",
      error
    );

  }

}



/* =========================================================
   STATUS
   ========================================================= */

function setReadyStatus(
  message = ""
) {

  if (message) {

    elements.status.textContent =
      message;

    return;

  }


  const mode =
    state.shuffle
      ? "Shuffle on"
      : "Shuffle off";


  elements.status.textContent =
    `${state.tracks.length.toLocaleString()} tracks loaded • ${mode}`;

}



/* =========================================================
   CONTROL STATE
   ========================================================= */

function setControlsEnabled(
  enabled
) {

  elements.playButton.disabled =
    !enabled;


  elements.nextButton.disabled =
    !enabled;


  elements.shuffleButton.disabled =
    !enabled;


  elements.previousButton.disabled =
    !enabled ||
    state.history.length === 0;

}



/* =========================================================
   SHUFFLE BUTTON
   ========================================================= */

function updateShuffleButton() {

  elements.shuffleButton.textContent =
    state.shuffle
      ? "Shuffle: On"
      : "Shuffle: Off";


  elements.shuffleButton.setAttribute(
    "aria-pressed",
    String(
      state.shuffle
    )
  );


  elements.shuffleButton.classList.toggle(
    "is-on",
    state.shuffle
  );

}



/* =========================================================
   SHUFFLE QUEUE
   ========================================================= */

function rebuildShuffleQueue() {

  const candidates =
    state.tracks

      .map(
        (_, index) =>
          index
      )

      .filter(
        (index) =>

          index !==
            state.currentIndex &&

          !state
            .failedIndexes
            .has(index)
      );


  state.queue =
    shuffle(candidates);

}



function getNextRandomIndex() {

  /*
   * Remove anything that failed
   * since the queue was built.
   */

  state.queue =
    state.queue.filter(
      (index) =>
        !state
          .failedIndexes
          .has(index)
    );


  if (
    state.queue.length === 0
  ) {

    rebuildShuffleQueue();

  }


  if (
    state.queue.length > 0
  ) {

    return state.queue.pop();

  }


  /*
   * Only one playable song may remain.
   */

  if (
    state.currentIndex !== null &&

    !state
      .failedIndexes
      .has(
        state.currentIndex
      )
  ) {

    return state.currentIndex;

  }


  return null;

}



/* =========================================================
   NORMAL NEXT
   ========================================================= */

function getNextSequentialIndex() {

  if (
    state.tracks.length === 0
  ) {

    return null;

  }


  const start =
    Number.isInteger(
      state.currentIndex
    )
      ? state.currentIndex
      : -1;


  /*
   * Walk through tracks.json in order.
   * Wrap around at the end.
   */

  for (
    let offset = 1;

    offset <=
      state.tracks.length;

    offset += 1
  ) {

    const index =
      (
        start +
        offset
      ) %
      state.tracks.length;


    if (
      !state
        .failedIndexes
        .has(index)
    ) {

      return index;

    }

  }


  return null;

}



/* =========================================================
   DETERMINE NEXT TRACK
   ========================================================= */

function getNextTrackIndex() {

  return state.shuffle
    ? getNextRandomIndex()
    : getNextSequentialIndex();

}



/* =========================================================
   CURRENT TRACK DISPLAY
   ========================================================= */

function renderCurrentTrack(
  track
) {

  const details =
    formatTrackDetails(
      track
    );


  elements.title.textContent =
    track.title ||
    "Unknown Track";


  elements.details.textContent =
    details;


  setReadyStatus();

}



/* =========================================================
   SEARCH MATCHING
   ========================================================= */

function trackMatchesSearch(
  track,
  query
) {

  if (!query) {

    return true;

  }


  const haystack =
    normalizeText(

      `${track.title} ${track.artist} ${track.album} ${track.trackNumber}`

    );


  /*
   * Search:
   *
   *   led zeppelin black
   *
   * matches even though the words are
   * in different metadata fields.
   */

  return query
    .split(/\s+/)
    .every(
      (term) =>
        haystack.includes(term)
    );

}



/* =========================================================
   RECORD LIBRARY
   ========================================================= */

function renderTrackList() {

  const query =
    normalizeText(
      elements
        .trackSearch
        .value
    );


  const fragment =
    document
      .createDocumentFragment();


  let visibleCount = 0;


  elements.trackList.innerHTML =
    "";


  state.tracks.forEach(
    (track, index) => {

      if (
        !trackMatchesSearch(
          track,
          query
        )
      ) {

        return;

      }


      visibleCount += 1;


      const button =
        document.createElement(
          "button"
        );


      const title =
        document.createElement(
          "span"
        );


      const meta =
        document.createElement(
          "span"
        );


      const badge =
        document.createElement(
          "span"
        );


      const isFailed =
        state
          .failedIndexes
          .has(index);


      const isCurrent =
        index ===
        state.currentIndex;


      button.type =
        "button";


      button.className =
        "track-row";


      button.dataset.trackIndex =
        String(index);


      button.disabled =
        isFailed;


      button.classList.toggle(
        "is-active",
        isCurrent
      );


      button.classList.toggle(
        "is-unavailable",
        isFailed
      );


      if (isCurrent) {

        button.setAttribute(
          "aria-current",
          "true"
        );

      }


      title.className =
        "track-row-title";


      title.textContent =
        track.title ||
        "Unknown Track";


      meta.className =
        "track-row-meta";


      meta.textContent =
        `${track.artist || "Unknown Artist"} · ${track.album || "Unknown Album"}`;


      badge.className =
        "track-row-badge";


      badge.textContent =
        isFailed
          ? "Unavailable"
          : "";


      button.append(
        title,
        meta,
        badge
      );


      fragment.appendChild(
        button
      );

    }
  );


  elements.trackList.appendChild(
    fragment
  );


  elements.trackCount.textContent =
    query

      ? `${visibleCount.toLocaleString()} / ${state.tracks.length.toLocaleString()} tracks`

      : `${state.tracks.length.toLocaleString()} tracks`;

}



/* =========================================================
   SCROLL ACTIVE TRACK INTO VIEW
   ========================================================= */

function scrollCurrentTrackIntoView() {

  const activeRow =
    elements.trackList.querySelector(
      ".track-row.is-active"
    );


  if (activeRow) {

    const listRect =
      elements
        .trackList
        .getBoundingClientRect();


    const rowRect =
      activeRow
        .getBoundingClientRect();


    if (
      rowRect.top <
      listRect.top
    ) {

      elements.trackList.scrollTop -=
        listRect.top -
        rowRect.top;

    } else if (
      rowRect.bottom >
      listRect.bottom
    ) {

      elements.trackList.scrollTop +=
        rowRect.bottom -
        listRect.bottom;

    }

  }

}



/* =========================================================
   LOAD A TRACK
   ========================================================= */

function loadTrack(

  index,

  {

    addToHistory = true,

    autoplay = true,

    scroll = true

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

    index >=
      state.tracks.length
  ) {

    console.warn(
      "Invalid track index:",
      index
    );

    return;

  }


  if (
    state
      .failedIndexes
      .has(index)
  ) {

    setReadyStatus(
      "That track is unavailable in this session."
    );

    return;

  }


  /*
   * Remember the track we are leaving.
   */

  if (
    addToHistory &&

    state.currentIndex !== null &&

    state.currentIndex !==
      index
  ) {

    state.history.push(
      state.currentIndex
    );

  }


  state.currentIndex =
    index;


  /*
   * Don't let the current track immediately
   * return from the shuffle queue.
   */

  state.queue =
    state.queue.filter(

      (queuedIndex) =>
        queuedIndex !== index

    );


  const track =
    state.tracks[index];


  /*
   * Remember selected song for next visit.
   */

  state.savedYoutubeId =
    track.youtubeId;


  savePreferences();


  renderCurrentTrack(
    track
  );


  renderTrackList();


  if (scroll) {

    scrollCurrentTrackIntoView();

  }


  syncReceiverPlayback(
    false
  );


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
   NEXT
   ========================================================= */

function playNextTrack(
  {
    addToHistory = true,

    autoplay = true,

    scroll = true
  } = {}
) {

  if (
    !state.playerReady ||
    !state.tracksReady
  ) {

    return;

  }


  const nextIndex =
    getNextTrackIndex();


  if (
    nextIndex === null
  ) {

    setReadyStatus(
      "No playable tracks remain in this session."
    );

    return;

  }


  loadTrack(

    nextIndex,

    {
      addToHistory,
      autoplay,
      scroll
    }

  );

}



/* =========================================================
   PREVIOUS
   ========================================================= */

function playPreviousTrack(
  {
    scroll = true
  } = {}
) {

  /*
   * Skip any tracks that have failed
   * during this session.
   */

  while (
    state.history.length > 0
  ) {

    const previousIndex =
      state.history.pop();


    if (
      !state
        .failedIndexes
        .has(
          previousIndex
        )
    ) {

      loadTrack(

        previousIndex,

        {
          addToHistory: false,
          autoplay: false,
          scroll
        }

      );


      break;

    }

  }


  elements.previousButton.disabled =
    state.history.length === 0;

}



/* =========================================================
   PLAY / PAUSE
   ========================================================= */

function togglePlayback() {

  if (
    !state.playerReady ||

    state.currentIndex ===
      null
  ) {

    return;

  }


  if (
    state.isPlaying
  ) {

    state.player.pauseVideo();

  } else {

    state.player.playVideo();

  }

}



/* =========================================================
   SHUFFLE ON / OFF
   ========================================================= */

function toggleShuffle() {

  state.shuffle =
    !state.shuffle;


  updateShuffleButton();


  if (
    state.shuffle
  ) {

    rebuildShuffleQueue();

  } else {

    state.queue = [];

  }


  savePreferences();


  setReadyStatus();

}



/* =========================================================
   VOLUME
   ========================================================= */

function updateVolume() {

  const volume =
    clampVolume(
      elements
        .volumeControl
        .value
    );


  elements.volumeControl.value =
    String(volume);


  syncVolumeReadout(
    volume
  );


  /*
   * Save even if YouTube has not
   * finished initializing yet.
   */

  savePreferences();


  if (
    !state.playerReady ||
    !state.player
  ) {

    return;

  }


  state.player.setVolume(
    volume
  );


  if (
    volume === 0
  ) {

    state.player.mute();

  } else if (
    state.player.isMuted()
  ) {

    state.player.unMute();

  }

}



/* =========================================================
   YOUTUBE STATE CHANGES
   ========================================================= */

function handlePlayerStateChange(
  event
) {

  syncReceiverPlayback(
    event.data ===
    YT.PlayerState.PLAYING
  );


  /*
   * Successful playback means the
   * error chain has ended.
   */

  if (
    event.data ===
    YT.PlayerState.PLAYING
  ) {

    state.consecutiveErrors =
      0;


    setReadyStatus();

  }


  /*
   * Finished song automatically advances
   * using the current Shuffle mode.
   */

  if (
    event.data ===
    YT.PlayerState.ENDED
  ) {

    playNextTrack();

  }

}



/* =========================================================
   YOUTUBE ERROR DESCRIPTION
   ========================================================= */

function describePlayerError(
  code
) {

  switch (code) {

    case 2:

      return (
        "Invalid YouTube video ID"
      );


    case 5:

      return (
        "YouTube could not play this video in the HTML5 player"
      );


    case 100:

      return (
        "Video removed or private"
      );


    case 101:

    case 150:

      return (
        "Embedding disabled by the video owner"
      );


    default:

      return (
        "Video unavailable"
      );

  }

}



/* =========================================================
   BETTER UNAVAILABLE-TRACK HANDLING
   ========================================================= */

function handlePlayerError(
  event
) {

  const code =
    Number(event.data);


  /*
   * Error 153 is different.
   *
   * It can indicate a client/embed identity
   * problem rather than a bad individual song.
   *
   * Don't blacklist the song and keep skipping
   * the entire library.
   */

  if (
    code === 153
  ) {

    if (!state.identityRetryDone) {

      state.identityRetryDone =
        true;


      state.useNoCookieHost =
        true;


      state.playerReady =
        false;


      state.playerRequested =
        false;


      if (
        state.player &&
        typeof state.player.destroy ===
          "function"
      ) {

        state.player.destroy();

      }


      state.player =
        null;


      resetYouTubeMount();


      setReadyStatus(
        "Retrying YouTube player verification..."
      );


      createYouTubePlayer();


      return;

    }


    setReadyStatus(
      "YouTube could not verify this embed. Deploy on HTTPS and refresh the page."
      "YouTube could not verify this embed. Hard refresh the page and try again."
    );

    return;

  }


  /*
   * Mark only this song unavailable
   * for the remainder of this session.
   */

  if (
    state.currentIndex !==
    null
  ) {

    state.failedIndexes.add(
      state.currentIndex
    );


    state.queue =
      state.queue.filter(

        (index) =>
          index !==
          state.currentIndex

      );

  }


  state.consecutiveErrors +=
    1;


  /*
   * Re-render so the broken song
   * visibly says UNAVAILABLE.
   */

  renderTrackList();


  /*
   * Don't get stuck in an infinite
   * skip loop if something larger is wrong.
   */

  if (

    state.consecutiveErrors >=

    Math.min(
      10,
      state.tracks.length
    )

  ) {

    setReadyStatus(
      "Several videos failed in a row. Choose another track from the library."
    );

    return;

  }


  const reason =
    describePlayerError(
      code
    );


  setReadyStatus(
    `${reason}. Skipping…`
  );


  window.setTimeout(

    () => {

      /*
       * Don't put the broken track
       * into Previous history.
       */

      playNextTrack({
        addToHistory: false
      });

    },

    600

  );

}



/* =========================================================
   AUTOPLAY BLOCKED
   ========================================================= */

function handleAutoplayBlocked() {

  syncReceiverPlayback(
    false
  );


  setReadyStatus(
    "Playback was blocked by your browser — press Play to start."
  );

}



/* =========================================================
   INITIALIZE FIRST / SAVED SONG
   ========================================================= */

function initializePlayer() {

  if (

    !state.playerReady ||

    !state.tracksReady ||

    state.initialized

  ) {

    return;

  }


  state.initialized =
    true;


  setControlsEnabled(
    true
  );


  /*
   * Restore saved volume.
   */

  updateVolume();


  /*
   * Find the song that was playing
   * during the previous visit.
   */

  const savedIndex =
    state.savedYoutubeId

      ? state.tracks.findIndex(
          (track) =>
            track.youtubeId ===
            state.savedYoutubeId
        )

      : -1;


  /*
   * If no saved song exists:
   *
   * Shuffle On  = random first track
   * Shuffle Off = first track in tracks.json
   */

  const firstIndex =

    savedIndex >= 0

      ? savedIndex

      : state.shuffle

        ? getNextRandomIndex()

        : getNextSequentialIndex();


  if (
    firstIndex === null
  ) {

    setReadyStatus(
      "No playable tracks were found."
    );

    return;

  }


  /*
   * Restore the song but don't automatically
   * start blasting music on page load.
   */

  loadTrack(

    firstIndex,

    {
      addToHistory: false,
      autoplay: false,
      scroll: true
    }

  );

}



/* =========================================================
   LOAD TRACKS.JSON
   ========================================================= */

async function loadTracks() {

  try {

    const response =
      await fetch(

        "tracks.json",

        {
          cache:
            "no-store"
        }

      );


    if (
      !response.ok
    ) {

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


    /*
     * A valid standard YouTube video ID
     * is 11 URL-safe characters.
     */

    state.tracks =
      tracks.filter(

        (track) =>

          typeof track.youtubeId ===
            "string" &&

          /^[A-Za-z0-9_-]{11}$/.test(
            track.youtubeId.trim()
          )

      );


    if (
      state.tracks.length === 0
    ) {

      throw new Error(
        "No valid YouTube IDs were found."
      );

    }


    state.tracksReady =
      true;


    rebuildShuffleQueue();


    renderTrackList();


    createYouTubePlayer();


    initializePlayer();

  } catch (error) {

    console.error(
      error
    );


    elements.status.textContent =
      "Could not load the music library.";


    elements.title.textContent =
      "Player unavailable";


    elements.details.textContent =
      error.message;


    elements.trackCount.textContent =
      "Unavailable";

  }

}



/* =========================================================
   YOUTUBE API
   ========================================================= */

function createYouTubePlayer() {

  if (
    state.playerRequested ||
    !state.youtubeApiReady ||
    !state.tracksReady ||
    !window.YT ||
    typeof window.YT.Player !==
      "function"
  ) {

    return;

  }


  const iframe =
    createYouTubeIframe(
      getInitialEmbedVideoId()
    );
  state.playerRequested =
    true;


  if (!iframe) {
  state.player =
    new YT.Player(

    return;
      "youtube-player",

  }
      {

        width:
          "100%",

  state.playerRequested =
    true;
        height:
          "100%",

        videoId:
          getInitialEmbedVideoId(),

  state.player =
    new YT.Player(
        host:
          state.useNoCookieHost
            ? "https://www.youtube-nocookie.com"
            : "https://www.youtube.com",

      iframe,
        playerVars: {

      {
          controls: 1,

          enablejsapi: 1,

          playsinline: 1,

          rel: 0,

          origin:
            getPageOrigin(),

          widget_referrer:
            getWidgetReferrer()

        },

        events: {

          onReady: () => {

            state.playerReady =
              true;


            setPlayerIframeIdentity();


            updateVolume();


            initializePlayer();

          },


          onStateChange:
            handlePlayerStateChange,


          onError:
            handlePlayerError,


          onAutoplayBlocked:
            handleAutoplayBlocked

        }

      }

    );


  window.setTimeout(
    setPlayerIframeIdentity,
    0
  );

}



window.onYouTubeIframeAPIReady =
  function onYouTubeIframeAPIReady() {

    state.youtubeApiReady =
      true;


    createYouTubePlayer();

  };



/* =========================================================
   EVENT LISTENERS
   ========================================================= */

elements.previousButton
  .addEventListener(

    "click",

    () =>
      playPreviousTrack({
        scroll: false
      })

  );



elements.playButton
  .addEventListener(

    "click",

    togglePlayback

  );



elements.nextButton
  .addEventListener(

    "click",

    () =>
      playNextTrack({
        autoplay: false,
        scroll: false
      })

  );



elements.shuffleButton
  .addEventListener(

    "click",

    toggleShuffle

  );



elements.volumeControl
  .addEventListener(

    "input",

    updateVolume

  );



elements.volumeControl
  .addEventListener(

    "change",

    updateVolume

  );



elements.trackSearch
  .addEventListener(

    "input",

    renderTrackList

  );



/*
 * One click listener handles every track row,
 * including rows created after searching.
 */

elements.trackList
  .addEventListener(

    "click",

    (event) => {

      const row =
        event.target.closest(
          ".track-row"
        );


      if (
        !row ||
        row.disabled
      ) {

        return;

      }


      loadTrack(

        Number(
          row.dataset.trackIndex
        ),

        {
          addToHistory: true,
          autoplay: true,
          scroll: true
        }

      );

    }

  );



/* =========================================================
   START
   ========================================================= */

loadPreferences();


syncVolumeReadout(
  clampVolume(
    elements.volumeControl.value
  )
);


syncReceiverPlayback(
  false
);


setControlsEnabled(
  false
);


loadTracks();
