import { openDB } from 'idb';

const DB_NAME = 'NovelAppDB';
const DB_VERSION = 1;

export const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore('settings', { keyPath: 'id' });
  },
});

export const saveValue = async (key: string, value: any) => {
  const db = await dbPromise;
  await db.put('settings', { id: key, value });
};

export const getValue = async (key: string) => {
  const db = await dbPromise;
  const result = await db.get('settings', key);
  return result?.value;
};

export const deleteValue = async (key: string) => {
  const db = await dbPromise;
  await db.delete('settings', key);
};
