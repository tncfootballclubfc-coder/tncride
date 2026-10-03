import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/fuel.js';
async function call(body){const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};await handler({method:'POST',headers:{host:'test',origin:'https://test'},body},res);return res;}
test('admin fuel settings require independent secret and valid efficiency',async()=>{
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';process.env.SESSION_SECRET='s'.repeat(40);process.env.ADMIN_SETTINGS_SECRET='x'.repeat(64);
 const original=global.fetch;let calls=0;
 global.fetch=async(url,opts)=>{calls++;const b=JSON.parse(opts.body);assert.equal(b.p_rate,12);return {ok:true,json:async()=>({kmPerLitre:12})};};
 try {
  assert.equal((await call({action:'set',ownerId:1,kmPerLitre:12,password:'wrong'})).code,403);
  assert.equal((await call({action:'set',ownerId:1,kmPerLitre:0,password:'x'.repeat(64)})).code,400);
  assert.equal(calls,0);
  assert.equal((await call({action:'set',ownerId:1,kmPerLitre:12,password:'x'.repeat(64)})).code,200);
  assert.equal(calls,1);
  assert.equal((await call({action:'get'})).code,401);
 }finally{global.fetch=original;}
});
