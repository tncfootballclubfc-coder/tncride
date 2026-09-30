// No service-role key: every database call runs with the authenticated user's JWT.
const actions = new Set(['requestOtp','verifyOtp','me','logout','getAllRides','createRide','joinRide','updateRideStatus']);
const cookie = (token, age) => `tnc_sb=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${age}`;
export default async function handler(req,res) {
  let stage='request';
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST') {res.setHeader('Allow','POST');return res.status(405).json({success:false,message:'Method not allowed'});}
  try {
    if(req.headers.origin && new URL(req.headers.origin).host!==req.headers.host) return res.status(403).json({success:false,message:'Origin rejected'});
    const url=(process.env.SUPABASE_URL || '').trim().replace(/\/$/,'');
    const key=(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)||!key) return res.status(503).json({success:false,message:'กรุณาตั้ง SUPABASE_URL และ SUPABASE_PUBLISHABLE_KEY ใน Vercel แล้ว Redeploy'});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(JSON.stringify(body || {}).length>12000) return res.status(413).json({success:false,message:'ข้อมูลยาวเกินไป'});
    const {action,payload:p={}}=body || {};
    if(!actions.has(action)) return res.status(400).json({success:false,message:'Unknown action'});
    const call=async(path,data,token,method='POST')=>{
      stage=path.startsWith('/auth/v1/otp')?'send_otp':path.startsWith('/auth/v1/verify')?'verify_otp':path.startsWith('/rest/')?'database':'session';
      const headers={apikey:key,'Content-Type':'application/json'};
      if(token) headers.Authorization=`Bearer ${token}`;
      const response=await fetch(url+path,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(data)}),signal:AbortSignal.timeout(20000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(result.message || result.msg || result.error_description || 'Supabase request failed');error.status=response.status;error.code=result.code || result.error_code;throw error;}
      return result;
    };
    const rpc=(fn,data,token)=>call('/rest/v1/rpc/'+fn,data,token);
    if(action==='requestOtp'){
      const email=String(p.email || '').trim().toLowerCase();
      if(email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||!['login','register'].includes(p.purpose)) return res.status(400).json({success:false,message:'กรุณาตรวจอีเมล'});
      const name=String(p.name || '').trim(),phone=String(p.phone || '').trim();
      if(p.purpose==='register'&&(name.length<2||name.length>100||/[<>=]/.test(name)||!/^0\d{9}$/.test(phone))) return res.status(400).json({success:false,message:'กรุณากรอกชื่อและเบอร์ 10 หลักให้ถูกต้อง'});
      await call('/auth/v1/otp',{email,create_user:p.purpose==='register',...(p.purpose==='register'?{data:{name,phone}}:{})});
      return res.status(200).json({success:true,challengeId:email,retryAfter:60,message:'หากอีเมลนี้ใช้งานได้ ระบบจะส่งรหัสให้ กรุณาตรวจกล่องข้อความและสแปม'});
    }
    if(action==='verifyOtp'){
      if(!/^\d{6}$/.test(String(p.code || ''))||typeof p.challengeId!=='string'||p.challengeId.length>254) return res.status(400).json({success:false,message:'กรุณากรอก OTP 6 หลัก'});
      const auth=await call('/auth/v1/verify',{email:p.challengeId,token:p.code,type:'email'});
      if(!auth.access_token) throw Error('No session');
      // Profile is created only after Supabase verifies the email.
      const profile=await rpc('tnc_profile',{},auth.access_token);
      res.setHeader('Set-Cookie',cookie(auth.access_token,Math.max(1,Math.min(3600,Number(auth.expires_in)||3600))));
      return res.status(200).json({success:true,data:profile});
    }
    const raw=(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('tnc_sb='));
    const token=raw?decodeURIComponent(raw.slice(7)):'';
    if(action==='logout'){
      if(token) { try { await call('/auth/v1/logout',{},token); } catch(error) { if(error.status!==401 && error.status!==403) throw error; } }
      res.setHeader('Set-Cookie',cookie('',0));return res.status(200).json({success:true});
    }
    if(!token) return res.status(401).json({success:false,message:'กรุณาเข้าสู่ระบบใหม่'});
    // Supabase validates JWT on each RPC; the server never trusts an ID from the browser.
    const functions={me:['tnc_profile',{}],getAllRides:['tnc_rides',{}],createRide:['tnc_create_ride',{p:p}],joinRide:['tnc_join_ride',{ride_id:p.rideId}],updateRideStatus:['tnc_status',{ride_id:p.id,new_status:p.status}]};
    const [fn,data]=functions[action];
    const result=await rpc(fn,data,token);
    return res.status(200).json({success:true,data:result});
  } catch(error){
    const code=typeof error.code==='string' && /^[a-zA-Z0-9_]{1,80}$/.test(error.code)?error.code:'unknown';
    // Do not log request bodies, email addresses, keys, tokens, or raw provider messages.
    console.error('TNC_SUPABASE_ERROR',JSON.stringify({stage,status:Number(error.status)||0,code}));
    const messages={otp_expired:'OTP ไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่',over_email_send_rate_limit:'ส่งอีเมลเกินโควตา กรุณารอหรือตรวจ SMTP ใน Supabase',email_address_not_authorized:'อีเมลนี้ยังรับจาก SMTP ทดสอบไม่ได้ กรุณาตั้ง Custom SMTP',signup_disabled:'ไม่พบบัญชีหรือระบบปิดสมัครสมาชิก',PGRST202:'กรุณารันไฟล์ schema.sql ใน Supabase SQL Editor ก่อน', '23505':'เบอร์โทรถูกใช้งานแล้ว กรุณาติดต่อผู้ดูแล'};
    const known=error.code==='P0001';
    const status=error.status===401?401:error.status===429?429:400;
    Object.assign(messages,{
      over_request_rate_limit:'ขอรหัสถี่เกินไป กรุณารอสักครู่ก่อนลองใหม่',
      email_address_invalid:'Supabase ไม่ยอมรับรูปแบบอีเมลนี้ กรุณาตรวจอีเมล',
      email_provider_disabled:'กรุณาเปิด Email provider ใน Supabase Authentication',
      captcha_failed:'การตรวจ CAPTCHA ไม่ผ่าน โค้ดรุ่นนี้ยังไม่ได้เชื่อม CAPTCHA widget',
      hook_timeout:'บริการส่งอีเมลตอบกลับช้า กรุณาตรวจ Auth Hook',
      hook_timeout_after_retry:'บริการส่งอีเมลตอบกลับช้า กรุณาตรวจ Auth Hook'
    });
    let message=messages[code] || (known?error.message:status===401?'Session หมดอายุ กรุณารับ OTP ใหม่':'เชื่อมต่อ Supabase ไม่สำเร็จ กรุณาดู Authentication Logs');
    if(stage==='send_otp' && !messages[code]) {
      message=error.status===401||error.status===403?'Supabase ปฏิเสธคำขอ กรุณาตรวจว่า Project URL และ Publishable key มาจากโปรเจกต์เดียวกัน':error.status>=500?'Supabase ส่ง OTP ไม่สำเร็จ กรุณาดู Authentication Logs เพื่อตรวจ SMTP หรือ Auth Hook':'ขอ OTP ไม่สำเร็จ กรุณาดู Authentication Logs';
    }
    if(error.name==='TimeoutError'||error.name==='AbortError'||error.message==='fetch failed') message='ติดต่อ Supabase ไม่ได้หรือหมดเวลา กรุณาตรวจ Project URL และสถานะโปรเจกต์';
    return res.status(status).json({success:false,message:message+` [${stage}/${Number(error.status)||0}/${code}]`});
  }
}
