import {json} from '../../_runtime/admin.js';export async function onRequestPost(){return json({status:'ok'},200,{'set-cookie':'spry_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'});}
