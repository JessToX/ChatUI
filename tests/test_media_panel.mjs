import { componentTemplate } from './component-template.mjs';
/** Image lifecycle and safe source fallback. Does not request any real remote image. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM, VirtualConsole} from 'jsdom';
const item = () => ({title:'图片对象',body:'与图片相邻的解释',alt:'图像描述',imageUrl:'https://images.example.org/image.jpg',sourceUrl:'https://example.org/source',sourceLabel:'原始来源',caption:'示例图注',credit:'原作者'});
function mount(items) {
  const dom = new JSDOM(componentTemplate('media-panel'), {runScripts:'outside-only',url:'https://chatui.test/',virtualConsole:new VirtualConsole()});
  const w=dom.window;
  w.document.querySelector('#chatui-component-config').textContent=JSON.stringify({schemaVersion:1,contentId:'media-fixture',type:'media-panel',data:{items}});
  w.document.querySelectorAll('script:not([type])').forEach(s=>w.eval(s.textContent));
  return {w,root:w.document.getElementById('chatui-component'),close:()=>w.close()};
}
test('image load reveals real image while preserving adjacent source, attribution and alternative text',t=>{
  const app=mount([item()]);t.after(app.close);
  const img=app.root.querySelector('img'),fallback=app.root.querySelector('[data-media-fallback]'),source=app.root.querySelector('a');
  assert.equal(img.hidden,true);assert.equal(fallback.hidden,false);
  Object.defineProperty(img,'naturalWidth',{value:800});img.dispatchEvent(new app.w.Event('load'));
  assert.equal(img.hidden,false);assert.equal(fallback.hidden,true);
  assert.equal(img.alt,'图像描述');assert.equal(img.referrerPolicy,'no-referrer');
  assert.equal(source.href,'https://example.org/source');assert.match(source.rel,/noopener/);
  assert.match(app.root.textContent,/原作者/);assert.match(app.root.textContent,/与图片相邻的解释/);
});
test('blocked or failed image leaves a visible source and explanation, no blank image placeholder',t=>{
  const app=mount([item()]);t.after(app.close);
  app.root.querySelector('img').dispatchEvent(new app.w.Event('error'));
  assert.equal(app.root.querySelector('img').hidden,true);
  assert.equal(app.root.querySelector('[data-media-fallback]').hidden,false);
  assert.match(app.root.textContent,/图片未能显示/);assert.equal(app.root.querySelector('a').href,item().sourceUrl);
});
test('source-only fallback is supported without manufacturing a remote image address',t=>{
  const value=item();delete value.imageUrl;
  const app=mount([value]);t.after(app.close);
  assert.equal(app.root.querySelector('img'),null);assert.match(app.root.textContent,/图片未嵌入/);assert.ok(app.root.querySelector('a'));
});
test('unsafe image and source URLs fail visibly without links or image loading',t=>{
  for(const key of ['imageUrl','sourceUrl']) for(const value of ['javascript:alert(1)','data:image/svg+xml,hello','http://example.org/x','https://user:secret@example.org/x','https://example.org/\nsecret']) {
    const app=mount([{...item(),[key]:value}]);t.after(app.close);
    assert.ok(app.root.querySelector('[role="alert"]'));assert.equal(app.root.querySelector('img,a'),null);
  }
});
test('missing provenance and oversized image lists are rejected',t=>{
  for(const items of [[],Array.from({length:7},item),[{...item(),alt:''}],[{...item(),sourceLabel:''}],[{...item(),body:'x'.repeat(1801)}]]) {
    const app=mount(items);t.after(app.close);assert.ok(app.root.querySelector('[role="alert"]'));
  }
});
test('captions and descriptions stay text; each image keeps its own source',t=>{
  const unsafe='<img src=x onerror=window.injected=true>';
  const app=mount([{...item(),title:unsafe,body:unsafe,caption:unsafe},{...item(),title:'第二张',sourceUrl:'https://example.org/second'}]);t.after(app.close);
  assert.equal(app.root.querySelectorAll('figure').length,2);assert.equal(app.root.querySelectorAll('img').length,2);
  assert.equal(app.w.injected,undefined);assert.match(app.root.textContent,/<img/);
  assert.equal(app.root.querySelectorAll('a')[1].href,'https://example.org/second');
});
