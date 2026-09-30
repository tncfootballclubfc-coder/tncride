import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import handler from '../api/app.js';
async function req(action,payload={},cookie=''){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};
 await handler({method:'POST',headers:{host:'test.local',origin:'https://test.local',cookie},body:{action,payload}},res);return res;
}
test('phone UI parses and removes OTP actions',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
 assert.ok(html.includes('id="login-phone"'));assert.ok(!html.includes('requestOtp'));assert.ok(!html.includes('verifyOtp'));assert.ok(!html.includes('id="otp-modal"'));
 assert.ok(html.includes('beforeinput'));assert.ok(!html.includes('SUPABASE_SERVICE_ROLE_KEY'));
});
test('registration, phone login, duplicate handling, English input and signed identity',async()=>{
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';process.env.SESSION_SECRET='a'.repeat(40);
 const original=global.fetch;const calls=[];
 try{
  global.fetch=async(url,opts)=>{calls.push(JSON.parse(opts.body));assert.ok(!url.includes('/auth/'));return {ok:true,json:async()=>({id:12,name:'Test User',phone:'0989147999',email:'test@example.com'})};};
  assert.equal((await req('requestOtp')).code,400);
  assert.equal((await req('me')).code,401);
  assert.equal((await req('register',{name:'สมชาย',phone:'0989147999',email:'test@example.com'})).code,400);
  assert.equal((await req('register',{name:'Test User',phone:'0989147999',email:'ไทย@example.com'})).code,400);
  assert.equal((await req('login',{phone:'123'})).code,400);
  const result=await req('register',{name:'Test User',phone:'0989147999',email:'test@example.com',p_actor:999});
  assert.equal(result.body.success,true);assert.equal(calls.at(-1).p_actor,null);assert.match(result.headers['Set-Cookie'],/HttpOnly; Secure/);
  const login=await req('login',{phone:'0989147999'});assert.equal(login.body.data.name,'Test User');
  const cookie=login.headers['Set-Cookie'].split(';')[0];
  await req('joinRide',{rideId:9,p_actor:999,passenger:{id:999}},cookie);
  assert.equal(calls.at(-1).p_actor,12);
  assert.equal((await req('me',{},cookie+'tampered')).code,401);
  assert.equal((await req('createRide',{pickup:{name:'กรุงเทพ'},dest:{name:'Office'}},cookie)).code,400);
  global.fetch=async()=>({ok:false,status:409,json:async()=>({code:'23505'})});
  const duplicate=await req('register',{name:'Test User',phone:'0989147999',email:'test@example.com'});
  assert.equal(duplicate.body.success,false);assert.equal(duplicate.headers['Set-Cookie'],undefined);
  global.fetch=async()=>{throw Error('offline');};
  assert.equal((await req('login',{phone:'0989147999'})).code,502);
  assert.match((await req('logout')).headers['Set-Cookie'],/Max-Age=0/);
 }finally{global.fetch=original;}
});
