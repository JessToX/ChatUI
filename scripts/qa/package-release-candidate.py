import argparse,hashlib,importlib.util,json,subprocess,sys,zipfile
from pathlib import Path

def verify_source(root,sha,e):
 tracked=set(subprocess.check_output(['git','ls-tree','-r','--name-only',sha],cwd=root,text=True).splitlines())
 if set(e)-tracked: raise RuntimeError('Allowlisted source must exist in the committed tree')
 if Path(__file__).resolve()!=root/'scripts/qa/package-release-candidate.py': raise RuntimeError('Run the packager from the same source checkout')
 for name,data in e.items():
  if name=='plugins/chatui/.app.json': continue # Deliberate public placeholder; never read account binding.
  if subprocess.check_output(['git','show',sha+':'+name],cwd=root)!=data: raise RuntimeError('Source bytes differ from committed tree: '+name)

def original_bytes(root, sha, name):
 if name=='plugins/chatui/.app.json': return None # Account binding is excluded, including provenance hashing.
 try: return subprocess.check_output(['git','show',sha+':'+name],cwd=root,stderr=subprocess.DEVNULL)
 except subprocess.CalledProcessError: return None

def main():
 parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output',type=Path);a=parser.parse_args();root=a.source.resolve();out=a.output.resolve();out.mkdir(parents=True,exist_ok=True)
 sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
 if len(sha)!=40: raise RuntimeError('Expected a full committed source identity')
 sys.path.insert(0,str(root/'scripts'));spec=importlib.util.spec_from_file_location('pack',root/'scripts/qa/package-phase3.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 if subprocess.check_output(['git','diff','HEAD','--name-only'],cwd=root).strip(): raise RuntimeError('Tracked working tree differs from frozen commit')
 e,origins=m.source_entries(root)
 verify_source(root,sha,e)
 additions=['renderer/tests/force-restoration.test.mjs','renderer/tests/fallback-completeness.test.mjs','renderer/tests/heading-navigation.test.mjs','renderer/tests/success-fallback-presentation.test.mjs','docs/feature-completeness/continuation-stimuli.json']
 for name in additions:
  e[name]=subprocess.check_output(['git','show',sha+':'+name],cwd=root);origins[name]='exact original regression/fixture covering distributed product source'
 allow=json.loads(e['scripts/release-allowlist.json'])
 allow['renderer']=sorted(set(allow['renderer']+[n for n in additions if n.startswith('renderer/')]))
 allow['documents']=sorted(set(allow['documents']+[n for n in additions if n.startswith('docs/')]))
 allow['source']=sorted(set(allow['source']+['LICENSE','NOTICE.txt','PACKAGE-README.md','PACKAGE-MANIFEST.json','scripts/reproduce-package.py']))
 e['scripts/release-allowlist.json']=m.canonical_json(allow)
 placeholder=b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>ChatUI placeholder</title><rect x="8" y="8" width="48" height="48" rx="8" fill="#365b8c"/><path d="M20 24h24M20 32h24M20 40h16" fill="none" stroke="white" stroke-width="4"/></svg>\n'
 for name in ['plugins/chatui/assets/icon.svg','renderer/public/favicon.svg']:
  e[name]=placeholder;origins[name]='new original geometric placeholder; unverified original icon excluded'
 draft=subprocess.check_output(['git','show',sha+':docs/release-preparation/LICENSE-MIT-DRAFT.txt'],cwd=root)
 e['LICENSE']=draft.split(b'--- BEGIN ORIGINAL TEMPLATE ---\n',1)[1].split(b'--- END ORIGINAL TEMPLATE ---',1)[0].replace(b'JessToX',b'Jess(T o X)').strip()+b'\n'
 e['NOTICE.txt']=b'ChatUI source preview\nOriginal project contributions are licensed under MIT. Copyright (c) 2026 Jess(T o X).\nThird-party code and assets retain their original licenses and copyright notices; root MIT does not relicense them.\nSee THIRD_PARTY_NOTICES.md and docs/final-edition/third-party-dependencies.json.\nTwo unverified original main icons are excluded and replaced by newly authored simple geometric SVG placeholders.\nThis distribution excludes original Git history, credentials, private host evidence, account-bound configuration and installed dependencies.\n'
 # Publication is a separate explicit gate; this command only writes local artifacts.
 e['README.md']=(root/'docs/release-preparation/SOURCE-PACKAGE-README.txt').read_bytes()
 e['PACKAGE-README.md']=b'# ChatUI source preview package\n\nSee README.md for installation, exact validation scope and known limitations. LICENSE applies to original contributions only; third-party notices are retained. PACKAGE-MANIFEST.json records source transformations. This package is not byte-identical to the full source commit and has no public cloud CI claim.\n'
 e['scripts/reproduce-package.py']=(root/'scripts/qa/reproduce-release-package.py').read_bytes()
 changes={}
 for name,data in e.items():
  old=original_bytes(root,sha,name)
  if old!=data:changes[name]={'sourceSha256':hashlib.sha256(old).hexdigest() if old is not None else None,'packageSha256':hashlib.sha256(data).hexdigest(),'reason':origins.get(name,'packaging documentation, exact inventory or local reproduction script')}
 manifest={'sourceCommit':sha,'status':'LOCAL_RELEASE_CANDIDATE_NOT_PUBLISHED','licenseDecision':'MIT for original contributions, copyright Jess(T o X); third-party licenses unchanged; user approved','changes':changes,'files':{n:hashlib.sha256(b).hexdigest() for n,b in sorted(e.items())}}
 e['PACKAGE-MANIFEST.json']=m.canonical_json(manifest)
 for n,b in e.items():m.scan(n,b)
 m.validate_documentation_links(e)
 archive=out/'chatui-source-candidate.zip'
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for n,b in sorted(e.items()):
   i=zipfile.ZipInfo(n,(1980,1,1,0,0,0));i.external_attr=0o100644<<16;i.compress_type=zipfile.ZIP_DEFLATED;z.writestr(i,b)
 (out/'SHA256SUMS').write_text(hashlib.sha256(archive.read_bytes()).hexdigest()+'  '+archive.name+'\n');(out/'manifest.json').write_bytes(m.canonical_json(manifest));print(json.dumps({'files':len(e),'changes':list(changes),'zip':archive.name}))

if __name__=='__main__': main()
