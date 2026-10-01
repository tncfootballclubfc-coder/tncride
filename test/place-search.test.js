import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('place search requires selection and saves selected coordinates without Auth', async () => {
 const html=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',children:[],listeners:{},addEventListener(k,v){this.listeners[k]=v;},replaceChildren(){this.children=[];},appendChild(x){this.children.push(x);}});return nodes.get(id);};
 node('place-query').value='Bang Na';node('place-target').value='pickup';
 let requests=0;const state={pickup:null,map:{setView(){}}};
 const context=vm.createContext({document:{getElementById:node,createElement:()=>({addEventListener(k,v){this[k]=v;}})},state,URLSearchParams,AbortSignal,Date,drawMarkers(){},updateUI(){},fetch:async url=>{requests++;assert.match(url,/\/search\?/);return {ok:true,json:async()=>[{lat:'13.67',lon:'100.60',display_name:'Bang Na, Bangkok'}]};}});
 vm.runInContext(html.slice(html.indexOf('        let placeSearchVersion'),html.indexOf('        function recenterMap()')),context);
 await vm.runInContext('searchPlace()',context);
 assert.equal(requests,1);assert.equal(state.pickup,null);
 node('place-results').children[0].click();
 assert.equal(state.pickup.lat,13.67);assert.equal(state.pickup.lng,100.60);assert.equal(state.pickup.name,'Bang Na, Bangkok');
 node('place-query').value='ไทย';await vm.runInContext('searchPlace()',context);assert.equal(requests,1);
});
