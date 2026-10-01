import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityDeletionStatus, groupDeletionStatus, deleteActivityCascade, deleteGroupCascade,
} from './lifecycle.js';

const group={id:'g1',name:'旅行',ownerUid:'owner',deputyUids:['dep'],memberIds:['owner','dep','m']};
const activity={id:'a1',groupId:'g1',title:'巴黎',participantIds:['owner','dep','m']};
const settledExpense={id:'e1',activityId:'a1',amount:300,paidBy:'owner',allocations:{owner:100,dep:100,m:100}};
const settledPayments=[
  {id:'s1',activityId:'a1',fromUid:'dep',toUid:'owner',amount:100,status:'confirmed'},
  {id:'s2',activityId:'a1',fromUid:'m',toUid:'owner',amount:100,status:'confirmed'},
];
const base={users:{owner:{id:'owner'},dep:{id:'dep'},m:{id:'m'}},groups:[group],activities:[activity],expenses:[],settlements:[],drafts:[],notifications:[]};

test('只有群主可永久刪除活動與群組，副群主也不可',()=>{
  assert.equal(activityDeletionStatus(group,activity,base,'dep').allowed,false);
  assert.equal(groupDeletionStatus(group,base,'dep').allowed,false);
  assert.equal(activityDeletionStatus(group,activity,base,'owner').allowed,true);
});

test('活動有未結清餘額時禁止刪除',()=>{
  const data={...base,expenses:[settledExpense]};
  const status=activityDeletionStatus(group,activity,data,'owner');
  assert.equal(status.allowed,false);
  assert.match(status.reason,/未結清/);
});

test('pending 或 disputed 還款存在時禁止刪除',()=>{
  for(const statusName of ['pending','disputed']){
    const data={...base,settlements:[{id:'s',activityId:'a1',fromUid:'dep',toUid:'owner',amount:1,status:statusName}]};
    assert.equal(activityDeletionStatus(group,activity,data,'owner').allowed,false);
  }
});

test('帳務已完全結清時允許刪除活動',()=>{
  const data={...base,expenses:[settledExpense],settlements:settledPayments};
  assert.equal(activityDeletionStatus(group,activity,data,'owner').allowed,true);
});

test('活動級聯刪除只移除該活動資料',()=>{
  const other={id:'a2',groupId:'g1',title:'里昂',participantIds:['owner']};
  const data={...base,activities:[activity,other],
    expenses:[{...settledExpense},{id:'e2',activityId:'a2'}],
    settlements:[{id:'s',activityId:'a1'},{id:'s2',activityId:'a2'}],
    drafts:[{id:'d1',activityId:'a1'},{id:'d2',activityId:'a2'}],
    notifications:[{id:'n1',activityId:'a1'},{id:'n2',activityId:'a2'}]};
  const next=deleteActivityCascade(data,'a1');
  assert.deepEqual(next.activities.map(x=>x.id),['a2']);
  assert.deepEqual(next.expenses.map(x=>x.id),['e2']);
  assert.deepEqual(next.settlements.map(x=>x.id),['s2']);
  assert.deepEqual(next.drafts.map(x=>x.id),['d2']);
  assert.deepEqual(next.notifications.map(x=>x.id),['n2']);
});

test('群組刪除保留其他群組與 users，不跨群組誤刪',()=>{
  const g2={id:'g2',name:'工作',ownerUid:'owner',memberIds:['owner']};
  const a2={id:'a2',groupId:'g2',title:'午餐',participantIds:['owner']};
  const data={...base,groups:[group,g2],activities:[activity,a2],
    expenses:[{id:'e1',activityId:'a1'},{id:'e2',activityId:'a2'}],
    settlements:[{id:'s1',activityId:'a1'},{id:'s2',activityId:'a2'}],
    drafts:[{id:'d1',activityId:'a1'},{id:'d2',activityId:'a2'}],
    notifications:[{id:'n1',groupId:'g1',activityId:'a1'},{id:'n2',groupId:'g2',activityId:'a2'}]};
  const next=deleteGroupCascade(data,'g1');
  assert.deepEqual(next.groups.map(x=>x.id),['g2']);
  assert.deepEqual(next.activities.map(x=>x.id),['a2']);
  assert.deepEqual(next.expenses.map(x=>x.id),['e2']);
  assert.deepEqual(next.settlements.map(x=>x.id),['s2']);
  assert.deepEqual(next.drafts.map(x=>x.id),['d2']);
  assert.deepEqual(next.notifications.map(x=>x.id),['n2']);
  assert.deepEqual(next.users,data.users);
});

test('群組內任一活動未結清時禁止永久刪除群組',()=>{
  const data={...base,expenses:[settledExpense]};
  const status=groupDeletionStatus(group,data,'owner');
  assert.equal(status.allowed,false);
  assert.match(status.reason,/巴黎.*未結清/);
});
