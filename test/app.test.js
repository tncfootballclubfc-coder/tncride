import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import handler from '../api/app.js';
async function call(action,payload={},cookie=''){const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(body){this.body=body;return this;}};await handler({method:'POST',headers:{host:'test',origin:'https://test',cookie},body:{action,payload}},res);return res;}
test('template parses and does not fake database success locally',()=>{const s=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');for(const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);assert.doesNotMatch(s,/script.google.com|localStorage.setItem\('tnc_(users|rides|current_user)'/);assert.match(s,/if \(!await createRide/);});
test('fresh database proxy Thai signup, server identity, failure, no OTP',async()=>{process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='sb_secret_test';process.env.SESSION_SECRET='a'.repeat(40);const original=global.fetch;const calls=[];try{global.fetch=async(url,opts)=>{assert.match(url,/\/rpc\/tnc2_phone$/);calls.push(JSON.parse(opts.body));return {ok:true,json:async()=>({id:2,name:'สมชาย',phone:'0812345678'})};};const reg=await call('register',{name:'สมชาย',phone:'0812345678'});assert.equal(reg.code,200);const cookie=reg.headers['Set-Cookie'].split(';')[0];assert.match(cookie,/^tnc_fresh=/);assert.equal((await call('joinRide',{rideId:9,p_actor:999},cookie)).code,200);assert.equal(calls.at(-1).p_actor,2);assert.equal((await call('joinRide',{rideId:9})).code,401);assert.equal((await call('requestOtp')).code,400);global.fetch=async()=>({ok:false,status:409,json:async()=>({code:'23505'})});assert.equal((await call('register',{name:'สมชาย',phone:'0812345678'})).body.success,false);global.fetch=async()=>{throw Error('offline')};assert.equal((await call('login',{phone:'0812345678'})).code,502);}finally{global.fetch=original;}});

test('carbon uses displayed one-decimal distance, not raw map distance',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');const ctx=vm.createContext({});
 vm.runInContext(html.slice(html.indexOf('        function calculateCarbon('),html.indexOf('        function calculateDistance(')),ctx);
 assert.equal(vm.runInContext('calculateCarbon(6.949)',ctx),'1.56');
 assert.equal(vm.runInContext('calculateCarbon(12)',ctx),'2.71');
 assert.equal(vm.runInContext('calculateCarbon(0)',ctx),'0.00');
 assert.equal((html.match(/calculateCarbon\(dist\)/g)||[]).length,2);
});

test('booking writes only on click and blocks duplicate clicks while saving',async()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');let writes=0,release;
 const pending=new Promise(resolve=>{release=resolve;});const button={innerHTML:'ประกาศ',disabled:false,value:'2099-01-01',checkValidity:()=>true};
 const ctx=vm.createContext({state:{user:{id:1,name:'Test'},pickup:{lat:1,lng:1},destination:{lat:2,lng:2},maxSeats:2,currentShift:'morning'},document:{getElementById:()=>button},initRideDate(){},bangkokDate:()=>'2026-10-04',calculateDistance:()=>6.9,calculateCarbon:()=> '1.56',createRide:async ride=>{writes++;assert.equal(ride.distance,'6.9');assert.equal(ride.co2,'1.56');await pending;return true;},showToast(){},selectShift(){},updateUI(){}});
 vm.runInContext(html.slice(html.indexOf('        let bookingInProgress'),html.indexOf('        function collapseBottomPanel')),ctx);
 assert.equal(writes,0);const first=vm.runInContext('handleBooking()',ctx);assert.equal(writes,1);
 await vm.runInContext('handleBooking()',ctx);assert.equal(writes,1);assert.equal(button.disabled,true);
 release();await first;
});

test('pickup date uses Thailand day and tomorrow across month boundary',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');const ctx=vm.createContext({});
 vm.runInContext(html.slice(html.indexOf('        function bangkokDate('),html.indexOf('        let bookingInProgress')),ctx);
 assert.equal(vm.runInContext("bangkokDate(0,new Date('2026-10-03T18:00:00Z'))",ctx),'2026-10-04');
 assert.equal(vm.runInContext("bangkokDate(1,new Date('2026-10-31T10:00:00Z'))",ctx),'2026-11-01');
 assert.match(vm.runInContext("pickupDateLabel({pickupDate:'2026-10-05'})",ctx),/05\/10\/2026/);
 assert.match(vm.runInContext('pickupDateLabel({})',ctx),/ไม่ระบุ/);
});

test('notification lets another member join and shows passengers/full state',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8'); const items=[];
 const ride={id:1,userId:10,userName:'Driver',status:'Pending',maxSeats:1,passengers:[]};
 const ctx=vm.createContext({state:{user:{id:20},ridesDb:[ride]},joining:new Set(),escapeHtml:String,pickupDateLabel:()=>'',lucide:{createIcons(){}},document:{createElement:()=>({}),getElementById:id=>id==='ride-requests-list'?{innerHTML:'',appendChild:x=>items.push(x)}:{classList:{add(){},remove(){}}}}});
 vm.runInContext(html.slice(html.indexOf('        function renderRidesList()'),html.indexOf('        async function updateRideStatus(')),ctx);
 vm.runInContext('renderRidesList()',ctx);assert.match(items.at(-1).innerHTML,/requestJoinRide\(1\)/);
 ride.passengers=[{id:30,name:'Passenger'}];ride.status='Full';vm.runInContext('renderRidesList()',ctx);
 assert.match(items.at(-1).innerHTML,/Passenger/);assert.match(items.at(-1).innerHTML,/เต็มแล้ว/);assert.doesNotMatch(items.at(-1).innerHTML,/onclick="requestJoinRide/);
 ctx.state.user.id=30;vm.runInContext('renderRidesList()',ctx);assert.match(items.at(-1).innerHTML,/คุณเข้าร่วมเดินทางแล้ว/);
});

test('Thai address search waits for selection before changing pickup',async()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');const nodes={};
 const node=id=>nodes[id]??=( {value:'บางนา',children:[],addEventListener(){},replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);}} );
 const state={pickup:null,map:{setView(){}}};
 const ctx=vm.createContext({state,URLSearchParams,AbortSignal,setTimeout,document:{getElementById:node,createElement:()=>({addEventListener(k,fn){this[k]=fn;}})},drawMarkers(){},updateUI(){},fetch:async()=>({ok:true,json:async()=>[{lat:'13.6',lon:'100.6',display_name:'บางนา กรุงเทพมหานคร'}]})});
 vm.runInContext(html.slice(html.indexOf('        let addressTarget'),html.indexOf('        function selectShift(')),ctx);
 await vm.runInContext("searchAddress('pickup')",ctx);assert.equal(state.pickup,null);
 node('address-results').children[0].click();assert.equal(state.pickup.name,'บางนา กรุงเทพมหานคร');assert.equal(state.pickup.lat,13.6);
});
