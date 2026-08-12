#!/usr/bin/env python3
"""Fetch key-free official bus files into a private raw-data directory.

The caller must point ``--raw-dir`` outside the public repository. Existing raw
files are never overwritten when the downloaded bytes differ.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import http.cookiejar
import io
import json
import re
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
)
HEADWAY_PAGE = "https://www.data.go.kr/data/3079226/fileData.do"
BMS_ROUTE_MAP_PAGE = (
    "https://data.gg.go.kr/portal/data/service/selectServicePage.do"
    "?infId=1MQHOF2F4XO6DQMRHXOA34337309&infSeq=1"
)
BMS_ROUTE_MAP_DOWNLOAD = "https://data.gg.go.kr/portal/data/sheet/downloadSheetData.do"
BMS_STOP_INFO_ID = "TEXYY9BODHAA8QZ1ZZG233176356"
BMS_FILE_METADATA = "https://data.gg.go.kr/portal/data/file/searchFileData.do"
BMS_FILE_DOWNLOAD = "https://data.gg.go.kr/portal/data/file/downloadFileData.do"


def digest_bytes(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest().upper()


def preserve_raw(raw_dir: Path, filename: str, content: bytes) -> tuple[Path, str, str]:
    raw_dir.mkdir(parents=True, exist_ok=True)
    target = raw_dir / filename
    content_hash = digest_bytes(content)
    if not target.exists():
        target.write_bytes(content)
        return target, content_hash, "created"
    if digest_bytes(target.read_bytes()) == content_hash:
        return target, content_hash, "reused_identical"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    versioned = target.with_name(f"{target.stem}.retrieved_{stamp}{target.suffix}")
    versioned.write_bytes(content)
    return versioned, content_hash, "created_version_without_overwrite"


def request(opener: urllib.request.OpenerDirector, url: str, referer: str | None = None) -> bytes:
    headers = {"User-Agent": USER_AGENT}
    if referer:
        headers["Referer"] = referer
    response = opener.open(urllib.request.Request(url, headers=headers), timeout=120)
    return response.read()


def csv_nonempty_rows(content: bytes, encoding: str) -> tuple[list[str], int]:
    reader = csv.reader(io.StringIO(content.decode(encoding), newline=""))
    headers = next(reader)
    return headers, sum(1 for row in reader if any(cell.strip() for cell in row))


def fetch_headway(opener: urllib.request.OpenerDirector) -> tuple[str, bytes, dict[str, object]]:
    page = request(opener, HEADWAY_PAGE).decode("utf-8", errors="replace")
    match = re.search(r'"contentUrl"\s*:\s*"([^"]+)"', page)
    if not match:
        raise ValueError("Official headway contentUrl was not found")
    download_url = match.group(1).replace("\\/", "/")
    content = request(opener, download_url, HEADWAY_PAGE)
    headers, rows = csv_nonempty_rows(content, "cp949")
    if headers != ["순번", "관할관청", "운행업체", "노선번호", "기점", "종점", "배차간격"]:
        raise ValueError(f"Unexpected headway headers: {headers}")
    return "경기도_고양시_버스노선별_배차간격정보_20241231.csv", content, {
        "officialPage": HEADWAY_PAGE,
        "downloadUrl": download_url,
        "snapshotDate": "2024-12-31",
        "rowCount": rows,
        "encoding": "cp949",
    }


def fetch_bms_route_map(opener: urllib.request.OpenerDirector) -> tuple[str, bytes, dict[str, object]]:
    page = request(opener, BMS_ROUTE_MAP_PAGE).decode("utf-8", errors="replace")
    match = re.search(r'<meta\s+name="_csrf"\s+content="([^"]+)"', page)
    if not match:
        raise ValueError("Gyeonggi CSRF token was not found")
    token = match.group(1)
    query = urllib.parse.urlencode(
        {
            "_csrf": token,
            "CSRFToken": token,
            "rows": 100,
            "infId": "1MQHOF2F4XO6DQMRHXOA34337309",
            "infSeq": 1,
            "downloadType": "C",
            "loc": "",
        }
    )
    download_url = f"{BMS_ROUTE_MAP_DOWNLOAD}?{query}"
    content = request(opener, download_url, BMS_ROUTE_MAP_PAGE)
    headers, rows = csv_nonempty_rows(content, "cp949")
    if headers != ["업체ID", "노선ID", "노선명"]:
        raise ValueError(f"Unexpected BMS route-map headers: {headers}")
    return "경기도_BMS_노선정보검증_20230925.csv", content, {
        "officialPage": BMS_ROUTE_MAP_PAGE,
        "downloadUrlTemplate": f"{BMS_ROUTE_MAP_DOWNLOAD}?[session_csrf]&rows=100&infId=1MQHOF2F4XO6DQMRHXOA34337309&infSeq=1&downloadType=C",
        "snapshotDate": "2023-09-25",
        "rowCount": rows,
        "encoding": "cp949",
    }


def fetch_bms_stop_order(opener: urllib.request.OpenerDirector) -> tuple[str, bytes, dict[str, object]]:
    metadata_url = f"{BMS_FILE_METADATA}?{urllib.parse.urlencode({'infId': BMS_STOP_INFO_ID, 'infSeq': 3})}"
    metadata = json.loads(request(opener, metadata_url).decode("utf-8"))
    files = metadata.get("data") or []
    if len(files) != 1:
        raise ValueError(f"Expected one BMS stop-order file, got {len(files)}")
    file_info = files[0]
    query = urllib.parse.urlencode(
        {"infId": BMS_STOP_INFO_ID, "infSeq": file_info["infSeq"], "fileSeq": file_info["fileSeq"]}
    )
    download_url = f"{BMS_FILE_DOWNLOAD}?{query}"
    content = request(opener, download_url)
    if not content.startswith(b"PK\x03\x04"):
        raise ValueError("BMS stop-order response is not a ZIP archive")
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        entries = [entry for entry in archive.infolist() if not entry.is_dir()]
        if len(entries) != 1:
            raise ValueError("Expected one CSV in BMS stop-order ZIP")
        with archive.open(entries[0]) as binary_stream:
            reader = csv.DictReader(io.TextIOWrapper(binary_stream, encoding="cp949", newline=""))
            headers = list(reader.fieldnames or [])
            rows = sum(1 for _ in reader)
    if not {"ROUTE_ID", "STTN_ORDR", "STTN_ID"}.issubset(headers):
        raise ValueError(f"Unexpected BMS stop-order headers: {headers}")
    return "경기도_BMS_노선_경유정류소_20230926.zip", content, {
        "officialPage": (
            "https://data.gg.go.kr/portal/data/service/selectServicePage.do"
            f"?infId={BMS_STOP_INFO_ID}&infSeq=1"
        ),
        "metadataUrl": metadata_url,
        "downloadUrl": download_url,
        "snapshotDate": "2023-09-26",
        "rowCount": rows,
        "zipEntryCount": len(entries),
        "encoding": "cp949",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", required=True, type=Path)
    args = parser.parse_args()
    cookie_jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie_jar))
    retrievals = []
    for fetcher in (fetch_headway, fetch_bms_route_map, fetch_bms_stop_order):
        filename, content, metadata = fetcher(opener)
        path, file_hash, action = preserve_raw(args.raw_dir.resolve(), filename, content)
        retrievals.append(
            {
                **metadata,
                "filename": path.name,
                "byteCount": len(content),
                "sha256": file_hash,
                "preservationAction": action,
            }
        )
    manifest = {
        "retrievedAtUtc": datetime.now(timezone.utc).isoformat(),
        "authentication": "none",
        "apiKeyUsed": False,
        "rawDirectory": ".",
        "files": retrievals,
        "notFetched": [
            {
                "dataset": "경기도_BMS 노선 경로이력",
                "reason": "268,567,781-byte full-province archive; metadata verified, not needed for the conservative stop-order crosscheck",
                "metadataByteCount": 268567781,
                "snapshotDate": "2025-10-31",
                "officialPage": "https://data.gg.go.kr/portal/data/service/selectServicePage.do?infId=B87V4OBIG76T6N59I3SM33067357&infSeq=1",
            }
        ],
    }
    manifest_path = args.raw_dir.resolve() / "official_bus_retrieval_manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
