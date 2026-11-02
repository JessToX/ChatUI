/* Private synthetic Document diagnostic; trusted build opt-in only. */
(() => {
  'use strict';
  const html = document.documentElement;
  if (html.dataset.chatuiEntryProbe !== 'v1') return;
  const started = performance.now(), events = [];
  const stages = new Set(['entry', 'app_script_entry', 'app_script_return', 'script_error', 'unhandled_rejection', 'dom_parsed']);
  const mark = stage => {
    if (events.length >= 16 || !stages.has(stage)) return;
    const event = { seq: events.length, stage, ms: Math.max(0, Math.round(performance.now() - started)) };
    events.push(event);
    try { html.setAttribute('data-chatui-entry', JSON.stringify(events)); } catch {}
    try { console.info('[ChatUI entry v1]', JSON.stringify(event)); } catch {}
  };
  window.addEventListener('error', event => { if (event.target === window) mark('script_error'); });
  window.addEventListener('unhandledrejection', () => mark('unhandled_rejection'));
  document.addEventListener('chatui:app-script-entry', () => mark('app_script_entry'));
  document.addEventListener('chatui:app-script-return', () => mark('app_script_return'));
  document.addEventListener('DOMContentLoaded', () => mark('dom_parsed'), { once: true });
  mark('entry');
})();
