// The visible search-intelligence repair block, in ONE place.
//
// scripts/search_intelligence/apply_repairs.mjs mints these blocks during the
// measurement cycle and records them in data/search_intelligence/repair_ledger.json.
// scripts/search_intelligence/reapply_ledgered_blocks.mjs puts them back when a
// full page rebuild has dropped them. Those two must produce byte-identical
// markup or the rebuild would "repair" a page into a diff against the committed
// tree, so the template lives here and neither side carries a copy of it.
export const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export const repairMarker = (repairId) => `data-search-intelligence-repair="${repairId}"`;

export function repairBlockHtml(row) {
  const comps = (row.competitor_domains || []).slice(0, 3).map(esc);
  const comparison = comps.length
    ? ` Search observations also referenced ${comps.join(', ')}; this page therefore clarifies the owned Spry/BHPC approach without claiming a numerical search rank.`
    : '';
  const body = esc(row.current_description || row.current_title || 'This page explains the relevant Spry Executive OS framework and the practical decision it supports.');
  return `<section class="search-intelligence-repair" ${repairMarker(row.repair_id)}><h2>${esc(row.query)}</h2><p>${body} ${comparison}</p><p><strong>Decision use:</strong> use the framework on this page to compare the problem, the operating constraint, and the next executable action before adding another tool or reset.</p></section>`;
}

// Inside </main> when the page has one, otherwise inside </body>. Returns the
// input unchanged when neither anchor exists, so the caller can tell that the
// page could not take the block instead of silently writing nothing.
export function insertRepairBlock(html, block) {
  const withMain = html.replace(/<\/main>/i, `${block}</main>`);
  if (withMain !== html) return withMain;
  return html.replace(/<\/body>/i, `${block}</body>`);
}
