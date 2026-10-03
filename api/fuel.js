import {createHash,timingSafeEqual} from 'node:crypto';
import {member} from './app.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST') return res.status(405).json({success:false});
 try{
  if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host)return res.status(403).json({success:false});
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const action=body?.action;
  if(!['get','list','set'].includes(action))return res.status(400).json({success:false});
  const url=(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const session=process.env.SESSION_SECRET||'';
  if(!url||!key||session.length<32)return res.status(503).json({success:false,message:'Server configuration missing'});
  let owner=member(req,session);
  if(action==='get') {if(!owner)return res.status(401).json({success:false});}
  else {
   const expected=process.env.ADMIN_SETTINGS_SECRET||'';
   if(expected.length<32)return res.status(503).json({success:false,message:'Set ADMIN_SETTINGS_SECRET (32+ random characters) in Vercel.'});
   const hash=v=>createHash('sha256').update(v).digest();
   if(typeof body.password!=='string'||body.password.length>512||!timingSafeEqual(hash(body.password),hash(expected)))return res.status(403).json({success:false,message:'รหัสผู้ดูแลไม่ถูกต้อง'});
   owner=Number(body.ownerId);
  }
  const rate=Number(body.kmPerLitre);
  if(action==='set'&&(!Number.isSafeInteger(owner)||owner<1||!Number.isFinite(rate)||rate<=0||rate>100))return res.status(400).json({success:false,message:'กรอกอัตรา กม./ลิตร มากกว่า 0 และไม่เกิน 100'});
  const headers={apikey:key,'Content-Type':'application/json'};
  if(!key.startsWith('sb_secret_'))headers.Authorization=`Bearer ${key}`;
  const response=await fetch(url+'/rest/v1/rpc/tnc_fuel_settings',{method:'POST',headers,body:JSON.stringify({p_action:action,p_owner:action==='list'?null:owner,p_rate:action==='set'?rate:null}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  return res.status(response.ok?200:400).json(response.ok?{success:true,data}:{success:false,message:'ตรวจสอบ SQL upgrade-fuel-emissions.sql และข้อมูลสมาชิก'});
 }catch{return res.status(502).json({success:false,message:'เชื่อมต่อไม่สำเร็จ'});}
}
