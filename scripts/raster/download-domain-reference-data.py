"""Download pinned paleogeographic files; Python is test tooling, never product runtime."""
import hashlib
import io
import json
from pathlib import Path
import re
from urllib.request import urlopen
from zipfile import ZipFile

root = Path(__file__).resolve().parents[2]
directory = root / "tmp" / "paleo-domain-review"
directory.mkdir(parents=True, exist_ok=True)
manifest = json.loads(Path(__file__).with_name("domain-reference-datasets.json").read_text(encoding="utf-8"))


def checked_download(url, checksum, limit, destination):
    if destination.exists():
        data = destination.read_bytes()
    else:
        parts = []
        length = 0
        with urlopen(url, timeout=45) as response:
            while chunk := response.read(1024 * 1024):
                length += len(chunk)
                if length > limit:
                    raise ValueError(f"Download exceeds {limit} bytes: {url}")
                parts.append(chunk)
        data = b"".join(parts)
    if len(data) > limit or hashlib.sha256(data).hexdigest() != checksum:
        raise ValueError(f"Size or SHA-256 mismatch: {destination.name}")
    if not destination.exists():
        destination.write_bytes(data)
    return data


receipts = []
for entry in manifest:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", entry["filename"]):
        raise ValueError("Unsafe fixture filename")
    destination = directory / entry["filename"]
    if "archiveUrl" in entry:
        archive = checked_download(entry["archiveUrl"], entry["archiveSha256"], entry["maximumBytes"], directory / "PaleoDEM-1deg-original.zip")
        with ZipFile(io.BytesIO(archive)) as container:
            info = container.getinfo(entry["archiveEntry"])
            if info.file_size > entry["maximumBytes"]:
                raise ValueError("Archive member exceeds size limit")
            data = container.read(info)
        if hashlib.sha256(data).hexdigest() != entry["sha256"]:
            raise ValueError("Archive member checksum mismatch")
        destination.write_bytes(data)
    else:
        data = checked_download(entry["url"], entry["sha256"], entry["maximumBytes"], destination)
    if not (data.startswith(b"CDF") or data.startswith(b"\x89HDF\r\n\x1a\n")):
        raise ValueError("Expected NetCDF signature")
    receipts.append({**entry, "bytes": len(data)})
    print(f'{entry["id"]}: {len(data)} bytes, {entry["sha256"]}')
(directory / "download-receipts.json").write_text(json.dumps(receipts, indent=2), encoding="utf-8")
