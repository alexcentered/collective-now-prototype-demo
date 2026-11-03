#!/usr/bin/env python3
"""Validate the public snapshot and preserved original; optional live byte checks.

Standard library only. Run from any directory with Python 3.9 or newer.
This does not establish publication permission or organization-field accuracy.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import csv
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / 'review-2026-10'
ORIGINAL = '0732e2b22ec448ca8b24a8e244a8478faf857fb5'
LIVE = 'https://alexcentered.github.io/collective-now-prototype-demo/'
KINDS = {'artist', 'community', 'event', 'map', 'media', 'organization', 'resource'}
SOURCES = {'existing-directory', 'master-spreadsheet', 'airtable-directory', 'election-curation'}
LENSES = {'Environmental', 'Political', 'Social', 'Economic', 'Well-being'}
DOMAINS = {
    'Arts, Culture & Media', 'Community & Place', 'Economy, Ownership & Labor',
    'Education & Learning', 'Environment, Energy & Ecology',
    'Facilitation, Process & Dialogue', 'Food & Agriculture',
    'Governance, Democracy & Decision-Making', 'Health, Care & Healing',
    'Justice, Safety & Accountability', 'Land & Housing',
    'Movement-Building & Organizing', 'Technology & Digital Infrastructure',
}
FIELDS = {
    'slug', 'name', 'kind', 'summary', 'websiteUrl', 'city', 'state', 'region',
    'country', 'neighborhood', 'topics', 'imageUrl', 'imageKind', 'latitude',
    'longitude', 'domains', 'lenses', 'categoryStatus', 'sources', 'publisher',
    'note', 'verified', 'election', 'summaryAttribution', 'endsAt',
}
HEADERS = [
    'Name', 'Collection', 'Website', 'City', 'State', 'Country', 'Original tags',
    'AI Suggested — Detailed Taxonomy (13)', 'AI Suggested — Broad Taxonomy (5)',
    'Category review status', 'Sources',
]
EMAIL = re.compile(r'[\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,}')
PRIVATE_MARKERS = (
    'docs.google.com', 'drive.google.com', 'signal.group', 'chat.whatsapp',
    'access_token', 'ss_email_id', 'our connection', 'point person',
    'race/ethnicity of leadership', 'gender of leadership',
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()


def public_url(value, label):
    if not value:
        return
    parsed = urlparse(value)
    require(parsed.scheme in {'http', 'https'} and parsed.hostname, label + ': invalid public URL')
    require(not parsed.username and not parsed.password, label + ': URL contains credentials')
    require(not EMAIL.search(value), label + ': email address in URL')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', help='Compare deployed public files with this checkout')
    args = parser.parse_args()
    entries = json.loads((REVIEW / 'entries.json').read_text())
    original = json.loads((ROOT / 'entries.json').read_text())
    require(isinstance(entries, list) and entries, 'Review entries must be a nonempty array')
    require(len({e['slug'] for e in entries}) == len(entries), 'Duplicate review slug')
    for entry in entries:
        name = entry.get('slug', '<missing slug>')
        require(set(entry) <= FIELDS, name + ': unexpected public fields')
        require(bool(entry.get('slug')) and bool(entry.get('name')), name + ': missing identity')
        require(entry.get('kind') in KINDS, name + ': unknown collection')
        for field in ('topics', 'domains', 'lenses', 'sources'):
            require(isinstance(entry.get(field), list), name + ': ' + field + ' must be an array')
        require(set(entry['domains']) <= DOMAINS, name + ': unknown detailed domain')
        require(set(entry['lenses']) <= LENSES, name + ': unknown broad lens')
        require(set(entry['sources']) <= SOURCES and bool(entry['sources']), name + ': invalid source memberships')
        for field in ('websiteUrl', 'imageUrl'):
            public_url(entry.get(field), name + ': ' + field)
        for field, limit in (('latitude', 90), ('longitude', 180)):
            value = entry.get(field)
            require(value is None or (isinstance(value, (int, float)) and not isinstance(value, bool)
                                     and -limit <= value <= limit), name + ': invalid ' + field)
    for file in (REVIEW / 'entries.json', REVIEW / 'directory-review.csv'):
        text = file.read_text()
        require(not EMAIL.search(text), file.name + ': potential email disclosure')
        require(not any(marker in text.lower() for marker in PRIVATE_MARKERS), file.name + ': private-data marker')
    with (REVIEW / 'directory-review.csv').open(newline='') as handle:
        rows = list(csv.reader(handle))
    require(rows[0] == HEADERS, 'Unexpected CSV headers')
    require(all(len(row) == len(HEADERS) for row in rows[1:]), 'Inconsistent CSV row shape')
    require(Counter(row[0] for row in rows[1:]) == Counter(e['name'] for e in entries), 'CSV/runtime names or counts differ')
    manifest = json.loads((ROOT / 'assets/manifest.json').read_text())
    assets = [ROOT / path.removeprefix('./') for path in manifest.values()]
    assets += [REVIEW / 'media' / name for name in
               ('community-logos.webp', 'election-risk-map.webp', 'federal-interference.webp')]
    require(all(path.is_file() for path in assets), 'Missing local artwork')
    baseline_files = git('ls-tree', '-r', '--name-only', ORIGINAL).splitlines()
    require(baseline_files, 'Missing original baseline; use a full-history Git clone')
    diff = git('diff', '--name-only', ORIGINAL, '--', *baseline_files)
    require(not diff, 'Original snapshot changed: ' + diff)
    print('PASS: {} review entries, {} CSV rows, {} focused resources; public schema/URLs, taxonomy and local artwork'.format(
        len(entries), len(rows) - 1, sum(e.get('election') is True for e in entries)))
    print('PASS: {} original entries; {} original files unchanged from {}'.format(len(original), len(baseline_files), ORIGINAL[:7]))
    if args.live:
        review_files = ['index.html', 'app.js', 'review.css', 'entries.json', 'directory-review.csv',
                        'media/community-logos.webp', 'media/election-risk-map.webp', 'media/federal-interference.webp']
        files = ['review-2026-10/' + name for name in review_files]
        files += ['index.html', 'app.js', 'styles.css', 'match.css', 'entries.json', 'assets/manifest.json']

        def check_live(name):
            with urlopen(LIVE + name, timeout=30) as response:
                remote = response.read()
                require(response.status == 200, name + ': HTTP error')
            require(remote == (ROOT / name).read_bytes(), name + ': live bytes differ from this checkout')

        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(check_live, files))
        print('PASS: {} deployed files exactly match this checkout (review + original entry points)'.format(len(files)))
    print('Privacy markers are a limited regression check, not a substitute for source/publication review.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError) as exc:
        print('FAIL: ' + str(exc), file=sys.stderr)
        sys.exit(1)
