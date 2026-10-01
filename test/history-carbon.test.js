import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('history carbon shows stored estimate and handles missing and invalid legacy data',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ctx=vm.createContext({});
 vm.runInContext(html.slice(html.indexOf('        function historyCarbon'),html.indexOf('        function renderHistoryRides')),ctx);
 assert.match(vm.runInContext("historyCarbon({distance:'10',co2:'2.10'})",ctx),/2.10 kg CO₂/);
 assert.match(vm.runInContext('historyCarbon({co2:0})',ctx),/0.00 kg CO₂/);
 for(const value of [null,'',undefined,'bad',-1]){
 ctx.ride={co2:value};assert.match(vm.runInContext('historyCarbon(ride)',ctx),/ไม่มีข้อมูล/);
 assert.doesNotMatch(vm.runInContext('historyCarbon(ride)',ctx),/NaN|Infinity/);
 }
 assert.ok(html.slice(html.indexOf('        function renderHistoryRides')).includes('${historyCarbon(ride)}'));
});
