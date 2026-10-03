import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('passenger actions: available, full, departed, joined and same-name driver',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const state={user:{id:2,name:'Same Name'}};
 const ctx=vm.createContext({state,escapeHtml:s=>String(s).replaceAll('<','&lt;')});
 vm.runInContext(html.slice(html.indexOf('        const joiningRides'),html.indexOf('        function renderPassengerDriverRides')),ctx);
 const ride={id:10,userId:1,userName:'Same Name',status:'Pending',maxSeats:2,passengers:[]};
 ctx.ride=ride;
 const button=()=>vm.runInContext('joinRideButton(ride)',ctx);
 assert.match(button(),/requestJoinRide\(10\)/);
 ride.passengers=[{id:3,name:'Other Rider'}];assert.match(vm.runInContext('passengerSummary(ride)',ctx),/Other Rider/);
 ride.passengers.push({id:4,name:'Last Rider'});assert.match(button(),/disabled/);
 ride.passengers=[];ride.status='In-Progress';assert.match(button(),/disabled/);
 ride.status='Pending';ride.passengers=[{id:2,name:'Same Name'}];assert.match(button(),/เข้าร่วมเดินทางแล้ว/);
 ride.passengers=[];ride.userId=2;assert.match(button(),/ผู้ขับรถ/);
 ride.userId=1;vm.runInContext("joiningRides.add('10')",ctx);assert.match(button(),/กำลังบันทึก/);
});

test('bell menu renders join button, passenger list and remaining/full seats',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const list={innerHTML:'',children:[],appendChild(item){this.children.push(item);}};
 const ride={id:20,userId:1,status:'Pending',maxSeats:2,passengers:[{id:3,name:'Alice'}]};
 const ctx=vm.createContext({state:{user:{id:2},ridesDb:[ride]},escapeHtml:String,lucide:{createIcons(){}},document:{getElementById:id=>id==='ride-requests-list'?list:{classList:{add(){},remove(){}}},createElement:()=>({})}});
 vm.runInContext(html.slice(html.indexOf('        const joiningRides'),html.indexOf('        function renderPassengerDriverRides')),ctx);
 vm.runInContext(html.slice(html.indexOf('        function renderRidesList()'),html.indexOf('        async function updateRideStatus(')),ctx);
 vm.runInContext('renderRidesList()',ctx);
 assert.match(list.children.at(-1).innerHTML,/requestJoinRide\(20\)/);
 assert.match(list.children.at(-1).innerHTML,/Alice/);
 assert.match(list.children.at(-1).innerHTML,/ว่าง 1 ที่/);
 ride.passengers.push({id:4,name:'Bob'});ride.status='Full';
 vm.runInContext('renderRidesList()',ctx);
 assert.match(list.children.at(-1).innerHTML,/เต็มแล้ว/);
 assert.doesNotMatch(list.children.at(-1).innerHTML,/onclick="requestJoinRide/);
});
