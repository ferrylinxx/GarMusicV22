"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Album,
  CirclePlus,
  Clock3,
  Download,
  Disc3,
  Heart,
  ListPlus,
  ListMusic,
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
  getStoredLibrary,
  saveStoredAlbum,
  saveStoredTracks,
  type StoredAlbum,
  type StoredTrack
} from "@/lib/music-store";

type AlbumItem = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  source: "built-in" | "user";
  createdAt: number;
};

type TrackItem = {
  id: string;
  title: string;
  artist: string;
  albumId: string;
  albumTitle: string;
  coverUrl: string;
  source: "built-in" | "user";
  audioUrl: string;
  createdAt: number;
};

type Playlist = {
  id: string;
  title: string;
  trackIds: string[];
  createdAt: number;
};

type RepeatMode = "off" | "one" | "all";
type ViewMode = "library" | "albums" | "favorites" | "recent" | "playlists";
type SortMode = "added" | "title" | "artist" | "album";

const BUILT_IN_ALBUM_ID = "costa-dorada";
const FAVORITES_KEY = "gar-music-favorites";
const PLAYLISTS_KEY = "gar-music-playlists";
const POSITIONS_KEY = "gar-music-positions";
const CURRENT_TRACK_KEY = "gar-music-current-track";
const ADMIN_EMAIL = "ferrangarola22@gmail.com";
const ADMIN_PASSWORD = "Ferran2203%";

const builtInAlbum: AlbumItem = {
  id: BUILT_IN_ALBUM_ID,
  title: "Costa Dorada",
  artist: "fgarola",
  coverUrl: "/artwork/cover.png",
  source: "built-in",
  createdAt: 0
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function cleanTitle(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function randomIndex(max: number, current: number) {
  if (max <= 1) {
    return 0;
  }

  let next = Math.floor(Math.random() * max);
  while (next === current) {
    next = Math.floor(Math.random() * max);
  }
  return next;
}

function getLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }

  const value = window.localStorage.getItem(key);
  return value ? (JSON.parse(value) as T) : fallback;
}

export default function Home() {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const savedPositionsRef = useRef<Record<string, number>>(getLocalJson(POSITIONS_KEY, {}));
  const isPlayingRef = useRef(false);
  const lastPositionWriteRef = useRef(0);
  const lastProgressRenderRef = useRef(0);
  const shouldResumeRef = useRef(true);
  const loadResumeTimeRef = useRef(0);
  const dockTouchRef = useRef<{ x: number; y: number; at: number } | null>(null);

  const [albums, setAlbums] = useState<AlbumItem[]>([builtInAlbum]);
  const [library, setLibrary] = useState<TrackItem[]>([]);
  const [currentId, setCurrentId] = useState(() => getLocalJson(CURRENT_TRACK_KEY, ""));
  const [isPlaying, setIsPlaying] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedAlbumId, setSelectedAlbumId] = useState("all");
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("library");
  const [sortMode, setSortMode] = useState<SortMode>("added");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepEndsAt, setSleepEndsAt] = useState<number | null>(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("all");
  const [favorites, setFavorites] = useState<string[]>(() => getLocalJson(FAVORITES_KEY, []));
  const [playlists, setPlaylists] = useState<Playlist[]>(() => getLocalJson(PLAYLISTS_KEY, []));
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
  const [adminUnlocked, setAdminUnlocked] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.sessionStorage.getItem("gar-music-admin") === "ok";
  });

  const canManage = isAdminRoute && adminUnlocked;

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const builtInLibrary: TrackItem[] = builtInTracks.map((track, index) => ({
      id: track.id,
      title: track.title,
      artist: "fgarola",
      albumId: BUILT_IN_ALBUM_ID,
      albumTitle: builtInAlbum.title,
      coverUrl: builtInAlbum.coverUrl,
      source: "built-in",
      audioUrl: assetPath("tracks", track.file),
      createdAt: index
    }));

    getStoredLibrary()
      .then(({ albums: storedAlbums, tracks: storedTracks }) => {
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
            createdAt: track.createdAt
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
        setLibrary(builtInLibrary);
        setCurrentId((existing) =>
          existing && builtInLibrary.some((track) => track.id === existing)
            ? existing
            : builtInLibrary[0]?.id || ""
        );
      });

    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    window.localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  }, [playlists]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (currentId) {
      window.localStorage.setItem(CURRENT_TRACK_KEY, JSON.stringify(currentId));
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

  const queue = visibleTracks.length ? visibleTracks : library;
  const currentQueueIndex = queue.findIndex((track) => track.id === currentTrack?.id);
  const nextQueue = queue
    .filter((track) => track.id !== currentTrack?.id)
    .slice(Math.max(currentQueueIndex, 0), Math.max(currentQueueIndex, 0) + 5);
  const userAlbums = albums.filter((albumItem) => albumItem.source === "user").length;
  const listeningPercent = duration ? Math.round((progress / duration) * 100) : 0;
  const totalArtists = new Set(library.map((track) => track.artist)).size;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    audio.src = currentTrack.audioUrl;
    audio.load();
    lastPositionWriteRef.current = 0;
    const resumeAt = shouldResumeRef.current ? savedPositionsRef.current[currentTrack.id] ?? 0 : 0;
    loadResumeTimeRef.current = resumeAt;
    shouldResumeRef.current = true;
    setProgress(resumeAt);
    setDuration(0);

    if (isPlayingRef.current) {
      audio.play().catch(() => setIsPlaying(false));
    }
  }, [currentTrack]);

  const saveTrackPosition = (trackId: string, seconds: number) => {
    const rounded = Math.floor(seconds);
    if (rounded === savedPositionsRef.current[trackId]) {
      return;
    }

    savedPositionsRef.current = {
      ...savedPositionsRef.current,
      [trackId]: rounded
    };
    window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(savedPositionsRef.current));
  };

  const playTrack = (trackId: string) => {
    shouldResumeRef.current = false;
    if (trackId === currentId && audioRef.current) {
      audioRef.current.currentTime = 0;
      setProgress(0);
      saveTrackPosition(trackId, 0);
    }
    setCurrentId(trackId);
    setIsPlaying(true);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  };

  const skip = (direction: -1 | 1) => {
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
  };

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
  };

  const persistCurrentPosition = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack || !audio.duration || audio.currentTime < 1 || audio.currentTime >= audio.duration - 4) {
      return;
    }

    saveTrackPosition(currentTrack.id, audio.currentTime);
  };

  useEffect(() => {
    window.addEventListener("beforeunload", persistCurrentPosition);
    return () => window.removeEventListener("beforeunload", persistCurrentPosition);
  });

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

  const toggleFavorite = (trackId: string) => {
    setFavorites((items) =>
      items.includes(trackId) ? items.filter((item) => item !== trackId) : [...items, trackId]
    );
  };

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
  };

  const addToPlaylist = (playlistId: string, trackId: string) => {
    setPlaylists((items) =>
      items.map((playlist) =>
        playlist.id === playlistId && !playlist.trackIds.includes(trackId)
          ? { ...playlist, trackIds: [...playlist.trackIds, trackId] }
          : playlist
      )
    );
  };

  const removePlaylist = (playlistId: string) => {
    setPlaylists((items) => items.filter((playlist) => playlist.id !== playlistId));
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId("all");
    }
  };

  const exportLibrary = () => {
    const payload = {
      albums: albums.map(({ coverUrl, ...album }) => album),
      tracks: library.map(({ audioUrl, coverUrl, ...track }) => track),
      playlists,
      favorites
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "gar-music-library.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const shareTrack = async (track: TrackItem) => {
    const url = `${window.location.origin}${window.location.pathname}?track=${encodeURIComponent(track.id)}`;
    if (navigator.share) {
      await navigator.share({ title: track.title, text: `${track.title} - ${track.artist}`, url });
      return;
    }

    await navigator.clipboard?.writeText(url);
  };

  const shareAlbum = async (album: AlbumItem) => {
    const url = `${window.location.origin}${window.location.pathname}?album=${encodeURIComponent(album.id)}`;
    if (navigator.share) {
      await navigator.share({ title: album.title, text: `${album.title} - ${album.artist}`, url });
      return;
    }

    await navigator.clipboard?.writeText(url);
  };

  const shareTrackAlbum = async (track: TrackItem) => {
    const album = albums.find((item) => item.id === track.albumId);
    if (album) {
      await shareAlbum(album);
    }
  };

  const startSleepTimer = () => {
    if (!sleepMinutes) {
      setSleepEndsAt(null);
      setSleepRemaining(0);
      return;
    }

    setSleepEndsAt(Date.now() + sleepMinutes * 60 * 1000);
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

    if (deltaY < 0 && currentTrack) {
      toggleFavorite(currentTrack.id);
      return;
    }

    togglePlay();
  };

  const createAlbum = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = albumTitle.trim();
    const artist = albumArtist.trim() || "Artista local";

    if (!title) {
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

    await saveStoredAlbum(album);
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
  };

  const uploadTracks = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("audio/"));
    const album = albums.find((item) => item.id === newAlbumId) ?? builtInAlbum;

    if (!files.length) {
      return;
    }

    setIsImporting(true);
    const storedTracks: StoredTrack[] = files.map((file) => ({
      id: createId("track"),
      albumId: album.id,
      title: cleanTitle(file.name),
      artist: album.artist,
      fileName: file.name,
      file,
      createdAt: Date.now() + Math.random()
    }));

    await saveStoredTracks(storedTracks);

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
    event.target.value = "";
  };

  const removeAlbum = async (albumId: string) => {
    if (albumId === BUILT_IN_ALBUM_ID) {
      return;
    }

    await deleteStoredAlbum(albumId);
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
  };

  const loginAdmin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (adminEmail.trim() === ADMIN_EMAIL && adminPassword === ADMIN_PASSWORD) {
      window.sessionStorage.setItem("gar-music-admin", "ok");
      setAdminUnlocked(true);
      setAdminError("");
      return;
    }

    setAdminError("Credenciales incorrectas");
  };

  if (isAdminRoute && !adminUnlocked) {
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
            value={adminEmail}
            onChange={(event) => setAdminEmail(event.target.value)}
          />
          <input
            type="password"
            placeholder="Contrasena"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
          />
          {adminError ? <p className="admin-error">{adminError}</p> : null}
          <button type="submit" className="primary-action">
            Entrar
          </button>
        </form>
      </main>
    );
  }

  const navItems = canManage
    ? [
        ["library", ListMusic, "Biblioteca"],
        ["albums", Album, "Albumes"],
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
        }}
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

        <div className="mini-stats">
          <div>
            <span>{library.length}</span>
            <p>Canciones</p>
          </div>
          <div>
            <span>{albums.length}</span>
            <p>Albumes</p>
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
      </aside>

      <section className="content">
        <header className="topbar">
          <label className="search-field">
            <Search size={18} />
            <input
              type="search"
              placeholder="Buscar cancion, album o artista"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="top-actions">
            <select
              aria-label="Filtrar por album"
              value={selectedAlbumId}
              onChange={(event) => setSelectedAlbumId(event.target.value)}
            >
              <option value="all">Todos los albumes</option>
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
              <option value="title">Titulo</option>
              <option value="artist">Artista</option>
              <option value="album">Album</option>
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

            <div className="transport">
              <button type="button" className={shuffle ? "round-button active" : "round-button"} onClick={() => setShuffle((value) => !value)} aria-label="Aleatorio">
                <Shuffle size={19} />
              </button>
              <button type="button" className="round-button" onClick={() => skip(-1)} aria-label="Anterior">
                <SkipBack size={22} />
              </button>
              <button type="button" className="play-button" onClick={togglePlay} aria-label={isPlaying ? "Pausar" : "Reproducir"}>
                {isPlaying ? <Pause size={30} /> : <Play size={30} />}
              </button>
              <button type="button" className="round-button" onClick={() => skip(1)} aria-label="Siguiente">
                <SkipForward size={22} />
              </button>
              <button
                type="button"
                className={repeatMode !== "off" ? "round-button active" : "round-button"}
                onClick={() => setRepeatMode((mode) => (mode === "off" ? "all" : mode === "all" ? "one" : "off"))}
                aria-label="Repetir"
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
              {currentTrack && canManage ? (
                <button type="button" className="text-button" onClick={() => toggleFavorite(currentTrack.id)}>
                  <Heart size={18} fill={favoriteSet.has(currentTrack.id) ? "currentColor" : "none"} />
                  <span>{favoriteSet.has(currentTrack.id) ? "Guardada" : "Favorita"}</span>
                </button>
              ) : null}
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
          <section className="album-grid primary-library" aria-label="Albumes">
            {albums.map((albumItem) => (
              <article key={albumItem.id} className="album-tile">
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
                <button type="button" className="album-share" onClick={() => shareAlbum(albumItem)} aria-label="Compartir album">
                  <Share2 size={16} />
                </button>
                {albumItem.source === "user" ? (
                  <button type="button" className="delete-button" onClick={() => removeAlbum(albumItem.id)} aria-label="Eliminar album">
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
                <strong>{currentTrack?.title ?? "Sin cancion"}</strong>
              </div>
            </div>

            <div className="track-list">
              {visibleTracks.map((track, index) => {
                const active = currentTrack?.id === track.id;
                const favorite = favoriteSet.has(track.id);

                return (
                  <div key={track.id} className={active ? "track-row active" : "track-row"}>
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
                          <button type="button" onClick={() => shareTrackAlbum(track)}>
                            <Album size={16} />
                            <span>Compartir album</span>
                          </button>
                          {canManage && firstPlaylistId ? (
                            <button type="button" onClick={() => addToPlaylist(firstPlaylistId, track.id)}>
                              <ListPlus size={16} />
                              <span>Anadir a playlist</span>
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

        {canManage ? (
        <section className="dashboard">
          <form className="creator-panel" onSubmit={createAlbum}>
            <div className="section-title">
              <CirclePlus size={20} />
              <h2>Nuevo album</h2>
            </div>
            <div className="form-grid">
              <input
                type="text"
                placeholder="Nombre del album"
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
                <span>Crear album</span>
              </button>
            </div>
          </form>

          <div className="upload-panel">
            <div className="section-title">
              <Upload size={20} />
              <h2>Importar musica</h2>
            </div>
            <div className="upload-controls">
              <select
                aria-label="Album para nuevas canciones"
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
                <span>{isImporting ? "Importando..." : "Elegir archivos"}</span>
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
              <h2>A continuacion</h2>
            </div>
            <div className="queue-list">
              {nextQueue.length ? nextQueue.map((track) => (
                <button type="button" key={track.id} className="queue-item" onClick={() => playTrack(track.id)}>
                  <span style={{ backgroundImage: `url("${track.coverUrl}")` }} />
                  <strong>{track.title}</strong>
                  <em>{track.artist}</em>
                </button>
              )) : (
                <p className="empty-copy">La cola se rellena segun tus filtros.</p>
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
          className="now-dock"
          aria-label="Cancion sonando"
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
            <button type="button" onClick={() => shareTrackAlbum(currentTrack)} aria-label="Compartir album">
              <Album size={16} />
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
          <div className="dock-progress">
            <span style={{ width: `${listeningPercent}%` }} />
          </div>
        </aside>
      ) : null}
    </main>
  );
}
