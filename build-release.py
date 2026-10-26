#!/usr/bin/env python3
"""Build an offline Arch/Omarchy distribution with its own Electron runtime."""

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parent
BASE_LIBRARIES = {
    'libc.so.6', 'libm.so.6', 'libpthread.so.0', 'libdl.so.2',
    'librt.so.1', 'libresolv.so.2', 'libutil.so.1',
}


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT)


def sha256(filename):
    with filename.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def write_asar(source, destination):
    tree = {'files': {}}
    files = []
    offset = 0
    for filename in sorted(source.rglob('*')):
        if filename.is_symlink():
            raise RuntimeError('Application source must not contain symlinks')
        if not filename.is_file():
            continue
        if filename.suffix not in {'.js', '.json', '.html', '.css', '.png'}:
            raise RuntimeError('Unexpected application file: ' + filename.name)
        data = filename.read_bytes()
        parts = filename.relative_to(source).parts
        parent = tree
        for part in parts[:-1]:
            parent = parent['files'].setdefault(part, {'files': {}})
        parent['files'][parts[-1]] = {'size': len(data), 'offset': str(offset)}
        offset += len(data)
        files.append(data)
    encoded = json.dumps(tree, ensure_ascii=False, separators=(',', ':')).encode()
    payload = struct.pack('<I', len(encoded)) + encoded
    payload += bytes((-len(payload)) % 4)
    header = struct.pack('<I', len(payload)) + payload
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('wb') as output:
        output.write(struct.pack('<II', 4, len(header)))
        output.write(header)
        for data in files:
            output.write(data)


def native_libraries(runtime):
    output = command('ldd', str(runtime / 'electron'))
    if 'not found' in output:
        raise RuntimeError('The build runtime has unresolved libraries:\n' + output)
    libraries = {}
    for line in output.splitlines():
        match = re.match(r'\s*(\S+)\s+=>\s+(/\S+)\s+\(', line)
        if not match:
            continue
        name, filename = match.groups()
        filename = Path(filename).resolve()
        if Path(name).name != name or name.startswith('ld-linux'):
            continue
        if name in BASE_LIBRARIES or name.startswith('libnss_') or filename.is_relative_to(runtime):
            continue
        libraries[name] = filename
    return libraries


def minimum_glibc(files):
    versions = set()
    for filename in files:
        output = command('readelf', '--version-info', str(filename))
        versions.update(re.findall(r'\bGLIBC_(\d+\.\d+)', output))
    return max(versions, key=lambda value: tuple(map(int, value.split('.'))))


def copy_library_notices(libraries, destination):
    packages = set()
    for filename in libraries.values():
        try:
            packages.update(command('pacman', '-Qqo', str(filename)).splitlines())
        except subprocess.CalledProcessError:
            continue
    for package in sorted(packages):
        source = Path('/usr/share/licenses') / package
        if source.is_dir():
            shutil.copytree(source, destination / package, symlinks=False, dirs_exist_ok=True)
    common = Path('/usr/share/licenses/common')
    if common.is_dir():
        shutil.copytree(common, destination / 'common', symlinks=False, dirs_exist_ok=True)
    return sorted(packages)


def build(args):
    runtime = args.electron_dir.resolve()
    if not (runtime / 'electron').is_file() or not (runtime / 'version').is_file():
        raise RuntimeError('--electron-dir must contain electron and version')
    if os.uname().machine != 'x86_64':
        raise RuntimeError('This build target is Linux x86_64')
    version = json.loads((ROOT / 'package.json').read_text())['version']
    name = f'Torchlight-Tracker-linux-port-v{version}-arch-x64'
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    destination = output / name
    if destination.exists():
        raise RuntimeError('Output directory already exists: ' + name)
    libraries = native_libraries(runtime)
    glibc = minimum_glibc([runtime / 'electron', *libraries.values()])
    print(f'Packaging Electron {runtime.joinpath("version").read_text().strip()}, '
          f'{len(libraries)} native libraries; glibc >= {glibc}', flush=True)

    with tempfile.TemporaryDirectory(prefix='tracker-build-', dir=output) as temporary:
        stage = Path(temporary) / name
        shutil.copytree(runtime, stage / 'runtime', symlinks=False)
        for default in ['default_app.asar', 'app.asar', 'app']:
            path = stage / 'runtime/resources' / default
            if path.is_dir():
                shutil.rmtree(path)
            elif path.exists():
                path.unlink()
        write_asar(ROOT / 'linux/app', stage / 'runtime/resources/app.asar')
        (stage / 'runtime/lib').mkdir(exist_ok=True)
        for soname, filename in libraries.items():
            shutil.copyfile(filename, stage / 'runtime/lib' / soname)
        packages = copy_library_notices(libraries, stage / 'licenses/native')
        for filename in ['run-linux.sh', 'install-desktop.sh']:
            shutil.copyfile(ROOT / filename, stage / filename)
        shutil.copyfile(ROOT / 'run-linux.sh', stage / 'Torchlight-Tracker')
        (stage / 'resources').mkdir()
        shutil.copyfile(ROOT / 'linux/app/etor.png', stage / 'resources/etor.png')
        shutil.copyfile(ROOT / 'linux/NOTICE.md', stage / 'NOTICE.md')
        manifest = {
            'name': 'Torchlight Tracker', 'version': version,
            'target': 'arch-linux-x86_64', 'minimum_glibc': glibc,
            'electron': (runtime / 'version').read_text().strip(),
            'backend_version': json.loads((ROOT / 'linux/app/package.json').read_text())['version'],
            'runtime_sha256': sha256(runtime / 'electron'),
            'app_asar_sha256': sha256(stage / 'runtime/resources/app.asar'),
            'native_libraries': sorted(libraries), 'arch_packages': packages,
        }
        (stage / 'release.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (stage / 'README.txt').write_text(
            'Torchlight Tracker — Linux port\n\n'
            'Extract this entire directory, then run ./Torchlight-Tracker.\n'
            'Run ./install-desktop.sh once to add Torchlight Tracker to your desktop menu.\n'
            'Electron, Node.js, npm and Python are not required to launch or install the app.\n'
            f'Target: current Arch Linux / Omarchy, x86_64, glibc >= {glibc}.\n'
            'A graphical desktop and enabled unprivileged user namespaces are required.\n'
            'The Chromium sandbox remains enabled. No sudo or setuid installation is needed.\n'
            'Steam logs are discovered automatically; use Ctrl+O to select another log.\n'
            'The original author\'s online interface and internet access are still required.\n'
            'This package contains no game logs, credentials or machine-specific settings.\n'
            'See NOTICE.md and runtime/LICENSE* for attribution and license notices.\n'
        )
        for path in stage.rglob('*'):
            if path.is_file():
                # Never ship a setuid executable owned by the build user.
                path.chmod(0o755 if path.stat().st_mode & 0o111 else 0o644)
        for filename in ['Torchlight-Tracker', 'run-linux.sh', 'install-desktop.sh']:
            (stage / filename).chmod(0o755)
        archive_path = output / (name + '.tar.gz')
        with archive_path.open('wb') as raw:
            with gzip.GzipFile(filename='', fileobj=raw, mode='wb', mtime=0, compresslevel=6) as compressed:
                with tarfile.open(fileobj=compressed, mode='w', format=tarfile.PAX_FORMAT) as archive:
                    for path in [stage, *sorted(stage.rglob('*'))]:
                        info = archive.gettarinfo(str(path), str(path.relative_to(stage.parent)))
                        info.uid = info.gid = info.mtime = 0
                        info.uname = info.gname = ''
                        info.pax_headers = {}
                        if path.is_file():
                            with path.open('rb') as source:
                                archive.addfile(info, source)
                        else:
                            archive.addfile(info)
        archive_path.with_suffix(archive_path.suffix + '.sha256').write_text(
            sha256(archive_path) + '  ' + archive_path.name + '\n')
        shutil.move(str(stage), destination)
    print(str(archive_path))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--electron-dir', type=Path, default=Path('/usr/lib/electron43'))
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'dist/releases')
    build(parser.parse_args())
