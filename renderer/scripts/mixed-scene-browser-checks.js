// Offline Playwright CLI callback using the actual generated product renderer.
// eslint-disable-next-line @typescript-eslint/no-unused-expressions
async (page) => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  await page.evaluate(()=>postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:window.mixedResult},'*'));
  await page.locator('#scene-second-height-number').waitFor();
  const prose=()=>page.locator('[data-block-id="intro"], [data-block-id="explanation"]').allTextContents();
  const original=await prose();
  const second=()=>page.locator('[data-block-id="second"] svg').innerHTML();
  const checks=[];
  for(const width of [320,360,720]) {
    await page.setViewportSize({width,height:800});await settle();
    const layout=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,order:[...document.querySelectorAll('#chatui-component > [data-block-id]')].map(e=>e.dataset.blockId),escaped:[...document.querySelectorAll('svg text')].filter(t=>{const r=t.getBoundingClientRect(),s=t.ownerSVGElement.getBoundingClientRect();return r.left<s.left-1||r.right>s.right+1;}).length}));
    assert(layout.scroll<=layout.client+1,`overflow: ${JSON.stringify(layout)}`);
    assert(layout.order.join(',')==='intro,first,explanation,second',`reading order: ${layout.order}`);
    assert(layout.escaped===0,'SVG labels outside bounds');
    const before=await second();
    await page.locator('#scene-first-height-number').fill('4.123456789');await settle();
    assert(await page.locator('#scene-first-height-number').inputValue()==='4.123456789','exact input lost');
    assert(await second()===before,'other SVG changed');
    assert(JSON.stringify(await prose())===JSON.stringify(original),'prose changed');
    const slider=page.locator('[data-block-id="first"] [role="slider"]');
    await slider.focus();await page.keyboard.press('ArrowUp');await settle();
    assert(Math.abs(Number(await page.locator('#scene-first-height-number').inputValue())-4.223456789)<1e-12,'keyboard arithmetic changed precision');
    const expected=['BUTTON','scene-first-vertex-number','BUTTON','DIV','scene-first-height-number','scene-first-guide-toggle','BUTTON','slider'];
    const focus=[];
    for(const id of expected){await page.keyboard.press('Tab');const actual=await page.evaluate(()=>{const e=document.activeElement;return e.id||e.getAttribute('role')||e.tagName;});focus.push(actual);assert(actual===id,`tab order ${actual} != ${id}`);}
    assert(await page.locator('[data-block-id="second"] [role="slider"]').evaluate(e=>e===document.activeElement),'Tab did not reach second scene');
    assert(JSON.stringify(await prose())===JSON.stringify(original),'keyboard changed prose');
    await page.locator('[data-block-id="second"] button').last().scrollIntoViewIfNeeded();
    const bottom=await page.locator('[data-block-id="second"] button').last().boundingBox();
    assert(bottom.y>=0&&bottom.y+bottom.height<=800,'last control unreachable');
    await page.screenshot({path:`output/playwright/mixed-scene-${width}.png`,fullPage:true});
    checks.push({width,layout,focus,exactInput:true,proseStable:true,otherSceneStable:true,bottomReachable:true});
  }
  return checks;
}
