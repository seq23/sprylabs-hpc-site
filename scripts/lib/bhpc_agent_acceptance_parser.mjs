import {slug} from '../agent_intake/bhpc_agent_common.mjs';
import {BHPC_AGENT_BLOCK_TYPES, blockTypesForAgentText} from './bhpc_agent_block_schema.mjs';
import {resolveBhpcAgentRoute} from './bhpc_agent_route_resolver.mjs';

function clean(value=''){return String(value??'').replace(/\s+/g,' ').trim()}
function unique(values=[]){const seen=new Set(),out=[];for(const raw of values){const value=clean(raw);const key=value.toLowerCase();if(value&&!seen.has(key)){seen.add(key);out.push(value)}}return out}
function requestedHeading(fix='',query=''){
  const text=clean(fix);
  const match=text.match(/(?:add|create|include)\s+(?:a\s+)?h2\s+(.+?)(?:\.|$)/i)
    || text.match(/(?:h2|h3|section)\s+(?:titled|called|named)?\s*["“”']?([^"“”'.;:]{4,140})/i);
  return clean(match?.[1]||query).slice(0,180);
}
function tableColumns(types=[]){return types.includes(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE)?['Decision criterion','Spry/BHPC system','Other coaching or software option']:[]}
function minimumRows(types=[]){return types.includes(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE)?4:0}

export function buildBhpcAcceptanceEntry(row={},context={}){
  const query=clean(row.query||row.title||'BHPC agent signal');
  const seo=row.seo_execution||null;
  const fix=clean(seo?.exact_edit||row.fix_recommendation||row.recommendation||row.gap||row.why_worth_building||query);
  const gap=clean((seo?.on_page_failures||[]).join('; ')||row.gap||row.issue||row.finding||'');
  const combined=[query,fix,gap,row.primary_fix_type,row.action_tier,seo?.canonical_page_type,seo?.competitor_format_gap].map(clean).join(' ');
  const route=resolveBhpcAgentRoute(row,context);
  const noAction=row.operation==='NO_ACTION_MAINTAIN'||row.page_decision==='no_action';
  const requiredBlockTypes=blockTypesForAgentText(combined);
  if(seo?.internal_link_actions?.length) requiredBlockTypes.push(BHPC_AGENT_BLOCK_TYPES.INTERNAL_LINK_SET);
  if(['comparison','alternatives'].includes(seo?.canonical_page_type)&&!requiredBlockTypes.includes(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE)) requiredBlockTypes.push(BHPC_AGENT_BLOCK_TYPES.COMPARISON_TABLE);
  const blockTypes=unique(requiredBlockTypes);
  const protectedBuyerPage = ['download.html'].includes(route.implementation_path);
  const blocked=Boolean(route.blocked_reason||String(route.status).startsWith('BLOCKED')||row.seo_execution_status==='INVALID'||protectedBuyerPage);
  const acceptanceStatus=noAction?'NO_ACTION':(blocked?'BLOCKED':'REQUIRED');
  const heading=requestedHeading(fix,query);
  return {
    id:row.id||`${row.run_date||'unknown'}-${slug(query)}`,
    record_id:row.id||`${row.run_date||'unknown'}-${slug(query)}`,
    run_date:row.run_date||context.run_date||'',scope:row.scope||context.scope||'bhpc',query,
    source_gap:gap,source_fix_instruction:fix,action_tier:clean(row.action_tier),primary_fix_type:clean(row.primary_fix_type),
    operation:row.operation||(route.page_family==='intended_winner_repair'?'REPAIR_INTENDED_WINNER_PAGE':'CREATE_NEW_TARGET_PAGE'),
    page_decision:row.page_decision||seo?.page_decision||'',recommended_page_type:row.recommended_page_type||seo?.recommended_page_type||'',
    seo_execution_status:row.seo_execution_status||'NOT_PROVIDED',seo_execution:seo,seo_execution_hash:seo?.hash||'',
    intended_winner_page:row.intended_winner_page||'',intended_winner_path:row.intended_winner_path||'',
    implementation_path:route.implementation_path,route_status:route.status,route_resolution:route.route_resolution||null,page_family:route.page_family,
    acceptance_status:acceptanceStatus,blocked_reason:blocked?(protectedBuyerPage?'PROTECTED_BUYER_PAGE_CONTRACT:no_visible_agent_or_citation_injection_on_download':(route.blocked_reason||row.seo_execution_errors?.join(';')||'invalid_seo_execution')):'',
    required_heading:heading,
    required_block_types:blockTypes,
    required_strings:unique([query,heading]).slice(0,8),
    required_internal_links:seo?.internal_link_actions||[],
    schema_action:seo?.schema_action||'none',
    acceptance_checks:seo?.acceptance_checks||[],
    table_columns_exact:tableColumns(blockTypes),min_table_rows:minimumRows(blockTypes),
    placement:route.page_family==='intended_winner_repair'?'before_closing_body':'page_body',
    proof_selector:`[data-bhpc-agent-record="${row.id||slug(query)}"]`,
    raw_hash_basis:clean(JSON.stringify(row.raw||row)).slice(0,1000)
  };
}
