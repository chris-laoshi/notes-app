// storage.js
// The ONLY file that talks to IndexedDB. Every other file goes through
// the `storage` object exported at the bottom. If cloud sync (e.g. Supabase)
// is added later, it should plug in here without changing any other file.

const DB_NAME = 'notes-app';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
        store.createIndex('date', 'date');
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
  return dbPromise;
}

// Ask the browser not to auto-clear this site's storage under pressure.
// Returns true/false for whether persistence was granted.
async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      return await navigator.storage.persist();
    } catch (err) {
      console.warn('Storage persistence request failed:', err);
      return false;
    }
  }
  return false;
}

async function getAllNotes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Creates or overwrites a note (notes carry their own id).
async function saveNote(note) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(note);
    tx.oncomplete = () => resolve(note);
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteNote(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const storage = {
  requestPersistence,
  getAllNotes,
  saveNote,
  deleteNote,
};
