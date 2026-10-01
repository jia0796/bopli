import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBalances, splitByRatio, splitCustom, splitEqualRotating, suggestTransfers,
} from './money.js';
import { memberLedger } from './ledger.js';
import { buildRoundingModel, applyRoundingToBalances } from './rounding.js';

function rng(seed=1) {
  let s=seed>>>0;
  return () => ((s = (s*1664525 + 1013904223)>>>0) / 2**32);
}
function pick(rand, arr){ return arr[Math.floor(rand()*arr.length)]; }
function sum(obj){ return Object.values(obj).reduce((a,b)=>a+b,0); }

function makeExpense(id, participants, rand, offset=0) {
  const amount=1+Math.floor(rand()*500000);
  const paidBy=pick(rand,participants);
  const mode=Math.floor(rand()*3);
  let allocations;
  if(mode===0){
    allocations=splitEqualRotating(amount,participants,offset);
  } else if(mode===1) {
    const ratios=Object.fromEntries(participants.map((uid)=>[uid,String(1+Math.floor(rand()*10))]));
    allocations=splitByRatio(amount,participants,ratios);
  } else {
    const weights=participants.map(()=>1+Math.floor(rand()*1000));
    const total=weights.reduce((a,b)=>a+b,0);
    const raw=weights.map((w)=>Math.floor(amount*w/total));
    let remaining=amount-raw.reduce((a,b)=>a+b,0);
    for(let i=0;i<remaining;i++)raw[i%raw.length]+=1;
    const custom=Object.fromEntries(participants.map((uid,i)=>[uid,raw[i]]));
    allocations=splitCustom(amount,participants,custom);
  }
  return {id,title:`E${id}`,amount,paidBy,createdBy:paidBy,participantIds:[...participants],
    splitMode:mode===0?'equal':mode===1?'ratio':'custom',allocations,expenseType:'simple'};
}

test('STRESS 14人旅行：300筆支出，中途+1、退出2人，歷史帳務保持平衡', () => {
  for(let seed=1;seed<=20;seed++){
    const rand=rng(seed);
    const original=Array.from({length:14},(_,i)=>`U${i+1}`);
    const newcomer='U15';
    const leavers=['U4','U9'];
    let current=[...original];
    const expenses=[];
    for(let i=0;i<300;i++){
      if(i===100) current=[...current,newcomer];
      if(i===200) current=current.filter((id)=>!leavers.includes(id));
      const count=Math.max(1,1+Math.floor(rand()*current.length));
      const participants=[...current].sort(()=>rand()-0.5).slice(0,count);
      expenses.push(makeExpense(`${seed}-${i}`,participants,rand,i));
    }
    const balances=calculateBalances(current,expenses);
    assert.equal(sum(balances),0,`seed ${seed} unbalanced`);
    assert.ok(Object.hasOwn(balances,'U4'),'historical leaver U4 missing');
    assert.ok(Object.hasOwn(balances,'U9'),'historical leaver U9 missing');
    assert.ok(Object.hasOwn(balances,newcomer),'newcomer missing');
    const transfers=suggestTransfers(balances);
    assert.equal(transfers.reduce((s,t)=>s+t.amount,0),
      Object.values(balances).filter((n)=>n>0).reduce((s,n)=>s+n,0));
    const ledgers=memberLedger(current,expenses);
    assert.equal(Object.keys(ledgers).length,Object.keys(balances).length);
  }
});

test('STRESS 兩個群組各500筆：各自帳務平衡且結果互不改變', () => {
  for(let seed=101;seed<=110;seed++){
    const rand=rng(seed);
    const aIds=Array.from({length:14},(_,i)=>`A${i}`);
    const bIds=Array.from({length:18},(_,i)=>`B${i}`);
    const a=Array.from({length:500},(_,i)=>makeExpense(`A-${i}`,aIds,rand,i));
    const b=Array.from({length:500},(_,i)=>makeExpense(`B-${i}`,bIds,rand,i));
    const before=calculateBalances(aIds,a);
    calculateBalances(bIds,b);
    const after=calculateBalances(aIds,a);
    assert.deepEqual(after,before);
    assert.equal(sum(before),0);
    assert.equal(sum(calculateBalances(bIds,b)),0);
  }
});

test('STRESS 尾差：3~60人、200輪不同金額都維持總額平衡', () => {
  const rand=rng(9876);
  for(let round=0;round<200;round++){
    const n=3+Math.floor(rand()*58);
    const ids=Array.from({length:n},(_,i)=>`R${round}-${i}`);
    const amount=1+Math.floor(rand()*1000000);
    const allocations=splitEqualRotating(amount,ids,round);
    const expense={amount,splitMode:'equal',participantIds:ids,allocations};
    const model=buildRoundingModel(ids,[expense]);
    const base=Object.fromEntries(ids.map((id)=>[id,-allocations[id]]));
    base[ids[0]]+=amount;
    for(const mode of ['current','random','assigned','roundUp']){
      const cfg={mode,randomTailUids:[...ids].reverse(),tailUids:[...ids].reverse(),
        receiverMode:'selected',receiverUids:[ids[0]],receiverOrder:[ids[0]]};
      const result=applyRoundingToBalances(base,model,cfg);
      assert.equal(sum(result.balances),0,`round=${round} mode=${mode}`);
    }
  }
});

test('STRESS 大額與大量成員：1,000,000,000 元 / 1000人', () => {
  const ids=Array.from({length:1000},(_,i)=>`P${i}`);
  const allocations=splitEqualRotating(1_000_000_000,ids,999999);
  assert.equal(sum(allocations),1_000_000_000);
  const expense={id:'max',amount:1_000_000_000,paidBy:ids[0],allocations};
  const balances=calculateBalances(ids,[expense]);
  assert.equal(sum(balances),0);
  assert.ok(suggestTransfers(balances).length<=999);
});

test('DIAGNOSTIC: 負數 confirmed settlement 應被拒絕', () => {
  const ids=['a','b'];
  const expense={id:'e',amount:100,paidBy:'a',allocations:{a:50,b:50}};
  assert.throws(
    ()=>calculateBalances(ids,[expense],[{fromUid:'b',toUid:'a',amount:-10,status:'confirmed'}]),
    /還款|金額|合法/
  );
});

test('DIAGNOSTIC: 小數 confirmed settlement 應被拒絕', () => {
  const ids=['a','b'];
  const expense={id:'e',amount:100,paidBy:'a',allocations:{a:50,b:50}};
  assert.throws(
    ()=>calculateBalances(ids,[expense],[{fromUid:'b',toUid:'a',amount:10.5,status:'confirmed'}]),
    /還款|金額|整數|合法/
  );
});

test('DIAGNOSTIC: 自己還款給自己應被拒絕', () => {
  const ids=['a','b'];
  const expense={id:'e',amount:100,paidBy:'a',allocations:{a:50,b:50}};
  assert.throws(
    ()=>calculateBalances(ids,[expense],[{fromUid:'b',toUid:'b',amount:10,status:'confirmed'}]),
    /還款|自己|相同|合法/
  );
});


test('STRESS 100 seeds × 1000筆：隨機帳本持續平衡', () => {
  for(let seed=1000;seed<1100;seed++){
    const rand=rng(seed);
    const ids=Array.from({length:25},(_,i)=>`S${i}`);
    const expenses=[];
    for(let i=0;i<1000;i++){
      const count=1+Math.floor(rand()*ids.length);
      const participants=[...ids].sort(()=>rand()-0.5).slice(0,count);
      expenses.push(makeExpense(`${seed}-${i}`,participants,rand,i));
    }
    const balances=calculateBalances(ids,expenses);
    assert.equal(sum(balances),0,`seed ${seed}`);
    suggestTransfers(balances);
  }
});

test('DIAGNOSTIC: NaN confirmed settlement 應被拒絕', () => {
  const expense={id:'e',amount:100,paidBy:'a',allocations:{a:50,b:50}};
  assert.throws(()=>calculateBalances(['a','b'],[expense],[{fromUid:'b',toUid:'a',amount:NaN,status:'confirmed'}]),/還款|金額|合法/);
});

test('DIAGNOSTIC: Infinity confirmed settlement 應被拒絕', () => {
  const expense={id:'e',amount:100,paidBy:'a',allocations:{a:50,b:50}};
  assert.throws(()=>calculateBalances(['a','b'],[expense],[{fromUid:'b',toUid:'a',amount:Infinity,status:'confirmed'}]),/還款|金額|合法/);
});

test('DIAGNOSTIC: 超額還款不應把債權債務反轉', () => {
  const expense={id:'e',amount:100,paidBy:'a',allocations:{a:50,b:50}};
  const balances=calculateBalances(['a','b'],[expense],[{fromUid:'b',toUid:'a',amount:60,status:'confirmed'}]);
  assert.deepEqual(balances,{a:0,b:0});
});

test('DIAGNOSTIC: 重複 settlement id 不應被重複計算', () => {
  const expense={id:'e',amount:100,paidBy:'a',allocations:{a:50,b:50}};
  const same={id:'s1',fromUid:'b',toUid:'a',amount:25,status:'confirmed'};
  const balances=calculateBalances(['a','b'],[expense],[same,{...same}]);
  assert.deepEqual(balances,{a:25,b:-25});
});
