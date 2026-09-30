import {createHmac,timingSafeEqual} from 'node:crypto';
const actions=new Set(['register','login','me','logout','getAllRides','createRide','joinRide','updateRideStatus']);
const sign=(text,secret)=>createHmac('sha256',secret).update(text).digest('base64url');
const cookie=(value,age)=>`tnc_phone=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
function member(req,secret){
 try {
  const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tnc_phone='))?.slice(10);
  const [data,signature]=value.split('.'),expected=sign(data,secret);
  if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
  const parsed=JSON.parse(Buffer.from(data,'base64url').toString());
  return parsed.exp>Date.now()&&Number.isSafeInteger(parsed.id)&&parsed.id>0?parsed.id:null;
 }catch{return null;}
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({success:false,message:'Method not allowed'});}
 try{
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({success:false,message:'Origin rejected'});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(JSON.stringify(body||{}).length>12000)return res.status(413).json({success:false,message:'Request too large'});
  const {action,payload={}}=body||{};
  if(!actions.has(action))return res.status(400).json({success:false,message:'Unknown action'});
  if(action==='logout'){res.setHeader('Set-Cookie',cookie('',0));return res.status(200).json({success:true});}
  const url=(process.env.SUPABASE_URL||'').trim().replace(/\/$/,'');
  const key=(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim(),secret=process.env.SESSION_SECRET||'';
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key||secret.length<32)return res.status(503).json({success:false,message:'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SESSION_SECRET (32+ characters) in Vercel, then redeploy.'});
  let p={...payload},actor=null;
  if(action==='register'||action==='login'){
   p={phone:String(p.phone||'').trim(),name:String(p.name||'').trim(),email:String(p.email||'').trim().toLowerCase()};
   if(!/^0\d{9}$/.test(p.phone))return res.status(400).json({success:false,message:'Enter a 10-digit phone number starting with 0.'});
   if(action==='register'&&(!/^[A-Za-z][A-Za-z .'-]{1,99}$/.test(p.name)||!/[A-Za-z].*[A-Za-z]/.test(p.name)||p.email.length>254||! /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(p.email)))return res.status(400).json({success:false,message:'Use English letters for your name and a valid English-character email address.'});
  }else{
   actor=member(req,secret);
   if(!actor)return res.status(401).json({success:false,message:'Please sign in with your phone number.'});
   if(action==='createRide')for(const point of [p.pickup,p.dest])if(!point||typeof point.name!=='string'||!/^[\x20-\x7E]{1,500}$/.test(point.name))return res.status(400).json({success:false,message:'Location names must use English characters.'});
  }
  const headers={apikey:key,'Content-Type':'application/json'};
  // Legacy service_role keys are JWTs. New sb_secret keys are only sent as apikey.
  if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
  const upstream=await fetch(url+'/rest/v1/rpc/tnc_phone',{method:'POST',headers,body:JSON.stringify({p_action:action,p_payload:p,p_actor:actor}),signal:AbortSignal.timeout(20000)});
  const result=await upstream.json().catch(()=>({}));
  if(!upstream.ok){
   const code=String(result.code||'unknown').replace(/[^a-zA-Z0-9_]/g,'').slice(0,40);
   const messages={PGRST202:'Run the phone-login SQL migration in Supabase first.',23505:'This phone number is already registered. Please sign in.',42501:'Check the server-only Supabase service key and SQL migration.'};
   return res.status(400).json({success:false,message:messages[code]||(code==='P0001'?result.message:`Database request failed (${upstream.status}/${code}). Check Vercel settings.`)});
  }
  if(action==='register'||action==='login'){
   const data=Buffer.from(JSON.stringify({id:result.id,exp:Date.now()+86400000})).toString('base64url');
   res.setHeader('Set-Cookie',cookie(`${data}.${sign(data,secret)}`,86400));
  }
  return res.status(200).json({success:true,data:result});
 }catch{return res.status(502).json({success:false,message:'Unable to connect. Check the connection before trying again.'});}
}
