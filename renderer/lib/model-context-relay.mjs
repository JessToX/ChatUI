// One bounded replacement queue per mounted View. No message/tool/model calls.
export function createModelContextRelay({ request, isReady, capabilities, validate = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const supported = value => object(value) && Object.keys(value).length === 0;
  let generation = 0, serial = 0, timer, queued, flight, blocked = '', sent = 0, closed = false;
  const emit = (entry, status) => { if (!closed && entry.generation === generation) entry.notify?.({ status, revision: entry.serial }); };
  function flush() {
    cancel(timer); timer = undefined;
    if (closed || blocked || flight || !queued || !isReady()) return;
    const entry = queued, cap = capabilities()?.updateModelContext;
    let params;
    if (supported(cap?.structuredContent)) params = { structuredContent: entry.payload };
    else if (supported(cap?.text)) params = { content: [{ type: 'text', text: JSON.stringify(entry.payload) }] };
    else { queued = undefined; blocked = 'unsupported'; emit(entry, blocked); return; }
    if (sent >= 64) { queued = undefined; blocked = 'limit'; emit(entry, blocked); return; }
    queued = undefined; flight = entry; sent++; emit(entry, 'sending');
    Promise.resolve().then(() => {
      // The debounce reserved a slot, but invalidation may precede this
      // microtask. Only already-sent requests must retain wire ordering.
      if (closed || entry.generation !== generation) return;
      return request('ui/update-model-context', params);
    }).then(() => {
      emit(entry, 'received'); // Receipt only; never claim next-turn adoption.
    }, () => {
      if (entry.generation === generation) {
        blocked = 'unconfirmed'; emit(entry, blocked);
        if (queued) { emit(queued, blocked); queued = undefined; }
      }
    }).finally(() => { if (flight === entry) flight = undefined; flush(); });
  }
  return {
    enqueue(payload, notify) {
      const entry = { generation, serial: ++serial, notify };
      try {
        validate(payload); const text = JSON.stringify(payload);
        if (!object(payload) || text.length > 16000) throw new Error('Context budget');
        entry.payload = JSON.parse(text); // Bind a request to immutable bytes.
      } catch { emit(entry, 'invalid'); return; }
      if (closed) return;
      if (blocked) { emit(entry, blocked); return; }
      queued = entry; emit(entry, isReady() ? 'pending' : 'unconfirmed'); cancel(timer); timer = schedule(flush, 200);
    },
    refresh: flush,
    unavailable() { if (queued) { emit(queued, 'unconfirmed'); queued = undefined; cancel(timer); } },
    reset() {
      if (queued) emit(queued, 'unconfirmed');
      if (flight) emit(flight, 'unconfirmed');
      generation++; queued = undefined; blocked = ''; sent = 0; cancel(timer);
      // Preserve wire ordering: a previous in-flight request settles before a
      // replacement snapshot can be sent. Its callbacks are generation-scoped.
    },
    destroy() { closed = true; generation++; queued = undefined; cancel(timer); }
  };
}
