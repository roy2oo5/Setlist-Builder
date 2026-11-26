const DATABASE_NAME = 'setlist-builder-stage';
const DATABASE_VERSION = 1;
const STORE_NAME = 'gig-packs';
const ACTIVE_PACK_KEY = 'active';
const PACK_FALLBACK_KEY = 'stage_gig_pack';
const SETTINGS_KEY = 'stage_device_settings';

function openStageDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable.'));
      return;
    }
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open the offline gig store.'));
    request.onblocked = () => reject(new Error('The offline gig store is blocked by another tab.'));
  });
}

function readLocalPack() {
  try {
    const stored = window.localStorage.getItem(PACK_FALLBACK_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn('Could not read the local gig-pack fallback:', error);
    return null;
  }
}

export async function loadGigPack() {
  try {
    const database = await openStageDatabase();
    try {
      const pack = await new Promise((resolve, reject) => {
        const request = database.transaction(STORE_NAME, 'readonly')
          .objectStore(STORE_NAME)
          .get(ACTIVE_PACK_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('Unable to read the offline gig pack.'));
      });
      return pack || readLocalPack();
    } finally {
      database.close();
    }
  } catch (error) {
    console.warn('Could not read the IndexedDB gig pack; trying local storage:', error);
    return readLocalPack();
  }
}

export async function saveGigPack(pack) {
  let indexedDBError;
  try {
    const database = await openStageDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(pack, ACTIVE_PACK_KEY);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error('Unable to cache the gig pack.'));
        transaction.onabort = () => reject(transaction.error || new Error('The gig-pack cache transaction was aborted.'));
      });
    } finally {
      database.close();
    }
    return 'indexedDB';
  } catch (error) {
    indexedDBError = error;
  }

  try {
    window.localStorage.setItem(PACK_FALLBACK_KEY, JSON.stringify(pack));
    return 'localStorage';
  } catch (fallbackError) {
    throw new Error(`Could not save this gig pack offline. IndexedDB: ${indexedDBError.message} Local storage: ${fallbackError.message}`);
  }
}

export function loadDeviceSettings() {
  try {
    return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch (error) {
    console.warn('Could not load Stage View settings:', error);
    return {};
  }
}

export function saveDeviceSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Could not persist Stage View settings:', error);
  }
}
