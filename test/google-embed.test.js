import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('Google uses only free Embed and URLs; coordinates validated; no key fallback',()=>{
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const ctx=vm.createContext({URLSearchParams});
 vm.runInContext(html.slice(html.indexOf('        function googleRouteUrls'),html.indexOf('        function showGoogleRoute')),ctx);
 const run=key=>vm.runInContext(`googleRouteUrls({lat:13.6,lng:100.5},{lat:12.7,lng:101.2},${JSON.stringify(key)})`,ctx);
 const r=run('test-key');const url=new URL(r.embed);
 assert.equal(url.pathname,'/maps/embed/v1/directions');assert.equal(url.searchParams.get('language'),'th');assert.equal(url.searchParams.get('origin'),'13.6,100.5');
 assert.equal(run('').embed,'');assert.match(run('').navigation,/www.google.com\/maps\/dir/);
 assert.equal(vm.runInContext('googleRouteUrls(null,{lat:0,lng:0})',ctx),null);
 assert.equal(vm.runInContext('googleRouteUrls({lat:100,lng:0},{lat:0,lng:0})',ctx),null);
 assert.doesNotMatch(html,/maps.googleapis.com\/maps\/api\/js|places.googleapis.com/);
});
