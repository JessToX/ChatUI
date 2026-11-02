// Offline-only fixture: does not alter the pilot resource or tool declarations.
import {readFileSync, writeFileSync} from 'node:fs';
import {responseHtml} from '../lib/response.generated.mjs';
import {normalizeResponse} from '../lib/response-normalization.mjs';
import {mixedReadingExperience} from '../examples/mixed-reading.mjs';
const input=mixedReadingExperience();
const {view,text}=normalizeResponse(input);
const host=`<script>window.mixedResult=${JSON.stringify({structuredContent:view,content:[{type:'text',text}]})};addEventListener('message',e=>{const m=e.data;if(m?.method==='ui/initialize')postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{},hostContext:{}}},'*');});</script>`;
const checks=readFileSync(new URL('./mixed-scene-browser-checks.js',import.meta.url),'utf8');
writeFileSync('/tmp/chatui-mixed-scene-check.js',`async(page)=>{await page.goto('about:blank');await page.context().setOffline(true);await page.setContent(${JSON.stringify(responseHtml.replace('<head>','<head>'+host))});return await (${checks})(page);}`);
