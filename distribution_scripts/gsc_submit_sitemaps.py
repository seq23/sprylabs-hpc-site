#!/usr/bin/env python3
import sys
from google.oauth2 import service_account
from googleapiclient.discovery import build


def main() -> int:
    if len(sys.argv) < 4:
        print("Usage: gsc_submit_sitemaps.py <service-account.json> <siteUrl> <sitemapUrl1> [sitemapUrl2 ...]")
        return 1

    creds_path = sys.argv[1]
    site_url = sys.argv[2]
    sitemap_urls = sys.argv[3:]

    scopes = ["https://www.googleapis.com/auth/webmasters"]
    creds = service_account.Credentials.from_service_account_file(creds_path, scopes=scopes)
    service = build("searchconsole", "v1", credentials=creds)

    for sitemap_url in sitemap_urls:
        print(f"Submitting sitemap: {sitemap_url}")
        service.sitemaps().submit(siteUrl=site_url, feedpath=sitemap_url).execute()
        print("OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
