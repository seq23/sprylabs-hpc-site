#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from google.oauth2 import service_account
from googleapiclient.discovery import build


def load_urls(path: Path) -> list[str]:
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip().startswith(("http://", "https://"))]


def main() -> int:
    if len(sys.argv) != 5:
        print("Usage: gsc_inspect_urls.py <service-account.json> <siteUrl> <urlFile> <outputJson>")
        return 1

    creds_path = sys.argv[1]
    site_url = sys.argv[2]
    url_file = Path(sys.argv[3])
    output_json = Path(sys.argv[4])

    scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]
    creds = service_account.Credentials.from_service_account_file(creds_path, scopes=scopes)
    service = build("searchconsole", "v1", credentials=creds)

    results = []
    for url in load_urls(url_file):
        print(f"Inspecting: {url}")
        resp = service.urlInspection().index().inspect(body={
            "inspectionUrl": url,
            "siteUrl": site_url,
            "languageCode": "en-US",
        }).execute()
        results.append(resp)

    output_json.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"Wrote {len(results)} inspection results to {output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
