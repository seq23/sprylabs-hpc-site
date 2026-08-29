#!/usr/bin/env python3
"""Export Google Search Console Search Analytics rows for one property.

Why the counts below exist
--------------------------
This script asks GSC for every query/page row in the window, then keeps only the
rows whose query is an exact case-insensitive match against the target query set.
The filter is intentional - the search-intelligence lane reasons about targets -
but for a long time the only number written out was the length of the POST-filter
list, under the name ``row_count``.

That made two completely different situations indistinguishable downstream:

  * Google returned nothing, and
  * Google returned a full response, none of which matched our targets.

Both wrote ``row_count: 0``, and the lane reported healthy. The property was in
fact serving 895 impressions across 69 queries; the target set simply had zero
overlap with them, so every single row was discarded in silence.

So the export now records the raw API response size alongside the filtered size,
plus what the filter actually did to it and a bounded sample of the highest
impression queries it threw away. ``row_count`` keeps its original meaning
(post-filter) so nothing downstream shifts under it.
"""
import json
import sys
from datetime import date, timedelta

DISCARDED_SAMPLE_LIMIT = 25


def summarize(raw, queries, site, start, end, collected_at):
    """Split a raw Search Analytics response into kept rows and a visible discard.

    Split out so the counting can be self-tested without credentials or a network
    call - the defect being guarded here is a counting defect, not an API one.
    """
    rows = []
    discarded = []
    raw_impressions = 0
    raw_clicks = 0
    raw_queries = set()
    matched_queries = set()

    for r in raw:
        keys = r.get('keys') or ['', '']
        q = keys[0]
        page = keys[1] if len(keys) > 1 else ''
        impressions = r.get('impressions', 0) or 0
        clicks = r.get('clicks', 0) or 0
        raw_impressions += impressions
        raw_clicks += clicks
        raw_queries.add(q.lower())
        if q.lower() not in queries:
            discarded.append({'query': q, 'page': page, 'clicks': clicks, 'impressions': impressions})
            continue
        matched_queries.add(q.lower())
        rows.append({'site_url': site, 'query': q, 'page': page, 'clicks': clicks,
                     'impressions': impressions, 'ctr': r.get('ctr', 0),
                     'gsc_average_position': r.get('position')})

    discarded.sort(key=lambda d: (-d['impressions'], -d['clicks'], d['query']))

    return {
        'provider': 'google_search_console',
        'site_url': site,
        'start_date': str(start),
        'end_date': str(end),
        'collected_at': collected_at,
        # Pre-filter: what Google actually returned. Zero here means the property
        # returned no data. Non-zero with row_count 0 means the target set missed.
        'raw_row_count': len(raw),
        'raw_distinct_query_count': len(raw_queries),
        'raw_impressions': raw_impressions,
        'raw_clicks': raw_clicks,
        # Post-filter: unchanged meaning, kept so downstream consumers do not shift.
        'row_count': len(rows),
        'target_query_filter': {
            'target_query_count': len(queries),
            'rows_in': len(raw),
            'rows_matched': len(rows),
            'rows_discarded': len(discarded),
            'distinct_queries_matched': len(matched_queries),
            'discarded_impressions': sum(d['impressions'] for d in discarded),
            'discarded_clicks': sum(d['clicks'] for d in discarded),
            'discard_ratio': (len(discarded) / len(raw)) if raw else 0,
            'filter_discarded_every_row': bool(raw) and not rows,
            'discarded_sample_limit': DISCARDED_SAMPLE_LIMIT,
            'discarded_sample': discarded[:DISCARDED_SAMPLE_LIMIT],
        },
        'rows': rows,
    }


def main():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    if len(sys.argv) != 5:
        print('usage: gsc_search_analytics.py <service-account.json> <site-url> <target-query-json> <output-json>')
        sys.exit(2)
    cred, site, target_path, out = sys.argv[1:]

    targets = json.load(open(target_path)).get('targets', [])
    queries = {str(t.get('query', '')).lower() for t in targets}

    creds = service_account.Credentials.from_service_account_file(
        cred, scopes=['https://www.googleapis.com/auth/webmasters.readonly'])
    svc = build('searchconsole', 'v1', credentials=creds, cache_discovery=False)

    end = date.today() - timedelta(days=2)
    start = end - timedelta(days=27)
    body = {'startDate': str(start), 'endDate': str(end), 'dimensions': ['query', 'page'],
            'rowLimit': 25000, 'dataState': 'final'}
    resp = svc.searchanalytics().query(siteUrl=site, body=body).execute()

    payload = summarize(resp.get('rows', []) or [], queries, site, start, end, date.today().isoformat())
    json.dump(payload, open(out, 'w'), indent=2)
    f = payload['target_query_filter']
    print(f"wrote {payload['row_count']} GSC rows for {site} "
          f"(raw={payload['raw_row_count']} rows / {payload['raw_distinct_query_count']} queries / "
          f"{payload['raw_impressions']} impressions; discarded_by_target_filter={f['rows_discarded']})")


if __name__ == '__main__':
    main()
