import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStoreIndexes, itemsFor } from './selectors.js';

test('store indexes group activities, expenses and settlements without cross-contamination', () => {
  const data={
    groups:[{id:'g1'},{id:'g2'}],
    activities:[{id:'a1',groupId:'g1'},{id:'a2',groupId:'g1'},{id:'b1',groupId:'g2'}],
    expenses:[{id:'e1',activityId:'a1'},{id:'e2',activityId:'b1'}],
    settlements:[{id:'s1',activityId:'a1'},{id:'s2',activityId:'a1'}],
  };
  const idx=buildStoreIndexes(data);
  assert.deepEqual(itemsFor(idx.activitiesByGroupId,'g1').map(x=>x.id),['a1','a2']);
  assert.deepEqual(itemsFor(idx.expensesByActivityId,'a1').map(x=>x.id),['e1']);
  assert.deepEqual(itemsFor(idx.expensesByActivityId,'b1').map(x=>x.id),['e2']);
  assert.deepEqual(itemsFor(idx.settlementsByActivityId,'a1').map(x=>x.id),['s1','s2']);
  assert.equal(idx.groupById.get('g2').id,'g2');
  assert.equal(idx.activityById.get('b1').groupId,'g2');
});

test('missing index keys return a stable empty result shape', () => {
  const idx=buildStoreIndexes({groups:[],activities:[],expenses:[],settlements:[]});
  assert.deepEqual(itemsFor(idx.expensesByActivityId,'missing'),[]);
});
