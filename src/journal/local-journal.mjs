const STORES = ['observations', 'journalEntries'];
const WRITE_STORES = [...STORES, 'changes', 'syncState', 'syncFlight'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError('Invalid record identifier');
  return value.toLowerCase();
}

function observation(input) {
  const id = uuid(input.id);
  const { longitude, latitude } = input;
  if (!Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
      !Number.isFinite(latitude) || Math.abs(latitude) > 90) throw new TypeError('Invalid coordinates');
  const time = input.captureTime ?? { status: 'not-requested' };
  let captureTime;
  if (['not-requested', 'missing', 'invalid'].includes(time.status)) {
    if (time.local !== undefined || time.offset !== undefined) throw new TypeError('Unexpected capture time');
    captureTime = { status: time.status };
  } else {
    if (!['timezone-unknown', 'invalid-offset', 'with-offset'].includes(time.status) ||
        typeof time.local !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(time.local)) {
      throw new TypeError('Invalid capture time');
    }
    const date = new Date(`${time.local}Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 19) !== time.local) {
      throw new TypeError('Invalid capture date');
    }
    captureTime = { status: time.status, local: time.local };
    if (time.status === 'with-offset') {
      if (typeof time.offset !== 'string' || !/^[+-](?:0\d|1[0-4]):[0-5]\d$/.test(time.offset) ||
          (/^[+-]14:/.test(time.offset) && !time.offset.endsWith(':00'))) throw new TypeError('Invalid time offset');
      captureTime.offset = time.offset;
    } else if (time.offset !== undefined) throw new TypeError('Unexpected time offset');
  }
  // Copy only the journal contract: no image buffers, filenames, asset IDs or unrelated EXIF.
  const record = { id, longitude, latitude, captureTime };
  if (input.palette !== undefined) {
    const { algorithm, colors } = input.palette ?? {};
    if (algorithm !== 'rgb-histogram-v1' || !Array.isArray(colors) || colors.length < 1 || colors.length > 3 ||
        colors.some(color => typeof color !== 'string' || !/^#[0-9A-F]{6}$/.test(color)) || new Set(colors).size !== colors.length) {
      throw new TypeError('Invalid photo palette');
    }
    record.palette = { algorithm, colors: [...colors] };
  }
  return record;
}

function journalEntry(input) {
  const id = uuid(input.id);
  const observationId = input.observationId == null ? null : uuid(input.observationId);
  const note = input.note ?? '';
  const correctedPlaceLabel = input.correctedPlaceLabel ?? null;
  if (typeof note !== 'string' || [...note].length > 4000) throw new TypeError('Invalid note');
  if (correctedPlaceLabel !== null && (typeof correctedPlaceLabel !== 'string' ||
      [...correctedPlaceLabel].length < 1 || [...correctedPlaceLabel].length > 160)) throw new TypeError('Invalid place label');
  return { id, observationId, note, correctedPlaceLabel };
}

function changedSession() {
  return new DOMException('Journal session changed', 'AbortError');
}

function track(tx, store, id, operation) {
  tx.objectStore('changes').put({ key: `${store}:${id}`, token: crypto.randomUUID(), store, id, operation });
  if (operation === 'delete') {
    const states = tx.objectStore('syncState');
    const known = states.get(`${store}:${id}`);
    known.onsuccess = () => {
      if (known.result?.remote && !known.result.remote.deleted) {
        states.put({ ...known.result, remote: withoutContent(known.result.remote) });
      }
    };
    const flights = tx.objectStore('syncFlight');
    const request = flights.get('active');
    request.onsuccess = () => {
      const flight = request.result;
      if (flight?.store === store && flight.id === id && flight.operation === 'put') {
        delete flight.record;
        flight.state = 'reconcile';
        flights.put(flight);
      }
    };
  }
}

function serverRecord(store, record) {
  if (store === 'journalEntries') return {
    observation_id: record.observationId, note: record.note, corrected_place_label: record.correctedPlaceLabel,
  };
  const time = record.captureTime;
  const offset = time.offset;
  return {
    longitude: record.longitude, latitude: record.latitude, capture_status: time.status,
    capture_local: time.local ?? null,
    capture_offset_minutes: offset ? (offset[0] === '-' ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4))) : null,
    palette: record.palette ?? null,
  };
}

function revision(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value) ||
      value.length > 19 || BigInt(value) > 9223372036854775807n) throw new TypeError('Invalid server revision');
  return value;
}

function withoutContent(row) {
  return { store: row.store, id: row.id, revision: row.revision, deleted: row.deleted, record: null, contentOmitted: true };
}

function remoteRow(input) {
  if (!input || !STORES.includes(input.store) || typeof input.deleted !== 'boolean') throw new TypeError('Invalid remote row');
  const row = { store: input.store, id: uuid(input.id), revision: revision(input.revision), deleted: input.deleted, record: null };
  if (row.deleted) {
    if (input.record !== null) throw new TypeError('Tombstone contains content');
    return row;
  }
  const record = input.record;
  const fields = row.store === 'observations'
    ? ['longitude', 'latitude', 'capture_status', 'capture_local', 'capture_offset_minutes', 'palette']
    : ['observation_id', 'note', 'corrected_place_label'];
  if (!record || Array.isArray(record) || fields.some(key => !Object.hasOwn(record, key))) throw new TypeError('Incomplete remote record');
  if (row.store === 'journalEntries') {
    if (typeof record.note !== 'string') throw new TypeError('Invalid remote note');
    row.record = journalEntry({ id: row.id, observationId: record.observation_id, note: record.note,
      correctedPlaceLabel: record.corrected_place_label });
  } else {
    const captureTime = { status: record.capture_status };
    if (record.capture_local !== null) captureTime.local = record.capture_local;
    const minutes = record.capture_offset_minutes;
    if (minutes !== null) {
      if (!Number.isInteger(minutes) || Math.abs(minutes) > 840) throw new TypeError('Invalid remote offset');
      captureTime.offset = `${minutes < 0 ? '-' : '+'}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
    }
    row.record = observation({ id: row.id, longitude: record.longitude, latitude: record.latitude, captureTime,
      ...(record.palette === null ? {} : { palette: record.palette }) });
  }
  return row;
}

// All requests remain inside the caller's transaction, including cursor advancement.
function mergeRemote(tx, row, fail) {
  const key = `${row.store}:${row.id}`;
  const states = tx.objectStore('syncState');
  const known = states.get(key);
  known.onsuccess = () => {
    const state = known.result ?? { key, revision: '0', deleted: false };
    if (BigInt(row.revision) <= BigInt(state.revision) ||
        (state.remote && BigInt(row.revision) < BigInt(state.remote.revision))) return;
    if (state.deleted && !row.deleted) {
      fail(new TypeError('Remote update reused a deleted identifier'));
      return;
    }
    const pending = tx.objectStore('changes').get(key);
    pending.onsuccess = () => {
      const active = tx.objectStore('syncFlight').get('active');
      active.onsuccess = () => {
        const flight = active.result;
        if (pending.result || (flight?.store === row.store && flight.id === row.id) || row.contentOmitted) {
          states.put({ ...state, remote: pending.result?.operation === 'delete' && !row.deleted ? withoutContent(row) : row });
        } else {
          const records = tx.objectStore(row.store);
          if (row.deleted) records.delete(row.id);
          else records.put(row.record);
          states.put({ key, revision: row.revision, deleted: row.deleted });
        }
      };
    };
  };
}

export class LocalJournal {
  #db = null;
  #generation = 0;
  #transactions = new Set();
  #session = null;

  async activate({ kind, id }) {
    this.close();
    if (!['device', 'account'].includes(kind)) throw new TypeError('Invalid journal scope');
    const name = `hk-journal-v1:${kind}:${uuid(id)}`;
    const generation = this.#generation;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 3);
      let abandoned = false;
      request.onupgradeneeded = event => {
        if (event.oldVersion < 1) {
          request.result.createObjectStore('observations', { keyPath: 'id' });
          const entries = request.result.createObjectStore('journalEntries', { keyPath: 'id' });
          entries.createIndex('observationId', 'observationId');
        }
        if (event.oldVersion < 2) {
          const changes = request.result.createObjectStore('changes', { keyPath: 'key' });
          changes.createIndex('token', 'token', { unique: true });
          for (const store of STORES) {
            const cursorRequest = request.transaction.objectStore(store).openCursor();
            cursorRequest.onsuccess = () => {
              const cursor = cursorRequest.result;
              if (!cursor) return;
              track(request.transaction, store, cursor.value.id, 'put');
              cursor.continue();
            };
          }
        }
        request.result.createObjectStore('syncState', { keyPath: 'key' });
        request.result.createObjectStore('syncFlight', { keyPath: 'key' });
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        abandoned = true;
        reject(new DOMException('Journal storage is open in another version', 'InvalidStateError'));
      };
      request.onsuccess = () => {
        if (abandoned) request.result.close();
        else resolve(request.result);
      };
    });
    if (generation !== this.#generation) {
      db.close();
      throw changedSession();
    }
    this.#db = db;
    this.#session = { sessionId: crypto.randomUUID(), scope: { kind, id: uuid(id) } };
    db.onversionchange = () => this.close();
  }

  close() {
    this.#generation++;
    for (const transaction of this.#transactions) {
      try { transaction.abort(); } catch (error) {
        if (error.name !== 'InvalidStateError') throw error;
      }
    }
    this.#db?.close();
    this.#db = null;
    this.#session = null;
  }

  #transaction(stores, mode, schedule) {
    const db = this.#db;
    const generation = this.#generation;
    if (!db) return Promise.reject(new DOMException('No active journal', 'InvalidStateError'));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      this.#transactions.add(tx);
      let result;
      let failure;
      tx.oncomplete = () => {
        this.#transactions.delete(tx);
        if (generation !== this.#generation) reject(changedSession());
        else resolve(result);
      };
      tx.onabort = () => {
        this.#transactions.delete(tx);
        reject(failure ?? tx.error ?? changedSession());
      };
      const fail = error => { failure = error; tx.abort(); };
      try { schedule(tx, value => { result = value; }, fail); }
      catch (error) { fail(error); }
    });
  }

  async putObservation(input) {
    const record = observation(input);
    await this.#transaction(['observations', 'changes'], 'readwrite', tx => {
      tx.objectStore('observations').put(record);
      track(tx, 'observations', record.id, 'put');
    });
    return record;
  }

  async putJournalEntry(input) {
    const record = journalEntry(input);
    await this.#transaction(WRITE_STORES, 'readwrite', (tx, result, fail) => {
      const save = () => {
        tx.objectStore('journalEntries').put(record);
        track(tx, 'journalEntries', record.id, 'put');
      };
      if (record.observationId === null) save();
      else {
        const request = tx.objectStore('observations').get(record.observationId);
        request.onsuccess = () => {
          if (request.result) save();
          else fail(new DOMException('Linked observation does not exist in this journal', 'NotFoundError'));
        };
      }
    });
    return record;
  }

  async snapshot() {
    return this.#transaction(STORES, 'readonly', (tx, result) => {
      const snapshot = { schemaVersion: 1, observations: [], journalEntries: [] };
      for (const name of STORES) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => { snapshot[name] = request.result; };
      }
      result(snapshot);
    });
  }

  async exportJSON() {
    return JSON.stringify(await this.snapshot(), null, 2);
  }

  async pendingChanges() {
    return this.#transaction(WRITE_STORES, 'readonly', (tx, result) => {
      const batch = { ...this.#session, scope: { ...this.#session.scope }, changes: [] };
      const request = tx.objectStore('changes').openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const { key, ...change } = cursor.value;
        batch.changes.push(change);
        if (change.operation === 'put') {
          const record = tx.objectStore(change.store).get(change.id);
          record.onsuccess = () => { change.record = record.result; };
        }
        cursor.continue();
      };
      result(batch);
    });
  }

  async acknowledgeChanges({ sessionId, tokens }) {
    if (!this.#session || sessionId !== this.#session.sessionId) throw changedSession();
    if (!Array.isArray(tokens)) throw new TypeError('Invalid change tokens');
    const validated = [...new Set(tokens.map(uuid))];
    return this.#transaction(['changes', 'syncState', 'syncFlight'], 'readwrite', (tx, result, fail) => {
      for (const name of ['syncState', 'syncFlight']) {
        const count = tx.objectStore(name).count();
        count.onsuccess = () => {
          if (count.result) fail(new DOMException('Use server-verified sync acknowledgment', 'InvalidStateError'));
        };
      }
      let removed = 0;
      result(removed);
      for (const token of validated) {
        const request = tx.objectStore('changes').index('token').openCursor(token);
        request.onsuccess = () => {
          if (!request.result) return;
          request.result.delete();
          result(++removed);
        };
      }
    });
  }

  async nextSyncRequest() {
    if (this.#session?.scope.kind !== 'account') throw new DOMException('Account journal required', 'InvalidStateError');
    return this.#transaction(WRITE_STORES, 'readwrite', (tx, result) => {
      const deliver = flight => result(flight ? {
        sessionId: this.#session.sessionId, scope: { ...this.#session.scope }, ...flight,
      } : null);
      const flights = tx.objectStore('syncFlight');
      const active = flights.get('active');
      active.onsuccess = () => {
        if (active.result) { deliver(active.result); return; }
        const pending = tx.objectStore('changes').getAll();
        pending.onsuccess = () => {
          const change = pending.result.find(item => item.store === 'observations') ?? pending.result[0];
          if (!change) { deliver(null); return; }
          const known = tx.objectStore('syncState').get(change.key);
          known.onsuccess = () => {
            const flight = { ...change, key: 'active', state: 'ready', baseRevision: known.result?.revision ?? '0' };
            if (known.result?.remote || (known.result?.deleted && change.operation === 'put')) {
              const remote = known.result.remote ?? known.result;
              flight.state = 'conflict';
              flight.conflict = { revision: remote.revision, deleted: remote.deleted };
            }
            const freeze = () => { flights.put(flight); deliver(flight); };
            if (change.operation === 'delete') { flight.record = null; freeze(); }
            else {
              const record = tx.objectStore(change.store).get(change.id);
              record.onsuccess = () => { flight.record = serverRecord(change.store, record.result); freeze(); };
            }
          };
        };
      };
    });
  }

  async acceptSyncResult({ sessionId, token, response }) {
    if (!this.#session || sessionId !== this.#session.sessionId) throw changedSession();
    token = uuid(token);
    if (!response || !['accepted', 'conflict'].includes(response.status) || typeof response.deleted !== 'boolean') {
      throw new TypeError('Invalid sync response');
    }
    const receivedRevision = revision(response.revision);
    return this.#transaction(WRITE_STORES, 'readwrite', (tx, result, fail) => {
      result(false);
      const flights = tx.objectStore('syncFlight');
      const active = flights.get('active');
      active.onsuccess = () => {
        const flight = active.result;
        if (!flight || flight.token !== token) return;
        if (response.status === 'conflict') {
          flights.put({ ...flight, state: flight.state === 'reconcile' ? 'reconcile' : 'conflict',
            conflict: { revision: receivedRevision, deleted: response.deleted } });
          result(true);
          return;
        }
        if (response.token !== token || response.store !== flight.store || response.id !== flight.id ||
            response.deleted !== (flight.operation === 'delete') || BigInt(receivedRevision) <= BigInt(flight.baseRevision)) {
          fail(new TypeError('Sync receipt does not match request'));
          return;
        }
        const key = `${flight.store}:${flight.id}`;
        const states = tx.objectStore('syncState');
        const known = states.get(key);
        known.onsuccess = () => {
          const remote = known.result?.remote;
          states.put({ key, revision: receivedRevision, deleted: response.deleted });
          flights.delete('active');
          const current = tx.objectStore('changes').get(key);
          current.onsuccess = () => {
            if (current.result?.token === token) tx.objectStore('changes').delete(key);
            if (remote) mergeRemote(tx, remote, fail);
          };
        };
        result(true);
      };
    });
  }

  async acceptSyncRetirement({ sessionId, token, response }) {
    if (!this.#session || sessionId !== this.#session.sessionId) throw changedSession();
    if (this.#session.scope.kind !== 'account') throw new DOMException('Account journal required', 'InvalidStateError');
    token = uuid(token);
    if (!response || response.status !== 'retired' || response.token !== token ||
        typeof response.deleted !== 'boolean') throw new TypeError('Invalid retirement response');
    const receivedRevision = revision(response.revision);
    return this.#transaction(WRITE_STORES, 'readwrite', (tx, result, fail) => {
      result(false);
      const flights = tx.objectStore('syncFlight');
      const active = flights.get('active');
      active.onsuccess = () => {
        const flight = active.result;
        if (!flight || flight.token !== token) return;
        if (flight.state !== 'reconcile' || flight.operation !== 'put' || flight.record != null ||
            response.store !== flight.store || response.id !== flight.id ||
            BigInt(receivedRevision) < BigInt(flight.baseRevision)) {
          fail(new TypeError('Retirement does not match a purged request'));
          return;
        }
        const key = `${flight.store}:${flight.id}`;
        const pending = tx.objectStore('changes').get(key);
        pending.onsuccess = () => {
          if (pending.result?.operation !== 'delete') {
            fail(new DOMException('Deletion changed before retirement', 'InvalidStateError'));
            return;
          }
          const states = tx.objectStore('syncState');
          const known = states.get(key);
          known.onsuccess = () => {
            const remote = known.result?.remote;
            states.put({ key, revision: receivedRevision, deleted: response.deleted });
            flights.delete('active');
            if (remote) mergeRemote(tx, remote, fail);
            result(true);
          };
        };
      };
    });
  }

  async nextPullRequest() {
    if (this.#session?.scope.kind !== 'account') throw new DOMException('Account journal required', 'InvalidStateError');
    return this.#transaction(['syncState'], 'readonly', (tx, result) => {
      const request = tx.objectStore('syncState').get('pullCursor');
      request.onsuccess = () => result({ sessionId: this.#session.sessionId, scope: { ...this.#session.scope },
        after: request.result?.revision ?? '0', limit: 500 });
    });
  }

  async resolveSyncConflict({ sessionId, token, changeToken, remoteRevision, choice }) {
    if (!this.#session || sessionId !== this.#session.sessionId) throw changedSession();
    if (this.#session.scope.kind !== 'account') throw new DOMException('Account journal required', 'InvalidStateError');
    token = uuid(token);
    changeToken = uuid(changeToken);
    remoteRevision = revision(remoteRevision);
    if (!['local', 'remote'].includes(choice)) throw new TypeError('Invalid conflict choice');
    return this.#transaction(WRITE_STORES, 'readwrite', (tx, result, fail) => {
      const stale = () => fail(new DOMException('Conflict changed; review current versions', 'InvalidStateError'));
      const flights = tx.objectStore('syncFlight');
      const active = flights.get('active');
      active.onsuccess = () => {
        const flight = active.result;
        // Ready requests may already be in flight; reconcile requests have lost their payload.
        if (!flight || flight.token !== token || flight.state !== 'conflict') { stale(); return; }
        const key = `${flight.store}:${flight.id}`;
        const changes = tx.objectStore('changes');
        const pending = changes.get(key);
        pending.onsuccess = () => {
          const change = pending.result;
          if (!change || change.token !== changeToken) { stale(); return; }
          const states = tx.objectStore('syncState');
          const known = states.get(key);
          known.onsuccess = () => {
            const state = known.result;
            const remote = state?.remote ?? (state?.deleted ? { revision: state.revision, deleted: true } : null);
            if (!remote || remote.revision !== remoteRevision ||
                BigInt(remote.revision) < BigInt(flight.conflict.revision)) { stale(); return; }
            if (choice === 'local' && change.operation === 'put' && remote.deleted) {
              fail(new DOMException('Deleted identifiers cannot be restored; preserve a copy under a new identifier', 'InvalidStateError'));
              return;
            }
            if (choice === 'remote' && remote.contentOmitted) {
              fail(new DOMException('Deleted content is unavailable for restoration', 'InvalidStateError'));
              return;
            }
            const apply = () => {
              states.put({ key, revision: remote.revision, deleted: remote.deleted });
              flights.delete('active');
              if (choice === 'remote') {
                if (remote.deleted) tx.objectStore(flight.store).delete(flight.id);
                else tx.objectStore(flight.store).put(remote.record);
                changes.delete(key);
              } else if (remote.deleted) {
                // Both versions are deleted; no redundant outbound deletion is needed.
                changes.delete(key);
              } else {
                changes.put({ ...change, token: crypto.randomUUID() });
              }
              result({ choice, revision: remote.revision, queued: choice === 'local' && !remote.deleted });
            };
            if (choice === 'local' && change.operation === 'put' && flight.store === 'journalEntries') {
              const note = tx.objectStore('journalEntries').get(flight.id);
              note.onsuccess = () => {
                if (note.result.observationId === null) { apply(); return; }
                const linked = tx.objectStore('observations').get(note.result.observationId);
                linked.onsuccess = () => {
                  if (linked.result) apply();
                  else fail(new DOMException('Resolve the missing photo link before keeping this note', 'NotFoundError'));
                };
              };
            } else apply();
          };
        };
      };
    });
  }

  async applyPullPage({ sessionId, after, rows }) {
    if (!this.#session || sessionId !== this.#session.sessionId) throw changedSession();
    if (this.#session.scope.kind !== 'account') throw new DOMException('Account journal required', 'InvalidStateError');
    after = revision(after);
    if (!Array.isArray(rows) || rows.length > 500) throw new TypeError('Invalid remote page');
    const validated = rows.map(remoteRow);
    let cursor = after;
    const keys = new Set();
    for (const row of validated) {
      const key = `${row.store}:${row.id}`;
      if (BigInt(row.revision) <= BigInt(cursor) || keys.has(key)) throw new TypeError('Invalid remote ordering');
      cursor = row.revision;
      keys.add(key);
    }
    return this.#transaction(WRITE_STORES, 'readwrite', (tx, result, fail) => {
      const states = tx.objectStore('syncState');
      const request = states.get('pullCursor');
      request.onsuccess = () => {
        if ((request.result?.revision ?? '0') !== after) {
          fail(new DOMException('Pull cursor changed; fetch a new page', 'InvalidStateError'));
          return;
        }
        for (const row of validated) mergeRemote(tx, row, fail);
        states.put({ key: 'pullCursor', revision: cursor });
        result({ after: cursor, count: validated.length });
      };
    });
  }

  async pendingRemoteChanges() {
    return this.#transaction(['syncState'], 'readonly', (tx, result) => {
      const request = tx.objectStore('syncState').getAll();
      request.onsuccess = () => result(request.result.filter(state => state.remote).map(state => state.remote));
    });
  }

  async deleteObservation(id) {
    id = uuid(id);
    await this.#transaction(WRITE_STORES, 'readwrite', tx => {
      tx.objectStore('observations').delete(id);
      track(tx, 'observations', id, 'delete');
      const request = tx.objectStore('journalEntries').index('observationId').openCursor(id);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.update({ ...cursor.value, observationId: null });
        track(tx, 'journalEntries', cursor.value.id, 'put');
        cursor.continue();
      };
    });
  }

  async deleteJournalEntry(id) {
    id = uuid(id);
    await this.#transaction(['journalEntries', 'changes', 'syncFlight', 'syncState'], 'readwrite', tx => {
      tx.objectStore('journalEntries').delete(id);
      track(tx, 'journalEntries', id, 'delete');
    });
  }

  async deleteAll() {
    await this.#transaction(WRITE_STORES, 'readwrite', tx => {
      for (const name of STORES) {
        const request = tx.objectStore(name).openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          track(tx, name, cursor.value.id, 'delete');
          cursor.delete();
          cursor.continue();
        };
      }
    });
  }
}
