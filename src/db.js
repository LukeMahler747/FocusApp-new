// FocusApp DB — IndexedDB wrapper
// Exposes window.DB with async methods for todos, settings, and trash.
(function () {
  'use strict';

  const NAME = 'focusapp_v2';
  const VER  = 3;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(NAME, VER);

      req.onupgradeneeded = function (e) {
        var db = e.target.result;

        if (!db.objectStoreNames.contains('todos')) {
          var ts = db.createObjectStore('todos', { keyPath: 'id' });
          ts.createIndex('byDate',  'listDate', { unique: false });
          ts.createIndex('byPanel', 'panel',    { unique: false });
        }

        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains('trash')) {
          db.createObjectStore('trash', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('morning')) {
          db.createObjectStore('morning', { keyPath: 'dateKey' });
        }

        if (!db.objectStoreNames.contains('checklistDays')) {
          db.createObjectStore('checklistDays', { keyPath: 'stateKey' });
        }
      };

      req.onsuccess = function () {
        _db = req.result;
        resolve(_db);
      };

      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  // ── Generic helpers ────────────────────────────────────────────────────────

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(store, mode);
        t.onerror = function () { reject(t.error); };
        fn(t.objectStore(store), resolve, reject);
      });
    });
  }

  function getAll(store) {
    return tx(store, 'readonly', function (s, resolve, reject) {
      var req = s.getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  function put(store, record) {
    return tx(store, 'readwrite', function (s, resolve, reject) {
      var req = s.put(record);
      req.onsuccess = function () { resolve(); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  function remove(store, key) {
    return tx(store, 'readwrite', function (s, resolve, reject) {
      var req = s.delete(key);
      req.onsuccess = function () { resolve(); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  function clear(store) {
    return tx(store, 'readwrite', function (s, resolve, reject) {
      var req = s.clear();
      req.onsuccess = function () { resolve(); };
      req.onerror   = function () { reject(req.error); };
    });
  }

  // ── Todos ──────────────────────────────────────────────────────────────────

  function getTodosByDate(listDate) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t   = db.transaction('todos', 'readonly');
        var idx = t.objectStore('todos').index('byDate');
        var req = idx.getAll(listDate);
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function putTodo(todo)   { return put('todos', todo); }
  function deleteTodo(id)  { return remove('todos', id); }
  function getAllTodos()    { return getAll('todos'); }

  // ── Settings ───────────────────────────────────────────────────────────────

  function getSetting(key) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t   = db.transaction('settings', 'readonly');
        var req = t.objectStore('settings').get(key);
        req.onsuccess = function () {
          resolve(req.result ? req.result.value : undefined);
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function setSetting(key, value) {
    return put('settings', { key: key, value: value });
  }

  function getAllSettings() {
    return getAll('settings').then(function (rows) {
      var map = {};
      rows.forEach(function (r) { map[r.key] = r.value; });
      return map;
    });
  }

  // ── Trash ──────────────────────────────────────────────────────────────────

  function addToTrash(todo) {
    var item = Object.assign({}, todo, { deletedAt: Date.now() });
    return put('trash', item);
  }

  function getAllTrash()         { return getAll('trash'); }
  function deleteFromTrash(id)  { return remove('trash', id); }
  function clearTrash()         { return clear('trash'); }

  // ── Morning ────────────────────────────────────────────────────────────────

  function getMorningDay(dateKey) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t   = db.transaction('morning', 'readonly');
        var req = t.objectStore('morning').get(dateKey);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function putMorningDay(record) { return put('morning', record); }

  // ── Checklist day state ────────────────────────────────────────────────────
  // stateKey = listId + '_' + dateKey

  function getChecklistDay(stateKey) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t   = db.transaction('checklistDays', 'readonly');
        var req = t.objectStore('checklistDays').get(stateKey);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror   = function () { reject(req.error); };
      });
    });
  }

  function putChecklistDay(record)    { return put('checklistDays', record); }

  function getAllChecklistDays() { return getAll('checklistDays'); }

  // ── Export ─────────────────────────────────────────────────────────────────

  window.DB = {
    open,
    // todos
    getTodosByDate, putTodo, deleteTodo, getAllTodos,
    // settings
    getSetting, setSetting, getAllSettings,
    // trash
    addToTrash, getAllTrash, deleteFromTrash, clearTrash,
    // morning
    getMorningDay, putMorningDay,
    // checklist days
    getChecklistDay, putChecklistDay, getAllChecklistDays,
  };
}());
