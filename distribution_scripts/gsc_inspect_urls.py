#!/usr/bin/env python3
from __future__ import annotations
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
sys.path.insert(0, str(Path(__file__).resolve().parent))
from distribution_common import load_config, read_urls


def inspect_single_mode(args: list[str]) -> None:
    creds_path, site_url, url_file, output_json = args
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    scopes = ['https://www.googleapis.com/auth/webmasters.readonly']
    creds = service_account.Credentials.from_service_account_file(creds_path, scopes=scopes)
    service = build('searchconsole', 'v1', credentials=creds)
    urls = read_urls(url_file)
    results = []
    for url in urls:
        body = {'inspectionUrl': url, 'siteUrl': site_url, 'languageCode': 'en-US'}
        results.append(service.urlInspection().index().inspect(body=body).execute())
    Path(output_json).write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(f'Wrote {len(results)} inspection results to {output_json}')


def main() -> None:
    if len(sys.argv) == 5:
        inspect_single_mode(sys.argv[1:])
        return
    config = load_config()
    creds_path = config['gsc'].get('credentials_path', '').strip()
    if not creds_path:
        raise SystemExit('ERROR: Missing gsc.credentials_path in distribution.config.json')
    priority_file = config['inspection']['priority_file']
    output_dir = Path(config['inspection']['output_dir'])
    output_dir.mkdir(parents=True, exist_ok=True)
    urls = read_urls(priority_file)
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    scopes = ['https://www.googleapis.com/auth/webmasters.readonly']
    creds = service_account.Credentials.from_service_account_file(creds_path, scopes=scopes)
    service = build('searchconsole', 'v1', credentials=creds)
    for job in config['gsc'].get('sites', []):
        host = job['host']
        site_url = job['site_url']
        host_urls = [u for u in urls if urlparse(u).netloc.lower() == host.lower()]
        if not host_urls:
            continue
        results = []
        for url in host_urls:
            body = {'inspectionUrl': url, 'siteUrl': site_url, 'languageCode': 'en-US'}
            results.append(service.urlInspection().index().inspect(body=body).execute())
        out = output_dir / f'{host}.json'
        out.write_text(json.dumps(results, indent=2), encoding='utf-8')
        print(f'Wrote {len(results)} inspection results to {out}')


if __name__ == '__main__':
    main()
