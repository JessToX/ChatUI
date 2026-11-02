#!/usr/bin/env python3
"""Create and freshly extract the two local Phase 2B deliveries. Never publish."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from release_privacy import validate_public_content  # noqa: E402


def sha(content):
    return hashlib.sha256(content).hexdigest()


def safe_path(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name or str(path) != name:
        raise ValueError('Unsafe archive path: ' + name)


def check_text(name, content):
    validate_public_content(content, json_document=PurePosixPath(name).suffix.lower() == '.json')
    if name.endswith('.png'):
        return
    text = content.decode('utf-8')
    if re.search(r'/Users/[^\s"<>]+|/home/[^\s"<>]+|file:///(?:Users|home)/', text):
        raise ValueError('Local machine path in ' + name)


def png(content):
    if not content.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Invalid PNG signature')
    offset, payload, ended, header = 8, b'', False, None
    while offset < len(content):
        if offset + 12 > len(content):
            raise ValueError('Truncated PNG chunk')
        length = struct.unpack('>I', content[offset:offset+4])[0]
        if offset + 12 + length > len(content):
            raise ValueError('Truncated PNG data')
        kind = content[offset+4:offset+8]
        chunk = content[offset+8:offset+8+length]
        checksum = struct.unpack('>I', content[offset+8+length:offset+12+length])[0]
        if zlib.crc32(kind + chunk) != checksum:
            raise ValueError('Invalid PNG CRC')
        if offset == 8 and kind != b'IHDR':
            raise ValueError('PNG has no first IHDR')
        if kind == b'IHDR':
            if header is not None or length != 13:
                raise ValueError('Invalid PNG IHDR')
            width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', chunk)
            if not (0 < width <= 50000 and 0 < height <= 50000 and depth == 8 and color in (2, 6) and compression == filtering == interlace == 0):
                raise ValueError('Unsupported screenshot pixel format')
            header = (width, height, 3 if color == 2 else 4)
        if kind == b'IDAT':
            payload += chunk
        if kind == b'IEND':
            if length or offset + 12 != len(content):
                raise ValueError('Invalid PNG IEND')
            ended = True
        offset += length + 12
    if not ended or header is None:
        raise ValueError('PNG cannot be decoded')
    width, height, channels = header
    pixels = zlib.decompress(payload)
    stride = width * channels
    if len(pixels) != height * (stride + 1):
        raise ValueError('PNG scanline length mismatch')
    if any(pixels[row * (stride + 1)] > 4 for row in range(height)):
        raise ValueError('Invalid PNG row filter')
    # The macOS image decoder verifies the real pixels quickly for tall captures.
    # Other hosts retain the portable decoder below; no dependencies are installed.
    if sys.platform == 'darwin' and Path('/usr/bin/sips').is_file():
        with tempfile.TemporaryDirectory(prefix='chatui-png-decode-') as temporary:
            source, decoded = Path(temporary) / 'source.png', Path(temporary) / 'decoded.png'
            source.write_bytes(content)
            result = subprocess.run(['/usr/bin/sips', '-s', 'format', 'png', str(source), '--out', str(decoded)], capture_output=True)
            if result.returncode or not decoded.exists() or not decoded.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('Native PNG pixel decoding failed')
        return
    # Decode actual RGB/RGBA pixels, including every PNG row filter.
    previous = bytearray(stride)
    for row_index in range(height):
        start = row_index * (stride + 1)
        method = pixels[start]
        if method > 4:
            raise ValueError('Invalid PNG row filter')
        row = bytearray(pixels[start+1:start+stride+1])
        if method == 0:
            previous = row
            continue
        for column in range(stride):
            left = row[column-channels] if column >= channels else 0
            above = previous[column]
            corner = previous[column-channels] if column >= channels else 0
            if method == 1:
                prediction = left
            elif method == 2:
                prediction = above
            elif method == 3:
                prediction = (left + above) // 2
            elif method == 4:
                estimate = left + above - corner
                distances = [abs(estimate-left), abs(estimate-above), abs(estimate-corner)]
                prediction = [left, above, corner][distances.index(min(distances))]
            else:
                prediction = 0
            row[column] = (row[column] + prediction) & 255
        previous = row


def zipped(entries):
    import io
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in sorted(entries.items()):
            safe_path(name); check_text(name, content)
            item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            item.create_system = 3; item.external_attr = 0o100644 << 16
            item.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(item, content, compresslevel=9)
    return output.getvalue()


def available(directory, stem):
    candidate = directory / (stem + '.zip')
    version = 2
    while candidate.exists() or candidate.is_symlink():
        candidate = directory / (stem + f'-v{version}.zip'); version += 1
    return candidate


def verify_extract(archive, entries):
    directory = Path(tempfile.mkdtemp(prefix='chatui-phase2b-delivery-')).resolve()
    with zipfile.ZipFile(archive) as source:
        if source.testzip() or len(source.namelist()) != len(set(source.namelist())) or set(source.namelist()) != set(entries):
            raise ValueError('ZIP integrity/inventory failure')
        for item in source.infolist():
            safe_path(item.filename)
            if stat.S_IFMT(item.external_attr >> 16) == stat.S_IFLNK:
                raise ValueError('ZIP symlink')
        source.extractall(directory)
    for name, content in entries.items():
        path = directory / name
        if path.is_symlink() or not path.resolve().is_relative_to(directory) or path.read_bytes() != content:
            raise ValueError('Extracted file mismatch: ' + name)
        if name.endswith('.png'):
            png(content)
    for name, content in entries.items():
        if name.endswith('.md'):
            for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', content.decode()):
                if re.match(r'https?://', target) or target.startswith('#'):
                    continue
                destination = (directory / name).parent / target.split('#')[0]
                if not destination.resolve().is_relative_to(directory) or not destination.exists():
                    raise ValueError('Broken or escaping Markdown link: ' + name + ': ' + target)
    sums = directory / 'SHA256SUMS'
    if sums.exists():
        for line in sums.read_text().splitlines():
            expected, name = line.split('  ', 1)
            if sha((directory / name).read_bytes()) != expected:
                raise ValueError('Checksum mismatch')
    return directory


def portable(text):
    # Review copies are self-contained prose: repository-only links become labels.
    text = re.sub(r'\[([^\]]+)\]\((?!https?://|#)[^)]+\)', r'\1', text)
    return re.sub(r'/Users/[^\s`"<>]+|/home/[^\s`"<>]+', '[local-checkout]', text)


def sanitize(value):
    if isinstance(value, dict):
        return {key: sanitize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize(item) for item in value]
    if isinstance(value, str):
        return value.replace(str(ROOT), '[local-checkout]').replace(str(Path.home()), '[local-home]')
    return value


def require_browser(report, full):
    expected = {(mode, name) for mode in ['file', 'http'] for name in (['slice', 'layout', 'interaction', 'security'] if full else ['slice', 'interaction', 'security'])}
    checks = {(check['mode'], check['name']): check for check in report.get('checks', [])}
    if report.get('status') != 'PASS' or not expected.issubset(checks):
        raise ValueError('Missing required real-browser modes/checks')
    for key in expected:
        check = checks[key]
        if check.get('status') != 'PASS' or check.get('result', {}).get('status') != 'PASS':
            raise ValueError('Non-passing browser evidence')
        if key[1] == 'layout':
            layouts = check['result'].get('layouts', [])
            actual = {(row['scene'], row['theme'], row['width']) for row in layouts if row.get('status') == 'PASS'}
            expected_layouts = {(f'G{i:02}', theme, width) for i in range(1, 9) for theme in ['light', 'dark'] for width in [320, 390, 768, 1024]}
            if len(layouts) != 64 or actual != expected_layouts:
                raise ValueError('Missing actual passing 64-layout coverage')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--engineering', required=True, type=Path)
    parser.add_argument('--browser', required=True, type=Path)
    parser.add_argument('--standalone-browser', required=True, type=Path)
    parser.add_argument('--before-browser', type=Path, help='Preserved same-input G03 touch-target failure capture')
    parser.add_argument('--output-dir', type=Path, default=Path.home() / 'Downloads')
    args = parser.parse_args()
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip():
        raise ValueError('Delivery requires a clean local commit')
    engineering = json.loads(args.engineering.read_text())
    browser = json.loads(args.browser.read_text())
    standalone = json.loads(args.standalone_browser.read_text())
    require_browser(browser, full=True)
    require_browser(standalone, full=False)
    if engineering['status'] != 'PHASE 2B ENGINEERING PASS' or engineering['sourceSha'] != head or any(report['status'] != 'PASS' for report in [browser, standalone]):
        raise ValueError('Final engineering/browser evidence not passing')
    gallery = ROOT / 'renderer/public/gallery'
    names = ['index.html', 'fixtures.json', 'renderer.html', 'README.md', 'THIRD_PARTY_NOTICES.md', 'manifest.json', 'SHA256SUMS']
    gallery_entries = {name: (gallery / name).read_bytes() for name in names}
    for report in [browser, standalone]:
        if any(report['galleryResourceSHA256'].get(name) != sha(content) for name, content in gallery_entries.items()):
            raise ValueError('Captured Gallery resource bytes differ from final commit')
        report['finalCommitSHA'] = head
        report['finalResourceVerification'] = {'status': 'PASS', 'galleryFilesByteIdentical': True, 'captureGitHead': report['captureGitHead']}
    for name, content in gallery_entries.items():
        committed = subprocess.check_output(['git', 'show', f'HEAD:renderer/public/gallery/{name}'], cwd=ROOT)
        if content != committed:
            raise ValueError('Gallery resource differs from committed blob')
    candidate = available(args.output_dir, 'ChatUI-Phase2B-Gallery-Candidate')
    candidate_bytes = zipped(gallery_entries)
    if candidate_bytes != zipped(gallery_entries):
        raise ValueError('Non-deterministic Gallery ZIP')
    with candidate.open('xb') as output:
        output.write(candidate_bytes)
    candidate_extract = verify_extract(candidate, gallery_entries)
    docs = ['final-edition/phase2b.md', 'final-edition/intellectual-ui-ux-spec.md', 'final-edition/phase2a1.md', 'final-edition/phase2a.md', 'final-edition/b1.md', 'visual-spec-v0.7.md', 'rich-document-v1-spec.md']
    review_entries, sources = {}, {}
    for path in docs:
        name = 'docs/' + ('phase2b.md' if path.endswith('/phase2b.md') else path)
        review_entries[name] = portable((ROOT / 'docs' / path).read_text()).encode()
        sources[name] = 'docs/' + path + ' (portable review copy)'
    # Keep the entire structured layout/interaction record, excluding raw tool logs.
    evidence = {'status': 'CORE PASS WITH DECLARED LIMITATIONS', 'finalCommitSHA': head, 'engineering': sanitize(engineering), 'browser': sanitize(browser), 'cleanStandaloneBrowser': sanitize(standalone)}
    review_entries['acceptance.json'] = (json.dumps(evidence, ensure_ascii=False, indent=2) + '\n').encode()
    sources['acceptance.json'] = 'final local engineering, browser and clean standalone structured results'
    shot_paths = list(browser.get('screenshots', {}))
    selected = [path for path in shot_paths if (re.search(r'-(light-390|dark-320|dark-768)(?:\.|-)', path) or any(marker in path for marker in ['interaction', 'security', 'vertical-slice', '-keyboard-', '-copy-', 'quiz-submitted', 'alternative-tab', 'safe-tex']))]
    if not selected:
        selected = shot_paths[:24]
    for path in selected:
        source = ROOT / path
        if source.is_symlink() or not source.resolve().is_relative_to(ROOT / 'output/playwright/phase2b'):
            raise ValueError('Unsafe screenshot source')
        content = source.read_bytes(); png(content)
        if sha(content) != browser['screenshots'][path]:
            raise ValueError('Captured screenshot changed')
        name = 'screenshots/' + source.name
        if name in review_entries:
            raise ValueError('Duplicate screenshot basename')
        review_entries[name] = content; sources[name] = path
    if args.before_browser:
        before = json.loads(args.before_browser.read_text())
        if before.get('fixtureHash') != browser.get('fixtureHash'):
            raise ValueError('Before/after fixed inputs differ')
        if not any(row.get('scene') == 'G03' and row.get('width') == 390 and row.get('theme') == 'light' and row.get('status') == 'FAIL' for check in before.get('checks', []) if check['name'] == 'layout' for row in check.get('result', {}).get('layouts', [])):
            raise ValueError('Missing exact same-input G03 before failure')
        old = ROOT / 'output/playwright/phase2b' / args.before_browser.parent.name / 'file-g03-light-390-FAIL.png'
        content = old.read_bytes(); png(content)
        name = 'screenshots/before-file-g03-light-390-touch-target-FAIL.png'
        review_entries[name] = content; sources[name] = str(old.relative_to(ROOT))
        after = next((path for path in shot_paths if path.endswith('/file-g03-light-390.png')), None)
        if not after:
            raise ValueError('Missing G03 after screenshot')
        comparison = {'scene': 'G03', 'theme': 'light', 'width': 390, 'fixtureHash': browser['fixtureHash'], 'before': {'status': 'FAIL: 23.92px reading-note touch target', 'screenshot': name, 'captureGitHead': before['captureGitHead'], 'captureWorktreeDirty': before['captureWorktreeDirty'], 'rendererResourceSHA256': before['rendererResourceSHA256']}, 'after': {'status': 'PASS: at least 44px', 'screenshot': 'screenshots/' + Path(after).name, 'captureGitHead': browser['captureGitHead'], 'captureWorktreeDirty': browser['captureWorktreeDirty'], 'rendererResourceSHA256': browser['rendererResourceSHA256'], 'finalCommitSHA': head}}
        review_entries['same-input-comparison.json'] = (json.dumps(comparison, ensure_ascii=False, indent=2) + '\n').encode()
        sources['same-input-comparison.json'] = 'preserved original G03 failure and final same-fixture capture identity'
    candidate_sum = sha(candidate_bytes)
    readme = f'''# ChatUI Phase 2B Review\n\nStatus: **CORE PASS WITH DECLARED LIMITATIONS**.\n\nFinal local commit: `{head}` on `codex/final-edition`, from `be6e0ae2d4446e9a8df709c7f19d18e6fb93bf8c`.\n\nThis ZIP is review evidence. The runnable product is **{candidate.name}** ({len(candidate_bytes)} bytes), SHA256 `{candidate_sum}`.\n\nReview [Phase 2B report](docs/phase2b.md), then [structured acceptance](acceptance.json), then the real screenshots in [image index](index.html). The acceptance file records both file and loopback HTTP layouts and behavior, source/capture identity and final byte equivalence. Screenshots captured before commit retain their real captureGitHead and dirty state.\n\nChromium offline core and local engineering PASS; Safari automation unavailable, Firefox absent, manual VoiceOver UNKNOWN, real ChatGPT host and user comprehension NOT RUN. This does not establish production or full screen-reader acceptance.\n\nNo push, deployment, release, account connection changes, Phase 3 or archive occurred. Phase 3 needs separate approval. Original logs remain only in the isolated local checkout.\n'''
    review_entries['README.md'] = readme.encode(); sources['README.md'] = 'post-commit delivery record'
    images = ''.join(f'<figure><img loading="lazy" src="{name}" alt="{Path(name).stem}"><figcaption>{Path(name).stem}</figcaption></figure>' for name in review_entries if name.endswith('.png'))
    review_entries['index.html'] = ('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Phase 2B review images</title><style>body{font:16px system-ui;margin:24px}img{max-width:100%;height:auto}figure{margin:24px 0;border-top:1px solid #aaa;padding-top:12px}</style><h1>Phase 2B · 真实截图索引</h1><p>审核证据包；运行产品请打开 Gallery Candidate ZIP。</p>' + images + '</html>').encode(); sources['index.html'] = 'generated static screenshot index'
    files = [{'path': name, 'source': sources[name], 'bytes': len(content), 'sha256': sha(content)} for name, content in sorted(review_entries.items())]
    review_entries['manifest.json'] = (json.dumps({'format': 'chatui-phase2b-review-v1', 'finalCommitSHA': head, 'galleryCandidate': {'filename': candidate.name, 'bytes': len(candidate_bytes), 'sha256': candidate_sum}, 'files': files}, ensure_ascii=False, indent=2) + '\n').encode()
    review_entries['SHA256SUMS'] = ('\n'.join(f'{sha(content)}  {name}' for name, content in sorted(review_entries.items())) + '\n').encode()
    review = available(args.output_dir, 'ChatUI-Phase2B-Review')
    review_bytes = zipped(review_entries)
    if review_bytes != zipped(review_entries):
        raise ValueError('Non-deterministic Review ZIP')
    if len(review_bytes) > 100 * 1024 * 1024:
        raise ValueError('Review exceeds 100 MiB; preserve all evidence and report a split plan')
    with review.open('xb') as output:
        output.write(review_bytes)
    review_extract = verify_extract(review, review_entries)
    report = {'status': 'PASS', 'finalCommitSHA': head, 'finalResourceVerification': 'PASS: captured, committed and extracted Gallery bytes identical', 'repeatedZipBytesIdentical': True, 'gallery': {'path': str(candidate), 'bytes': len(candidate_bytes), 'sha256': candidate_sum, 'extraction': str(candidate_extract)}, 'review': {'path': str(review), 'bytes': len(review_bytes), 'sha256': sha(review_bytes), 'extraction': str(review_extract), 'images': len(selected)}, 'engineeringEvidence': str(args.engineering), 'browserEvidence': str(args.browser), 'standaloneBrowserEvidence': str(args.standalone_browser)}
    destination = ROOT / '.local/phase2b/delivery'
    destination.mkdir(parents=True, exist_ok=True)
    (destination / ('delivery-' + head[:12] + '.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
