import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler from '../api/app.js';
async function request(action,payload={},cookie='',origin='https://test.local'){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(x){this.body=x;return this;}};
 await handler({method:'POST',headers:{host:'test.local',origin,cookie},body:{action,payload}},res);return res;
}
test('HTML syntax and new API path',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const s of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(s[1]);
 assert.ok(html.includes('/api/app'));assert.ok(!html.includes('Google Sheets'));assert.ok(!html.includes('/api/sheets'));
});
test('configuration, validation, OTP, profile, cookies, RPC identities and failures',async()=>{
 const original=global.fetch;
 try {
  delete process.env.SUPABASE_URL;delete process.env.SUPABASE_PUBLISHABLE_KEY;
  assert.equal((await request('me')).statusCode,503);
  process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
  assert.equal((await request('me')).statusCode,401);
  assert.equal((await request('me',{},'','https://evil.test')).statusCode,403);
  assert.equal((await request('getUserByPhone')).statusCode,400);
  assert.equal((await request('requestOtp',{email:'invalid',purpose:'login'})).statusCode,400);
  const calls=[];global.fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({})};};
  const pending=await request('requestOtp',{email:'test@example.com',purpose:'register',name:'Test User',phone:'0812345678'});
  assert.equal(pending.body.success,true);assert.equal(pending.headers['Set-Cookie'],undefined);
  assert.equal(JSON.parse(calls[0].options.body).create_user,true);assert.equal(calls[0].options.headers.Authorization,undefined);
  const denied=await request('verifyOtp',{challengeId:'test@example.com',code:'123'});assert.equal(denied.statusCode,400);
  global.fetch=async(url,options)=>{
   calls.push({url,options});
   return {ok:true,json:async()=>url.endsWith('/verify')?{access_token:'verified-token',expires_in:3600}:{id:7,name:'Test User'}};
  };
  const verified=await request('verifyOtp',{challengeId:'test@example.com',code:'123456'});
  assert.equal(verified.body.data.id,7);assert.match(verified.headers['Set-Cookie'],/HttpOnly; Secure/);assert.ok(!JSON.stringify(verified.body).includes('verified-token'));
  assert.equal(calls.at(-1).options.headers.Authorization,'Bearer verified-token');
  await request('joinRide',{rideId:123,passenger:{id:999}},'tnc_sb=verified-token');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{ride_id:123});
  global.fetch=async()=>({ok:false,status:400,json:async()=>({code:'otp_expired'})});
  assert.equal((await request('verifyOtp',{challengeId:'test@example.com',code:'123456'})).headers['Set-Cookie'],undefined);
  global.fetch=async()=>({ok:false,status:401,json:async()=>({})});
  assert.match((await request('logout',{},'tnc_sb=expired')).headers['Set-Cookie'],/Max-Age=0/);
  global.fetch=async()=>({ok:false,status:400,json:async()=>({code:'P0001',message:'เที่ยวรถเต็มหรือไม่เปิดรับแล้ว'})});
  assert.equal((await request('joinRide',{rideId:123},'tnc_sb=verified-token')).body.success,false);
 } finally {global.fetch=original;}
});
