import { exampleFactories } from '/preview-examples.mjs';

// Developer-only MCP Apps host. No production normalization endpoint or model call.
let frame = document.getElementById('explanation');
const nativeAnswer = document.getElementById('native-answer');
const status = document.getElementById('host-status');
const form = document.getElementById('conditions');
const log = document.getElementById('interaction-log');
const params = new URLSearchParams(location.search);
const responseMode = params.get('legacy') !== '1';
const referenceIndex = await fetch('/examples/response-index.json').then(response => response.json());
const phase2a = params.get('phase') === '2a';
const choices = responseMode ? referenceIndex.filter(item => !phase2a || ['document-g01', 'document-g04', 'document-g05', 'native-g06'].includes(item.id)) : Object.keys(exampleFactories).map(id => ({ id, title: { learning: '学习讲解', writing: '写作分析', progress: '项目进展', causal: '因果图解' }[id] }));
let selected = choices.some(item => item.id === params.get('example')) ? params.get('example') : choices[0].id;
let theme = params.get('theme') === 'light' ? 'light' : 'dark';
let initialized = false, options = {}, snapshot, operations = 0, selectionSerial = 0;
const storage = {
  read(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; } },
  write(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Ephemeral interaction still works. */ } },
  remove(key) { try { sessionStorage.removeItem(key); return true; } catch { return false; } }
};
const stateKey = () => `chatui-preview-v5/${responseMode ? 'response' : 'legacy'}/${selected}/state`;
const optionKey = () => `${stateKey()}/options`;
function report(message, error = false) { status.textContent = message; status.dataset.error = String(error); }
function post(message) { frame.contentWindow.postMessage({ jsonrpc: '2.0', ...message }, location.origin); }
function syncUrl() {
  const url = new URL(location.href); url.searchParams.set('example', selected); url.searchParams.set('theme', theme); history.replaceState(null, '', url);
}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.getElementById('theme').textContent = theme === 'dark' ? '切换浅色' : '切换深色';
  if (initialized && frame) post({ method: 'ui/notifications/host-context-changed', params: { theme } });
  syncUrl();
}
function sendSnapshot() {
  if (!initialized || !snapshot || !frame) return;
  post({ method: 'ui/notifications/tool-result', params: snapshot });
  report('完整快照已交给真实 Renderer · 本地操作与状态恢复可验收 · 未发送到真实聊天');
}
function input(name, label, value, min, max, step = 1) {
  const wrapper = document.createElement('label'); wrapper.textContent = label;
  const field = document.createElement('input'); Object.assign(field, { type: 'number', name, value: String(value), min: String(min), max: String(max), step: String(step), required: true });
  wrapper.append(field); form.append(wrapper);
}
function note(text) { const p = document.createElement('p'); p.className = 'condition-note'; p.textContent = text; form.append(p); }
function action(label, fn) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', fn); form.append(button); return button; }
function conditions() {
  form.replaceChildren();
  if (responseMode) {
    if (['progress', 'chart'].includes(selected)) {
      action(options.changed ? '恢复原始题设（新快照）' : '修改题设（新快照）', () => update({ changed: !options.changed }));
      note(selected === 'progress' ? '预构建的 6/10 ↔ 8/12 快照：正文、比例与控件同步；旧快照没有被改写。' : '预构建的 g=10 ↔ 9.81 快照：真实计算的点、公式、单位一致更新。');
    }
  } else if (selected === 'learning') {
    input('initialVelocity', '初速度（m/s）', options.initialVelocity ?? 20, 2, 50, .01); input('gravity', '明确采用 g（m/s²）', options.gravity ?? 10, 2, 20, .01);
    note('改变题设产生新快照；图中自主实验不改写讲解。');
  } else if (selected === 'progress') {
    input('total', '总量（章）', options.total ?? 10, 1, 1000); input('drafted', '已成稿（章）', options.drafted ?? 6, 0, 1000); input('reviewed', '已核对（章）', options.reviewed ?? 3, 0, 1000);
    note('必须满足 0 ≤ 已核对 ≤ 已成稿 ≤ 总量。不补造未知章节。');
  } else if (selected === 'writing') {
    for (const [focus, label] of [['arrival', '聚焦装甲车出现'], ['waiting', '聚焦等待中的犹疑']]) action(label, () => update({ focus })).setAttribute('aria-pressed', String((options.focus ?? 'arrival') === focus));
    note('定性节奏不是字数或时长。');
  }
  if (!responseMode && ['learning', 'progress'].includes(selected)) {
    const submit = document.createElement('button'); submit.type = 'submit'; submit.textContent = '更新完整快照'; form.prepend(submit);
  }
  form.hidden = !form.children.length;
}
async function update(next) {
  const serial = ++selectionSerial;
  try {
    const result = responseMode
      ? await fetch(`/examples/${/^(html|document|benchmark|native)-/.test(selected) ? selected : `response-${selected}`}${next.changed && ['progress', 'chart'].includes(selected) ? '-changed' : ''}.json`).then(response => { if (!response.ok) throw new Error('示例加载失败。'); return response.json(); })
      : { structuredContent: exampleFactories[selected](next), content: [{ type: 'text', text: '本地旧接口完整示例快照；实际显示由 iframe 完成。' }] };
    if (serial !== selectionSerial) return;
    options = next; storage.write(optionKey(), options); conditions();
    if (selected === 'native-g06') {
      if (typeof result.text !== 'string' || result.id !== selected) throw new Error('原生对照内容无效。');
      document.getElementById('native-text').textContent = result.text;
      nativeAnswer.hidden = false; report('G06 原生 Markdown 对照 · 无 Renderer 调用');
    } else { snapshot = result; sendSnapshot(); }
  } catch (error) { if (serial === selectionSerial) report(error.message, true); }
}
async function select(id) {
  selected = id; snapshot = null; initialized = false;
  // Each selection owns a new frame identity; late messages from removed frames
  // cannot initialize or save state into the next example.
  frame?.remove(); frame = null; nativeAnswer.hidden = true;
  if (selected !== 'native-g06') {
    frame = document.createElement('iframe'); frame.id = 'explanation';
    frame.title = 'ChatUI 统一回答：可操作预览'; nativeAnswer.before(frame);
  }
  document.getElementById('reload').disabled = !frame;
  document.getElementById('reset').disabled = !frame;
  operations = 0; log.textContent = '尚无本次操作。刷新仅恢复匹配快照中的真实操作。';
  document.querySelectorAll('[data-example]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.example === id)));
  syncUrl(); const selectedFrame = frame; await update(storage.read(optionKey()) || {});
  if (frame && frame === selectedFrame) frame.src = selected.startsWith('document-') ? '/chatui-document.html' : responseMode ? '/chatui-response.html' : '/chatui-explanation.html';
}
function attachHost() {
  if (params.get('state') === 'off') return;
  const owner = frame, key = stateKey();
  frame.contentWindow.openai = {
    get widgetState() { return owner === frame ? storage.read(key) : null; },
    setWidgetState(payload) { if (owner !== frame) return; storage.write(key, payload); operations++; log.textContent = JSON.stringify({ genuineOperations: operations, ...payload }, null, 2); }
  };
}
window.addEventListener('message', event => {
  if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
  const message = event.data; if (!message || message.jsonrpc !== '2.0') return;
  const reply = result => post({ id: message.id, result });
  switch (message.method) {
    case 'ui/initialize':
      attachHost(); reply({ protocolVersion: '2026-01-26', hostInfo: { name: 'ChatUI local preview', version: '0.9.0' }, hostCapabilities: { updateModelContext: {}, ...(params.get('followup') === 'off' ? {} : { message: {} }), openLinks: {} }, hostContext: { theme } }); break;
    case 'ui/notifications/initialized': initialized = true; sendSnapshot(); break;
    case 'ui/notifications/size-changed': if (Number.isFinite(message.params?.height) && message.params.height > 0) frame.style.height = `${Math.min(50000, Math.ceil(message.params.height))}px`; break;
    case 'ui/update-model-context': reply({}); break;
    case 'ui/message': log.textContent = JSON.stringify({ receivedByLocalHostOnly: message.params, note: '未发送至真实聊天。' }, null, 2); reply({}); break;
    case 'ui/open-link': reply({ isError: true }); report('预览不自动打开外部链接，请复制来源地址。', true); break;
  }
});
for (const item of choices) {
  const button = document.createElement('button'); button.type = 'button'; button.dataset.example = item.id; button.textContent = item.title || item.label || item.id;
  button.addEventListener('click', () => select(item.id)); document.getElementById('examples').append(button);
}
form.addEventListener('submit', event => { event.preventDefault(); update(Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, Number(value)]))); });
document.getElementById('theme').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(); });
document.getElementById('reload').addEventListener('click', () => { if (!frame) return; report('正在刷新视图，恢复匹配状态…'); void select(selected); });
document.getElementById('reset').addEventListener('click', () => {
  if (!frame) return;
  if (!storage.remove(stateKey())) { report('本地存储无法清除，请检查浏览器存储权限。', true); return; }
  report('已清除本例交互，正在重新加载题设。'); void select(selected);
});
const width = document.getElementById('width'); width.value = ['320', '375', '390', '768', '1024'].includes(params.get('width')) ? params.get('width') : '768';
function applyWidth() { document.documentElement.style.setProperty('--preview-width', `${width.value}px`); const url = new URL(location.href); url.searchParams.set('width', width.value); history.replaceState(null, '', url); }
width.addEventListener('change', applyWidth); applyWidth();
if (params.get('bare') === '1') document.body.classList.add('bare');
applyTheme(); await select(selected);
