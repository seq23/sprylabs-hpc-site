#!/usr/bin/env python3
"""Prove the GSC export can tell an empty response from a fully filtered one.

The defect: the export recorded only the POST-filter list length as ``row_count``.
Case A below (Google returned nothing) and case B (Google returned 69 rows, none
of which are in the 120-phrase target set) both produce ``row_count: 0``. Under
the old shape those two are byte-identical in every number that was written down,
which is how a property serving 895 impressions was read downstream as an
unindexed site.

This runs the real ``summarize`` against fixtures - no credentials, no network -
and asserts that the two cases are now distinguishable, and that the discard is
recorded rather than silent.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from gsc_search_analytics import summarize  # noqa: E402

SITE = 'sc-domain:spryexecutiveos.com'
TARGETS = {'accountability partner vs traditional coaching for athletes'}


def api_row(query, impressions, clicks=0):
    return {'keys': [query, f'https://spryexecutiveos.com/{query.replace(" ", "-")}'],
            'clicks': clicks, 'impressions': impressions, 'ctr': 0.0, 'position': 62.7}


errors = []

# Case A - the provider genuinely returned nothing.
empty = summarize([], TARGETS, SITE, '2026-05-26', '2026-08-23', '2026-08-28')

# Case B - the provider returned the 69 queries Google actually measured, and the
# target set matches none of them. This is the production condition.
measured = [api_row(f'real query {i}', 13) for i in range(69)]
measured[0]['clicks'] = 1
filtered = summarize(measured, TARGETS, SITE, '2026-05-26', '2026-08-23', '2026-08-28')

# Case C - one target actually matched.
hit = summarize(measured + [api_row('Accountability Partner Vs Traditional Coaching For Athletes', 40, 1)],
                TARGETS, SITE, '2026-05-26', '2026-08-23', '2026-08-28')

# The old shape could not separate A from B.
if empty['row_count'] != filtered['row_count']:
    errors.append('fixture error: the two cases should agree on the post-filter count')
if empty['raw_row_count'] == filtered['raw_row_count']:
    errors.append('raw_row_count does not separate an empty response from a fully filtered one')

checks = [
    ('empty.raw_row_count', empty['raw_row_count'], 0),
    ('empty.row_count', empty['row_count'], 0),
    ('empty.filter_discarded_every_row', empty['target_query_filter']['filter_discarded_every_row'], False),
    ('filtered.raw_row_count', filtered['raw_row_count'], 69),
    ('filtered.row_count', filtered['row_count'], 0),
    ('filtered.rows_discarded', filtered['target_query_filter']['rows_discarded'], 69),
    ('filtered.discarded_impressions', filtered['target_query_filter']['discarded_impressions'], 69 * 13),
    ('filtered.discard_ratio', filtered['target_query_filter']['discard_ratio'], 1.0),
    ('filtered.filter_discarded_every_row', filtered['target_query_filter']['filter_discarded_every_row'], True),
    ('hit.raw_row_count', hit['raw_row_count'], 70),
    ('hit.row_count', hit['row_count'], 1),
    ('hit.rows_discarded', hit['target_query_filter']['rows_discarded'], 69),
    ('hit.filter_discarded_every_row', hit['target_query_filter']['filter_discarded_every_row'], False),
]
for name, got, want in checks:
    if got != want:
        errors.append(f'{name}: expected {want!r}, got {got!r}')

# The discard has to be inspectable, not just counted, or nobody can tell what was
# thrown away. It is capped so a 25,000-row response cannot bloat the export.
sample = filtered['target_query_filter']['discarded_sample']
if not sample:
    errors.append('discarded_sample is empty; the discard is still invisible')
if len(sample) > filtered['target_query_filter']['discarded_sample_limit']:
    errors.append('discarded_sample exceeds its own limit')
if sample and sample[0]['impressions'] < sample[-1]['impressions']:
    errors.append('discarded_sample is not ordered by impressions')
# The case-insensitive match must still work, or the fix would have changed what is measured.
if hit['rows'] and hit['rows'][0]['query'].lower() not in TARGETS:
    errors.append('case-insensitive target matching regressed')

report = {
    'schema_version': '1.0',
    'status': 'FAIL' if errors else 'PASS',
    'old_shape_was_ambiguous': {
        'empty_response_row_count': empty['row_count'],
        'fully_filtered_row_count': filtered['row_count'],
        'indistinguishable_under_old_shape': empty['row_count'] == filtered['row_count'],
    },
    'new_shape_separates_them': {
        'empty_response_raw_row_count': empty['raw_row_count'],
        'fully_filtered_raw_row_count': filtered['raw_row_count'],
        'fully_filtered_discarded_impressions': filtered['target_query_filter']['discarded_impressions'],
    },
    'errors': errors,
}
out = ROOT / 'artifacts/validation/search-gsc-export-counts-self-test.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
sys.exit(1 if errors else 0)
