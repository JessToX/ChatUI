import { componentTemplate } from './component-template.mjs';
/** Tests real component controls and numerical SVG outputs; no browser layout or Chat routing claims. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { JSDOM, VirtualConsole } from 'jsdom';

const composePath = fileURLToPath(new URL('../plugins/chatui/skills/chatui/scripts/compose.py', import.meta.url));
const clone = value => JSON.parse(JSON.stringify(value));
const config = (data = {}) => ({ schemaVersion: 1, contentId: 'motion-independent-v1', type: 'motion-lab', title: '观察运动', data: { initialVelocity: 20, acceleration: -10, duration: 6, time: 3, ...data } });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} differs from ${expected}`);

function mount(input = config(), { saved, width = 320 } = {}) {
  const errors = [], saves = [];
  const console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(componentTemplate(input.type), { runScripts: 'outside-only', url: 'https://motion-lab.test/', virtualConsole: console });
  const { window } = dom;
  window.Element.prototype.getBoundingClientRect = () => ({ width, height: 0, x: 0, y: 0, top: 0, left: 0, right: width, bottom: 0 });
  window.openai = { widgetState: saved ? clone(saved) : undefined, setWidgetState(value) { saves.push(clone(value)); return Promise.resolve(); } };
  window.document.querySelector('#chatui-component-config').textContent = JSON.stringify(input);
  for (const script of window.document.querySelectorAll('script:not([type])')) window.eval(script.textContent);
  const root = window.document.querySelector('#chatui-component');
  return {
    window, root, errors, saves, close: () => window.close(),
    output(key) { return Number(root.querySelector(`[data-motion-output="${key}"]`).getAttribute('data-value')); },
    slider(key, value) {
      const slider = root.querySelector(`[data-motion-input="${key}"]`);
      assert.ok(slider); slider.value = String(value);
      slider.dispatchEvent(new window.Event('input', { bubbles: true }));
      slider.dispatchEvent(new window.Event('change', { bubbles: true }));
    },
    restore(value) { window.dispatchEvent(new window.CustomEvent('openai:set_globals', { detail: { globals: { widgetState: clone(value) } } })); }
  };
}

test('motion lab computes position and velocity using the given constant acceleration, with separate correct axes', t => {
  const app = mount(); t.after(app.close);
  assert.equal(app.root.querySelector('[role="alert"]'), null);
  assert.deepEqual(app.errors, []);
  near(app.output('position'), 15); near(app.output('velocity'), -10);
  for (const [kind, value, axis] of [['position', 15, 'x (m)'], ['velocity', -10, 'v (m/s)']]) {
    const graph = app.root.querySelector(`[data-motion-plot="${kind}"]`);
    assert.equal(graph.getAttribute('role'), 'img');
    assert.equal(graph.querySelector('[data-motion-axis="value"]').textContent, axis);
    assert.match(graph.querySelector('[data-motion-axis="time"]').textContent, /t \(s\)/);
    const point = graph.querySelector('[data-motion-point]');
    near(Number(point.getAttribute('data-time')), 3); near(Number(point.getAttribute('data-value')), value);
  }
  assert.match(app.root.textContent, /不一定是重力加速度/);
  assert.match(app.root.textContent, /忽略空气阻力/);
  assert.equal(app.root.querySelector('form'), null);
});

test('moving the time slider changes markers and values while preserving the physical trajectory', t => {
  const app = mount(config({ initialVelocity: 10, acceleration: 2, duration: 5, time: 1 })); t.after(app.close);
  const curves = [...app.root.querySelectorAll('[data-motion-curve]')].map(node => node.getAttribute('d'));
  const beforeX = Number(app.root.querySelector('[data-motion-point="position"]').getAttribute('cx'));
  near(app.output('position'), 11); near(app.output('velocity'), 12);
  app.slider('time', 2);
  near(app.output('position'), 24); near(app.output('velocity'), 14);
  assert.deepEqual([...app.root.querySelectorAll('[data-motion-curve]')].map(node => node.getAttribute('d')), curves);
  assert.ok(Number(app.root.querySelector('[data-motion-point="position"]').getAttribute('cx')) > beforeX);
  assert.equal(app.saves.at(-1).modelContent.time, 2);
  assert.equal(app.saves.at(-1).modelContent.position, 24);
});

test('changing acceleration and initial velocity redraws both curves and keeps all computed state synchronized', t => {
  const app = mount(config({ initialVelocity: 10, acceleration: 2, duration: 5, time: 2 })); t.after(app.close);
  const before = [...app.root.querySelectorAll('[data-motion-curve]')].map(node => node.getAttribute('d'));
  app.slider('acceleration', -4);
  near(app.output('position'), 12); near(app.output('velocity'), 2);
  assert.notDeepEqual([...app.root.querySelectorAll('[data-motion-curve]')].map(node => node.getAttribute('d')), before);
  app.slider('initialVelocity', -10);
  near(app.output('position'), -28); near(app.output('velocity'), -18);
  assert.equal(app.saves.at(-1).modelContent.initialVelocity, -10);
  assert.equal(app.saves.at(-1).modelContent.acceleration, -4);
  assert.equal(app.saves.at(-1).modelContent.velocity, -18);
  assert.equal(app.saves.at(-1).modelContent.unit, 'SI');
});

test('negative motion, stationary motion, and time endpoints remain finite and retain their signs', t => {
  for (const [v0, a, time, x, v] of [[-5, -2, 3, -24, -11], [0, 0, 6, 0, 0], [20, -10, 0, 0, 20], [20, -10, 6, -60, -40]]) {
    const app = mount(config({ initialVelocity: v0, acceleration: a, time })); t.after(app.close);
    near(app.output('position'), x); near(app.output('velocity'), v);
    for (const point of app.root.querySelectorAll('[data-motion-point]')) {
      assert.ok(Number.isFinite(Number(point.getAttribute('cx')))); assert.ok(Number.isFinite(Number(point.getAttribute('cy'))));
    }
    assert.doesNotMatch(app.root.innerHTML, /NaN|Infinity/);
  }
});

test('both endpoint markers remain inside a 320-pixel graphic with room for their radius', t => {
  const app = mount(config({ initialVelocity: -100, acceleration: 50, duration: 60, time: 0 }), { width: 320 }); t.after(app.close);
  const original = [...app.root.querySelectorAll('[data-motion-curve]')].map(node => node.getAttribute('d'));
  for (const time of [0, 60]) {
    app.slider('time', time);
    for (const graph of app.root.querySelectorAll('[data-motion-plot]')) {
      const [, , width, height] = graph.getAttribute('viewBox').split(' ').map(Number);
      const point = graph.querySelector('[data-motion-point]');
      const cx = Number(point.getAttribute('cx')), cy = Number(point.getAttribute('cy')), r = Number(point.getAttribute('r'));
      assert.ok(cx - r >= 0 && cx + r <= width);
      assert.ok(cy - r >= 0 && cy + r <= height);
      assert.equal(Number(point.getAttribute('data-time')), time);
    }
    assert.deepEqual([...app.root.querySelectorAll('[data-motion-curve]')].map(node => node.getAttribute('d')), original);
  }
});

test('the analytic position curve and time marker coincide at the true turning point', t => {
  const app = mount(config({ initialVelocity: 7, acceleration: -3, duration: 6, time: 7 / 3 })); t.after(app.close);
  const graph = app.root.querySelector('[data-motion-plot="position"]');
  const path = graph.querySelector('[data-motion-curve]').getAttribute('d');
  assert.match(path, /^M .* Q /);
  const coordinates = path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi).map(Number);
  assert.equal(coordinates.length, 6);
  const u = (7 / 3) / 6;
  const bezier = axis => (1 - u) ** 2 * coordinates[axis] + 2 * u * (1 - u) * coordinates[axis + 2] + u ** 2 * coordinates[axis + 4];
  const point = graph.querySelector('[data-motion-point]');
  near(Number(point.getAttribute('cx')), bezier(0)); near(Number(point.getAttribute('cy')), bezier(1));
  near(app.output('position'), 49 / 6); near(app.output('velocity'), 0);
});

test('reset restores the configured starting parameters and time rather than generic defaults', t => {
  const app = mount(config({ initialVelocity: -8, acceleration: 3, duration: 4, time: .5 })); t.after(app.close);
  app.slider('initialVelocity', 12); app.slider('acceleration', -5); app.slider('time', 3);
  const reset = [...app.root.querySelectorAll('button')].find(button => button.textContent === '恢复初始参数');
  assert.ok(reset); assert.equal(reset.type, 'button'); reset.focus(); assert.equal(app.window.document.activeElement, reset);
  reset.click();
  near(app.output('position'), -3.625); near(app.output('velocity'), -6.5);
  assert.equal(app.root.querySelector('[data-motion-input="time"]').value, '0.5');
  assert.equal(app.saves.at(-1).modelContent.initialVelocity, -8);
  assert.equal(app.saves.at(-1).modelContent.acceleration, 3);
  assert.equal(app.saves.at(-1).modelContent.time, .5);
});

test('saved lab state restores only within the same experiment and discards invalid cached fields', t => {
  const input = config(); const first = mount(input); t.after(first.close);
  first.slider('initialVelocity', 12); first.slider('time', 1);
  const saved = first.saves.at(-1);
  const restored = mount(input, { saved }); t.after(restored.close);
  near(restored.output('position'), 7); near(restored.output('velocity'), 2);
  const another = mount(config({ duration: 4 }), { saved }); t.after(another.close);
  near(another.output('position'), 15); near(another.output('velocity'), -10);
  const altered = clone(saved);
  altered.privateContent.chatui.value = { initialVelocity: 999, acceleration: '2', time: -1, position: 12345 };
  restored.restore(altered);
  near(restored.output('position'), 15); near(restored.output('velocity'), -10);
});

test('invalid limits and incompatible units fail clearly without drawing a misleading experiment', t => {
  for (const data of [
    { initialVelocity: 101 }, { initialVelocity: -101 }, { initialVelocity: '20' }, { initialVelocity: null },
    { acceleration: 51 }, { acceleration: -51 }, { acceleration: Infinity }, { acceleration: NaN },
    { duration: 0 }, { duration: .01 }, { duration: 61 }, { time: -1 }, { time: 7 }, { unit: 'km/h' }
  ]) {
    const app = mount(config(data)); t.after(app.close);
    assert.ok(app.root.querySelector('[role="alert"]'), JSON.stringify(data));
    assert.equal(app.root.querySelector('svg, input'), null);
    assert.doesNotMatch(app.root.textContent, /NaN|Infinity/);
  }
});

test('the shipped compose helper produces a self-contained motion lab with inert titles and independent controls', t => {
  const make = (id, title) => execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-c', 'import json,runpy,sys; module=runpy.run_path(sys.argv[1]); print(module["compose"](json.load(sys.stdin),sys.argv[2]))', composePath, id], { input: JSON.stringify({ ...config(), title }), encoding: 'utf8' });
  const payload = '</script><script>window.injected=true</script>';
  const dom = new JSDOM(make('chatui-motion-first', payload) + make('chatui-motion-second', '第二个实验'), { runScripts: 'dangerously', url: 'https://motion-lab.test/', virtualConsole: new VirtualConsole() });
  t.after(() => dom.window.close());
  assert.equal(dom.window.injected, undefined);
  const first = dom.window.document.querySelector('#chatui-motion-first');
  const second = dom.window.document.querySelector('#chatui-motion-second');
  const ids = [...dom.window.document.querySelectorAll('input')].map(input => input.id);
  assert.equal(ids.length, 6); assert.equal(new Set(ids).size, 6);
  assert.ok(first.textContent.includes(payload));
  const input = first.querySelector('[data-motion-input="time"]'); input.value = 2;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(Number(first.querySelector('[data-motion-output="velocity"]').getAttribute('data-value')), 0);
  assert.equal(Number(second.querySelector('[data-motion-output="velocity"]').getAttribute('data-value')), -10);
});
