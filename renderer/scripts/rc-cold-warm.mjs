import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
const child = `import {normalizeDocument} from './lib/document-normalization.mjs'; import {fixtures} from './examples/rc-fixtures.mjs'; const results=[]; for(let n=0;n<11;n++){for(const [name,input] of Object.entries(fixtures)){const start=performance.now();const r=normalizeDocument(input); results.push({run:n,name,ms:performance.now()-start,fallbacks:r.mathDiagnostics.length,blocks:r.view.blocks.length,end:r.text.includes(name==='long'?'RC-LONG-END':name==='broken'?'RC-END':'')});}} console.log(JSON.stringify(results));`;
const processes=[];
for(let n=0;n<5;n++){const childResult=spawnSync(process.execPath,['--input-type=module','-e',child],{cwd:new URL('..',import.meta.url),encoding:'utf8'});if(childResult.status!==0)throw new Error(childResult.stderr);processes.push(JSON.parse(childResult.stdout));}
const report={method:'5 independent fresh Node processes, calculus is first in each fresh process (compiler cold); other fixtures in pass 0 are first-use after calculus; 10 repeated warm passes per process. Cold is compiler process, not Cloudflare host/cache.',processes};
const directory = new URL('../outputs/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('rc-cold-warm.json', directory), JSON.stringify(report,null,2));
console.log(JSON.stringify({freshProcesses:5,compilations:processes.flat().length,failures:processes.flat().filter(x=>!x.end || x.fallbacks!==(x.name==='broken'?2:0)).length}));
