export type AlbumItem = {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  source: "built-in" | "user";
  createdAt: number;
};

export type TrackItem = {
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

export type Playlist = {
  id: string;
  title: string;
  trackIds: string[];
  createdAt: number;
};

export type RepeatMode = "off" | "one" | "all";
export type ViewMode = "library" | "albums" | "favorites" | "recent" | "playlists";
export type SortMode = "added" | "title" | "artist" | "album";
