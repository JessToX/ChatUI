import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import Ajv from 'ajv';
import { validateComponent } from '../lib/component-validation.mjs';
import { computeInclineForces } from '../lib/physics.mjs';
import { normalizeDocument } from '../lib/document-normalization.mjs';
import { handleMcp, TOOL, DOCUMENT_TOOL } from '../lib/mcp.mjs';

const golden = JSON.parse(readFileSync(new URL('../examples/math-physics-golden.json', import.meta.url)));
const near = (a, e) => assert.ok(Math.abs(a - e) <= 1e-10 + 1e-10 * Math.abs(e), `${a} != independent ${e}`);

test('G01 normal schema inputs cannot bypass full-slider numeric rejection in component/document MCP routes', async () => {
  const ajv = new Ajv({ strict: false });
  const componentSchema = ajv.compile(TOOL.inputSchema), documentSchema = ajv.compile(DOCUMENT_TOOL.inputSchema);
  const call = async (name, args) => (await (await handleMcp(new Request('https://golden.invalid/mcp', {
    method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'synthetic-golden', 'oai-authenticated-user-email': 'golden@example.invalid' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  }))).json()).result;
  const boundary = Math.sqrt((2 ** -1022) * 400 / Math.sqrt(39));
  for (const radius of [2e-162, 1e-160, 1e-153, 1e154, boundary * (1 - 4 * Number.EPSILON)]) {
    for (const heightRatio of [.05, 1, 1.5, 1.95, undefined]) {
      const config = { schemaVersion: 1, contentId: 'numeric-rejection', type: 'geometry', data: { radius, ...(heightRatio === undefined ? {} : { heightRatio }), unit: 'm' } };
      const document = { contentId: 'numeric-rejection', source: `:::geometry ${JSON.stringify(config.data)}\n:::` };
      const composition = { schemaVersion: 1, contentId: config.contentId, facts: {}, blocks: [{ id: 'geometry', kind: 'component', type: 'geometry', data: config.data }] };
      assert.equal(componentSchema(config), true); assert.equal(documentSchema(document), true);
      assert.throws(() => validateComponent(config), /半径/);
      assert.throws(() => normalizeDocument(document), /半径/);
      for (const [name, args] of [['render_component', config], ['render_response', composition], ['render_explanation', composition], ['render_document', document]]) {
        const result = await call(name, args);
        assert.equal(result.isError, true, `${name} radius=${radius}, ratio=${heightRatio}`);
        assert.equal(result.structuredContent, undefined);
      }
    }
  }
  for (const radius of [boundary * (1 + 4 * Number.EPSILON), 1.2e-153, 1e-100, 2, 9e153]) {
    const config = { schemaVersion: 1, contentId: 'numeric-accepted', type: 'geometry', data: { radius, heightRatio: .05, unit: 'm' } };
    assert.equal(validateComponent(config).data.radius, radius);
    const composition = { schemaVersion: 1, contentId: config.contentId, facts: {}, blocks: [{ id: 'geometry', kind: 'component', type: 'geometry', data: config.data }] };
    for (const [name, args] of [['render_component', config], ['render_response', composition], ['render_explanation', composition], ['render_document', { contentId: config.contentId, source: `:::geometry ${JSON.stringify(config.data)}\n:::` }]]) {
      assert.equal((await call(name, args)).isError, undefined, name);
    }
  }
});

test('G03 smooth incline: independent exact-value oracle, signs, units and only real forces', () => {
  const g = golden.incline;
  const { calculation: c, config, summary } = computeInclineForces({ massKg: g.massKg, gravityMps2: g.gravityMps2, inclineDeg: g.inclineDeg, contentId: 'golden-incline' });
  near(c.normalN, g.normalN); near(c.netForceN.magnitude, g.netN); near(c.accelerationMps2.magnitude, g.accelerationMps2);
  [config.data.forces[1].fx, config.data.forces[1].fy].forEach((v, i) => near(v, g.normalVectorN[i]));
  [c.netForceN.fx, c.netForceN.fy].forEach((v, i) => near(v, g.netVectorN[i]));
  [c.accelerationMps2.x, c.accelerationMps2.y].forEach((v, i) => near(v, g.accelerationVectorMps2[i]));
  assert.deepEqual(config.data.forces.map(f => f.id), ['gravity', 'normal']); assert.equal(config.data.unit, 'N');
  assert.match(summary, /g=10 m\/s²/); assert.match(summary, /全局 \+x 向右、\+y 向上/);
  const mirror = computeInclineForces({ massKg: 2, gravityMps2: 10, inclineDeg: -30, contentId: 'golden-mirror' }).calculation;
  near(mirror.netForceN.fx, -g.netVectorN[0]); near(mirror.netForceN.fy, g.netVectorN[1]);
  for (const angle of [0, -90, 90]) {
    const result = computeInclineForces({ massKg: 2, gravityMps2: 10, inclineDeg: angle, contentId: 'golden-limit' });
    assert.equal(result.calculation.normalN, angle === 0 ? 20 : 0);
    assert.equal(result.calculation.netForceN.magnitude, angle === 0 ? 0 : 20);
    assert.equal(result.config.data.forces.length, angle === 0 ? 2 : 1);
  }
  for (const invalid of [{ massKg: 0 }, { gravityMps2: 0 }, { gravityMps2: undefined }, { inclineDeg: 91 }, { friction: 1 }]) {
    assert.throws(() => computeInclineForces({ massKg: 2, gravityMps2: 10, inclineDeg: 30, contentId: 'golden-invalid', ...invalid }));
  }
});

test('G01-G03 audited formulas preserve exact values, assumptions and endpoints in document fallback', () => {
  // Authored independently of normalizeDocument: this renderer does not solve calculus.
  const source = String.raw`GOLDEN-BEGIN

## 圆内等腰三角形
r=2 cm；0<h<2r。A(h)=h√(2rh−h²)，最大值 h=3 cm，b=2√3 cm，A=3√3 cm²。
\[A_{max}=\frac{3\sqrt{3}}{4}r^2=3\sqrt{3}\]

## 圆锥注水
R=3 m，H=6 m，Q=2 m³/s，h=2 m，水面半径为1 m；0<h<H，h=0奇异，满水停止此模型。
\[V=\frac{\pi h^3}{12},\quad \frac{dh}{dt}=\frac{2}{\pi}\ \mathrm{m/s}\]

## 换元积分
x∈R，无量纲，u=x²，du=2x dx；包括x=0，不除以x。
\[\int 2x\cos(x^2)\,dx=\sin(x^2)+C\]
链式法则回验：d(sin(x²)+C)/dx=2x cos(x²)。

## 匀加速运动
x0=0 m，v0=20 m/s，a=-10 m/s²；0≤t≤2 s。t=1 s时x=15 m、v=10 m/s；t=2 s时x=20 m、v=0 m/s。

GOLDEN-END`;
  const result = normalizeDocument({ contentId: 'audited-golden-document', source });
  assert.equal(result.mathDiagnostics.length, 0);
  for (const expected of ['GOLDEN-BEGIN', 'GOLDEN-END', 'A=3√3 cm²', 'x0=0 m', 'x=15 m', 'v=10 m/s', 'h=0奇异', 'sin(x²)+C', '包括x=0']) assert.ok(result.text.includes(expected), expected);
  assert.doesNotMatch(result.text, /6√3/);
});
