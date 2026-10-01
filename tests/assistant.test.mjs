import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
async function load(path) { const source=readFileSync(new URL(`../src/${path}.ts`,import.meta.url),'utf8'); const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText; return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`); }
const { LocalSlimeAIProvider }=await load('ai/AIProvider');
const { AssistantController,boundedContext }=await load('assistant/AssistantController');
const { CharacterController,normalizeModelAffect }=await load('character/slime/CharacterController');
test('provider readiness shares initialization, exposes errors, and retries',async()=>{
 let calls=0, fail=true;
 const p=new LocalSlimeAIProvider({initialize:async()=>{calls++;if(fail)throw Error('failure');},cancel:async()=>{},generate:async()=>''});
 const a=p.initialize(),b=p.initialize();assert.equal(a,b);await assert.rejects(a);assert.equal(p.readiness,'error');
 fail=false;await p.initialize();await p.initialize();assert.equal(calls,2);assert.equal(p.readiness,'ready');
});
test('provider forwards real deltas and cancellation stops late deltas',async()=>{
 let emit,resolve,cancelled=0;
 const p=new LocalSlimeAIProvider({initialize:async()=>{},cancel:async()=>{cancelled++;},generate:(_,cb)=>{emit=cb;return new Promise(r=>resolve=r);}});
 const abort=new AbortController(), chunks=[];const generation=p.generate([{role:'user',content:'hello'}],s=>chunks.push(s),abort.signal);
 emit('Hi');abort.abort();emit('stale');resolve('Hi');await generation;
 assert.deepEqual(chunks,['Hi']);assert.equal(cancelled,1);
});
test('conversation retains bounded complete pairs and excludes cancelled/failed responses',()=>{
 const turns=Array.from({length:30},(_,i)=>({id:i,request:'u'.repeat(300),response:'a'.repeat(500),complete:i%3!==0}));
 const result=boundedContext(turns,'follow up');assert.ok(result.length<=13);assert.ok(result.reduce((n,m)=>n+m.content.length,0)<=6000);assert.equal(result.at(-1).role,'user');
 for(let i=0;i<result.length-1;i+=2){assert.equal(result[i].role,'user');assert.equal(result[i+1].role,'assistant');}
});
test('assistant cancellation retains request but excludes incomplete turn from follow-up context',async()=>{
 let reject;const provider={readiness:'ready',initialize:async()=>{},generate:(_,__,signal)=>new Promise((_,r)=>{reject=r;signal.addEventListener('abort',()=>r(Error('cancelled')));}),cancel:async()=>{},shutdown:async()=>{}};
 const c=new AssistantController(provider,()=>{});const promise=c.submit('hello');assert.equal(c.getSnapshot().busy,true);c.cancel();await promise;
 assert.ok(reject);assert.equal(c.getSnapshot().busy,false);assert.equal(c.getSnapshot().turns[0].cancelled,true);assert.deepEqual(boundedContext(c.getSnapshot().turns,'next'),[{role:'user',content:'next'}]);
});
test('semantic reactions remain calm and reject unsupported model affect',()=>{
 for(const [state,emotion] of Object.entries({idle:'neutre',attention:'attentif',loading:'curieux',thinking:'curieux',responding:'curieux',error:'confus',success:'heureux',permission:'mefiant',notable:'fier'}))assert.equal(CharacterController.forAssistant(state).emotion,emotion);
 assert.equal(CharacterController.forAssistant('error').activity,'error');
 for(const v of ['thinking','toString',null,{},'ecstatic'])assert.equal(normalizeModelAffect(v),undefined);
});
