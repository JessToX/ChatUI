import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInclineForces, INCLINE_INPUT_SCHEMA } from '../lib/physics.mjs';
import { handleMcp, INCLINE_TOOL, RESOURCE_URI } from '../lib/mcp.mjs';

const problem = { massKg: 2, gravityMps2: 10, inclineDeg: 30, contentId: 'incline-known-g10' };
const near = (actual, expected, tolerance = 1e-12) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
async function rpc(method, params = {}, signed = true) {
  const response = await handleMcp(new Request('https://renderer.test/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(signed ? { 'oai-authenticated-user-id': 'synthetic-test-user', 'oai-authenticated-user-email': 'test@example.invalid' } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 7, method, params })
  }));
  return { status: response.status, ...(await response.json()) };
}

test('30 and 45 degree inclines derive the correct normal, resultant and acceleration from m/g/angle', () => {
  const thirty = computeInclineForces(problem);
  assert.deepEqual(thirty.config.data.forces[0], { id: 'gravity', label: '重力', fx: 0, fy: -20, tone: 'orange' });
  const normal = thirty.config.data.forces[1];
  near(normal.fx, -5 * Math.sqrt(3)); near(normal.fy, 15);
  near(thirty.calculation.normalN, 10 * Math.sqrt(3));
  near(thirty.calculation.netForceN.fx, -5 * Math.sqrt(3)); near(thirty.calculation.netForceN.fy, -5);
  near(thirty.calculation.netForceN.magnitude, 10);
  near(thirty.calculation.accelerationMps2.x, -2.5 * Math.sqrt(3)); near(thirty.calculation.accelerationMps2.y, -2.5);
  near(thirty.calculation.accelerationMps2.magnitude, 5);
  assert.match(thirty.config.data.note, /m=2 kg，g=10 m\/s²，θ=30°/);
  assert.doesNotMatch(thirty.config.data.note, /合力|加速度/, 'Visible note does not duplicate full-precision computed results');
  assert.match(thirty.summary, /合力/); assert.match(thirty.summary, /加速度/);
  const fortyFive = computeInclineForces({ ...problem, inclineDeg: 45 });
  near(fortyFive.config.data.forces[1].fx, -10); near(fortyFive.config.data.forces[1].fy, 10);
  near(fortyFive.calculation.netForceN.magnitude, 10 * Math.sqrt(2));
  near(fortyFive.calculation.accelerationMps2.magnitude, 5 * Math.sqrt(2));
  for (const { config, calculation } of [thirty, fortyFive]) {
    assert.equal(config.data.forces.reduce((sum, force) => sum + force.fx, 0), calculation.netForceN.fx);
    assert.equal(config.data.forces.reduce((sum, force) => sum + force.fy, 0), calculation.netForceN.fy);
    assert.equal(config.data.calculation, calculation);
  }
});

test('signed inclines mirror horizontally; normal is perpendicular and net is tangent; m and g scale correctly', () => {
  for (const angle of [5, 30, 45, 89.9]) {
    const positive = computeInclineForces({ ...problem, inclineDeg: angle });
    const negative = computeInclineForces({ ...problem, inclineDeg: -angle });
    near(negative.calculation.netForceN.fx, -positive.calculation.netForceN.fx);
    near(negative.calculation.netForceN.fy, positive.calculation.netForceN.fy);
    for (const result of [positive, negative]) {
      const theta = result.calculation.inclineDeg * Math.PI / 180;
      const c = Math.cos(theta), s = Math.sin(theta), force = result.config.data.forces[1], net = result.calculation.netForceN;
      near(force.fx * c + force.fy * s, 0);
      near(-net.fx * s + net.fy * c, 0);
      near(result.calculation.accelerationMps2.magnitude, 10 * Math.abs(s));
    }
  }
  const base = computeInclineForces(problem).calculation;
  const moreMass = computeInclineForces({ ...problem, massKg: 6 }).calculation;
  const moreGravity = computeInclineForces({ ...problem, gravityMps2: 20 }).calculation;
  near(moreMass.normalN, base.normalN * 3); near(moreMass.netForceN.magnitude, base.netForceN.magnitude * 3);
  near(moreMass.accelerationMps2.magnitude, base.accelerationMps2.magnitude);
  near(moreGravity.normalN, base.normalN * 2); near(moreGravity.netForceN.magnitude, base.netForceN.magnitude * 2);
  near(moreGravity.accelerationMps2.magnitude, base.accelerationMps2.magnitude * 2);
});

test('horizontal and both vertical limits are exact, without negative zero or phantom support forces', () => {
  for (const angle of [0, -0]) {
    const { config, calculation } = computeInclineForces({ ...problem, inclineDeg: angle });
    assert.deepEqual(calculation.netForceN, { fx: 0, fy: 0, magnitude: 0 });
    assert.deepEqual(calculation.accelerationMps2, { x: 0, y: 0, magnitude: 0 });
    assert.deepEqual(config.data.forces.map(({ fx, fy }) => [fx, fy]), [[0, -20], [0, 20]]);
    assert.equal(calculation.inclineDeg, 0); assert.equal(calculation.verticalZeroContactLimit, false);
  }
  for (const angle of [-90, 90]) {
    const { config, calculation, summary } = computeInclineForces({ ...problem, inclineDeg: angle });
    assert.equal(config.data.forces.length, 1); assert.equal(config.data.forces[0].id, 'gravity');
    assert.equal(calculation.normalN, 0); assert.equal(calculation.verticalZeroContactLimit, true);
    assert.deepEqual(calculation.netForceN, { fx: 0, fy: -20, magnitude: 20 });
    assert.deepEqual(calculation.accelerationMps2, { x: 0, y: -10, magnitude: 10 });
    assert.match(summary, /垂直极限：N=0/);
  }
});

test('missing, unknown, coerced and out-of-range physical quantities fail instead of adopting defaults', () => {
  for (const key of ['massKg', 'gravityMps2', 'inclineDeg', 'contentId']) {
    const missing = { ...problem }; delete missing[key];
    assert.throws(() => computeInclineForces(missing), Error, `missing ${key}`);
  }
  for (const key of ['massKg', 'gravityMps2', 'inclineDeg']) {
    for (const bad of [null, undefined, 'unknown', '10', true, [], {}, NaN, Infinity, -Infinity]) {
      assert.throws(() => computeInclineForces({ ...problem, [key]: bad }), Error, `${key}: ${String(bad)}`);
    }
  }
  for (const bad of [0, -1]) for (const key of ['massKg', 'gravityMps2']) assert.throws(() => computeInclineForces({ ...problem, [key]: bad }));
  for (const bad of [-90.00001, 90.00001, 180, -180]) assert.throws(() => computeInclineForces({ ...problem, inclineDeg: bad }));
});

test('unsupported model fields and invalid labels fail while safe untrusted text stays plain data', () => {
  for (const key of ['friction', 'mu', 'forces', 'fx', 'fy', 'g', 'velocity', '__proto__']) {
    assert.throws(() => computeInclineForces({ ...problem, [key]: 1 }), /只接受/);
  }
  for (const [key, max] of [['contentId', 200], ['title', 200], ['body', 120]]) {
    for (const value of [null, 1, [], {}, '', '   ', 'x'.repeat(max + 1)]) assert.throws(() => computeInclineForces({ ...problem, [key]: value }));
    const { config } = computeInclineForces({ ...problem, [key]: 'x'.repeat(max) });
    assert.equal(key === 'body' ? config.data.body : config[key], 'x'.repeat(max));
  }
  const title = '<script>throw new Error("untrusted")</script>';
  assert.equal(computeInclineForces({ ...problem, title }).config.title, title);
});

test('unrepresentable derived numbers are rejected and the advertised maximum weight is accepted', () => {
  for (const fields of [
    { massKg: 1e308, gravityMps2: 1e308 },
    { massKg: 1e12, gravityMps2: 1.001 },
    { massKg: Number.MIN_VALUE, gravityMps2: Number.MIN_VALUE },
    { inclineDeg: Number.MIN_VALUE },
    { massKg: 1, gravityMps2: Number.MIN_VALUE, inclineDeg: 89.9 }
  ]) assert.throws(() => computeInclineForces({ ...problem, ...fields }));
  assert.equal(computeInclineForces({ ...problem, massKg: 1e11 }).config.data.forces[0].fy, -1e12);
});

test('incline tool discovery has an explicit four-field contract and shares the existing inline resource', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18' }, false);
  assert.equal(init.result.serverInfo.name, 'chatui-renderer');
  const discovery = await rpc('tools/list', {}, false);
  assert.equal(discovery.result.tools.length, 6);
  const tool = discovery.result.tools.find(tool => tool.name === 'render_incline_forces');
  assert.deepEqual(tool.inputSchema, INCLINE_INPUT_SCHEMA);
  assert.deepEqual(tool.inputSchema.required, ['massKg', 'gravityMps2', 'inclineDeg', 'contentId']);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.equal(tool._meta.ui.resourceUri, RESOURCE_URI);
  assert.equal(tool._meta['openai/outputTemplate'], RESOURCE_URI);
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal((await rpc('tools/call', { name: INCLINE_TOOL.name, arguments: problem }, false)).status, 401);
});

test('authenticated incline calls return consistent grounded data; bad requests expose no partial diagram', async () => {
  const result = (await rpc('tools/call', { name: INCLINE_TOOL.name, arguments: problem })).result;
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.type, 'force-diagram');
  assert.equal(result.structuredContent.data.calculation.gravityMps2, 10);
  near(result.structuredContent.data.calculation.accelerationMps2.magnitude, 5);
  assert.match(result.content[0].text, /g=10 m\/s²/); assert.match(result.content[0].text, /实际显示由客户端完成/);
  const changed = (await rpc('tools/call', { name: INCLINE_TOOL.name, arguments: { ...problem, gravityMps2: 9.81 } })).result;
  near(changed.structuredContent.data.calculation.accelerationMps2.magnitude, 4.905);
  assert.equal(changed.structuredContent.data.forces[0].fy, -19.62);
  for (const args of [undefined, null, {}, { ...problem, gravityMps2: 'unknown' }, { ...problem, friction: .2 }]) {
    const bad = (await rpc('tools/call', { name: INCLINE_TOOL.name, arguments: args })).result;
    assert.equal(bad.isError, true); assert.equal(bad.structuredContent, undefined);
  }
});
