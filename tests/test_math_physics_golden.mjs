import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { componentTemplate } from './component-template.mjs';

const golden = JSON.parse(readFileSync(new URL('../renderer/examples/math-physics-golden.json', import.meta.url)));
const near = (a, e) => assert.ok(Math.abs(a - e) <= 1e-10 + 1e-10 * Math.abs(e), `${a} != independent ${e}`);
function mount(type, data, saved, width) {
  const dom = new JSDOM(componentTemplate(type), { runScripts: 'outside-only', url: 'https://golden.test/' });
  if (width) dom.window.Element.prototype.getBoundingClientRect = () => ({ width });
  const saves = [];
  dom.window.openai = { widgetState: saved, setWidgetState: value => { saves.push(JSON.parse(JSON.stringify(value))); } };
  dom.window.document.querySelector('#chatui-component-config').textContent = JSON.stringify({ schemaVersion: 1, contentId: `golden-${type}`, type, data });
  for (const script of dom.window.document.querySelectorAll('script:not([type])')) dom.window.eval(script.textContent);
  return { dom, root: dom.window.document.querySelector('#chatui-component'), saves };
}

test('G01 r=2: component and drawn equilateral maximum match independently fixed 3sqrt(3), not 6sqrt(3)', t => {
  const g = golden.geometry;
  const app = mount('geometry', { radius: g.radius, heightRatio: 1, unit: g.unit });
  t.after(() => app.dom.window.close());
  const slider = app.root.querySelector('input[type=range]');
  assert.equal(Number(slider.min), g.sliderDomain[0]); assert.equal(Number(slider.max), g.sliderDomain[1]);
  for (const c of g.cases) {
    slider.value = String(c.ratio);
    slider.dispatchEvent(new app.dom.window.Event('input', { bubbles: true }));
    slider.dispatchEvent(new app.dom.window.Event('change', { bubbles: true }));
    const actual = app.saves.at(-1).modelContent;
    near(actual.height, c.height); near(actual.halfBase * 2, c.base); near(actual.area, c.area);
    assert.equal(actual.unit, 'cm'); assert.match(app.root.textContent, /cm²/);
    if (c.ratio === 1.5) {
      const circle = app.root.querySelector('circle.cui-outline');
      const scale = Number(circle.getAttribute('r')) / g.radius;
      const points = app.root.querySelector('polygon').getAttribute('points').split(' ').map(p => p.split(',').map(Number));
      for (let i = 0; i < 3; i++) near(Math.hypot(points[i][0] - points[(i + 1) % 3][0], points[i][1] - points[(i + 1) % 3][1]) / scale, c.base);
    }
  }
});

test('G01 slider boundaries remain finite; invalid radii fail instead of manufacturing area', t => {
  for (const ratio of golden.geometry.sliderDomain) {
    const app = mount('geometry', { radius: 2, heightRatio: ratio, unit: 'cm' }); t.after(() => app.dom.window.close());
    assert.equal(app.root.querySelector('[role=alert]'), null); assert.doesNotMatch(app.root.textContent, /NaN|Infinity/);
  }
  for (const radius of [0, -2, null]) {
    const app = mount('geometry', { radius, heightRatio: 1.5 }); t.after(() => app.dom.window.close());
    assert.ok(app.root.querySelector('[role=alert]'));
  }
});

test('G01 full-height dimension follows A to D across allowed ratios and narrow/wide drawing widths', t => {
  for (const width of [280, 320, 390, 768]) {
    const app = mount('geometry', { radius: 2, heightRatio: 1.5, unit: 'cm' }, undefined, width);
    t.after(() => app.dom.window.close());
    const slider = app.root.querySelector('input[type=range]');
    for (const ratio of [.05, .5, 1, 1.5, 1.95]) {
      slider.value = String(ratio);
      slider.dispatchEvent(new app.dom.window.Event('input'));
      const [a, b, c] = app.root.querySelector('polygon').getAttribute('points').split(' ').map(point => point.split(',').map(Number));
      const dimension = app.root.querySelector('[data-geometry-segment=height]').getAttribute('d').match(/^M ([\d.]+) ([\d.]+) H ([\d.]+) V ([\d.]+) H ([\d.]+)$/);
      assert.ok(dimension, `finite dimension at width=${width}, h/r=${ratio}`);
      near(Number(dimension[2]), a[1]);
      near(Number(dimension[4]), (b[1] + c[1]) / 2);
      near(Number(dimension[4]) - Number(dimension[2]), ratio * Number(app.root.querySelector('circle.cui-outline').getAttribute('r')));
      assert.equal(app.root.querySelector('[data-geometry-measure=height]').textContent, 'h = AD');
      assert.equal(app.root.querySelectorAll('[data-geometry-measure=radius]').length, 1);
      assert.match(app.root.querySelector('svg desc').textContent, /完整高度h=AD.*半底边x=BD=DC，底边b=2x/);
      assert.doesNotMatch(app.root.innerHTML, /NaN|Infinity/);
    }
  }
});

test('G01 rounded live measurements use approximate equality while exact readings and stored golden values stay exact', t => {
  const app = mount('geometry', { radius: 2, heightRatio: 1.5, unit: 'cm' });
  t.after(() => app.dom.window.close());
  const slider = app.root.querySelector('input[type=range]');
  slider.dispatchEvent(new app.dom.window.Event('change'));
  assert.match(app.root.textContent, /高度 h = 3 cm/);
  assert.match(app.root.textContent, /半径 r = 2 cm/);
  assert.match(app.root.textContent, /半底边 x ≈ 1.73 cm/);
  assert.match(app.root.textContent, /底边 b=2x ≈ 3.46 cm/);
  assert.match(app.root.textContent, /面积 A ≈ 5.2 cm²/);
  assert.match(app.root.querySelector('svg desc').textContent, /面积约5.2平方cm/);
  near(app.saves.at(-1).modelContent.area, 3 * Math.sqrt(3));
  slider.value = '1';
  slider.dispatchEvent(new app.dom.window.Event('input'));
  assert.match(app.root.textContent, /半底边 x = 2 cm.*底边 b=2x = 4 cm.*面积 A = 4 cm²/);

  const rounded = mount('geometry', { radius: 1.234, heightRatio: .99, unit: 'cm' });
  t.after(() => rounded.dom.window.close());
  assert.match(rounded.root.textContent, /高度 h ≈ 1.22 cm/);
  assert.match(rounded.root.textContent, /半径 r ≈ 1.23 cm/);
  assert.match(rounded.root.querySelector('input').getAttribute('aria-valuetext'), /高度约1.22cm/);
});

test('G01 short-height offset uses the space between half-base labels when narrow label rows converge', t => {
  for (const width of [280, 320, 390]) {
    const app = mount('geometry', { radius: 2, heightRatio: .5, unit: 'cm' }, undefined, width);
    t.after(() => app.dom.window.close());
    const offset = app.root.querySelector('[data-geometry-measure=offset]');
    const halves = [...app.root.querySelectorAll('[data-geometry-measure=half-base]')].map(node => Number(node.getAttribute('x')));
    assert.equal(offset.textContent, 'r − h');
    assert.equal(offset.getAttribute('text-anchor'), 'middle');
    assert.equal(halves.length, 2);
    const offsetX = Number(offset.getAttribute('x'));
    assert.ok(offsetX > halves[0] + 24 && offsetX < halves[1] - 24, `offset must use the central gap at width=${width}`);
    assert.equal(offset.style.paintOrder, 'stroke');
    assert.match(app.root.textContent, /高度 h = 1 cm/);
  }
});

test('G01 rejects radii whose slider can underflow or lose normal-number relative precision', t => {
  // The original counterexample has h=1e-163 and halfBase≈6.245e-163,
  // but their stored product is zero. Positive subnormal products also lose
  // relative precision; checking only radius² or the initial ratio is insufficient.
  for (const radius of [2e-162, 1e-160, 1e-153, 1e154]) for (const heightRatio of [.05, 1, 1.5, 1.95, undefined]) {
    const app = mount('geometry', { radius, ...(heightRatio === undefined ? {} : { heightRatio }), unit: 'm' });
    t.after(() => app.dom.window.close());
    const input = app.root.querySelector('input');
    if (input) input.dispatchEvent(new app.dom.window.Event('change'));
    assert.ok(app.root.querySelector('[role=alert]'), `must reject radius=${radius}, initial ratio=${heightRatio}; actual saved output=${JSON.stringify(app.saves.at(-1)?.modelContent)}`);
    assert.equal(app.root.querySelector('svg, input'), null);
    assert.equal(app.saves.length, 0);
    assert.doesNotMatch(app.root.textContent, /NaN|Infinity/);
  }
});

test('G01 full slider remains positive, finite and relatively accurate at small and large accepted radii', t => {
  const minimumNormal = 2 ** -1022;
  for (const radius of [1.2e-153, 1e-100, 2, 9e153]) {
    const app = mount('geometry', { radius, heightRatio: 1, unit: 'm' }); t.after(() => app.dom.window.close());
    assert.equal(app.root.querySelector('[role=alert]'), null);
    const slider = app.root.querySelector('input');
    for (let step = 5; step <= 195; step++) {
      const ratio = step / 100;
      slider.value = String(ratio);
      slider.dispatchEvent(new app.dom.window.Event('input', { bubbles: true }));
      slider.dispatchEvent(new app.dom.window.Event('change', { bubbles: true }));
      const actual = app.saves.at(-1).modelContent;
      // Independent chord relation: x²=h(2r-h). Scale it before multiplication
      // to keep the oracle finite; no absolute tolerance can conceal tiny errors.
      const expectedHeight = radius * ratio;
      const expectedHalfBase = radius * Math.sqrt(ratio * (2 - ratio));
      const expectedArea = (radius * radius) * (ratio * Math.sqrt(ratio * (2 - ratio)));
      for (const [key, expected] of [['height', expectedHeight], ['halfBase', expectedHalfBase], ['area', expectedArea]]) {
        assert.ok(Number.isFinite(actual[key]) && actual[key] > 0, `${key}, radius=${radius}, ratio=${ratio}`);
        assert.ok(Math.abs(actual[key] / expected - 1) <= 1e-12, `${key} relative error, radius=${radius}, ratio=${ratio}`);
      }
      assert.ok(actual.area >= minimumNormal);
      assert.doesNotMatch(app.root.innerHTML, /NaN|Infinity/);
    }
  }
});

test('G01 independent normal-area threshold rejects below and accepts above its continuous-domain boundary', t => {
  // At q=1/20 the exact area is sqrt(39)/400 times r². The derivative
  // changes sign only at q=3/2; comparison with q=39/20 makes q=1/20
  // the global minimum on the whole continuous interval, not just sampled steps.
  const boundary = Math.sqrt((2 ** -1022) * 400 / Math.sqrt(39));
  for (const [radius, rejected] of [[boundary * (1 - 4 * Number.EPSILON), true], [boundary * (1 + 4 * Number.EPSILON), false]]) {
    const app = mount('geometry', { radius, heightRatio: 1.5, unit: 'm' }); t.after(() => app.dom.window.close());
    assert.equal(Boolean(app.root.querySelector('[role=alert]')), rejected);
  }
});

test('G01 safe tiny-radius initial and live restoration recompute area from the matching ratio', t => {
  const data = { radius: 1.2e-153, heightRatio: 1.5, unit: 'm' };
  const first = mount('geometry', data); t.after(() => first.dom.window.close());
  const slider = first.root.querySelector('input'); slider.value = '.05';
  slider.dispatchEvent(new first.dom.window.Event('input')); slider.dispatchEvent(new first.dom.window.Event('change'));
  const saved = structuredClone(first.saves.at(-1));
  saved.modelContent = { area: 0, radius: 0, height: 0, halfBase: 0 };
  const restored = mount('geometry', data, saved); t.after(() => restored.dom.window.close());
  assert.equal(Number(restored.root.querySelector('input').value), .05);
  restored.root.querySelector('input').dispatchEvent(new restored.dom.window.Event('change'));
  assert.ok(restored.saves.at(-1).modelContent.area >= 2 ** -1022);
  // Restored data can be off-grid; the domain guarantee covers every real ratio.
  saved.privateContent.chatui.value.heightRatio = .051234;
  restored.dom.window.dispatchEvent(new restored.dom.window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: saved } } }));
  assert.equal(Number(restored.root.querySelector('input').value), .051234);
  restored.root.querySelector('input').dispatchEvent(new restored.dom.window.Event('change'));
  const actualArea = restored.saves.at(-1).modelContent.area;
  const expectedArea = data.radius * data.radius * (.051234 * Math.sqrt(.051234 * (2 - .051234)));
  assert.ok(actualArea >= 2 ** -1022);
  assert.ok(Math.abs(actualArea / expectedArea - 1) <= 1e-12);
  assert.doesNotMatch(restored.root.innerHTML, /NaN|Infinity/);
});

test('G03 x0=0: real motion outputs and markers match independently fixed velocity-area values at t=0,1,2', t => {
  const g = golden.motion;
  const app = mount('motion-lab', { initialVelocity: g.initialVelocity, acceleration: g.acceleration, duration: g.duration, time: 0, unit: g.unit });
  t.after(() => app.dom.window.close());
  for (const c of g.cases) {
    const slider = app.root.querySelector('[data-motion-input=time]'); slider.value = String(c.time);
    slider.dispatchEvent(new app.dom.window.Event('change', { bubbles: true }));
    for (const key of ['position', 'velocity']) {
      near(Number(app.root.querySelector(`[data-motion-output=${key}]`).getAttribute('data-value')), c[key]);
      near(Number(app.root.querySelector(`[data-motion-point=${key}]`).getAttribute('data-value')), c[key]);
    }
    const state = app.saves.at(-1).modelContent; near(state.position, c.position); near(state.velocity, c.velocity); assert.equal(state.unit, 'SI');
  }
});

test('G02 independent calculus oracle: cone conservation and chain-rule check including x=0', () => {
  const c = golden.cone;
  near(c.flowM3ps / (Math.PI * c.waterRadiusM ** 2), c.rateMps);
  near(Math.PI * c.waterHeightM ** 2 / 4 * c.rateMps, c.flowM3ps);
  near(Math.PI * c.waterRadiusM ** 2 * c.waterHeightM / 3, c.volumeM3);
  near(c.rateMps / 2, c.radiusRateMps);
  near(2 * Math.cos(1), golden.integral.derivativeAtOne);
  for (const x of [-1, 0, 1]) {
    const epsilon = 1e-5;
    const derivative = (Math.sin((x + epsilon) ** 2) - Math.sin((x - epsilon) ** 2)) / (2 * epsilon);
    assert.ok(Math.abs(derivative - 2 * x * Math.cos(x * x)) < 1e-8);
  }
});
