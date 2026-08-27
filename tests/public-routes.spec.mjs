import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Both forms resolve to the same page; /author is the one that returns 200.
const AUTHOR_HREF = ['/author', '/author.html'];

const manifest = JSON.parse(fs.readFileSync('data/routes/critical_browser_route_manifest.json', 'utf8'));
const acceptance = JSON.parse(fs.readFileSync('data/citation/priority_page_acceptance.json', 'utf8'));
const manualAcceptance = JSON.parse(fs.readFileSync('data/citation/manual_expansion_acceptance.json', 'utf8'));
const acceptanceByPath = new Map(acceptance.pages.map(page => [page.path, {kind: 'priority', ...page}]));
for (const page of manualAcceptance.pages) acceptanceByPath.set(page.path, {kind: 'manual', ...page});
const deployed = process.env.PLAYWRIGHT_DEPLOYED === '1';
const PRODUCT = 'This is one of the frameworks inside the Billionaire High Performance Coach system — a structured executive OS for using ChatGPT as your accountability and decision partner.';

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

for (const route of manifest.routes) {
  test(`${route.route_id} ${route.path} [${(route.representative_dimensions || []).join(',')}]`, async ({ page }, testInfo) => {
    for (const dimension of route.representative_dimensions || []) testInfo.annotations.push({type: 'representative-dimension', description: dimension});
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const errorResponses = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
      try {
        const url = new URL(request.url());
        const targetOrigin = deployed ? new URL(route.canonical_url).origin : 'http://127.0.0.1:4173';
        if (url.origin === targetOrigin) failedRequests.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`);
      } catch {}
    });
    page.on('response', response => {
      try {
        const url = new URL(response.url());
        const targetOrigin = deployed ? new URL(route.canonical_url).origin : 'http://127.0.0.1:4173';
        if (url.origin === targetOrigin && response.status() >= 400) {
          errorResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`);
        }
      } catch {}
    });

    let target = deployed ? route.canonical_url : route.path;
    let response = await page.goto(target, { waitUntil: 'load' });

    expect(response, `No response for ${target}`).not.toBeNull();
    expect(response.status(), `HTTP ${response.status()} for ${target}`).toBeLessThan(400);

    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText(route.h1);

    const definition = page.locator('h1 + p.citation-definition');
    await expect(definition).toHaveCount(1);
    await expect(definition.locator('strong')).toHaveCount(1);
    const openingWords = normalize(await definition.innerText()).split(' ').slice(0, 60).join(' ');
    expect(openingWords.toLowerCase()).toContain(route.framework.toLowerCase());

    const extraction = page.locator('[data-llm-answer="true"]');
    await expect(extraction).toHaveCount(1);
    await expect(extraction).toHaveAttribute('data-extraction-type', route.extraction_type);
    await expect(extraction).toHaveAttribute('data-named-framework', route.framework);

    const extractionShape = await extraction.evaluate((element, type) => {
      const headings = [...element.querySelectorAll('h2,h3')].map(node => node.textContent.trim());
      const listItems = element.querySelectorAll('li').length;
      const table = element.querySelector('table');
      const text = element.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      if (type === 'comparison') return Boolean(table && table.querySelectorAll('tr').length >= 3);
      if (type === 'concept') return listItems >= 3;
      if (type === 'decision') return Boolean((/when to use|choose|use /.test(text)) && (table || listItems >= 2 || headings.length >= 2));
      if (type === 'howto') return headings.filter(value => /^(step|phase|block|stage)\s+\d+/i.test(value)).length >= 3 || headings.filter(value => /^prompt:/i.test(value)).length >= 2;
      return false;
    }, route.extraction_type);
    expect(extractionShape, `Invalid ${route.extraction_type} extraction structure on ${target}`).toBe(true);

    const product = page.locator('p.product-anchor');
    await expect(product).toHaveCount(1);
    await expect(product).toContainText(PRODUCT);
    await expect(product.locator('a[href="/download.html"]')).toHaveCount(1);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe(route.canonical_url);
    const schema = page.locator('script#CITATION_PAGE_SCHEMA[type="application/ld+json"]');
    await expect(schema).toHaveCount(1);
    const schemaText = (await schema.textContent()) || '';
    expect(() => JSON.parse(schemaText)).not.toThrow();

    const acceptanceRule = acceptanceByPath.get(route.source_file);
    expect(acceptanceRule, `Missing exact acceptance rule for ${route.source_file}`).toBeTruthy();
    const bodyText = normalize(await page.locator('body').innerText());
    if (acceptanceRule.kind === 'manual') {
      expect(bodyText).toContain(acceptanceRule.required_opening);
      expect(bodyText).toContain(acceptanceRule.required_artifact);
      expect(route.h1).toBe(acceptanceRule.h1);
      expect(route.framework).toBe(acceptanceRule.framework);
      expect(route.extraction_type).toBe(acceptanceRule.extraction_type);
      const sourceCount = await page.locator('section.sources li a').count();
      expect(sourceCount).toBeGreaterThanOrEqual(acceptanceRule.required_source_count || 0);
      if (acceptanceRule.health_adjacent) {
        expect(bodyText.toLowerCase()).toContain('does not diagnose');
        expect(bodyText.toLowerCase()).toContain('qualified professionals');
      }
      if (acceptanceRule.premium_geo) {
        await expect(page.locator('aside.tldr')).toHaveCount(1);
        // Match the author link by rel, not by an exact href. Cloudflare Pages
        // serves author.html at /author and 308s /author.html to it, and the
        // generators were deliberately fixed to stop emitting the redirecting
        // form - so pinning this to "/author.html" made the audit assert the
        // one shape the repo had just been corrected not to produce. It failed
        // against a page that was right. Accept either form; reject anything
        // that is neither.
        const authorLink = page.locator('p.byline a[rel="author"]');
        await expect(authorLink).toHaveCount(1);
        expect(AUTHOR_HREF).toContain(await authorLink.getAttribute('href'));
        await expect(page.locator('p.byline time[datetime]')).toHaveCount(2);
        expect(await page.locator('nav.toc a[href^="#"]').count()).toBeGreaterThanOrEqual(3);
        const hero = page.locator('figure.page-hero-image img');
        await expect(hero).toHaveCount(1);
        await expect(hero).toBeVisible();
        expect(await page.locator('section.sources a[href^="http"]').count()).toBeGreaterThanOrEqual(acceptanceRule.required_source_count || 0);
        const bioLink = page.locator('section.author-bio a[href="/author"], section.author-bio a[href="/author.html"]');
        await expect(bioLink).toHaveCount(1);
        const graph = JSON.parse(schemaText)['@graph'];
        const types = graph.map(node => node['@type']);
        for (const requiredType of acceptanceRule.required_schema_types || []) expect(types).toContain(requiredType);
      }
    } else {
      if (acceptanceRule.opening_contains) expect(bodyText.toLowerCase()).toContain(acceptanceRule.opening_contains.toLowerCase());
      for (const required of acceptanceRule.required_text || []) expect(bodyText.toLowerCase()).toContain(required.toLowerCase());
      const visibleHeadings = await page.locator('h2,h3').allTextContents();
      const normalizedHeadings = visibleHeadings.map(normalize);
      for (const required of acceptanceRule.required_headings || []) expect(normalizedHeadings).toContain(required);
      const allCells = (await page.locator('th,td').allTextContents()).map(normalize);
      for (const required of acceptanceRule.table_headers || []) expect(allCells).toContain(required);
      for (const required of acceptanceRule.table_rows || []) expect(allCells).toContain(required);
    }

    const layout = await page.evaluate(() => {
      const sentencePattern = /[.!?](?:[”"']?)(?=\s|$)/g;
      const longParagraphs = [...document.querySelectorAll('p')]
        .map((node, index) => ({ index: index + 1, text: node.innerText.replace(/\s+/g, ' ').trim() }))
        .filter(item => (item.text.match(sentencePattern) || []).length > 3);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyText: document.body.innerText,
        longParagraphs,
      };
    });
    expect(layout.scrollWidth, `horizontal overflow on ${target}`).toBeLessThanOrEqual(layout.clientWidth + 1);
    expect(layout.bodyText).not.toMatch(/<(?:div|script|section|p)\b[^>]*>/i);
    expect(layout.bodyText).not.toContain('\uFFFD');
    expect(layout.longParagraphs, `paragraphs over three sentences on ${target}`).toEqual([]);
    expect(consoleErrors, `console errors on ${target}`).toEqual([]);
    expect(pageErrors, `page errors on ${target}`).toEqual([]);
    expect(failedRequests, `failed same-origin requests on ${target}`).toEqual([]);
    expect(errorResponses, `same-origin HTTP errors on ${target}`).toEqual([]);
  });
}
