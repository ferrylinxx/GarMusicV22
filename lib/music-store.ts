export type StoredAlbum = {
  id: string;
  title: string;
  artist: string;
  cover?: Blob;
  createdAt: number;
};

export type StoredTrack = {
  id: string;
  albumId: string;
  title: string;
  artist: string;
  fileName: string;
  file: Blob;
  createdAt: number;
};

type MusicDatabase = IDBDatabase;

const DB_NAME = "gar-music-library";
const DB_VERSION = 1;
const ALBUM_STORE = "albums";
const TRACK_STORE = "tracks";

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function openMusicDatabase() {
  return new Promise<MusicDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ALBUM_STORE)) {
        db.createObjectStore(ALBUM_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(TRACK_STORE)) {
        const trackStore = db.createObjectStore(TRACK_STORE, { keyPath: "id" });
        trackStore.createIndex("albumId", "albumId");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getStoredLibrary() {
  const db = await openMusicDatabase();
  const transaction = db.transaction([ALBUM_STORE, TRACK_STORE], "readonly");
  const albums = await requestToPromise<StoredAlbum[]>(
    transaction.objectStore(ALBUM_STORE).getAll()
  );
  const tracks = await requestToPromise<StoredTrack[]>(
    transaction.objectStore(TRACK_STORE).getAll()
  );

  db.close();
  return { albums, tracks };
}

export async function saveStoredAlbum(album: StoredAlbum) {
  const db = await openMusicDatabase();
  const transaction = db.transaction(ALBUM_STORE, "readwrite");
  transaction.objectStore(ALBUM_STORE).put(album);
  await transactionDone(transaction);
  db.close();
}

export async function saveStoredTracks(tracks: StoredTrack[]) {
  const db = await openMusicDatabase();
  const transaction = db.transaction(TRACK_STORE, "readwrite");
  const store = transaction.objectStore(TRACK_STORE);

  tracks.forEach((track) => store.put(track));
  await transactionDone(transaction);
  db.close();
}

export async function updateStoredTrack(track: StoredTrack) {
  const db = await openMusicDatabase();
  const transaction = db.transaction(TRACK_STORE, "readwrite");
  transaction.objectStore(TRACK_STORE).put(track);
  await transactionDone(transaction);
  db.close();
}

export async function deleteStoredTrack(trackId: string) {
  const db = await openMusicDatabase();
  const transaction = db.transaction(TRACK_STORE, "readwrite");
  transaction.objectStore(TRACK_STORE).delete(trackId);
  await transactionDone(transaction);
  db.close();
}

export async function deleteStoredAlbum(albumId: string) {
  const db = await openMusicDatabase();
  const transaction = db.transaction([ALBUM_STORE, TRACK_STORE], "readwrite");
  const albums = transaction.objectStore(ALBUM_STORE);
  const tracks = transaction.objectStore(TRACK_STORE);
  const albumTracks = await requestToPromise<StoredTrack[]>(
    tracks.index("albumId").getAll(albumId)
  );

  albums.delete(albumId);
  albumTracks.forEach((track) => tracks.delete(track.id));
  await transactionDone(transaction);
  db.close();
}
