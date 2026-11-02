import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelContextRelay } from '../lib/model-context-relay.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const calls = [], events = [];
  let fire;
  const relay = createModelContextRelay({
    isReady: () => true,
    capabilities: () => ({ updateModelContext: { structuredContent: {} } }),
    schedule(callback) { fire = callback; return 1; }, cancel() {},
    request(method, params) {
      let resolve, reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      calls.push({ method, params, resolve, reject });
      return promise;
    }
  });
  return { relay, calls, events, fire: () => fire(),
    enqueue(snapshot) { relay.enqueue({ snapshot }, state => events.push({ snapshot, ...state })); } };
}

for (const action of ['reset', 'destroy']) test(`relay ${action} cancels a dispatch reserved before its request microtask`, async () => {
  const f = fixture();
  f.enqueue('old'); f.fire();
  // Invalidation can already be queued when the debounce callback runs.
  // No request has crossed the bridge yet.
  f.relay[action]();
  if (action === 'reset') { f.enqueue('new'); f.fire(); }
  await settle();
  assert.deepEqual(f.calls.map(call => call.params.structuredContent.snapshot), action === 'reset' ? ['new'] : []);
  if (action === 'reset') { f.calls[0].resolve({}); await settle(); }
  assert.equal(f.events.some(event => event.snapshot === 'old' && event.status === 'received'), false);
  f.relay.destroy();
});

for (const outcome of ['resolve', 'reject']) test(`relay preserves wire ordering when an already sent old request ${outcome}s after reset`, async () => {
  const f = fixture(); f.enqueue('old'); f.fire(); await settle();
  f.relay.reset(); f.enqueue('new'); f.fire(); await settle();
  assert.equal(f.calls.length, 1);
  f.calls[0][outcome]({}); await settle();
  assert.deepEqual(f.calls.map(call => call.params.structuredContent.snapshot), ['old', 'new']);
  f.calls[1].resolve({}); await settle();
  assert.equal(f.events.some(event => event.snapshot === 'old' && event.status === 'received'), false);
  assert.equal(f.events.at(-1).snapshot, 'new'); assert.equal(f.events.at(-1).status, 'received');
  f.relay.destroy();
});
