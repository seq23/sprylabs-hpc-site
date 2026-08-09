import {json} from '../../_runtime/admin.js';export async function onRequestGet(){return json({authenticated:true,mode:'owner_passwordless'});}
