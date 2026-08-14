#!/usr/bin/env python3
import json,sys
from datetime import date,timedelta
from google.oauth2 import service_account
from googleapiclient.discovery import build
if len(sys.argv)!=5:
    print('usage: gsc_search_analytics.py <service-account.json> <site-url> <target-query-json> <output-json>');sys.exit(2)
cred,site,target_path,out=sys.argv[1:]
targets=json.load(open(target_path)).get('targets',[])
queries={str(t.get('query','')).lower() for t in targets}
creds=service_account.Credentials.from_service_account_file(cred,scopes=['https://www.googleapis.com/auth/webmasters.readonly'])
svc=build('searchconsole','v1',credentials=creds,cache_discovery=False)
end=date.today()-timedelta(days=2);start=end-timedelta(days=27)
body={'startDate':str(start),'endDate':str(end),'dimensions':['query','page'],'rowLimit':25000,'dataState':'final'}
resp=svc.searchanalytics().query(siteUrl=site,body=body).execute();rows=[]
for r in resp.get('rows',[]):
    keys=r.get('keys') or ['','']; q=keys[0]; page=keys[1] if len(keys)>1 else ''
    if q.lower() not in queries: continue
    rows.append({'site_url':site,'query':q,'page':page,'clicks':r.get('clicks',0),'impressions':r.get('impressions',0),'ctr':r.get('ctr',0),'gsc_average_position':r.get('position')})
json.dump({'provider':'google_search_console','site_url':site,'start_date':str(start),'end_date':str(end),'collected_at':date.today().isoformat(),'rows':rows},open(out,'w'),indent=2)
print(f'wrote {len(rows)} GSC rows for {site}')
