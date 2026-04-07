#!/usr/bin/env python3
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from distribution_common import load_config


def main() -> None:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    scopes = ['https://www.googleapis.com/auth/webmasters']
    if len(sys.argv) > 1:
        creds_path = sys.argv[1]
        site_url = sys.argv[2]
        sitemap_urls = sys.argv[3:]
        creds = service_account.Credentials.from_service_account_file(creds_path, scopes=scopes)
        service = build('searchconsole', 'v1', credentials=creds)
        for sitemap_url in sitemap_urls:
            print(f'Submitting sitemap: {site_url} <- {sitemap_url}')
            service.sitemaps().submit(siteUrl=site_url, feedpath=sitemap_url).execute()
            print('OK')
        return

    config = load_config()
    creds_path = config['gsc'].get('credentials_path', '').strip()
    if not creds_path:
        raise SystemExit('ERROR: Missing gsc.credentials_path in distribution.config.json')
    creds = service_account.Credentials.from_service_account_file(creds_path, scopes=scopes)
    service = build('searchconsole', 'v1', credentials=creds)
    for job in config['gsc'].get('sites', []):
        site_url = job['site_url']
        for sitemap_url in job.get('sitemaps', []):
            print(f'Submitting sitemap: {site_url} <- {sitemap_url}')
            service.sitemaps().submit(siteUrl=site_url, feedpath=sitemap_url).execute()
            print('OK')


if __name__ == '__main__':
    main()
