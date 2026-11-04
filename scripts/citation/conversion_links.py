"""Recognize the manual destination independently of its visible link wording."""
from html.parser import HTMLParser
from urllib.parse import urlsplit


def is_manual_link(href):
    try:
        url = urlsplit(href or '')
        return url.path == '/download.html' and (
            (not url.scheme and not url.netloc and str(href).startswith('/'))
            or (url.scheme == 'https' and url.netloc == 'billionairehighperformancecoach.com')
        )
    except ValueError:
        return False


def has_manual_link(raw):
    class Links(HTMLParser):
        found = False

        def handle_starttag(self, tag, attrs):
            if tag == 'a' and is_manual_link(dict(attrs).get('href')):
                self.found = True

    links = Links(convert_charrefs=True)
    links.feed(raw)
    return links.found
