import test from 'node:test';
import assert from 'node:assert/strict';
import { scanController } from '../src/controllers/scanController.js';
test('saves complete assessed result under authenticated owner and tolerates failed saves', async () => {
 const original = globalThis.fetch;
 const model = {risk_score:20,prediction:'Legitimate',detected_urls:[],probabilities:{phishing:.2}};
 globalThis.fetch = async () => ({ok:true,json:async()=>model});
 let saved; let output;
 const res={json(value){output=value;},status(){return this;}};
 try {
  const controller=scanController('http://localhost:8000',{create:async fields=>{saved=fields;return {_id:'scan1'};}});
  await controller({body:{text:'Meeting',type:'email'},user:{_id:'owner'}},res);
  assert.equal(saved.userId,'owner'); assert.equal(saved.result.scoring_version,'3.1.0-link-policy');
  assert.deepEqual(saved.result.link_checks,[]); assert.equal(output.persistence.status,'saved');
  saved=null;await controller({body:{text:'Meeting'}},res); assert.equal(saved,null); assert.equal(output.persistence.status,'not_saved');
  await scanController('http://localhost:8000',{create:async()=>{throw new Error('private database error');}})({body:{text:'Meeting'},user:{_id:'owner'}},res);
  assert.equal(output.persistence.status,'unavailable');assert.equal(output.risk_score,20);assert.ok(!JSON.stringify(output).includes('private database'));
 } finally {globalThis.fetch=original;}
});
