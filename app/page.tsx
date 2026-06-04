"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Album,
  CirclePlus,
  Clock3,
  Download,
  Disc3,
  GripVertical,
  Heart,
  ListPlus,
  ListMusic,
  LogOut,
  Maximize2,
  Minimize2,
  MoreVertical,
  Mic2,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  Share2,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  Volume2
} from "lucide-react";
import { assetPath, tracks as builtInTracks } from "@/lib/tracks";
import {
  deleteStoredAlbum,
  deleteStoredTrack,
  getStoredLibrary,
  saveStoredAlbum,
  saveStoredTracks,
  updateStoredTrack,
  type StoredAlbum,
  type StoredTrack
} from "@/lib/music-store";
import {
  BUILT_IN_ALBUM_ID,
  BUILT_IN_ALBUM_TITLE,
  BUILT_IN_ARTIST,
  BUILT_IN_COVER_URL,
  CURRENT_TRACK_KEY,
  FAVORITES_KEY,
  PLAYLISTS_KEY,
  POSITIONS_KEY,
  REPEAT_KEY,
  SHUFFLE_KEY,
  VOLUME_KEY
} from "@/lib/constants";
import type {
  AlbumItem,
  Playlist,
  RepeatMode,
  SortMode,
  TrackItem,
  ViewMode
} from "@/lib/types";
import {
  cleanTitle,
  createId,
  formatTime,
  randomIndex,
  readLocalJson,
  writeLocalJson
} from "@/lib/utils";

const builtInAlbum: AlbumItem = {
  id: BUILT_IN_ALBUM_ID,
  title: BUILT_IN_ALBUM_TITLE,
  artist: BUILT_IN_ARTIST,
  coverUrl: BUILT_IN_COVER_URL,
  source: "built-in",
  createdAt: 0
};

const QUEUE_KEY = "gar-music-custom-queue";
const HISTORY_KEY = "gar-music-history";
const PLAY_STATS_KEY = "gar-music-play-stats";
const CROSSFADE_KEY = "gar-music-crossfade";
const TRACK_OVERRIDES_KEY = "gar-music-track-overrides";
const MAX_HISTORY_ITEMS = 30;

type PlayStats = {
  counts: Record<string, number>;
  totalSeconds: number;
};

type TrackOverride = Partial<Pick<TrackItem, "title" | "artist" | "albumId" | "albumTitle" | "coverUrl">>;

const MEDIA_ARTWORK_SIZES = [96, 128, 192, 256, 384, 512];

function fallbackMediaArtwork(src: string): MediaImage[] {
  return MEDIA_ARTWORK_SIZES.map((size) => ({
    src,
    sizes: `${size}x${size}`,
    type: src.startsWith("blob:") ? "image/png" : "image/png"
  }));
}

async function createMediaArtwork(src: string): Promise<{ artwork: MediaImage[]; urls: string[] }> {
  if (typeof window === "undefined") {
    return { artwork: fallbackMediaArtwork(src), urls: [] };
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la portada"));
    img.src = src;
  });

  const urls: string[] = [];
  const artwork = await Promise.all(
    MEDIA_ARTWORK_SIZES.map(
      (size) =>
        new Promise<MediaImage>((resolve) => {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const context = canvas.getContext("2d");

          if (!context) {
            resolve({ src, sizes: `${size}x${size}`, type: "image/png" });
            return;
          }

          context.fillStyle = "#0b0d12";
          context.fillRect(0, 0, size, size);

          const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
          const sourceX = ((image.naturalWidth || image.width) - sourceSize) / 2;
          const sourceY = ((image.naturalHeight || image.height) - sourceSize) / 2;
          context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve({ src, sizes: `${size}x${size}`, type: "image/png" });
                return;
              }

              const url = URL.createObjectURL(blob);
              urls.push(url);
              resolve({ src: url, sizes: `${size}x${size}`, type: blob.type || "image/png" });
            },
            "image/png",
            0.92
          );
        })
    )
  );

  return { artwork, urls };
}

export default function Home() {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const savedPositionsRef = useRef<Record<string, number>>(readLocalJson(POSITIONS_KEY, {}));
  const isPlayingRef = useRef(false);
  const lastPositionWriteRef = useRef(0);
  const lastProgressRenderRef = useRef(0);
  const lastStatsSecondRef = useRef(0);
  const lastCountedTrackRef = useRef("");
  const shouldResumeRef = useRef(true);
  const loadResumeTimeRef = useRef(0);
  const dockTouchRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const coverTouchRef = useRef<{ x: number; y: number; at: number } | null>(null);
  const mediaArtworkUrlsRef = useRef<string[]>([]);
  const queueDragRef = useRef<string | null>(null);
  const albumDragRef = useRef<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const fadingRef = useRef(false);

  const [albums, setAlbums] = useState<AlbumItem[]>([builtInAlbum]);
  const [library, setLibrary] = useState<TrackItem[]>([]);
  const [currentId, setCurrentId] = useState(() => readLocalJson(CURRENT_TRACK_KEY, ""));
  const [isPlaying, setIsPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedAlbumId, setSelectedAlbumId] = useState("all");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("library");
  const [sortMode, setSortMode] = useState<SortMode>("added");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState<number>(() => readLocalJson(VOLUME_KEY, 0.85));
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [shuffle, setShuffle] = useState<boolean>(() => readLocalJson(SHUFFLE_KEY, false));
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => readLocalJson<RepeatMode>(REPEAT_KEY, "all"));
  const [favorites, setFavorites] = useState<string[]>(() => readLocalJson(FAVORITES_KEY, []));
  const [playlists, setPlaylists] = useState<Playlist[]>(() => readLocalJson(PLAYLISTS_KEY, []));
  const [albumTitle, setAlbumTitle] = useState("");
  const [albumArtist, setAlbumArtist] = useState("Artista local");
  const [coverName, setCoverName] = useState("Sin portada personalizada");
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [newAlbumId, setNewAlbumId] = useState(BUILT_IN_ALBUM_ID);
  const [isImporting, setIsImporting] = useState(false);
  const [openTrackMenu, setOpenTrackMenu] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState<boolean | null>(null);
  const [customQueueIds, setCustomQueueIds] = useState<string[]>(() => readLocalJson<string[]>(QUEUE_KEY, []));
  const [history, setHistory] = useState<string[]>(() => readLocalJson<string[]>(HISTORY_KEY, []));
  const [playStats, setPlayStats] = useState<PlayStats>(() => readLocalJson<PlayStats>(PLAY_STATS_KEY, { counts: {}, totalSeconds: 0 }));
  const [crossfadeSeconds, setCrossfadeSeconds] = useState<number>(() => readLocalJson(CROSSFADE_KEY, 0));
  const [trackOverrides, setTrackOverrides] = useState<Record<string, TrackOverride>>(() => readLocalJson<Record<string, TrackOverride>>(TRACK_OVERRIDES_KEY, {}));
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [isFullscreenPlayer, setIsFullscreenPlayer] = useState(false);
  const [dockExpanded, setDockExpanded] = useState(false);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canManage = isAdminRoute && adminUnlocked === true;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    return () => {
      mediaArtworkUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      mediaArtworkUrlsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isAdminRoute) {
      return;
    }

    let cancelled = false;
    fetch("/api/admin/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { unlocked?: boolean }) => {
        if (!cancelled) {
          setAdminUnlocked(Boolean(data.unlocked));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAdminUnlocked(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAdminRoute]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const storedOverrides = readLocalJson<Record<string, TrackOverride>>(TRACK_OVERRIDES_KEY, {});
    const builtInLibrary: TrackItem[] = builtInTracks.map((track, index) => ({
      id: track.id,
      title: track.title,
      artist: BUILT_IN_ARTIST,
      albumId: BUILT_IN_ALBUM_ID,
      albumTitle: builtInAlbum.title,
      coverUrl: builtInAlbum.coverUrl,
      source: "built-in",
      audioUrl: assetPath("tracks", track.file),
      createdAt: index,
      ...storedOverrides[track.id]
    }));

    let cancelled = false;

    getStoredLibrary()
      .then(({ albums: storedAlbums, tracks: storedTracks }) => {
        if (cancelled) return;

        objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        objectUrlsRef.current = [];

        const userAlbums = storedAlbums.map((album) => {
          const coverUrl = album.cover ? URL.createObjectURL(album.cover) : builtInAlbum.coverUrl;
          if (album.cover) {
            objectUrlsRef.current.push(coverUrl);
          }

          return {
            id: album.id,
            title: album.title,
            artist: album.artist,
            coverUrl,
            source: "user" as const,
            createdAt: album.createdAt
          };
        });

        const allAlbums = [builtInAlbum, ...userAlbums];
        const userTracks = storedTracks.map((track) => {
          const album = allAlbums.find((item) => item.id === track.albumId) ?? builtInAlbum;
          const audioUrl = URL.createObjectURL(track.file);
          objectUrlsRef.current.push(audioUrl);

          return {
            id: track.id,
            title: track.title,
            artist: track.artist,
            albumId: track.albumId,
            albumTitle: album.title,
            coverUrl: album.coverUrl,
            source: "user" as const,
            audioUrl,
            createdAt: track.createdAt,
            ...storedOverrides[track.id]
          };
        });

        const nextLibrary = [...builtInLibrary, ...userTracks];
        setAlbums(allAlbums);
        setLibrary(nextLibrary);
        setCurrentId((existing) =>
          existing && nextLibrary.some((track) => track.id === existing)
            ? existing
            : nextLibrary[0]?.id || ""
        );
      })
      .catch(() => {
        if (cancelled) return;
        setLibrary(builtInLibrary);
        setCurrentId((existing) =>
          existing && builtInLibrary.some((track) => track.id === existing)
            ? existing
            : builtInLibrary[0]?.id || ""
        );
      });

    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    writeLocalJson(FAVORITES_KEY, favorites);
  }, [favorites]);

  useEffect(() => {
    writeLocalJson(PLAYLISTS_KEY, playlists);
  }, [playlists]);

  useEffect(() => {
    writeLocalJson(QUEUE_KEY, customQueueIds);
  }, [customQueueIds]);

  useEffect(() => {
    writeLocalJson(HISTORY_KEY, history);
  }, [history]);

  useEffect(() => {
    writeLocalJson(PLAY_STATS_KEY, playStats);
  }, [playStats]);

  useEffect(() => {
    writeLocalJson(CROSSFADE_KEY, crossfadeSeconds);
  }, [crossfadeSeconds]);

  useEffect(() => {
    writeLocalJson(TRACK_OVERRIDES_KEY, trackOverrides);
  }, [trackOverrides]);

  useEffect(() => {
    writeLocalJson(VOLUME_KEY, volume);
  }, [volume]);

  useEffect(() => {
    writeLocalJson(SHUFFLE_KEY, shuffle);
  }, [shuffle]);

  useEffect(() => {
    writeLocalJson(REPEAT_KEY, repeatMode);
  }, [repeatMode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (currentId) {
      writeLocalJson(CURRENT_TRACK_KEY, currentId);
    }
  }, [currentId]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (!sleepEndsAt) {
      return;
    }

    const interval = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((sleepEndsAt - Date.now()) / 1000));
      setSleepRemaining(remaining);

      if (remaining <= 0) {
        audioRef.current?.pause();
        setIsPlaying(false);
        setSleepEndsAt(null);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [sleepEndsAt]);

  const currentTrack = useMemo(
    () => library.find((track) => track.id === currentId) ?? library[0],
    [currentId, library]
  );
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const firstPlaylistId = playlists[0]?.id;

  const visibleTracks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const playlist = playlists.find((item) => item.id === selectedPlaylistId);

    return library
      .filter((track) => {
        if (viewMode === "favorites" && !favoriteSet.has(track.id)) {
          return false;
        }

        if (viewMode === "recent" && track.source !== "user") {
          return false;
        }

        if (viewMode === "playlists" && selectedPlaylistId !== "all" && !playlist?.trackIds.includes(track.id)) {
          return false;
        }

        if (selectedAlbumId !== "all" && track.albumId !== selectedAlbumId) {
          return false;
        }

        if (!needle) {
          return true;
        }

        return [track.title, track.artist, track.albumTitle].join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (viewMode === "recent") {
          return b.createdAt - a.createdAt;
        }

        if (sortMode === "title") {
          return a.title.localeCompare(b.title);
        }

        if (sortMode === "artist") {
          return a.artist.localeCompare(b.artist);
        }

        if (sortMode === "album") {
          return a.albumTitle.localeCompare(b.albumTitle);
        }

        return a.createdAt - b.createdAt;
      });
  }, [favoriteSet, library, playlists, query, selectedAlbumId, selectedPlaylistId, sortMode, viewMode]);

  const baseQueue = visibleTracks.length ? visibleTracks : library;
  const queue = useMemo(() => {
    if (!customQueueIds.length) {
      return baseQueue;
    }

    const byId = new Map(baseQueue.map((track) => [track.id, track]));
    const ordered = customQueueIds
      .map((id) => byId.get(id))
      .filter((track): track is TrackItem => Boolean(track));
    const missing = baseQueue.filter((track) => !customQueueIds.includes(track.id));

    return [...ordered, ...missing];
  }, [baseQueue, customQueueIds]);
  const currentQueueIndex = queue.findIndex((track) => track.id === currentTrack?.id);
  const nextQueue = queue
    .filter((track) => track.id !== currentTrack?.id)
    .slice(Math.max(currentQueueIndex, 0), Math.max(currentQueueIndex, 0) + 5);
  const userAlbums = albums.filter((albumItem) => albumItem.source === "user").length;
  const listeningPercent = duration ? Math.round((progress / duration) * 100) : 0;
  const totalArtists = new Set(library.map((track) => track.artist)).size;
  const historyTracks = history
    .map((id) => library.find((track) => track.id === id))
    .filter((track): track is TrackItem => Boolean(track));
  const topTracks = [...library]
    .sort((a, b) => (playStats.counts[b.id] ?? 0) - (playStats.counts[a.id] ?? 0))
    .filter((track) => (playStats.counts[track.id] ?? 0) > 0)
    .slice(0, 5);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    audio.src = currentTrack.audioUrl;
    audio.load();
    lastPositionWriteRef.current = 0;
    lastStatsSecondRef.current = 0;
    fadingRef.current = false;
    const resumeAt = shouldResumeRef.current ? savedPositionsRef.current[currentTrack.id] ?? 0 : 0;
    loadResumeTimeRef.current = resumeAt;
    shouldResumeRef.current = true;
    setProgress(resumeAt);
    setDuration(0);

    if (isPlayingRef.current) {
      if (crossfadeSeconds > 0) {
        audio.volume = 0;
      }
      audio.play().then(() => {
        if (crossfadeSeconds > 0) {
          const targetVolume = volume;
          let step = 0;
          const steps = 16;
          const timer = window.setInterval(() => {
            step += 1;
            audio.volume = Math.min(targetVolume, (targetVolume * step) / steps);
            if (step >= steps) {
              window.clearInterval(timer);
            }
          }, 45);
        }
      }).catch(() => setIsPlaying(false));
    }
  }, [currentTrack, crossfadeSeconds, volume]);

  useEffect(() => {
    if (!currentTrack || lastCountedTrackRef.current === currentTrack.id) {
      return;
    }

    lastCountedTrackRef.current = currentTrack.id;
    setHistory((items) => [currentTrack.id, ...items.filter((id) => id !== currentTrack.id)].slice(0, MAX_HISTORY_ITEMS));
    setPlayStats((stats) => ({
      ...stats,
      counts: {
        ...stats.counts,
        [currentTrack.id]: (stats.counts[currentTrack.id] ?? 0) + 1
      }
    }));
  }, [currentTrack]);

  const saveTrackPosition = useCallback((trackId: string, seconds: number) => {
    const rounded = Math.floor(seconds);
    if (rounded === savedPositionsRef.current[trackId]) {
      return;
    }

    savedPositionsRef.current = {
      ...savedPositionsRef.current,
      [trackId]: rounded
    };
    writeLocalJson(POSITIONS_KEY, savedPositionsRef.current);
  }, []);

  const playTrack = useCallback((trackId: string) => {
    shouldResumeRef.current = false;
    if (trackId === currentId && audioRef.current) {
      audioRef.current.currentTime = 0;
      setProgress(0);
      saveTrackPosition(trackId, 0);
    }
    setCurrentId(trackId);
    setIsPlaying(true);
  }, [currentId, saveTrackPosition]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (isPlayingRef.current) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, []);

  const skip = useCallback((direction: -1 | 1) => {
    if (!queue.length) {
      return;
    }

    const baseIndex = currentQueueIndex >= 0 ? currentQueueIndex : 0;
    const nextIndex = shuffle
      ? randomIndex(queue.length, baseIndex)
      : (baseIndex + direction + queue.length) % queue.length;

    shouldResumeRef.current = false;
    setCurrentId(queue[nextIndex].id);
    setIsPlaying(true);
  }, [currentQueueIndex, queue, shuffle]);

  const handleEnded = () => {
    if (repeatMode === "one" && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => setIsPlaying(false));
      return;
    }

    if (repeatMode === "off" && currentQueueIndex === queue.length - 1) {
      setIsPlaying(false);
      return;
    }

    skip(1);
  };

  const updateProgress = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    if (Math.abs(audio.currentTime - lastProgressRenderRef.current) > 0.5) {
      lastProgressRenderRef.current = audio.currentTime;
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
      updateMediaPosition();
    }

    const statSecond = Math.floor(audio.currentTime);
    if (isPlayingRef.current && statSecond > 0 && statSecond !== lastStatsSecondRef.current) {
      lastStatsSecondRef.current = statSecond;
      setPlayStats((stats) => ({
        ...stats,
        totalSeconds: stats.totalSeconds + 1
      }));
    }

    if (
      audio.duration &&
      audio.currentTime >= 1 &&
      audio.currentTime < audio.duration - 4 &&
      Math.abs(audio.currentTime - lastPositionWriteRef.current) > 1
    ) {
      lastPositionWriteRef.current = audio.currentTime;
      saveTrackPosition(currentTrack.id, audio.currentTime);
    }

    if (
      crossfadeSeconds > 0 &&
      repeatMode !== "one" &&
      audio.duration &&
      audio.duration - audio.currentTime <= crossfadeSeconds &&
      audio.duration - audio.currentTime > 0.2 &&
      !fadingRef.current
    ) {
      fadingRef.current = true;
      const startVolume = audio.volume;
      const steps = Math.max(8, crossfadeSeconds * 8);
      let step = 0;
      const timer = window.setInterval(() => {
        step += 1;
        audio.volume = Math.max(0, startVolume * (1 - step / steps));
        if (step >= steps) {
          window.clearInterval(timer);
          skip(1);
        }
      }, (crossfadeSeconds * 1000) / steps);
    }
  };

  const persistCurrentPosition = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack || !audio.duration || audio.currentTime < 1 || audio.currentTime >= audio.duration - 4) {
      return;
    }

    saveTrackPosition(currentTrack.id, audio.currentTime);
  }, [currentTrack, saveTrackPosition]);

  useEffect(() => {
    window.addEventListener("beforeunload", persistCurrentPosition);
    return () => window.removeEventListener("beforeunload", persistCurrentPosition);
  }, [persistCurrentPosition]);

  const seek = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = nextTime;
    }
    setProgress(nextTime);
    if (currentTrack) {
      saveTrackPosition(currentTrack.id, nextTime);
    }
  };

  const updateMediaPosition = useCallback(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }

    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }

    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: Math.min(audio.currentTime, audio.duration)
      });
    } catch {
      // Some mobile browsers reject updates while media metadata is still settling.
    }
  }, []);

  const seekToSecond = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) {
      return;
    }

    const durationLimit = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : seconds;
    const nextTime = Math.max(0, Math.min(seconds, durationLimit));
    audio.currentTime = nextTime;
    setProgress(nextTime);
    if (currentTrack) {
      saveTrackPosition(currentTrack.id, nextTime);
    }
    updateMediaPosition();
  }, [currentTrack, saveTrackPosition, updateMediaPosition]);

  const toggleFavorite = useCallback((trackId: string) => {
    setFavorites((items) =>
      items.includes(trackId) ? items.filter((item) => item !== trackId) : [...items, trackId]
    );
  }, []);

  // MediaSession API — controles desde lockscreen / barra del SO
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !currentTrack) {
      return;
    }

    let cancelled = false;

    createMediaArtwork(currentTrack.coverUrl)
      .catch(() => ({ artwork: fallbackMediaArtwork(currentTrack.coverUrl), urls: [] }))
      .then(({ artwork, urls }) => {
        if (cancelled) {
          urls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        mediaArtworkUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        mediaArtworkUrlsRef.current = urls;

        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist || "Gar Music",
          album: currentTrack.albumTitle || BUILT_IN_ALBUM_TITLE,
          artwork
        });
        updateMediaPosition();
      });

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => togglePlay()],
      ["pause", () => togglePlay()],
      ["previoustrack", () => skip(-1)],
      ["nexttrack", () => skip(1)],
      [
        "seekbackward",
        (details) => {
          const offset = details.seekOffset || 10;
          seekToSecond((audioRef.current?.currentTime || 0) - offset);
        }
      ],
      [
        "seekforward",
        (details) => {
          const offset = details.seekOffset || 10;
          seekToSecond((audioRef.current?.currentTime || 0) + offset);
        }
      ],
      [
        "seekto",
        (details) => {
          if (typeof details.seekTime === "number") {
            seekToSecond(details.seekTime);
          }
        }
      ]
    ];

    handlers.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // unsupported action on this browser — ignore
      }
    });

    return () => {
      cancelled = true;
      handlers.forEach(([action]) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // ignore
        }
      });
    };
  }, [currentTrack, seekToSecond, skip, togglePlay, updateMediaPosition]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
    updateMediaPosition();
  }, [isPlaying, updateMediaPosition]);

  // Atajos de teclado
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const audio = audioRef.current;

      switch (event.key) {
        case " ":
          event.preventDefault();
          togglePlay();
          break;
        case "ArrowRight":
          if (event.shiftKey) {
            skip(1);
          } else if (audio) {
            audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
          }
          break;
        case "ArrowLeft":
          if (event.shiftKey) {
            skip(-1);
          } else if (audio) {
            audio.currentTime = Math.max(0, audio.currentTime - 5);
          }
          break;
        case "ArrowUp":
          event.preventDefault();
          setVolume((v) => Math.min(1, +(v + 0.05).toFixed(2)));
          break;
        case "ArrowDown":
          event.preventDefault();
          setVolume((v) => Math.max(0, +(v - 0.05).toFixed(2)));
          break;
        case "s":
        case "S":
          setShuffle((value) => !value);
          break;
        case "r":
        case "R":
          setRepeatMode((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"));
          break;
        case "f":
        case "F":
          if (currentTrack) toggleFavorite(currentTrack.id);
          break;
        case "m":
        case "M":
          setVolume((v) => (v > 0 ? 0 : 0.85));
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentTrack, skip, toggleFavorite, togglePlay]);

  const createPlaylist = () => {
    const title = playlistTitle.trim();
    if (!title) {
      return;
    }

    const newPlaylist: Playlist = {
      id: createId("playlist"),
      title,
      trackIds: currentTrack ? [currentTrack.id] : [],
      createdAt: Date.now()
    };

    setPlaylists((items) => [...items, newPlaylist]);
    setSelectedPlaylistId(newPlaylist.id);
    setViewMode("playlists");
    setPlaylistTitle("");
    showToast(`Playlist "${title}" creada`);
  };

  const addToPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((items) =>
      items.map((playlist) =>
        playlist.id === playlistId && !playlist.trackIds.includes(trackId)
          ? { ...playlist, trackIds: [...playlist.trackIds, trackId] }
          : playlist
      )
    );
    showToast("Añadida a la playlist");
  };

  const moveQueueTrack = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return;
    }

    const ids = queue.map((track) => track.id);
    const sourceIndex = ids.indexOf(sourceId);
    const targetIndex = ids.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextIds = [...ids];
    const [moved] = nextIds.splice(sourceIndex, 1);
    nextIds.splice(targetIndex, 0, moved);
    setCustomQueueIds(nextIds);
  };

  const resetQueueOrder = () => {
    setCustomQueueIds([]);
    showToast("Cola restaurada");
  };

  const moveAlbum = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) {
      return;
    }

    setAlbums((items) => {
      const sourceIndex = items.findIndex((item) => item.id === sourceId);
      const targetIndex = items.findIndex((item) => item.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return items;
      }

      const next = [...items];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const renameTrack = async (track: TrackItem) => {
    if (!canManage) {
      return;
    }

    const title = window.prompt("Nuevo titulo", track.title)?.trim();
    if (!title) {
      return;
    }
    const artist = window.prompt("Nuevo artista", track.artist)?.trim() || track.artist;
    const albumTitle = window.prompt("Album", track.albumTitle)?.trim() || track.albumTitle;
    const coverUrl = window.prompt("Portada URL (deja igual si no cambias)", track.coverUrl)?.trim() || track.coverUrl;
    const album = albums.find((item) => item.title.toLowerCase() === albumTitle.toLowerCase());
    const override: TrackOverride = {
      title,
      artist,
      albumTitle,
      albumId: album?.id ?? track.albumId,
      coverUrl
    };

    try {
      if (track.source === "user") {
        const { tracks: storedTracks } = await getStoredLibrary();
        const stored = storedTracks.find((item) => item.id === track.id);
        if (stored) {
          await updateStoredTrack({ ...stored, title, artist, albumId: album?.id ?? stored.albumId });
        }
      }

      setTrackOverrides((items) => ({
        ...items,
        [track.id]: {
          ...items[track.id],
          ...override
        }
      }));
      setLibrary((items) => items.map((item) => item.id === track.id ? { ...item, ...override } : item));
      showToast("Cancion actualizada");
    } catch {
      showToast("No se pudo editar");
    }
  };

  const removeTrack = async (track: TrackItem) => {
    if (!canManage) {
      return;
    }

    if (track.source !== "user") {
      showToast("Las canciones integradas no se eliminan");
      return;
    }

    if (!window.confirm(`Eliminar "${track.title}"?`)) {
      return;
    }

    try {
      await deleteStoredTrack(track.id);
      setLibrary((items) => items.filter((item) => item.id !== track.id));
      setFavorites((items) => items.filter((id) => id !== track.id));
      setHistory((items) => items.filter((id) => id !== track.id));
      setCustomQueueIds((items) => items.filter((id) => id !== track.id));
      setPlaylists((items) => items.map((playlist) => ({
        ...playlist,
        trackIds: playlist.trackIds.filter((id) => id !== track.id)
      })));
      if (currentId === track.id) {
        const next = library.find((item) => item.id !== track.id);
        setCurrentId(next?.id ?? "");
      }
      showToast("Cancion eliminada");
    } catch {
      showToast("No se pudo eliminar");
    }
  };

  const removePlaylist = (playlistId: string) => {
    const playlist = playlists.find((item) => item.id === playlistId);
    if (!playlist) return;
    if (!window.confirm(`¿Eliminar la playlist "${playlist.title}"?`)) {
      return;
    }
    setPlaylists((items) => items.filter((item) => item.id !== playlistId));
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId("all");
    }
  };

  const exportLibrary = () => {
    const payload = {
      albums: albums.map(({ coverUrl: _coverUrl, ...album }) => album),
      tracks: library.map(({ audioUrl: _audioUrl, coverUrl: _coverUrl, ...track }) => track),
      playlists,
      favorites,
      exportedAt: Date.now(),
      version: 1
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gar-music-library-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Biblioteca exportada");
  };

  const shareTrack = async (track: TrackItem) => {
    const url = `${window.location.origin}${window.location.pathname}?track=${encodeURIComponent(track.id)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: track.title, text: `${track.title} - ${track.artist}`, url });
        return;
      } catch {
        // user cancelled — fallback to clipboard
      }
    }

    try {
      await navigator.clipboard?.writeText(url);
      showToast("Link copiado");
    } catch {
      showToast("No se pudo copiar el link");
    }
  };

  const shareAlbum = async (album: AlbumItem) => {
    const url = `${window.location.origin}${window.location.pathname}?album=${encodeURIComponent(album.id)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: album.title, text: `${album.title} - ${album.artist}`, url });
        return;
      } catch {
        // user cancelled — fallback
      }
    }

    try {
      await navigator.clipboard?.writeText(url);
      showToast("Link de álbum copiado");
    } catch {
      showToast("No se pudo copiar el link");
    }
  };

  const shareTrackAlbum = async (track: TrackItem) => {
    const album = albums.find((item) => item.id === track.albumId);
    if (album) {
      await shareAlbum(album);
    }
  };

  const shareTrackCard = async (track: TrackItem) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1080;
      const context = canvas.getContext("2d");
      if (!context) {
        await shareTrack(track);
        return;
      }

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("cover"));
        img.src = track.coverUrl;
      });

      const gradient = context.createLinearGradient(0, 0, 1080, 1080);
      gradient.addColorStop(0, "#1a1513");
      gradient.addColorStop(0.55, "#3a201d");
      gradient.addColorStop(1, "#0d1514");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 1080, 1080);
      context.drawImage(image, 150, 110, 780, 780);
      context.fillStyle = "rgba(0, 0, 0, 0.62)";
      context.fillRect(0, 760, 1080, 320);
      context.fillStyle = "#fff7ec";
      context.font = "800 64px Arial";
      context.fillText(track.title.slice(0, 28), 80, 870);
      context.fillStyle = "#f0bd59";
      context.font = "500 36px Arial";
      context.fillText(`${track.artist} / ${track.albumTitle}`.slice(0, 42), 80, 930);
      context.fillStyle = "#fff7ec";
      context.font = "700 30px Arial";
      context.fillText("Gar Music V22", 80, 1000);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
      if (!blob) {
        await shareTrack(track);
        return;
      }

      const file = new File([blob], `${track.title}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ title: track.title, text: `${track.title} - ${track.artist}`, files: [file] });
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${track.title}-gar-music.png`;
      link.click();
      URL.revokeObjectURL(url);
      showToast("Tarjeta descargada");
    } catch {
      await shareTrack(track);
    }
  };

  const startSleepTimer = () => {
    if (!sleepMinutes) {
      setSleepEndsAt(null);
      setSleepRemaining(0);
      return;
    }

    setSleepEndsAt(Date.now() + sleepMinutes * 60 * 1000);
    showToast(`Temporizador a ${sleepMinutes} min`);
  };

  const handleDockTouchEnd = (x: number, y: number) => {
    const start = dockTouchRef.current;
    dockTouchRef.current = null;

    if (!start) {
      return;
    }

    const deltaX = x - start.x;
    const deltaY = y - start.y;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const elapsed = Date.now() - start.at;

    if (elapsed > 700 || Math.max(absX, absY) < 42) {
      return;
    }

    if (absX > absY) {
      skip(deltaX < 0 ? 1 : -1);
      return;
    }

    if (deltaY < 0) {
      setMobileQueueOpen(true);
      return;
    }

    togglePlay();
  };

  const createAlbum = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = albumTitle.trim();
    const artist = albumArtist.trim() || "Artista local";

    if (!title) {
      showToast("Ponle un nombre al álbum");
      return;
    }

    const coverFile = coverRef.current?.files?.[0];
    const album: StoredAlbum = {
      id: createId("album"),
      title,
      artist,
      cover: coverFile,
      createdAt: Date.now()
    };

    try {
      await saveStoredAlbum(album);
    } catch {
      showToast("No se pudo guardar el álbum");
      return;
    }

    const coverUrl = coverFile ? URL.createObjectURL(coverFile) : builtInAlbum.coverUrl;
    if (coverFile) {
      objectUrlsRef.current.push(coverUrl);
    }

    setAlbums((items) => [...items, { ...album, coverUrl, source: "user" }]);
    setAlbumTitle("");
    setAlbumArtist("Artista local");
    setNewAlbumId(album.id);
    setCoverName("Sin portada personalizada");
    if (coverRef.current) {
      coverRef.current.value = "";
    }
    showToast(`Álbum "${title}" creado`);
  };

  const importAudioFiles = async (fileList: File[]) => {
    const files = fileList.filter((file) => file.type.startsWith("audio/"));
    const album = albums.find((item) => item.id === newAlbumId) ?? builtInAlbum;

    if (!files.length) {
      showToast("Selecciona archivos de audio");
      return;
    }

    setIsImporting(true);
    setUploadProgress({ done: 0, total: files.length });
    const storedTracks: StoredTrack[] = files.map((file, index) => ({
      id: createId("track"),
      albumId: album.id,
      title: cleanTitle(file.name),
      artist: album.artist,
      fileName: file.name,
      file,
      createdAt: Date.now() + index
    }));

    try {
      for (const [index, track] of storedTracks.entries()) {
        await saveStoredTracks([track]);
        setUploadProgress({ done: index + 1, total: storedTracks.length });
      }
    } catch {
      setIsImporting(false);
      setUploadProgress(null);
      showToast("No se pudieron guardar las canciones");
      return;
    }

    const nextTracks: TrackItem[] = storedTracks.map((track) => {
      const audioUrl = URL.createObjectURL(track.file);
      objectUrlsRef.current.push(audioUrl);

      return {
        id: track.id,
        title: track.title,
        artist: track.artist,
        albumId: track.albumId,
        albumTitle: album.title,
        coverUrl: album.coverUrl,
        source: "user",
        audioUrl,
        createdAt: track.createdAt
      };
    });

    setLibrary((items) => [...items, ...nextTracks]);
    setViewMode("recent");
    setSelectedAlbumId(album.id);
    shouldResumeRef.current = false;
    setCurrentId(nextTracks[0].id);
    setIsPlaying(true);
    setIsImporting(false);
    setUploadProgress(null);
    showToast(`${nextTracks.length} canción${nextTracks.length === 1 ? "" : "es"} añadidas`);
  };

  const uploadTracks = async (event: ChangeEvent<HTMLInputElement>) => {
    await importAudioFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const removeAlbum = async (albumId: string) => {
    if (albumId === BUILT_IN_ALBUM_ID) {
      return;
    }

    const album = albums.find((item) => item.id === albumId);
    if (!album) return;
    const tracksInAlbum = library.filter((track) => track.albumId === albumId).length;
    const msg = tracksInAlbum
      ? `¿Eliminar "${album.title}" y sus ${tracksInAlbum} canciones?`
      : `¿Eliminar "${album.title}"?`;
    if (!window.confirm(msg)) {
      return;
    }

    try {
      await deleteStoredAlbum(albumId);
    } catch {
      showToast("No se pudo eliminar el álbum");
      return;
    }

    setAlbums((items) => items.filter((item) => item.id !== albumId));
    setLibrary((items) => {
      const remaining = items.filter((item) => item.albumId !== albumId);
      if (!remaining.some((track) => track.id === currentId)) {
        setCurrentId(remaining[0]?.id || "");
        setIsPlaying(false);
      }
      return remaining;
    });
    setSelectedAlbumId("all");
    showToast(`"${album.title}" eliminado`);
  };

  const loginAdmin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminLoading(true);
    setAdminError("");

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail.trim(), password: adminPassword })
      });

      if (res.ok) {
        setAdminUnlocked(true);
        setAdminPassword("");
        return;
      }

      if (res.status === 500) {
        setAdminError("Falta configurar el servidor (env vars)");
      } else {
        setAdminError("Credenciales incorrectas");
      }
    } catch {
      setAdminError("Error de red");
    } finally {
      setAdminLoading(false);
    }
  };

  const logoutAdmin = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setAdminUnlocked(false);
    setAdminEmail("");
    setAdminPassword("");
  };

  if (isAdminRoute && adminUnlocked === null) {
    return (
      <main className="admin-login-page">
        <div className="admin-login-card">
          <div className="brand admin-brand">
            <div className="brand-mark">
              <Disc3 size={24} />
            </div>
            <div>
              <span>Gar Music</span>
              <strong>Admin Studio</strong>
            </div>
          </div>
          <p>Comprobando sesión…</p>
        </div>
      </main>
    );
  }

  if (isAdminRoute && adminUnlocked === false) {
    return (
      <main className="admin-login-page">
        <form className="admin-login-card" onSubmit={loginAdmin}>
          <div className="brand admin-brand">
            <div className="brand-mark">
              <Disc3 size={24} />
            </div>
            <div>
              <span>Gar Music</span>
              <strong>Admin Studio</strong>
            </div>
          </div>
          <h1>Panel admin</h1>
          <input
            type="email"
            placeholder="Email"
            autoComplete="username"
            value={adminEmail}
            onChange={(event) => setAdminEmail(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            autoComplete="current-password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            required
          />
          {adminError ? <p className="admin-error">{adminError}</p> : null}
          <button type="submit" className="primary-action" disabled={adminLoading}>
            {adminLoading ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </main>
    );
  }

  const navItems = canManage
    ? [
        ["library", ListMusic, "Biblioteca"],
        ["albums", Album, "Álbumes"],
        ["favorites", Heart, "Favoritas"],
        ["recent", Clock3, "Recientes"],
        ["playlists", ListPlus, "Playlists"]
      ]
    : [["library", ListMusic, "Biblioteca"]];

  return (
    <main className="music-app">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={updateProgress}
        onPause={persistCurrentPosition}
        onLoadedMetadata={() => {
          const audio = audioRef.current;
          if (!audio || !currentTrack) {
            return;
          }

          const resumeAt = loadResumeTimeRef.current;
          if (resumeAt > 0 && resumeAt < audio.duration - 4) {
            audio.currentTime = resumeAt;
            setProgress(resumeAt);
          }
          updateProgress();
          updateMediaPosition();
        }}
        onRateChange={updateMediaPosition}
        onEnded={handleEnded}
      />

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Disc3 size={24} />
          </div>
          <div>
            <span>Gar Music</span>
            <strong>Studio V22</strong>
          </div>
        </div>

        <nav className="nav-list" aria-label="Vistas de biblioteca">
          {navItems.map(([mode, Icon, label]) => (
            <button
              type="button"
              key={String(mode)}
              className={viewMode === mode ? "nav-item active" : "nav-item"}
              onClick={() => setViewMode(mode as ViewMode)}
            >
              <Icon size={18} />
              <span>{label as string}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-shelves" aria-label="Accesos rapidos">
          <div className="sidebar-section">
            <span>Álbumes</span>
            {albums.slice(0, 5).map((albumItem) => (
              <button
                type="button"
                key={albumItem.id}
                onClick={() => {
                  setSelectedAlbumId(albumItem.id);
                  setViewMode("library");
                }}
              >
                <i style={{ backgroundImage: `url("${albumItem.coverUrl}")` }} />
                <strong>{albumItem.title}</strong>
              </button>
            ))}
          </div>
          <div className="sidebar-section">
            <span>Playlists</span>
            <button type="button" onClick={() => setViewMode("favorites")}>
              <Heart size={15} />
              <strong>Favoritas ({favorites.length})</strong>
            </button>
            {playlists.slice(0, 4).map((playlist) => (
              <button
                type="button"
                key={playlist.id}
                onClick={() => {
                  setSelectedPlaylistId(playlist.id);
                  setViewMode("playlists");
                }}
              >
                <ListPlus size={15} />
                <strong>{playlist.title}</strong>
              </button>
            ))}
          </div>
        </div>

        <div className="mini-stats">
          <div>
            <span>{library.length}</span>
            <p>Canciones</p>
          </div>
          <div>
            <span>{albums.length}</span>
            <p>Álbumes</p>
          </div>
          <div>
            <span>{favorites.length}</span>
            <p>Favoritas</p>
          </div>
          {canManage ? (
            <div>
              <span>{playlists.length}</span>
              <p>Playlists</p>
            </div>
          ) : null}
        </div>

        {canManage ? (
          <button type="button" className="text-button logout-button" onClick={logoutAdmin}>
            <LogOut size={16} />
            <span>Cerrar sesión admin</span>
          </button>
        ) : null}
      </aside>

      <section className="content">
        <header className="topbar">
          <label className="search-field">
            <Search size={18} />
            <input
              type="search"
              placeholder="Buscar canción, álbum o artista"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="top-actions">
            <select
              aria-label="Filtrar por álbum"
              value={selectedAlbumId}
              onChange={(event) => setSelectedAlbumId(event.target.value)}
            >
              <option value="all">Todos los álbumes</option>
              {albums.map((albumItem) => (
                <option key={albumItem.id} value={albumItem.id}>
                  {albumItem.title}
                </option>
              ))}
            </select>
            <select
              aria-label="Ordenar canciones"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              <option value="added">Orden original</option>
              <option value="title">Título</option>
              <option value="artist">Artista</option>
              <option value="album">Álbum</option>
            </select>
            {canManage ? (
              <button type="button" className="primary-action" onClick={() => uploadRef.current?.click()}>
                <Upload size={18} />
                <span>Subir canciones</span>
              </button>
            ) : null}
          </div>
        </header>

        <section className="stage">
          <div className="cover-scene">
            <div className="cover-aura" />
            <div
              className="cover-art"
              style={{ backgroundImage: `url("${currentTrack?.coverUrl ?? builtInAlbum.coverUrl}")` }}
              aria-label="Portada actual"
              onTouchStart={(event) => {
                const touch = event.changedTouches[0];
                coverTouchRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
              }}
              onTouchEnd={(event) => {
                const start = coverTouchRef.current;
                coverTouchRef.current = null;
                if (!start) return;
                const touch = event.changedTouches[0];
                const deltaX = touch.clientX - start.x;
                const deltaY = touch.clientY - start.y;
                if (Date.now() - start.at < 700 && Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
                  skip(deltaX < 0 ? 1 : -1);
                }
              }}
            >
              <div className={isPlaying ? "equalizer playing" : "equalizer"}>
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="cover-badge">
                <Sparkles size={16} />
                <span>{listeningPercent}% escuchado</span>
              </div>
            </div>
          </div>

          <div className="player-panel">
            <p className="eyebrow">Reproduciendo ahora</p>
            <h1>{currentTrack?.title ?? "Sin canciones"}</h1>
            <p className="track-meta">
              {currentTrack?.artist ?? "Gar Music"} / {currentTrack?.albumTitle ?? "Biblioteca"}
            </p>
            <div className="player-readout">
              <span>Guardado en {formatTime(progress)}</span>
              <span>{queue.length} canciones en cola</span>
              <span>{shuffle ? "Aleatorio" : "Orden normal"}</span>
            </div>

            <div className={isPlaying ? "audio-visualizer playing" : "audio-visualizer"} aria-hidden="true">
              {Array.from({ length: 28 }).map((_, index) => (
                <span key={index} style={{ animationDelay: `${index * 34}ms` }} />
              ))}
            </div>

            <div className="transport">
              <button type="button" className={shuffle ? "round-button active" : "round-button"} onClick={() => setShuffle((value) => !value)} aria-label="Aleatorio" title="Aleatorio (S)">
                <Shuffle size={19} />
              </button>
              <button type="button" className="round-button" onClick={() => skip(-1)} aria-label="Anterior" title="Anterior (Shift + ←)">
                <SkipBack size={22} />
              </button>
              <button type="button" className="play-button" onClick={togglePlay} aria-label={isPlaying ? "Pausar" : "Reproducir"} title="Play/Pause (Espacio)">
                {isPlaying ? <Pause size={30} /> : <Play size={30} />}
              </button>
              <button type="button" className="round-button" onClick={() => skip(1)} aria-label="Siguiente" title="Siguiente (Shift + →)">
                <SkipForward size={22} />
              </button>
              <button
                type="button"
                className={repeatMode !== "off" ? "round-button active" : "round-button"}
                onClick={() => setRepeatMode((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"))}
                aria-label="Repetir"
                title="Repetir (R)"
              >
                <Repeat size={19} />
                {repeatMode === "one" ? <span className="repeat-dot">1</span> : null}
              </button>
            </div>

            <div className="timeline">
              <span>{formatTime(progress)}</span>
              <input
                aria-label="Progreso"
                type="range"
                min="0"
                max={duration || 0}
                step="0.1"
                value={Math.min(progress, duration || 0)}
                onChange={seek}
              />
              <span>{formatTime(duration)}</span>
            </div>

            <div className="player-tools">
              <label className="volume">
                <Volume2 size={18} />
                <input
                  aria-label="Volumen"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(event) => setVolume(Number(event.target.value))}
                />
              </label>
              {currentTrack ? (
                <button type="button" className="text-button" onClick={() => toggleFavorite(currentTrack.id)} title="Favorita (F)">
                  <Heart size={18} fill={favoriteSet.has(currentTrack.id) ? "currentColor" : "none"} />
                  <span>{favoriteSet.has(currentTrack.id) ? "Guardada" : "Favorita"}</span>
                </button>
              ) : null}
              <button type="button" className="text-button" onClick={() => setIsFullscreenPlayer(true)}>
                <Maximize2 size={18} />
                <span>Pantalla completa</span>
              </button>
            </div>

            <div className="advanced-controls">
              <label>
                <span>Velocidad</span>
                <select value={playbackRate} onChange={(event) => setPlaybackRate(Number(event.target.value))}>
                  <option value="0.75">0.75x</option>
                  <option value="1">1x</option>
                  <option value="1.25">1.25x</option>
                  <option value="1.5">1.5x</option>
                </select>
              </label>
              <label>
                <span>Crossfade</span>
                <select value={crossfadeSeconds} onChange={(event) => setCrossfadeSeconds(Number(event.target.value))}>
                  <option value="0">Off</option>
                  <option value="2">2s</option>
                  <option value="5">5s</option>
                  <option value="8">8s</option>
                </select>
              </label>
              <label>
                <span>Temporizador</span>
                <select value={sleepMinutes} onChange={(event) => setSleepMinutes(Number(event.target.value))}>
                  <option value="0">Off</option>
                  <option value="5">5 min</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="60">60 min</option>
                </select>
              </label>
              <button type="button" className="secondary-action" onClick={startSleepTimer}>
                <Timer size={18} />
                <span>{sleepRemaining ? formatTime(sleepRemaining) : "Activar"}</span>
              </button>
            </div>
          </div>
        </section>

        {viewMode === "albums" ? (
          <section className="album-grid primary-library" aria-label="Álbumes">
            {albums.map((albumItem) => (
              <article
                key={albumItem.id}
                className="album-tile"
                draggable={canManage}
                onDragStart={() => {
                  albumDragRef.current = albumItem.id;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  if (albumDragRef.current) {
                    moveAlbum(albumDragRef.current, albumItem.id);
                  }
                }}
              >
                <button
                  type="button"
                  className="album-cover"
                  style={{ backgroundImage: `url("${albumItem.coverUrl}")` }}
                  onClick={() => {
                    setSelectedAlbumId(albumItem.id);
                    setViewMode("library");
                  }}
                  aria-label={`Abrir ${albumItem.title}`}
                />
                <div>
                  <h3>{albumItem.title}</h3>
                  <p>{albumItem.artist}</p>
                </div>
                <button type="button" className="album-share" onClick={() => shareAlbum(albumItem)} aria-label="Compartir álbum">
                  <Share2 size={16} />
                </button>
                {albumItem.source === "user" && canManage ? (
                  <button type="button" className="delete-button" onClick={() => removeAlbum(albumItem.id)} aria-label="Eliminar álbum">
                    <Trash2 size={17} />
                  </button>
                ) : null}
              </article>
            ))}
          </section>
        ) : (
          <section className="library-panel primary-library" aria-label="Canciones">
            <div className="library-heading">
              <div>
                <p className="eyebrow">Cola principal</p>
                <h2>{viewMode === "favorites" ? "Favoritas" : viewMode === "recent" ? "Subidas recientes" : viewMode === "playlists" ? "Playlists" : "Canciones para reproducir"}</h2>
                <p>{visibleTracks.length} canciones listas para sonar</p>
              </div>
              <div className="library-status">
                <span>{isPlaying ? "Sonando ahora" : "En pausa"}</span>
                <strong>{currentTrack?.title ?? "Sin canción"}</strong>
              </div>
            </div>

            <div className="track-list">
              {visibleTracks.map((track, index) => {
                const active = currentTrack?.id === track.id;
                const favorite = favoriteSet.has(track.id);

                return (
                  <div
                    key={track.id}
                    className={active ? "track-row active" : "track-row"}
                    draggable
                    onDragStart={() => {
                      queueDragRef.current = track.id;
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (queueDragRef.current) {
                        moveQueueTrack(queueDragRef.current, track.id);
                      }
                    }}
                    onPointerDown={() => {
                      if (longPressTimerRef.current) {
                        window.clearTimeout(longPressTimerRef.current);
                      }
                      longPressTimerRef.current = window.setTimeout(() => setOpenTrackMenu(track.id), 520);
                    }}
                    onPointerUp={() => {
                      if (longPressTimerRef.current) {
                        window.clearTimeout(longPressTimerRef.current);
                      }
                    }}
                    onPointerLeave={() => {
                      if (longPressTimerRef.current) {
                        window.clearTimeout(longPressTimerRef.current);
                      }
                    }}
                  >
                    <button type="button" className="track-play" onClick={() => playTrack(track.id)} aria-label={`Reproducir ${track.title}`}>
                      {active && isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <span className="track-index">{String(index + 1).padStart(2, "0")}</span>
                    <div className="track-thumb" style={{ backgroundImage: `url("${track.coverUrl}")` }} />
                    <div className="track-copy">
                      <strong>{track.title}</strong>
                      <span>{track.artist}</span>
                    </div>
                    <span className="album-name">{active && isPlaying ? "Sonando" : track.albumTitle}</span>
                    <div className="track-menu-wrap">
                      <button
                        type="button"
                        className="heart-button"
                        onClick={() => setOpenTrackMenu((id) => (id === track.id ? null : track.id))}
                        aria-label="Opciones"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {openTrackMenu === track.id ? (
                        <div className="track-menu">
                          <button type="button" onClick={() => playTrack(track.id)}>
                            <Play size={16} />
                            <span>Reproducir</span>
                          </button>
                          <button type="button" onClick={() => toggleFavorite(track.id)}>
                            <Heart size={16} fill={favorite ? "currentColor" : "none"} />
                            <span>{favorite ? "Quitar favorito" : "Favorito"}</span>
                          </button>
                          <button type="button" onClick={() => shareTrack(track)}>
                            <Share2 size={16} />
                            <span>Compartir link</span>
                          </button>
                          <button type="button" onClick={() => shareTrackCard(track)}>
                            <Sparkles size={16} />
                            <span>Compartir portada</span>
                          </button>
                          <button type="button" onClick={() => shareTrackAlbum(track)}>
                            <Album size={16} />
                            <span>Compartir álbum</span>
                          </button>
                          <a href={track.audioUrl} download className="track-menu-link">
                            <Download size={16} />
                            <span>Descargar offline</span>
                          </a>
                          {canManage ? (
                            <button type="button" onClick={() => renameTrack(track)}>
                              <SlidersHorizontal size={16} />
                              <span>Editar datos</span>
                            </button>
                          ) : null}
                          {canManage ? (
                            <button type="button" onClick={() => removeTrack(track)}>
                              <Trash2 size={16} />
                              <span>Eliminar canción</span>
                            </button>
                          ) : null}
                          {canManage && firstPlaylistId ? (
                            <button type="button" onClick={() => addToPlaylist(firstPlaylistId, track.id)}>
                              <ListPlus size={16} />
                              <span>Añadir a playlist</span>
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="listening-insights" aria-label="Historial y estadisticas">
          <div className="history-panel">
            <div className="section-title">
              <Clock3 size={20} />
              <h2>Historial</h2>
            </div>
            <div className="history-list">
              {historyTracks.length ? historyTracks.slice(0, 6).map((track) => (
                <button type="button" key={track.id} onClick={() => playTrack(track.id)}>
                  <span style={{ backgroundImage: `url("${track.coverUrl}")` }} />
                  <strong>{track.title}</strong>
                  <em>{playStats.counts[track.id] ?? 0} plays</em>
                </button>
              )) : (
                <p className="empty-copy">Aún no hay historial.</p>
              )}
            </div>
          </div>
          <div className="stats-panel">
            <div className="section-title">
              <SlidersHorizontal size={20} />
              <h2>Estadísticas</h2>
            </div>
            <div className="stat-cards">
              <span><strong>{formatTime(playStats.totalSeconds)}</strong><em>escuchado</em></span>
              <span><strong>{Object.values(playStats.counts).reduce((total, count) => total + count, 0)}</strong><em>plays</em></span>
              <span><strong>{topTracks[0]?.title ?? "Sin datos"}</strong><em>top track</em></span>
            </div>
            <div className="top-track-list">
              {topTracks.map((track) => (
                <button type="button" key={track.id} onClick={() => playTrack(track.id)}>
                  <strong>{track.title}</strong>
                  <em>{playStats.counts[track.id]} plays</em>
                </button>
              ))}
            </div>
          </div>
        </section>

        {canManage ? (
        <section className="dashboard">
          <form className="creator-panel" onSubmit={createAlbum}>
            <div className="section-title">
              <CirclePlus size={20} />
              <h2>Nuevo álbum</h2>
            </div>
            <div className="form-grid">
              <input
                type="text"
                placeholder="Nombre del álbum"
                value={albumTitle}
                onChange={(event) => setAlbumTitle(event.target.value)}
              />
              <input
                type="text"
                placeholder="Artista"
                value={albumArtist}
                onChange={(event) => setAlbumArtist(event.target.value)}
              />
              <input
                ref={coverRef}
                className="hidden-file"
                type="file"
                accept="image/*"
                onChange={(event) => setCoverName(event.target.files?.[0]?.name ?? "Sin portada personalizada")}
              />
              <button type="button" className="cover-picker" onClick={() => coverRef.current?.click()}>
                <Upload size={18} />
                <span>{coverName}</span>
              </button>
              <button type="submit" className="primary-action">
                <CirclePlus size={18} />
                <span>Crear álbum</span>
              </button>
            </div>
          </form>

          <div
            className="upload-panel drop-upload"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void importAudioFiles(Array.from(event.dataTransfer.files));
            }}
          >
            <div className="section-title">
              <Upload size={20} />
              <h2>Importar música</h2>
            </div>
            <div className="upload-controls">
              <select
                aria-label="Álbum para nuevas canciones"
                value={newAlbumId}
                onChange={(event) => setNewAlbumId(event.target.value)}
              >
                {albums.map((albumItem) => (
                  <option key={albumItem.id} value={albumItem.id}>
                    {albumItem.title}
                  </option>
                ))}
              </select>
              <input ref={uploadRef} type="file" accept="audio/*" multiple onChange={uploadTracks} />
              <button type="button" className="secondary-action" onClick={() => uploadRef.current?.click()}>
                <Upload size={18} />
                <span>{isImporting ? "Importando…" : "Elegir archivos"}</span>
              </button>
            </div>
          </div>
          <div className="insights-panel">
            <div className="section-title">
              <SlidersHorizontal size={20} />
              <h2>Resumen</h2>
            </div>
            <div className="insight-grid">
              <span>{userAlbums} creados</span>
              <span>{library.filter((track) => track.source === "user").length} subidas</span>
              <span>{totalArtists} artistas</span>
              <span>{queue.length} en cola</span>
              <span>{Object.values(playStats.counts).reduce((total, count) => total + count, 0)} plays</span>
              <span>{formatTime(playStats.totalSeconds)} escuchado</span>
              <span>{repeatMode === "one" ? "Repite pista" : repeatMode === "all" ? "Repite cola" : "Sin repetir"}</span>
              <span>{shuffle ? "Aleatorio activo" : "Orden normal"}</span>
            </div>
            <button type="button" className="export-button" onClick={exportLibrary}>
              <Download size={18} />
              <span>Exportar biblioteca</span>
            </button>
          </div>
        </section>
        ) : null}

        {canManage ? (
        <section className="studio-grid">
          <div className="playlist-panel">
            <div className="section-title">
              <ListPlus size={20} />
              <h2>Playlists</h2>
            </div>
            <div className="playlist-create">
              <input
                type="text"
                placeholder="Nueva playlist"
                value={playlistTitle}
                onChange={(event) => setPlaylistTitle(event.target.value)}
              />
              <button type="button" className="secondary-action" onClick={createPlaylist} aria-label="Crear playlist">
                <Plus size={18} />
              </button>
            </div>
            <div className="playlist-list">
              <button
                type="button"
                className={selectedPlaylistId === "all" ? "playlist-chip active" : "playlist-chip"}
                onClick={() => {
                  setSelectedPlaylistId("all");
                  setViewMode("playlists");
                }}
              >
                Todas las canciones
              </button>
              {playlists.map((playlist) => (
                <div key={playlist.id} className="playlist-row">
                  <button
                    type="button"
                    className={selectedPlaylistId === playlist.id ? "playlist-chip active" : "playlist-chip"}
                    onClick={() => {
                      setSelectedPlaylistId(playlist.id);
                      setViewMode("playlists");
                    }}
                  >
                    {playlist.title} ({playlist.trackIds.length})
                  </button>
                  <button type="button" className="delete-button" onClick={() => removePlaylist(playlist.id)} aria-label="Eliminar playlist">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="queue-panel">
            <div className="section-title">
              <ListMusic size={20} />
              <h2>A continuación</h2>
              <button type="button" className="inline-reset" onClick={resetQueueOrder}>Reset</button>
            </div>
            <div className="queue-list">
              {nextQueue.length ? nextQueue.map((track) => (
                <button
                  type="button"
                  key={track.id}
                  className="queue-item"
                  draggable
                  onClick={() => playTrack(track.id)}
                  onDragStart={() => {
                    queueDragRef.current = track.id;
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (queueDragRef.current) {
                      moveQueueTrack(queueDragRef.current, track.id);
                    }
                  }}
                >
                  <GripVertical size={16} />
                  <span style={{ backgroundImage: `url("${track.coverUrl}")` }} />
                  <strong>{track.title}</strong>
                  <em>{track.artist}</em>
                </button>
              )) : (
                <p className="empty-copy">La cola se rellena según tus filtros.</p>
              )}
            </div>
          </div>

          <div className="artist-panel">
            <div className="section-title">
              <Mic2 size={20} />
              <h2>Artistas</h2>
            </div>
            <div className="artist-cloud">
              {Array.from(new Set(library.map((track) => track.artist))).map((artist) => (
                <button type="button" key={artist} onClick={() => setQuery(artist)}>
                  {artist}
                </button>
              ))}
            </div>
          </div>
        </section>
        ) : null}

      </section>
      {currentTrack ? (
        <aside
          className={dockExpanded ? "now-dock expanded" : "now-dock"}
          aria-label="Canción sonando"
          onTouchStart={(event) => {
            const touch = event.changedTouches[0];
            dockTouchRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
          }}
          onTouchEnd={(event) => {
            const touch = event.changedTouches[0];
            handleDockTouchEnd(touch.clientX, touch.clientY);
          }}
        >
          <div className="dock-art" style={{ backgroundImage: `url("${currentTrack.coverUrl}")` }} />
          <div className="dock-copy">
            <span>{isPlaying ? "Sigue sonando" : "Lista para sonar"}</span>
            <strong>{currentTrack.title}</strong>
            <em>{formatTime(progress)} / {formatTime(duration)}</em>
          </div>
          <div className="dock-actions">
            <button type="button" onClick={() => skip(-1)} aria-label="Anterior">
              <SkipBack size={16} />
            </button>
            <button type="button" className="dock-play" onClick={togglePlay} aria-label={isPlaying ? "Pausar" : "Reproducir"}>
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button type="button" onClick={() => skip(1)} aria-label="Siguiente">
              <SkipForward size={16} />
            </button>
            <button type="button" className={favoriteSet.has(currentTrack.id) ? "active" : ""} onClick={() => toggleFavorite(currentTrack.id)} aria-label="Favorita">
              <Heart size={16} fill={favoriteSet.has(currentTrack.id) ? "currentColor" : "none"} />
            </button>
            <button type="button" onClick={() => shareTrack(currentTrack)} aria-label="Compartir">
              <Share2 size={16} />
            </button>
            <button type="button" onClick={() => shareTrackAlbum(currentTrack)} aria-label="Compartir álbum">
              <Album size={16} />
            </button>
            <button type="button" onClick={() => setDockExpanded((value) => !value)} aria-label={dockExpanded ? "Compactar" : "Expandir"}>
              {dockExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
          <label className="dock-volume">
            <Volume2 size={15} />
            <input
              aria-label="Volumen flotante"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(event) => setVolume(Number(event.target.value))}
            />
          </label>
          {dockExpanded ? (
            <div className="dock-expanded-panel">
              <button type="button" onClick={() => setIsFullscreenPlayer(true)}>
                <Maximize2 size={16} />
                <span>Pantalla completa</span>
              </button>
              <a href={currentTrack.audioUrl} download>
                <Download size={16} />
                <span>Offline</span>
              </a>
              <button type="button" onClick={() => setMobileQueueOpen((value) => !value)}>
                <ListMusic size={16} />
                <span>Cola</span>
              </button>
            </div>
          ) : null}
          <div className="dock-progress">
            <span style={{ width: `${listeningPercent}%` }} />
          </div>
        </aside>
      ) : null}

      {isFullscreenPlayer && currentTrack ? (
        <div className="fullscreen-player" role="dialog" aria-modal="true" aria-label="Reproductor a pantalla completa">
          <button type="button" className="fullscreen-close" onClick={() => setIsFullscreenPlayer(false)} aria-label="Cerrar">
            <Minimize2 size={22} />
          </button>
          <div className="fullscreen-art" style={{ backgroundImage: `url("${currentTrack.coverUrl}")` }} />
          <div className="fullscreen-copy">
            <p className="eyebrow">{isPlaying ? "Sonando ahora" : "En pausa"}</p>
            <h2>{currentTrack.title}</h2>
            <span>{currentTrack.artist} / {currentTrack.albumTitle}</span>
          </div>
          <div className={isPlaying ? "audio-visualizer fullscreen-visualizer playing" : "audio-visualizer fullscreen-visualizer"} aria-hidden="true">
            {Array.from({ length: 36 }).map((_, index) => (
              <span key={index} style={{ animationDelay: `${index * 28}ms` }} />
            ))}
          </div>
          <div className="transport fullscreen-transport">
            <button type="button" className={shuffle ? "round-button active" : "round-button"} onClick={() => setShuffle((value) => !value)} aria-label="Aleatorio">
              <Shuffle size={22} />
            </button>
            <button type="button" className="round-button" onClick={() => skip(-1)} aria-label="Anterior">
              <SkipBack size={26} />
            </button>
            <button type="button" className="play-button" onClick={togglePlay} aria-label={isPlaying ? "Pausar" : "Reproducir"}>
              {isPlaying ? <Pause size={34} /> : <Play size={34} />}
            </button>
            <button type="button" className="round-button" onClick={() => skip(1)} aria-label="Siguiente">
              <SkipForward size={26} />
            </button>
            <button type="button" className={favoriteSet.has(currentTrack.id) ? "round-button active" : "round-button"} onClick={() => toggleFavorite(currentTrack.id)} aria-label="Favorita">
              <Heart size={22} fill={favoriteSet.has(currentTrack.id) ? "currentColor" : "none"} />
            </button>
          </div>
          <div className="timeline fullscreen-timeline">
            <span>{formatTime(progress)}</span>
            <input
              aria-label="Progreso fullscreen"
              type="range"
              min="0"
              max={duration || 0}
              step="0.1"
              value={Math.min(progress, duration || 0)}
              onChange={seek}
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      ) : null}

      {mobileQueueOpen ? (
        <div className="mobile-queue-sheet">
          <div className="section-title">
            <ListMusic size={20} />
            <h2>Cola</h2>
            <button type="button" className="inline-reset" onClick={() => setMobileQueueOpen(false)}>Cerrar</button>
          </div>
          <div className="queue-list">
            {queue.map((track) => (
              <button type="button" key={track.id} className="queue-item" onClick={() => playTrack(track.id)}>
                <span style={{ backgroundImage: `url("${track.coverUrl}")` }} />
                <strong>{track.title}</strong>
                <em>{track.artist}</em>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
    </main>
  );
}
