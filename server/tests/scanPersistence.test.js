import test from 'node:test';
import assert from 'node:assert/strict';
import { scanController } from '../src/controllers/scanController.js';
import mongoose from 'mongoose';
import { createScanRepository } from '../src/models/ScanReport.js';

test('guest report schema accepts a full message without an account owner', () => {
 createScanRepository();
 const guest = new mongoose.models.ScanReport({ source:'guest', message:'Guest message', title:'Guest', result:{prediction:'Legitimate'} });
 assert.equal(guest.validateSync(),undefined);
 assert.equal(guest.userId,null);
});
test('saves complete assessed result under authenticated owner and tolerates failed saves', async () => {
 const original = globalThis.fetch;
 const model = {risk_score:20,prediction:'Legitimate',detected_urls:[],probabilities:{phishing:.2},
  detected_indicators:[{category:'secret_disclosure',why_it_matters:'Account access could be exposed.',evidence:[{text:'share your OTP',start:7,end:21,context:'Please share your OTP.'}]}],
  model_explanation:{available:true,method:'mean_linear_svm_margin',toward_phishing:[{term:'otp',contribution:.2}]},analysis_version:'1.0.0-detailed-evidence'};
 globalThis.fetch = async () => ({ok:true,json:async()=>model});
 let saved; let output;
 const res={json(value){output=value;},status(){return this;}};
 try {
  const controller=scanController('http://localhost:8000',{create:async fields=>{saved=fields;return {_id:'scan1'};}});
  await controller({body:{text:'Meeting',type:'email'},user:{_id:'owner'}},res);
  assert.equal(saved.userId,'owner'); assert.equal(saved.result.scoring_version,'3.1.2-link-policy');
  assert.deepEqual(saved.result.link_checks,[]); assert.equal(output.persistence.status,'saved');
  assert.deepEqual(saved.result.detected_indicators,model.detected_indicators);
  assert.deepEqual(saved.result.model_explanation,model.model_explanation);
  assert.equal(saved.result.analysis_version,model.analysis_version);
  saved=null;await controller({body:{text:'Meeting',tosAccepted:true}},res);
  assert.equal(saved.userId,null); assert.equal(saved.source,'guest'); assert.equal(saved.message,'Meeting');
  assert.equal(saved.tosAcknowledged,true); assert.equal(output.persistence.status,'saved'); assert.equal(output.persistence.scope,'guest');
  await scanController('http://localhost:8000',{create:async()=>{throw new Error('private database error');}})({body:{text:'Meeting'},user:{_id:'owner'}},res);
  assert.equal(output.persistence.status,'unavailable');assert.equal(output.risk_score,20);assert.ok(!JSON.stringify(output).includes('private database'));
 } finally {globalThis.fetch=original;}
});
