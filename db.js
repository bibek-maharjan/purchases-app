// IndexedDB wrapper. Three stores:
//   items  – text fields + small thumbnail (loaded for list & search)
//   photos – full compressed photo, loaded only when needed
const DB = (() => {
  let dbp;
  function open() {
    dbp ??= new Promise((resolve, reject) => {
      const req = indexedDB.open('purchases', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('items', { keyPath: 'id' });
        req.result.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function run(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const result = fn(tx);
      tx.oncomplete = () => resolve(result?.result ?? result);
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    allItems: () => run('items', 'readonly', tx => tx.objectStore('items').getAll()),
    getPhoto: id => run('photos', 'readonly', tx => tx.objectStore('photos').get(id)),
    save: (item, photo) => run(['items', 'photos'], 'readwrite', tx => {
      tx.objectStore('items').put(item);
      if (photo) tx.objectStore('photos').put(photo, item.id);
    }),
    remove: id => run(['items', 'photos'], 'readwrite', tx => {
      tx.objectStore('items').delete(id);
      tx.objectStore('photos').delete(id);
    }),
  };
})();
