'use strict';

const DB = {
  DB_NAME: 'InventoryDB',
  DB_VERSION: 1,

  _db: null,

  async open() {
    if (this._db) return this._db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('sessions')) {
          const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
          sessionStore.createIndex('createdAt', 'createdAt');
        }

        if (!db.objectStoreNames.contains('records')) {
          const recordStore = db.createObjectStore('records', { keyPath: 'id' });
          recordStore.createIndex('sessionId', 'sessionId');
          recordStore.createIndex('scannedAt', 'scannedAt');
        }
      };

      request.onsuccess = (e) => {
        this._db = e.target.result;
        resolve(this._db);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  },

  // ===== Session CRUD =====

  async createSession(name) {
    await this.open();
    const session = {
      id: Utils.generateId(),
      name,
      createdAt: Utils.nowISO(),
      recordCount: 0
    };
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      store.add(session);
      tx.oncomplete = () => resolve(session);
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async getAllSessions() {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('sessions');
      const store = tx.objectStore('sessions');
      const request = store.getAll();
      request.onsuccess = () => {
        const sessions = request.result;
        sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        resolve(sessions);
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async getSession(id) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('sessions');
      const store = tx.objectStore('sessions');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async updateSession(session) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('sessions', 'readwrite');
      const store = tx.objectStore('sessions');
      store.put(session);
      tx.oncomplete = () => resolve(session);
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  /**
   * 使用游标在同一事务中删除会话及其所有记录，避免孤儿数据
   */
  async deleteSession(id) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(['sessions', 'records'], 'readwrite');
      const sessionStore = tx.objectStore('sessions');
      const recordStore = tx.objectStore('records');
      const index = recordStore.index('sessionId');

      sessionStore.delete(id);

      // 用游标遍历删除，确保原子性
      const cursorReq = index.openCursor(id);
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  // ===== Record CRUD =====

  async createRecord(record) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(['records', 'sessions'], 'readwrite');
      const recordStore = tx.objectStore('records');
      const sessionStore = tx.objectStore('sessions');

      recordStore.add(record);

      // 在同一事务中更新会话计数（原子操作，无竞态）
      const sessionReq = sessionStore.get(record.sessionId);
      sessionReq.onsuccess = () => {
        const session = sessionReq.result;
        if (session) {
          session.recordCount = (session.recordCount || 0) + 1;
          sessionStore.put(session);
        }
      };

      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async getRecordsBySession(sessionId) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('records');
      const store = tx.objectStore('records');
      const index = store.index('sessionId');
      const request = index.getAll(sessionId);
      request.onsuccess = () => {
        const records = request.result;
        records.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));
        resolve(records);
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async findRecordByPallet(palletNumber) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('records');
      const store = tx.objectStore('records');
      const request = store.getAll();
      request.onsuccess = () => {
        const record = request.result.find((r) => r.palletNumber === palletNumber) || null;
        resolve(record);
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async getRecord(id) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('records');
      const store = tx.objectStore('records');
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async updateRecord(record) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction('records', 'readwrite');
      const store = tx.objectStore('records');
      store.put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e.target.error);
    });
  },

  async deleteRecord(id) {
    await this.open();
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(['records', 'sessions'], 'readwrite');
      const recordStore = tx.objectStore('records');
      const sessionStore = tx.objectStore('sessions');

      // 先获取记录
      const getReq = recordStore.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          recordStore.delete(id);
          // 同一事务中更新计数
          const sessionReq = sessionStore.get(record.sessionId);
          sessionReq.onsuccess = () => {
            const session = sessionReq.result;
            if (session) {
              session.recordCount = Math.max(0, (session.recordCount || 0) - 1);
              sessionStore.put(session);
            }
          };
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }
};
