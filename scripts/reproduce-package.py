import subprocess,json,hashlib,re,os
from pathlib import Path
r=Path(__file__).resolve().parents[1]
manifest=json.loads((r/'PACKAGE-MANIFEST.json').read_text())
for name,h in manifest['files'].items():
 p=r/name
 if p.is_symlink() or not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=h: raise RuntimeError('Manifest mismatch: '+name)
if (r/'renderer/.openai').exists() or (r/'renderer/.openai').is_symlink(): raise RuntimeError('Use a fresh extraction without hosting configuration')
def snapshot(final=False):
 result={}
 for base,dirs,files in os.walk(r,followlinks=False):
  if Path(base)==r and '.git' in dirs:
   if (r/'.git').is_symlink(): raise RuntimeError('Unexpected Git directory symlink')
   dirs.remove('.git')
  for d in dirs:
   if (Path(base)/d).is_symlink(): raise RuntimeError('Unexpected directory symlink')
  if final:
   dirs[:]=[d for d in dirs if str((Path(base)/d).relative_to(r)) not in ('node_modules','renderer/node_modules','renderer/.openai','renderer/.next','renderer/dist','output/playwright') and not (d=='__pycache__' and str(Path(base).relative_to(r)) in ('scripts','scripts/qa','tests','plugins/chatui/skills/chatui/scripts'))]
  for n in files:
   p=Path(base)/n; name=str(p.relative_to(r))
   if p.is_symlink(): raise RuntimeError('Unexpected symlink: '+name)
   if final and name in ('.DS_Store','renderer/.DS_Store','renderer/.wrangler/deploy/config.json','renderer/next-env.d.ts'): continue
   if p.is_symlink(): raise RuntimeError('Unexpected symlink: '+name)
   result[name]=(hashlib.sha256(p.read_bytes()).hexdigest(),p.stat().st_mode&0o777)
 return result
before=snapshot()
if set(before)!=set(manifest['files'])|{'PACKAGE-MANIFEST.json'}: raise RuntimeError('Input inventory mismatch')
commands=[(['npm','ci','--ignore-scripts','--no-audit','--no-fund'],r),(['npm','ci','--ignore-scripts','--no-audit','--no-fund'],r/'renderer'),(['node','renderer/scripts/prepare-local-config.mjs'],r),(['npm','run','test:components'],r),(['python3','-m','unittest','discover','-s','tests','-p','test_*.py'],r),(['npm','test'],r/'renderer'),(['node','node_modules/typescript/bin/tsc','--noEmit','--incremental','false'],r/'renderer'),(['npm','run','lint'],r/'renderer'),(['npm','run','build'],r/'renderer'),(['node','scripts/check-generation.mjs'],r/'renderer'),(['python3','scripts/build_component_templates.py','--check'],r),(['python3','scripts/sync-plugin-metadata.py','--check','--candidate'],r),(['python3','scripts/qa/audit-phase3-licenses.py','--check'],r)]
for cmd,cwd in commands:
 result=subprocess.run(cmd,cwd=cwd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 print(result.stdout,flush=True);result.check_returncode()
 if cmd in (['npm','test'],['npm','run','test:components']):
  counts=re.findall(r'(?:ℹ|#) tests (\d+)',result.stdout)
  if not counts or int(counts[-1])==0 or re.search(r'(?:ℹ|#) (?:skipped|todo|cancelled|fail) [1-9]',result.stdout): raise RuntimeError('Incomplete Node test execution')
 if cmd[0]=='python3' and '-m' in cmd:
  if not re.search(r'Ran [1-9]\d* tests?',result.stdout) or re.search(r'skipped=|expected failures=|FAILED|unexpected success',result.stdout): raise RuntimeError('Incomplete Python test execution')
after=snapshot(final=True)
if before!=after: raise RuntimeError('Package source inventory/bytes/modes changed: '+str(sorted(set(before)^set(after))+[n for n in before.keys()&after.keys() if before[n]!=after[n]]))
print('Manifest verified; zero skipped tests; original package inventory/bytes/modes unchanged; no host/cloud acceptance implied.')
