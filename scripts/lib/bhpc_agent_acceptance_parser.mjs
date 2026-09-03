import {slug} from '../agent_intake/bhpc_agent_common.mjs';
import {
  BHPC_AGENT_BLOCK_TYPES,
  blockTypesForAgentText,
  requiredBlockTypesForPageFamily
} from './bhpc_agent_block_schema.mjs';
import {resolveBhpcAgentRoute} from './bhpc_agent_route_resolver.mjs';
import {partitionBhpcInternalLinkActions, deriveBhpcInternalLinkActionsFromText, deriveBhpcInternalLinkActionsFromNavigation, normalizeBhpcInternalLinkHref} from './bhpc_internal_links.mjs';
import {mergeBhpcExternalCtaLinks} from './bhpc_conversion_contract.mjs';
import {cleanBhpcReaderHeading, isPublishableBhpcReaderQuestion} from './bhpc_agent_reader_questions.mjs';

function clean(value=''){return String(value??'').replace(/\s+/g,' ').trim()}
function unique(values=[]){const seen=new Set(),out=[];for(const raw of values){const value=clean(raw);const key=value.toLowerCase();if(value&&!seen.has(key)){seen.add(key);out.push(value)}}return out}
function meaningfulSegments(value=''){
  return String(value||'').split(/\|\||[\r\n]+/).map(clean).filter(value=>value&&!/^(?:n\/?a|none|null|unknown)$/i.test(value));
}
function actionableInstruction(value='',query=''){
  const segments=meaningfulSegments(value);
  const action=segments.slice().reverse().find(segment=>/^(?:add|create|include|publish|build|replace|define|link|insert|rewrite|expand|clarify)\b/i.test(segment));
  return clean(action||segments.at(-1)||query);
}
// An audit row often names the heading it wants and then describes the shape it
// wants underneath it: "Add H2 titled 'The 3-Part Email System with H3s for
// Filter Batch and Triage each with 2-3 sentence definitions'". Only the first
// half is a heading. Carrying the rest through made every consumer treat the
// layout brief as subject matter - the applier published it as an <h2> and as a
// "Related reader questions" entry, and the acceptance validator then required
// that text to stay visible, which is why it survived on live pages.
export const stripBhpcHeadingLayoutBrief = cleanBhpcReaderHeading;

export function deriveBhpcRequiredHeading(fix='',query=''){
  const segments=meaningfulSegments(fix);
  for(const segment of segments.slice().reverse()){
    const named=segment.match(/(?:titled|called|named)\s*["“”']?([^"“”'.;|]{4,140})/i);
    if(named) return stripBhpcHeadingLayoutBrief(clean(named[1])).slice(0,180);
    if(/(?:h2|h3|heading|section|callout|boxed quote)/i.test(segment)){
      const quoted=[...segment.matchAll(/["“”'`]([^"“”'`]{4,180})["“”'`]/g)].map(match=>clean(match[1])).filter(Boolean);
      if(quoted.length) return stripBhpcHeadingLayoutBrief(quoted.at(-1)).slice(0,180);
      const subject=segment.match(/(?:defining|about|for|matching)\s+(?:the\s+)?([^.;|]{4,140}?)(?:\s+(?:under|after|before|to improve|on the page)|$)/i);
      if(subject) return stripBhpcHeadingLayoutBrief(clean(subject[1])).slice(0,180);
    }
  }
  return clean(query).slice(0,180);
}
function deriveSelfHref(implementationPath=''){
  return normalizeBhpcInternalLinkHref(`https://spryexecutiveos.com/${String(implementationPath||'').replace(/^\/+/,'')}`);
}
function tableColumns(types=[]){return types.includes(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE)?['Decision criterion','Spry/BHPC system','Other coaching or software option']:[]}
function minimumRows(types=[]){return types.includes(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE)?4:0}

export function buildBhpcAcceptanceEntry(row={},context={}){
  const query=clean(row.query||row.title||'BHPC agent signal');
  const seo=row.seo_execution||null;
  const rawFix=clean(seo?.exact_edit||row.fix_recommendation||row.recommendation||row.gap||row.why_worth_building||query);
  const fix=actionableInstruction(rawFix,query);
  const gap=clean((seo?.on_page_failures||[]).join('; ')||row.gap||row.issue||row.finding||'');
  const combined=[query,rawFix,gap,row.primary_fix_type,row.action_tier,seo?.canonical_page_type,seo?.competitor_format_gap].map(clean).join(' ');
  const route=resolveBhpcAgentRoute(row,context);
  const noAction=row.operation==='NO_ACTION_MAINTAIN'||row.page_decision==='no_action';
  const {internal: partitionedInternalLinkActions, external_ctas: partitionedExternalCtaActions, rejected: partitionedRejections} = partitionBhpcInternalLinkActions(seo?.internal_link_actions || []);
  // A link action pointing at the very page being edited cannot be rendered as a
  // related-page link, so requiring it guarantees a failure no applier run can
  // clear. These arrive when the artifact asks for a link FROM some other page
  // (its from_url) TO this one and the route resolver lands on the target.
  // Record it as rejected - the same channel every other unusable action uses -
  // instead of leaving an unsatisfiable requirement standing.
  const selfLinkHref = route.implementation_path
    ? deriveSelfHref(route.implementation_path)
    : '';
  const structuredInternalLinkActions = partitionedInternalLinkActions.filter(action => action.normalized_internal_href !== selfLinkHref);
  const selfReferentialLinkActions = partitionedInternalLinkActions.filter(action => action.normalized_internal_href === selfLinkHref)
    .map(action => ({...action, rejected_reason: 'self_referential_link_action'}));
  // The conversion contract declares a purchase CTA for high-intent routes, and
  // the plan has always merged it into the spec. Nothing rendered it: the applier
  // emits external CTA links only inside a cta_callout block, and the block was
  // only required when the artifact itself supplied an external action. So on a
  // high-intent page whose artifact supplied none, the plan declared the purchase
  // link and the page never got one. Attach the contract CTA where the
  // requirement is actually read, so the block that carries it is required too.
  const externalCtaActions = route.implementation_path === 'download.html'
    ? partitionedExternalCtaActions
    : mergeBhpcExternalCtaLinks(partitionedExternalCtaActions, route.implementation_path);
  const rejectedInternalLinkActions = [...partitionedRejections, ...selfReferentialLinkActions];
  // An artifact that states its link targets in prose rather than in
  // seo_execution.internal_link_actions used to have those targets dropped on the
  // floor while the words still triggered the internal_link_set requirement -
  // an acceptance the applier could not satisfy and the trace was right to
  // refuse. Read the prose too, and only where it names a route this repository
  // actually serves.
  const derivedInternalLinkActions = structuredInternalLinkActions.length
    ? []
    : deriveBhpcInternalLinkActionsFromText([rawFix, gap].filter(Boolean).join(' '), {selfPath: route.implementation_path});
  const textBlockTypes = blockTypesForAgentText(combined);
  // Last resort, and only when the artifact asked for internal links and named
  // no destination anywhere: use the page's own taxonomy-built related section.
  // Without this the requirement stands with nothing behind it and the applier
  // renders nothing, which is the state that failed the trace on every run.
  const navigationInternalLinkActions = (structuredInternalLinkActions.length || derivedInternalLinkActions.length || !textBlockTypes.includes(BHPC_AGENT_BLOCK_TYPES.INTERNAL_LINK_SET))
    ? []
    : deriveBhpcInternalLinkActionsFromNavigation(route.implementation_path);
  const internalLinkActions = structuredInternalLinkActions.length
    ? structuredInternalLinkActions
    : (derivedInternalLinkActions.length ? derivedInternalLinkActions : navigationInternalLinkActions);
  const requiredBlockTypes=[
    ...textBlockTypes,
    ...requiredBlockTypesForPageFamily(route.page_family)
  ];
  if(internalLinkActions.length) requiredBlockTypes.push(BHPC_AGENT_BLOCK_TYPES.INTERNAL_LINK_SET);
  if(externalCtaActions.length) requiredBlockTypes.push(BHPC_AGENT_BLOCK_TYPES.CTA_CALLOUT);
  if (String(row.source_intent_operation || row.operation || '') === 'CREATE_NEW_TARGET_PAGE' && /chatgpt|\bprompt\b|convert these|design an end-of-day/i.test(query)) requiredBlockTypes.push(BHPC_AGENT_BLOCK_TYPES.PROMPT_TEMPLATE);
  if(['comparison','alternatives'].includes(seo?.canonical_page_type)&&!requiredBlockTypes.includes(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE)) requiredBlockTypes.push(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE);
  const blockTypes=unique(requiredBlockTypes);
  const protectedBuyerPage = ['download.html'].includes(route.implementation_path);
  const blocked=Boolean(route.blocked_reason||String(route.status).startsWith('BLOCKED')||row.seo_execution_status==='INVALID'||protectedBuyerPage);
  const acceptanceStatus=noAction?'NO_ACTION':(blocked?'BLOCKED':'REQUIRED');
  const heading=deriveBhpcRequiredHeading(rawFix,query);
  return {
    id:row.id||`${row.run_date||'unknown'}-${slug(query)}`,
    record_id:row.id||`${row.run_date||'unknown'}-${slug(query)}`,
    run_date:row.run_date||context.run_date||'',scope:row.scope||context.scope||'bhpc',query,
    source_gap:gap,source_fix_instruction:fix,action_tier:clean(row.action_tier),primary_fix_type:clean(row.primary_fix_type),
    operation:row.operation||(route.page_family==='intended_winner_repair'?'REPAIR_INTENDED_WINNER_PAGE':'CREATE_NEW_TARGET_PAGE'),
    source_intent_operation:row.source_intent_operation||row.operation||(route.page_family==='intended_winner_repair'?'REPAIR_INTENDED_WINNER_PAGE':'CREATE_NEW_TARGET_PAGE'),
    page_decision:row.page_decision||seo?.page_decision||'',recommended_page_type:row.recommended_page_type||seo?.recommended_page_type||'',
    seo_execution_status:row.seo_execution_status||'NOT_PROVIDED',seo_execution:seo,seo_execution_hash:seo?.hash||'',
    intended_winner_page:row.intended_winner_page||'',intended_winner_path:row.intended_winner_path||'',
    implementation_path:route.implementation_path,route_status:route.status,route_resolution:route.route_resolution||null,page_family:route.page_family,
    acceptance_status:acceptanceStatus,blocked_reason:blocked?(protectedBuyerPage?'PROTECTED_BUYER_PAGE_CONTRACT:no_visible_agent_or_citation_injection_on_download':(route.blocked_reason||row.seo_execution_errors?.join(';')||'invalid_seo_execution')):'',
    required_heading:heading,
    required_block_types:blockTypes,
    // The SAME cleaning the applier writes with, from the SAME module, so a
    // required string is a string something in this repository actually
    // renders. `unpublishable_required_strings` names the ones the reader
    // surface deliberately will not print - they stay REQUIRED and stay
    // outstanding, because dropping a requirement is not satisfying it.
    required_strings:unique([cleanBhpcReaderHeading(query),heading]).slice(0,8),
    unpublishable_required_strings:isPublishableBhpcReaderQuestion(query)?[]:unique([cleanBhpcReaderHeading(query)]),
    required_internal_links:internalLinkActions,
    internal_link_source:structuredInternalLinkActions.length?'seo_execution.internal_link_actions':(derivedInternalLinkActions.length?'recommendation_text':(navigationInternalLinkActions.length?'site_navigation_related_section':'none')),
    required_external_cta_links:externalCtaActions,
    rejected_internal_link_actions:rejectedInternalLinkActions,
    schema_action:seo?.schema_action||'none',
    acceptance_checks:seo?.acceptance_checks||[],
    table_columns_exact:tableColumns(blockTypes),min_table_rows:minimumRows(blockTypes),
    placement:route.page_family==='intended_winner_repair'?'before_closing_body':'page_body',
    proof_selector:`[data-bhpc-agent-record="${row.id||slug(query)}"]`,
    evidence_urls:unique(row.evidence_urls||[]),
    evidence_required_domains:unique(row.evidence_required_domains||[]),
    raw_hash_basis:clean(JSON.stringify(row.raw||row)).slice(0,1000)
  };
}
