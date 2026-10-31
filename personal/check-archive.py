"""Check a Sites static tar.gz against a separately verified local build.

No extraction, network access or third-party dependencies. Python 3 standard library.
"""
import gzip
import hashlib
import json
from pathlib import Path, PurePosixPath
import sys
import tarfile


def check_archive(archive_path, manifest_path, hosting_path):
    manifest_bytes = Path(manifest_path).read_bytes()
    manifest = json.loads(manifest_bytes)
    hosting = json.loads(Path(hosting_path).read_bytes())
    if manifest.get("version") != 1 or hosting.get("static", {}).get("directory") != "dist":
        raise ValueError("Expected artifact manifest v1 and static.directory=dist")
    expected = {"dist/" + name: row for name, row in manifest["files"].items()}
    expected["dist/artifact-manifest.json"] = {
        "size": len(manifest_bytes), "sha256": hashlib.sha256(manifest_bytes).hexdigest()
    }
    metadata = "dist/.openai/hosting.json"
    seen = set()
    with gzip.open(archive_path, "rb") as raw:
        # Continue across tar end markers so concatenated gzip/tar members cannot
        # hide additional files after an otherwise complete distribution.
        with tarfile.open(fileobj=raw, mode="r|", ignore_zeros=True) as archive:
            for member in archive:
                name = member.name
                parts = PurePosixPath(name).parts
                if not parts or parts[0] != "dist" or ".." in parts or "\\" in name:
                    raise ValueError("Unsafe archive path: " + name)
                name = str(PurePosixPath(name))
                if name in seen:
                    raise ValueError("Duplicate archive entry: " + name)
                seen.add(name)
                if member.isdir():
                    if name in expected or name == metadata:
                        raise ValueError("Expected file, found directory: " + name)
                    continue
                if not member.isfile() or member.issparse():
                    raise ValueError("Non-regular archive entry: " + name)
                if name == metadata:
                    if member.size > 1024 * 1024:
                        raise ValueError("Oversized hosting metadata")
                    if json.load(archive.extractfile(member)) != hosting:
                        raise ValueError("Hosting metadata differs from approved source")
                    continue
                if name not in expected:
                    raise ValueError("Unexpected archive file: " + name)
                row = expected[name]
                if member.size != row["size"]:
                    raise ValueError("Wrong archive file size: " + name)
                digest = hashlib.sha256()
                with archive.extractfile(member) as source:
                    while chunk := source.read(65536):
                        digest.update(chunk)
                if digest.hexdigest() != row["sha256"]:
                    raise ValueError("Wrong archive file hash: " + name)
        # Consume the gzip trailer too: a truncated transport must not pass merely
        # because the tar end marker was already reached.
        while raw.read(65536):
            pass
    missing = (set(expected) | {metadata}) - seen
    if missing:
        raise ValueError("Missing archive files: " + ", ".join(sorted(missing)))
    return {"files": len(expected) + 1, "archive": str(Path(archive_path).resolve())}


if __name__ == "__main__":
    try:
        if len(sys.argv) != 4:
            raise ValueError("Usage: check-archive.py ARCHIVE TRUSTED_MANIFEST HOSTING_JSON")
        print(json.dumps(check_archive(*sys.argv[1:])))
    except (OSError, ValueError, EOFError, tarfile.TarError, KeyError) as error:
        print("Artifact verification failed: " + str(error), file=sys.stderr)
        sys.exit(1)
