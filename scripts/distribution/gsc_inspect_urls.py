#!/usr/bin/env python3
import datetime as dt
import json
import socket
import sys
import time
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

def load_urls(path):
    urls = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("http://") or line.startswith("https://"):
                urls.append(line)
    return urls

def main():
    if len(sys.argv) != 5:
        print("Usage: gsc_inspect_urls.py <service-account.json> <siteUrl> <urlFile> <outputJson>")
        sys.exit(1)

    creds_path = sys.argv[1]
    site_url = sys.argv[2]
    url_file = sys.argv[3]
    output_json = sys.argv[4]

    scopes = ["https://www.googleapis.com/auth/webmasters.readonly"]
    creds = service_account.Credentials.from_service_account_file(creds_path, scopes=scopes)
    service = build("searchconsole", "v1", credentials=creds)

    urls = load_urls(url_file)
    results = []
    failed = []

    # Google's URL Inspection API is rate-limited and intermittently slow. A single
    # read timeout used to raise straight out of this loop and, under `bash -e`,
    # fail a deploy that had ALREADY SUCCEEDED. Inspection is telemetry, not
    # deployment: a URL that cannot be inspected is recorded as such and the run
    # continues. Total failure still fails loudly (see the exit below).
    socket.setdefaulttimeout(60)
    ATTEMPTS = 3

    for url in urls:
        print(f"Inspecting: {url}")
        body = {
            "inspectionUrl": url,
            "siteUrl": site_url,
            "languageCode": "en-US"
        }
        last = None
        for attempt in range(1, ATTEMPTS + 1):
            try:
                resp = service.urlInspection().index().inspect(body=body).execute()
                # The API response does not echo the URL that was inspected, so a bare
                # list of responses cannot be attributed back to its URLs. Pairing them
                # here is what makes the verdicts persistable at all.
                results.append({"url": url, "inspection": resp})
                last = None
                break
            except Exception as exc:                      # noqa: BLE001 - transport agnostic
                last = f"{type(exc).__name__}: {exc}"
                if attempt < ATTEMPTS:
                    backoff = 2 ** attempt
                    print(f"  attempt {attempt}/{ATTEMPTS} failed ({last}); retrying in {backoff}s")
                    time.sleep(backoff)
        if last is not None:
            print(f"  NOT INSPECTED after {ATTEMPTS} attempts: {last}")
            failed.append({"url": url, "error": last})

    payload = {
        "provider": "google_search_console_url_inspection",
        "site_url": site_url,
        "collected_at": dt.date.today().isoformat(),
        "requested_url_count": len(urls),
        "inspected_count": len(results),
        "not_inspected": failed,
        "results": results,
    }
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"Wrote {len(results)} inspection results to {output_json}")
    if failed:
        print(f"[gsc-inspect] PARTIAL: {len(results)}/{len(urls)} inspected; "
              f"{len(failed)} not inspected and recorded in the payload")
    # Rule 0: never exit 0 having done nothing. Some inspected is a real result;
    # none inspected when URLs were requested is a genuine failure, not a blip.
    if urls and not results:
        print(f"[gsc-inspect] FAIL: 0 of {len(urls)} URLs could be inspected")
        sys.exit(1)

if __name__ == "__main__":
    main()
