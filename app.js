"use strict";

const STORAGE_KEY = "momPopVinylPlayer";
const MAX_CONSECUTIVE_ERRORS = 10;
const API_DELAY_NOTICE_MS = 8000;

const state = {
  tracks: [],
  queue: [],
  history: [],
  failedIndexes: new Set(),
  currentIndex: null,
  player: null,
  playerReady: false,
  youtubeApiReady: false,
  playerRequested: false,
  playerConstructionRetries: 0,
  useNoCookieHost: false,
  identityRetryDone: false,
  tracksReady: false,
  selectionInitialized: false,
  isPlaying: false,
  currentTrackStarted: false,
  shuffle: true,
  savedYoutubeId: null,
  savedTrackIndex: null,
  consecutiveErrors: 0,
  playbackState: "loading",
  apiUnavailable: false,
  pendingSelection: null,
  skipTimer: null,
  apiDelayTimer: null,
  libraryView: "tracks",
  groupSelections: {
    artists: null,
    albums: null
  },
  artistGroups: [],
  albumGroups: [],
  artistGroupMap: new Map(),
  albumGroupMap: new Map()
};

const elements = {
  skipLink: document.querySelector(".skip-link"),
  playerCard: document.querySelector(".player-card"),
  status: document.querySelector("#status"),
  title: document.querySelector("#track-title"),
  artist: document.querySelector("#track-artist"),
  album: document.querySelector("#track-album"),
  position: document.querySelector("#track-position"),
  programState: document.querySelector("#program-state"),
  programTrack: document.querySelector("#program-track"),
  programThumbnail: document.querySelector("#program-thumbnail"),
  watchVideo: document.querySelector("#watch-video"),
  previousButton: document.querySelector("#previous-button"),
  playButton: document.querySelector("#play-button"),
  playIcon: document.querySelector("#play-icon"),
  playLabel: document.querySelector("#play-label"),
  nextButton: document.querySelector("#next-button"),
  shuffleButton: document.querySelector("#shuffle-button"),
  shuffleState: document.querySelector("#shuffle-state"),
  volumePanel: document.querySelector("#volume-panel"),
  volumeControl: document.querySelector("#volume-control"),
  volumeValue: document.querySelector("#volume-value"),
  trackList: document.querySelector("#track-list"),
  trackCount: document.querySelector("#track-count"),
  trackSearch: document.querySelector("#track-search"),
  clearSearch: document.querySelector("#clear-search"),
  libraryPanel: document.querySelector("#library-panel"),
  recordLibrary: document.querySelector("#record-library"),
  libraryEmpty: document.querySelector("#library-empty"),
  libraryContextTitle: document.querySelector("#library-context-title"),
  groupBackButton: document.querySelector("#group-back-button"),
  groupBackLabel: document.querySelector("#group-back-label"),
  libraryTabs: document.querySelector(".library-tabs"),
  libraryViewButtons: [...document.querySelectorAll(".library-view-button")],
  copyrightYear: document.querySelector("#copyright-year"),
  youtubeApiScript: document.querySelector("#youtube-api")
};

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }

  return copy;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‘’']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getSearchTerms(value = elements.trackSearch.value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function textMatchesTerms(value, terms) {
  if (terms.length === 0) {
    return true;
  }

  const haystack = normalizeText(value);
  return terms.every((term) => haystack.includes(term));
}

function trackMatchesSearch(track, terms) {
  return textMatchesTerms(
    `${track.title} ${track.artist} ${track.album} ${track.trackNumber}`,
    terms
  );
}

function clampVolume(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : 70;
}

function getComparableTextMap(value) {
  const text = String(value ?? "");
  let comparable = "";
  const characterMap = [];
  let offset = 0;

  for (const character of text) {
    const start = offset;
    const end = start + character.length;
    offset = end;

    const normalizedCharacters = character
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    let addedAlphaNumeric = false;

    for (const normalizedCharacter of normalizedCharacters) {
      if (/[a-z0-9]/.test(normalizedCharacter)) {
        comparable += normalizedCharacter;
        characterMap.push({ start, end });
        addedAlphaNumeric = true;
      }
    }

    if (!addedAlphaNumeric && !/[‘’']/.test(character) && comparable.at(-1) !== " ") {
      comparable += " ";
      characterMap.push({ start, end });
    }
  }

  return { text, comparable: comparable.trimEnd(), characterMap };
}

function appendHighlightedText(container, value, terms) {
  const { text, comparable, characterMap } = getComparableTextMap(value);

  if (terms.length === 0) {
    container.appendChild(document.createTextNode(text));
    return;
  }

  const ranges = [];
  terms.forEach((term) => {
    let searchFrom = 0;
    let matchIndex = comparable.indexOf(term, searchFrom);

    while (matchIndex >= 0) {
      const firstCharacter = characterMap[matchIndex];
      const lastCharacter = characterMap[matchIndex + term.length - 1];
      if (firstCharacter && lastCharacter) {
        ranges.push([firstCharacter.start, lastCharacter.end]);
      }
      searchFrom = matchIndex + Math.max(term.length, 1);
      matchIndex = comparable.indexOf(term, searchFrom);
    }
  });

  if (ranges.length === 0) {
    container.appendChild(document.createTextNode(text));
    return;
  }

  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const mergedRanges = ranges.reduce((merged, range) => {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], range[1]);
    } else {
      merged.push([...range]);
    }
    return merged;
  }, []);

  let cursor = 0;
  mergedRanges.forEach(([start, end]) => {
    if (start > cursor) {
      container.appendChild(document.createTextNode(text.slice(cursor, start)));
    }
    const mark = document.createElement("mark");
    mark.className = "search-match";
    mark.textContent = text.slice(start, end);
    container.appendChild(mark);
    cursor = end;
  });

  if (cursor < text.length) {
    container.appendChild(document.createTextNode(text.slice(cursor)));
  }
}

function getPageOrigin() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.origin;
  }

  return "https://jackpwn.github.io";
}

function getWidgetReferrer() {
  if (window.location.protocol === "http:" || window.location.protocol === "https:") {
    return window.location.href;
  }

  return "https://jackpwn.github.io/RECORDPLAYER/";
}

function formatCount(number, singular, plural = `${singular}s`) {
  return `${number.toLocaleString()} ${number === 1 ? singular : plural}`;
}

function getCurrentTrack() {
  return Number.isInteger(state.currentIndex) ? state.tracks[state.currentIndex] : null;
}

function setPlayerIframeIdentity() {
  if (!state.player || typeof state.player.getIframe !== "function") {
    return;
  }

  const iframe = state.player.getIframe();
  if (!iframe) {
    return;
  }

  iframe.title = "YouTube video player for the selected track";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  iframe.setAttribute(
    "allow",
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
  );
  iframe.setAttribute("allowfullscreen", "");
  iframe.setAttribute("playsinline", "1");
}

function getInitialEmbedVideoId() {
  const currentTrack = getCurrentTrack();
  if (currentTrack) {
    return currentTrack.youtubeId;
  }

  if (state.savedYoutubeId) {
    const savedTrack = state.tracks.find((track) => track.youtubeId === state.savedYoutubeId);
    if (savedTrack) {
      return savedTrack.youtubeId;
    }
  }

  return state.tracks[0]?.youtubeId || "";
}

function resetYouTubeMount() {
  const currentNode = document.querySelector("#youtube-player");
  const wrap = document.querySelector(".video-wrap");

  if (!wrap) {
    return;
  }

  const mount = document.createElement("div");
  mount.id = "youtube-player";
  mount.setAttribute("aria-label", "YouTube video player");

  if (currentNode) {
    currentNode.replaceWith(mount);
  } else {
    wrap.appendChild(mount);
  }
}

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    elements.volumeControl.value = String(clampVolume(saved.volume));
    state.shuffle = typeof saved.shuffle === "boolean" ? saved.shuffle : true;
    state.savedYoutubeId = typeof saved.youtubeId === "string" ? saved.youtubeId : null;
    state.savedTrackIndex = Number.isInteger(saved.trackIndex) ? saved.trackIndex : null;
  } catch (error) {
    console.warn("Could not read saved player settings.", error);
    elements.volumeControl.value = "70";
    state.shuffle = true;
    state.savedYoutubeId = null;
    state.savedTrackIndex = null;
  }

  updateShuffleButton();
}

function savePreferences() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        volume: clampVolume(elements.volumeControl.value),
        youtubeId: state.savedYoutubeId,
        trackIndex: state.savedTrackIndex,
        shuffle: state.shuffle
      })
    );
  } catch (error) {
    console.warn("Could not save player settings.", error);
  }
}

function getProgramStateLabel(playbackState) {
  const labels = {
    loading: "Loading",
    ready: "Ready",
    cued: "Ready",
    playing: "Playing",
    paused: "Paused",
    buffering: "Loading",
    blocked: "Blocked",
    unavailable: "Unavailable",
    error: "Service"
  };

  return labels[playbackState] || "Standby";
}

function syncReceiverPlayback(playing) {
  state.isPlaying = playing;
  elements.playerCard.classList.toggle("is-playing", playing);
  elements.playIcon.textContent = playing ? "Ⅱ" : "▶";
  elements.playLabel.textContent = playing ? "Pause" : "Play";
  elements.playButton.setAttribute(
    "aria-label",
    playing ? "Pause current track" : "Play current track"
  );
}

function syncVisiblePlaybackMarkers() {
  const selectedRows = elements.trackList.querySelectorAll(".track-row.is-selected");
  selectedRows.forEach((row) => {
    const failed = row.classList.contains("is-unavailable");
    row.classList.toggle("is-playing", state.isPlaying && !failed);
    const badge = row.querySelector(".track-row-badge");
    if (badge && !failed) {
      badge.textContent = state.isPlaying ? "Playing" : "Selected";
    }
  });

  const currentGroups = elements.trackList.querySelectorAll(".library-group.has-current");
  currentGroups.forEach((group) => {
    const badge = group.querySelector(".group-badge");
    if (badge) {
      badge.textContent = state.isPlaying ? "Playing" : "Selected";
    }
  });
}

function setPlaybackState(playbackState, message) {
  state.playbackState = playbackState;
  elements.playerCard.dataset.playbackState = playbackState;
  elements.programState.textContent = getProgramStateLabel(playbackState);
  elements.status.textContent = message;
  syncReceiverPlayback(playbackState === "playing");
  syncVisiblePlaybackMarkers();
}

function announceStatus(message) {
  elements.status.textContent = message;
}

function setControlStates() {
  const hasCurrent = state.currentIndex !== null;
  const currentFailed = hasCurrent && state.failedIndexes.has(state.currentIndex);
  const canUsePlayer = state.playerReady && state.tracksReady && hasCurrent;
  const hasPlayableTrack = state.tracks.length > state.failedIndexes.size;

  elements.playButton.disabled = !canUsePlayer || currentFailed;
  elements.nextButton.disabled = !canUsePlayer || !hasPlayableTrack;
  elements.previousButton.disabled = !canUsePlayer || state.history.length === 0;
  elements.shuffleButton.disabled = !state.tracksReady;
}

function updateShuffleButton() {
  elements.shuffleState.textContent = state.shuffle ? "On" : "Off";
  elements.shuffleButton.setAttribute("aria-pressed", String(state.shuffle));
  elements.shuffleButton.setAttribute("aria-label", `Shuffle is ${state.shuffle ? "on" : "off"}`);
  elements.shuffleButton.classList.toggle("is-on", state.shuffle);
}

function rebuildShuffleQueue() {
  const candidates = state.tracks
    .map((_, index) => index)
    .filter((index) => index !== state.currentIndex && !state.failedIndexes.has(index));

  state.queue = shuffle(candidates);
}

function getNextRandomIndex() {
  state.queue = state.queue.filter((index) => !state.failedIndexes.has(index));

  if (state.queue.length === 0) {
    rebuildShuffleQueue();
  }

  if (state.queue.length > 0) {
    return state.queue.pop();
  }

  if (state.currentIndex !== null && !state.failedIndexes.has(state.currentIndex)) {
    return state.currentIndex;
  }

  return null;
}

function getNextSequentialIndex() {
  if (state.tracks.length === 0) {
    return null;
  }

  const start = Number.isInteger(state.currentIndex) ? state.currentIndex : -1;

  for (let offset = 1; offset <= state.tracks.length; offset += 1) {
    const index = (start + offset) % state.tracks.length;
    if (!state.failedIndexes.has(index)) {
      return index;
    }
  }

  return null;
}

function getNextTrackIndex() {
  return state.shuffle ? getNextRandomIndex() : getNextSequentialIndex();
}

function buildLibraryGroups() {
  const artistMap = new Map();
  const albumMap = new Map();

  state.tracks.forEach((track, index) => {
    if (!artistMap.has(track.artist)) {
      artistMap.set(track.artist, {
        key: track.artist,
        name: track.artist,
        trackIndexes: [],
        albums: new Set()
      });
    }

    const artistGroup = artistMap.get(track.artist);
    artistGroup.trackIndexes.push(index);
    artistGroup.albums.add(track.album);

    const albumKey = `${track.artist}|||${track.album}`;
    if (!albumMap.has(albumKey)) {
      albumMap.set(albumKey, {
        key: albumKey,
        name: track.album,
        artist: track.artist,
        trackIndexes: []
      });
    }

    albumMap.get(albumKey).trackIndexes.push(index);
  });

  const byName = (a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) ||
    String(a.artist || "").localeCompare(String(b.artist || ""), undefined, {
      sensitivity: "base"
    });

  state.artistGroups = [...artistMap.values()].sort(byName);
  state.albumGroups = [...albumMap.values()].sort(byName);
  state.artistGroupMap = new Map(state.artistGroups.map((group) => [group.key, group]));
  state.albumGroupMap = new Map(state.albumGroups.map((group) => [group.key, group]));
}

function getGroupsForView(view) {
  return view === "artists" ? state.artistGroups : state.albumGroups;
}

function getGroupMapForView(view) {
  return view === "artists" ? state.artistGroupMap : state.albumGroupMap;
}

function groupMatchesSearch(group, view, terms) {
  const groupMetadata =
    view === "artists"
      ? group.name
      : `${group.name} ${group.artist}`;

  return (
    textMatchesTerms(groupMetadata, terms) ||
    group.trackIndexes.some((index) => trackMatchesSearch(state.tracks[index], terms))
  );
}

function getCurrentGroupKey(view) {
  const track = getCurrentTrack();
  if (!track) {
    return null;
  }

  return view === "artists" ? track.artist : `${track.artist}|||${track.album}`;
}

function createTrackListItem(track, index, terms) {
  const item = document.createElement("div");
  const button = document.createElement("button");
  const title = document.createElement("span");
  const meta = document.createElement("span");
  const badge = document.createElement("span");
  const isFailed = state.failedIndexes.has(index);
  const isCurrent = index === state.currentIndex;

  item.className = "track-list-item";
  item.setAttribute("role", "listitem");

  button.type = "button";
  button.className = "track-row";
  button.dataset.trackIndex = String(index);
  button.setAttribute(
    "aria-label",
    `Track ${track.trackNumber}: ${track.title} by ${track.artist}, from ${track.album}${
      isFailed ? ", unavailable" : ""
    }`
  );
  button.classList.toggle("is-selected", isCurrent);
  button.classList.toggle("is-playing", isCurrent && state.isPlaying);
  button.classList.toggle("is-unavailable", isFailed);

  if (isCurrent) {
    button.setAttribute("aria-current", "true");
  }

  if (isFailed) {
    button.setAttribute("aria-disabled", "true");
  }

  title.className = "track-row-title";
  appendHighlightedText(title, track.title || "Unknown Track", terms);

  meta.className = "track-row-meta";
  appendHighlightedText(meta, track.artist || "Unknown Artist", terms);
  meta.appendChild(document.createTextNode(" · "));
  appendHighlightedText(meta, track.album || "Unknown Album", terms);

  badge.className = "track-row-badge";
  badge.textContent = isFailed
    ? "Unavailable"
    : isCurrent
      ? state.isPlaying
        ? "Playing"
        : "Selected"
      : "";

  button.append(title, meta, badge);
  item.appendChild(button);
  return item;
}

function createGroupListItem(group, view, groupIndex, terms) {
  const item = document.createElement("div");
  const button = document.createElement("button");
  const indexLabel = document.createElement("span");
  const title = document.createElement("span");
  const meta = document.createElement("span");
  const badge = document.createElement("span");
  const currentGroupKey = getCurrentGroupKey(view);
  const hasCurrent = group.key === currentGroupKey;

  item.className = "track-list-item";
  item.setAttribute("role", "listitem");

  button.type = "button";
  button.className = "library-group";
  button.dataset.groupKey = group.key;
  button.classList.toggle("has-current", hasCurrent);

  if (hasCurrent) {
    button.setAttribute("aria-current", "true");
  }

  const groupType = view === "artists" ? "artist" : "album";
  const groupOwner = view === "albums" ? ` by ${group.artist}` : "";
  const currentState = hasCurrent ? `, ${state.isPlaying ? "playing" : "selected"}` : "";
  button.setAttribute(
    "aria-label",
    `${groupType} ${group.name}${groupOwner}, ${formatCount(
      group.trackIndexes.length,
      "track"
    )}${currentState}`
  );

  indexLabel.className = "group-index";
  indexLabel.textContent = `${groupType} ${String(groupIndex + 1).padStart(2, "0")}`;

  title.className = "group-title";
  appendHighlightedText(title, group.name, terms);

  meta.className = "group-meta";
  if (view === "artists") {
    meta.textContent = `${formatCount(group.trackIndexes.length, "track")} · ${formatCount(
      group.albums.size,
      "album"
    )}`;
  } else {
    appendHighlightedText(meta, group.artist, terms);
    meta.appendChild(document.createTextNode(` · ${formatCount(group.trackIndexes.length, "track")}`));
  }

  badge.className = "group-badge";
  badge.textContent = hasCurrent ? (state.isPlaying ? "Playing" : "Selected") : "";

  button.append(indexLabel, title, meta, badge);
  item.appendChild(button);
  return item;
}

function setLibraryEmpty(message) {
  elements.libraryEmpty.textContent = message;
  elements.libraryEmpty.hidden = !message;
}

function updateLibraryContext() {
  const view = state.libraryView;
  const selectedKey = view === "tracks" ? null : state.groupSelections[view];
  const group = selectedKey ? getGroupMapForView(view).get(selectedKey) : null;

  elements.groupBackButton.hidden = !group;
  elements.libraryContextTitle.hidden = !group;

  if (group) {
    elements.groupBackLabel.textContent = view;
    elements.libraryContextTitle.textContent =
      view === "albums" ? `${group.name} — ${group.artist}` : group.name;
  }
}

function updateLibraryTabs() {
  elements.libraryViewButtons.forEach((button) => {
    const active = button.dataset.view === state.libraryView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });

  const activeTab = elements.libraryViewButtons.find(
    (button) => button.dataset.view === state.libraryView
  );
  elements.libraryPanel.setAttribute("aria-labelledby", activeTab?.id || "tracks-view");
}

function renderLibrary({ scrollCurrent = false, focusTrackIndex = null } = {}) {
  const query = elements.trackSearch.value.trim();
  const terms = getSearchTerms(query);
  const fragment = document.createDocumentFragment();
  const view = state.libraryView;
  let visibleCount = 0;

  elements.clearSearch.hidden = query.length === 0;
  updateLibraryTabs();
  updateLibraryContext();

  if (view === "tracks") {
    state.tracks.forEach((track, index) => {
      if (!trackMatchesSearch(track, terms)) {
        return;
      }

      visibleCount += 1;
      fragment.appendChild(createTrackListItem(track, index, terms));
    });

    elements.trackCount.textContent = query
      ? `${visibleCount.toLocaleString()} of ${state.tracks.length.toLocaleString()} tracks`
      : formatCount(state.tracks.length, "track");
  } else {
    const groupMap = getGroupMapForView(view);
    const selectedKey = state.groupSelections[view];
    const selectedGroup = selectedKey ? groupMap.get(selectedKey) : null;

    if (selectedGroup) {
      const groupNameMatches = textMatchesTerms(
        view === "albums"
          ? `${selectedGroup.name} ${selectedGroup.artist}`
          : selectedGroup.name,
        terms
      );

      selectedGroup.trackIndexes.forEach((index) => {
        const track = state.tracks[index];
        if (terms.length > 0 && !groupNameMatches && !trackMatchesSearch(track, terms)) {
          return;
        }

        visibleCount += 1;
        fragment.appendChild(createTrackListItem(track, index, terms));
      });

      elements.trackCount.textContent = formatCount(visibleCount, "track");
    } else {
      const groups = getGroupsForView(view);
      groups.forEach((group, groupIndex) => {
        if (!groupMatchesSearch(group, view, terms)) {
          return;
        }

        visibleCount += 1;
        fragment.appendChild(createGroupListItem(group, view, groupIndex, terms));
      });

      const totalGroups = groups.length;
      const groupLabel = view === "artists" ? "artist" : "album";
      elements.trackCount.textContent = query
        ? `${visibleCount.toLocaleString()} of ${formatCount(totalGroups, groupLabel)}`
        : formatCount(totalGroups, groupLabel);
    }
  }

  elements.trackList.replaceChildren(fragment);

  if (visibleCount === 0) {
    const subject = view === "tracks" ? "tracks" : view;
    const quotedQuery = query ? ` “${query}”` : "";
    setLibraryEmpty(`No ${subject} match${quotedQuery}. Try an artist, album, title, or fewer words.`);
  } else {
    setLibraryEmpty("");
  }

  if (scrollCurrent) {
    window.requestAnimationFrame(scrollCurrentTrackIntoView);
  }

  if (Number.isInteger(focusTrackIndex)) {
    window.requestAnimationFrame(() => {
      elements.trackList
        .querySelector(`.track-row[data-track-index="${focusTrackIndex}"]`)
        ?.focus({ preventScroll: true });
    });
  }
}

function scrollCurrentTrackIntoView() {
  const activeRow = elements.trackList.querySelector(".track-row.is-selected");
  if (!activeRow) {
    return;
  }

  const listRect = elements.trackList.getBoundingClientRect();
  const rowRect = activeRow.getBoundingClientRect();

  if (rowRect.top < listRect.top) {
    elements.trackList.scrollTop -= listRect.top - rowRect.top;
  } else if (rowRect.bottom > listRect.bottom) {
    elements.trackList.scrollTop += rowRect.bottom - listRect.bottom;
  }
}

function updateProgramArtwork(track) {
  const videoId = track.youtubeId;
  const thumbnail = elements.programThumbnail;

  thumbnail.hidden = true;
  thumbnail.removeAttribute("src");
  thumbnail.dataset.videoId = videoId;

  thumbnail.onload = () => {
    if (thumbnail.dataset.videoId === videoId) {
      thumbnail.hidden = false;
    }
  };

  thumbnail.onerror = () => {
    if (thumbnail.dataset.videoId === videoId) {
      thumbnail.hidden = true;
      thumbnail.removeAttribute("src");
    }
  };

  thumbnail.src = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

function renderCurrentTrack(track, index) {
  const title = track.title || "Unknown Track";
  const artist = track.artist || "Unknown Artist";
  const album = track.album || "Unknown Album";
  const trackNumber = track.trackNumber ?? "?";

  elements.title.textContent = title;
  elements.title.title = title;
  elements.artist.textContent = artist;
  elements.album.textContent = album;
  elements.position.textContent = `Album track ${trackNumber} · Library position ${index + 1}`;
  elements.programTrack.textContent = `${title} — ${artist}`;

  elements.watchVideo.href = track.youtubeUrl || `https://www.youtube.com/watch?v=${track.youtubeId}`;
  elements.watchVideo.setAttribute("aria-label", `Watch ${title} by ${artist} on YouTube`);
  elements.watchVideo.hidden = false;

  updateProgramArtwork(track);
}

function clearScheduledSkip() {
  if (state.skipTimer !== null) {
    window.clearTimeout(state.skipTimer);
    state.skipTimer = null;
  }
}

function applyPendingSelection() {
  if (!state.playerReady || !state.player || !state.pendingSelection) {
    return;
  }

  const pending = state.pendingSelection;
  if (pending.index !== state.currentIndex) {
    state.pendingSelection = null;
    return;
  }

  const track = state.tracks[pending.index];
  if (!track || state.failedIndexes.has(pending.index)) {
    state.pendingSelection = null;
    return;
  }

  state.pendingSelection = null;

  try {
    if (pending.autoplay) {
      setPlaybackState("buffering", `Loading ${track.title}…`);
      state.player.loadVideoById(track.youtubeId);
    } else {
      state.player.cueVideoById(track.youtubeId);
      setPlaybackState("cued", "Ready — press Play");
    }
  } catch (error) {
    console.error("Could not load the selected YouTube video.", error);
    setPlaybackState("error", "The selected video could not be loaded. Choose another track.");
  }
}

function loadTrack(
  index,
  { addToHistory = true, autoplay = true, scroll = true, restoreFocus = false } = {}
) {
  if (!state.tracksReady) {
    return;
  }

  if (!Number.isInteger(index) || index < 0 || index >= state.tracks.length) {
    console.warn("Invalid track index:", index);
    return;
  }

  if (state.failedIndexes.has(index)) {
    announceStatus("That track is unavailable in this session.");
    return;
  }

  clearScheduledSkip();

  if (addToHistory && state.currentIndex !== null && state.currentIndex !== index) {
    state.history.push(state.currentIndex);
  }

  state.currentIndex = index;
  state.queue = state.queue.filter((queuedIndex) => queuedIndex !== index);

  const track = state.tracks[index];
  state.savedYoutubeId = track.youtubeId;
  state.savedTrackIndex = index;
  state.currentTrackStarted = false;
  state.pendingSelection = {
    index,
    autoplay
  };

  savePreferences();
  renderCurrentTrack(track, index);
  renderLibrary({
    scrollCurrent: scroll,
    focusTrackIndex: restoreFocus ? index : null
  });

  if (state.playerReady) {
    applyPendingSelection();
  } else if (state.apiUnavailable) {
    setPlaybackState("error", "Selected — YouTube playback is currently unavailable");
  } else {
    setPlaybackState(
      "loading",
      autoplay
        ? "Waiting for the YouTube player — playback will start when ready"
        : "Selected — waiting for the YouTube player"
    );
  }

  setControlStates();
}

function playNextTrack({ addToHistory = true, autoplay = true, scroll = true } = {}) {
  if (!state.tracksReady) {
    return;
  }

  const nextIndex = getNextTrackIndex();
  if (nextIndex === null) {
    setPlaybackState("unavailable", "No playable tracks remain in this session.");
    return;
  }

  loadTrack(nextIndex, { addToHistory, autoplay, scroll });
}

function playPreviousTrack({ scroll = true } = {}) {
  while (state.history.length > 0) {
    const previousIndex = state.history.pop();
    if (!state.failedIndexes.has(previousIndex)) {
      loadTrack(previousIndex, {
        addToHistory: false,
        autoplay: false,
        scroll
      });
      break;
    }
  }

  setControlStates();
}

function togglePlayback() {
  if (!state.playerReady || !state.player || state.currentIndex === null) {
    announceStatus("The YouTube player is still loading.");
    return;
  }

  if (state.isPlaying) {
    state.player.pauseVideo();
    return;
  }

  const track = getCurrentTrack();
  if (!track) {
    return;
  }

  try {
    if (!state.currentTrackStarted) {
      setPlaybackState("buffering", `Loading ${track.title}…`);
      state.player.loadVideoById(track.youtubeId);
    } else {
      state.player.playVideo();
    }
  } catch (error) {
    console.error("Could not change playback state.", error);
    setPlaybackState("error", "Playback could not be started. Try another track.");
  }
}

function toggleShuffle() {
  state.shuffle = !state.shuffle;
  updateShuffleButton();

  if (state.shuffle) {
    rebuildShuffleQueue();
  } else {
    state.queue = [];
  }

  savePreferences();
}

function syncVolumeReadout(volume) {
  const muted = volume === 0;
  elements.volumeValue.textContent = muted ? "Muted" : `${volume}%`;
  elements.volumeControl.setAttribute(
    "aria-valuetext",
    muted ? "Muted" : `${volume} percent`
  );
  elements.volumePanel.classList.toggle("is-muted", muted);
  elements.volumePanel.style.setProperty("--volume-percent", `${volume}%`);
}

function updateVolume() {
  const volume = clampVolume(elements.volumeControl.value);
  elements.volumeControl.value = String(volume);
  syncVolumeReadout(volume);
  savePreferences();

  if (!state.playerReady || !state.player) {
    return;
  }

  try {
    state.player.setVolume(volume);
    if (volume === 0) {
      state.player.mute();
    } else if (state.player.isMuted()) {
      state.player.unMute();
    }
  } catch (error) {
    console.warn("Could not update YouTube volume.", error);
  }
}

function handlePlayerStateChange(event) {
  const playerState = window.YT?.PlayerState;
  if (!playerState) {
    return;
  }

  if (event.data === playerState.PLAYING) {
    state.currentTrackStarted = true;
    state.consecutiveErrors = 0;
    setPlaybackState("playing", "Playing");
    return;
  }

  if (event.data === playerState.PAUSED) {
    setPlaybackState("paused", "Paused");
    return;
  }

  if (event.data === playerState.BUFFERING) {
    setPlaybackState("buffering", "Loading audio…");
    return;
  }

  if (event.data === playerState.CUED) {
    setPlaybackState("cued", "Ready — press Play");
    return;
  }

  if (event.data === playerState.ENDED) {
    setPlaybackState("ready", "Track complete — selecting the next track");
    playNextTrack();
  }
}

function describePlayerError(code) {
  switch (code) {
    case 2:
      return "Invalid YouTube video ID";
    case 5:
      return "YouTube could not play this video in the HTML5 player";
    case 100:
      return "Video removed or private";
    case 101:
    case 150:
      return "Embedding disabled by the video owner";
    default:
      return "Video unavailable";
  }
}

function errorBelongsToCurrentTrack() {
  const currentTrack = getCurrentTrack();
  if (!currentTrack || !state.player || typeof state.player.getVideoData !== "function") {
    return true;
  }

  try {
    const videoId = state.player.getVideoData()?.video_id;
    return !videoId || videoId === currentTrack.youtubeId;
  } catch {
    return true;
  }
}

function handlePlayerError(event) {
  const code = Number(event.data);

  if (!errorBelongsToCurrentTrack()) {
    return;
  }

  clearScheduledSkip();
  syncReceiverPlayback(false);

  if (code === 153) {
    if (!state.identityRetryDone) {
      state.identityRetryDone = true;
      state.useNoCookieHost = true;
      state.playerReady = false;
      state.playerRequested = false;
      state.pendingSelection =
        state.currentIndex === null
          ? null
          : { index: state.currentIndex, autoplay: false };

      if (state.player && typeof state.player.destroy === "function") {
        state.player.destroy();
      }

      state.player = null;
      resetYouTubeMount();
      setControlStates();
      setPlaybackState("loading", "Reconnecting to YouTube…");
      createYouTubePlayer();
      return;
    }

    setPlaybackState(
      "error",
      "YouTube could not verify this local embed. Reload the page and try again."
    );
    setControlStates();
    return;
  }

  if (state.currentIndex === null) {
    setPlaybackState("error", describePlayerError(code));
    return;
  }

  const failedIndex = state.currentIndex;
  state.failedIndexes.add(failedIndex);
  state.queue = state.queue.filter((index) => index !== failedIndex);
  state.consecutiveErrors += 1;
  renderLibrary();
  setControlStates();

  if (
    state.consecutiveErrors >= Math.min(MAX_CONSECUTIVE_ERRORS, state.tracks.length)
  ) {
    setPlaybackState(
      "unavailable",
      "Several videos failed in a row. Choose another track from the library."
    );
    return;
  }

  const reason = describePlayerError(code);
  setPlaybackState("unavailable", `${reason}. Skipping…`);

  state.skipTimer = window.setTimeout(() => {
    state.skipTimer = null;
    if (state.currentIndex !== failedIndex) {
      return;
    }

    playNextTrack({ addToHistory: false });
  }, 650);
}

function handleAutoplayBlocked() {
  setPlaybackState("blocked", "Playback was blocked — press Play to start");
}

function initializeSelection() {
  if (!state.tracksReady || state.selectionInitialized) {
    return;
  }

  state.selectionInitialized = true;

  const exactSavedIndex =
    Number.isInteger(state.savedTrackIndex) &&
    state.savedTrackIndex >= 0 &&
    state.savedTrackIndex < state.tracks.length &&
    state.tracks[state.savedTrackIndex].youtubeId === state.savedYoutubeId
      ? state.savedTrackIndex
      : -1;
  const savedIndex =
    exactSavedIndex >= 0
      ? exactSavedIndex
      : state.savedYoutubeId
        ? state.tracks.findIndex((track) => track.youtubeId === state.savedYoutubeId)
        : -1;

  const firstIndex =
    savedIndex >= 0
      ? savedIndex
      : state.shuffle
        ? getNextRandomIndex()
        : getNextSequentialIndex();

  if (firstIndex === null) {
    setPlaybackState("unavailable", "No playable tracks were found.");
    return;
  }

  loadTrack(firstIndex, {
    addToHistory: false,
    autoplay: false,
    scroll: true
  });
}

function clearApiDelayTimer() {
  if (state.apiDelayTimer !== null) {
    window.clearTimeout(state.apiDelayTimer);
    state.apiDelayTimer = null;
  }
}

function startApiDelayNotice() {
  clearApiDelayTimer();
  state.apiDelayTimer = window.setTimeout(() => {
    state.apiDelayTimer = null;
    if (!state.playerReady && !state.apiUnavailable) {
      setPlaybackState(
        "loading",
        "The YouTube player is taking longer than expected — the library is still available"
      );
    }
  }, API_DELAY_NOTICE_MS);
}

async function loadTracks() {
  try {
    const response = await fetch("tracks.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load tracks.json (${response.status})`);
    }

    const tracks = await response.json();
    if (!Array.isArray(tracks) || tracks.length === 0) {
      throw new Error("tracks.json does not contain any tracks.");
    }

    state.tracks = tracks.filter(
      (track) =>
        typeof track.youtubeId === "string" &&
        /^[A-Za-z0-9_-]{11}$/.test(track.youtubeId.trim())
    );

    if (state.tracks.length === 0) {
      throw new Error("No valid YouTube IDs were found.");
    }

    state.tracksReady = true;
    buildLibraryGroups();
    rebuildShuffleQueue();
    renderLibrary();
    initializeSelection();
    setControlStates();
    createYouTubePlayer();
  } catch (error) {
    console.error(error);
    clearApiDelayTimer();
    setPlaybackState("error", "Could not load the music library.");
    elements.title.textContent = "Player unavailable";
    elements.artist.textContent = "The local library could not be read";
    elements.album.textContent = error.message;
    elements.position.textContent = "Check tracks.json and reload";
    elements.programTrack.textContent = "Library unavailable";
    elements.trackCount.textContent = "Unavailable";
    setLibraryEmpty("The record library could not be loaded.");
  }
}

function createYouTubePlayer() {
  if (
    state.playerRequested ||
    !state.youtubeApiReady ||
    !state.tracksReady ||
    !window.YT ||
    typeof window.YT.Player !== "function"
  ) {
    return;
  }

  state.playerRequested = true;
  startApiDelayNotice();

  try {
    state.player = new window.YT.Player("youtube-player", {
      width: "100%",
      height: "100%",
      videoId: getInitialEmbedVideoId(),
      host: state.useNoCookieHost
        ? "https://www.youtube-nocookie.com"
        : "https://www.youtube.com",
      playerVars: {
        controls: 1,
        enablejsapi: 1,
        playsinline: 1,
        rel: 0,
        origin: getPageOrigin(),
        widget_referrer: getWidgetReferrer()
      },
      events: {
        onReady: () => {
          clearApiDelayTimer();
          state.apiUnavailable = false;
          state.playerReady = true;
          state.playerConstructionRetries = 0;
          setPlayerIframeIdentity();
          updateVolume();
          setControlStates();
          applyPendingSelection();

          if (!state.pendingSelection && state.currentIndex !== null) {
            setPlaybackState("cued", "Ready — press Play");
          }
        },
        onStateChange: handlePlayerStateChange,
        onError: handlePlayerError,
        onAutoplayBlocked: handleAutoplayBlocked
      }
    });

    window.setTimeout(setPlayerIframeIdentity, 0);
  } catch (error) {
    console.error("Could not create the YouTube player.", error);
    state.player = null;
    state.playerRequested = false;
    state.playerReady = false;
    setControlStates();

    if (state.playerConstructionRetries < 2) {
      state.playerConstructionRetries += 1;
      setPlaybackState("loading", "Retrying the YouTube player…");
      window.setTimeout(createYouTubePlayer, 1200);
    } else {
      clearApiDelayTimer();
      state.apiUnavailable = true;
      setPlaybackState(
        "error",
        "The YouTube player could not start. The record library is still available."
      );
    }
  }
}

function setLibraryView(view, { focus = false } = {}) {
  if (!["tracks", "artists", "albums"].includes(view) || view === state.libraryView) {
    if (focus) {
      elements.libraryViewButtons.find((button) => button.dataset.view === view)?.focus();
    }
    return;
  }

  state.libraryView = view;
  elements.trackList.scrollTop = 0;
  renderLibrary();

  if (focus) {
    elements.libraryViewButtons.find((button) => button.dataset.view === view)?.focus();
  }
}

window.onYouTubeIframeAPIReady = function onYouTubeIframeAPIReady() {
  state.youtubeApiReady = true;
  createYouTubePlayer();
};

elements.previousButton.addEventListener("click", () => {
  playPreviousTrack({ scroll: false });
});

elements.playButton.addEventListener("click", togglePlayback);

elements.nextButton.addEventListener("click", () => {
  playNextTrack({ autoplay: false, scroll: false });
});

elements.shuffleButton.addEventListener("click", toggleShuffle);
elements.volumeControl.addEventListener("input", updateVolume);
elements.volumeControl.addEventListener("change", updateVolume);

elements.trackSearch.addEventListener("input", () => {
  elements.trackList.scrollTop = 0;
  renderLibrary();
});

elements.clearSearch.addEventListener("click", () => {
  elements.trackSearch.value = "";
  elements.trackList.scrollTop = 0;
  renderLibrary();
  elements.trackSearch.focus();
});

elements.groupBackButton.addEventListener("click", () => {
  state.groupSelections[state.libraryView] = null;
  elements.trackList.scrollTop = 0;
  renderLibrary();
  elements.libraryViewButtons
    .find((button) => button.dataset.view === state.libraryView)
    ?.focus();
});

elements.libraryTabs.addEventListener("click", (event) => {
  const button = event.target.closest(".library-view-button");
  if (button) {
    setLibraryView(button.dataset.view);
  }
});

elements.libraryTabs.addEventListener("keydown", (event) => {
  const activeIndex = elements.libraryViewButtons.findIndex(
    (button) => button.dataset.view === state.libraryView
  );
  let nextIndex = activeIndex;

  if (event.key === "ArrowRight") {
    nextIndex = (activeIndex + 1) % elements.libraryViewButtons.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex =
      (activeIndex - 1 + elements.libraryViewButtons.length) %
      elements.libraryViewButtons.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = elements.libraryViewButtons.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  setLibraryView(elements.libraryViewButtons[nextIndex].dataset.view, { focus: true });
});

elements.trackList.addEventListener("click", (event) => {
  const groupButton = event.target.closest(".library-group");
  if (groupButton && state.libraryView !== "tracks") {
    state.groupSelections[state.libraryView] = groupButton.dataset.groupKey;
    elements.trackList.scrollTop = 0;
    renderLibrary({ scrollCurrent: true });
    window.requestAnimationFrame(() => elements.groupBackButton.focus());
    return;
  }

  const row = event.target.closest(".track-row");
  if (!row) {
    return;
  }

  if (row.getAttribute("aria-disabled") === "true") {
    announceStatus("That track is unavailable in this session.");
    return;
  }

  loadTrack(Number(row.dataset.trackIndex), {
    addToHistory: true,
    autoplay: true,
    scroll: true,
    restoreFocus: document.activeElement === row
  });
});

elements.skipLink.addEventListener("click", (event) => {
  event.preventDefault();
  elements.recordLibrary.focus({ preventScroll: true });
  elements.recordLibrary.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    block: "start"
  });
});

if (elements.youtubeApiScript) {
  elements.youtubeApiScript.addEventListener("error", () => {
    clearApiDelayTimer();
    state.apiUnavailable = true;
    setPlaybackState(
      "error",
      "The YouTube player could not be reached. The record library is still available."
    );
    setControlStates();
  });
}

elements.copyrightYear.textContent = String(new Date().getFullYear());
loadPreferences();
syncVolumeReadout(clampVolume(elements.volumeControl.value));
syncReceiverPlayback(false);
setControlStates();
startApiDelayNotice();
loadTracks();
