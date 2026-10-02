import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_STORAGE_KEYS, RESET_MARKER_KEY, STORAGE_KEY, loadStore, saveStore } from './store.js';

describe('2.6 one-time localStorage reset', () => {
  beforeEach(() => localStorage.clear());

  it('first 2.6 load deletes prior test data and starts fresh', () => {
    localStorage.setItem(LEGACY_STORAGE_KEYS[0], JSON.stringify({
      version:23,
      currentUserId:'u1',
      account:{primaryUserId:'u1',testIdentityIds:[]},
      users:{u1:{id:'u1',nickname:'Cayden'}},
      groups:[],activities:[],expenses:[],settlements:[],drafts:[],notifications:[],
    }));
    const loaded=loadStore();
    expect(loaded.version).toBe(26);
    expect(loaded.currentUserId).toBe(null);
    expect(localStorage.getItem(LEGACY_STORAGE_KEYS[0])).toBe(null);
    expect(localStorage.getItem(RESET_MARKER_KEY)).toBe('1');
  });

  it('reset only happens once and later refresh keeps 2.6 data', () => {
    loadStore();
    const current={
      version:26,currentUserId:'new',account:{primaryUserId:'new',testIdentityIds:[]},
      users:{new:{id:'new',nickname:'New'}},groups:[],activities:[],expenses:[],settlements:[],drafts:[],notifications:[],
    };
    saveStore(current);
    expect(loadStore().currentUserId).toBe('new');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).version).toBe(26);
  });

  it('future schema is never downgraded after the reset marker exists', () => {
    localStorage.setItem(RESET_MARKER_KEY,'1');
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      version:999,currentUserId:'future',account:{primaryUserId:'future'},
      users:{future:{id:'future'}},groups:[],activities:[],expenses:[],settlements:[]
    }));
    expect(loadStore()).toEqual(expect.objectContaining({version:999}));
  });

  it('future schema cannot be overwritten by 2.6 saveStore', () => {
    expect(()=>saveStore({
      version:999,currentUserId:'future',account:{},users:{future:{id:'future'}},
      groups:[],activities:[],expenses:[],settlements:[]
    })).toThrow(/版本|停止覆寫|保護資料/);
  });

  it('localStorage write failure is surfaced', () => {
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(){const error=new Error('quota');error.name='QuotaExceededError';throw error;};
    try {
      expect(()=>saveStore({
        version:26,currentUserId:null,account:{},users:{},groups:[],activities:[],expenses:[],settlements:[],drafts:[],notifications:[]
      })).toThrow(/儲存空間已滿|尚未安全寫入/);
    } finally {
      Storage.prototype.setItem=original;
    }
  });
});

it('2.6 user-authorized reset removes only legacy keys, preserving existing 2.6 and unrelated data',()=>{
  const current={version:26,currentUserId:'new',users:{new:{nickname:'A very long legacy name'}},groups:[],activities:[],expenses:[],settlements:[]};
  localStorage.removeItem(RESET_MARKER_KEY);
  for(const key of LEGACY_STORAGE_KEYS)localStorage.setItem(key,'old');
  localStorage.setItem('unrelated-app','keep');localStorage.setItem(STORAGE_KEY,JSON.stringify(current));
  expect(loadStore().currentUserId).toBe('new');
  for(const key of LEGACY_STORAGE_KEYS)expect(localStorage.getItem(key)).toBeNull();
  expect(localStorage.getItem('unrelated-app')).toBe('keep');
  expect(loadStore().users.new.nickname).toBe('A very long legacy name');
});

it('schema 26 avatar defaults preserve IDs, snapshot, manual routes and payment history',async()=>{
 const {migrateStore}=await import('./store.js');
 const old={version:25,currentUserId:'A',account:{primaryUserId:'A'},users:{A:{id:'A',nickname:'A very long legacy name'}},groups:[{id:'g',nicknames:{A:'Friend'}}],activities:[{id:'a',settlementSnapshot:{id:'s'},settlementManualTransfers:[{fromUid:'A',toUid:'B',amount:5}]}],expenses:[{id:'e',paidBy:'A',allocations:{B:5},history:[{by:'A'}]}],settlements:[{fromUid:'B',toUid:'A',status:'pending',snapshotId:'s',events:[{by:'B'}]}]};
 const next=migrateStore(old);expect(next.version).toBe(26);expect(next.users.A.avatarId).toBe('coral');expect(next.users.A.id).toBe('A');expect(next.users.A.nickname).toBe(old.users.A.nickname);expect(next.expenses).toBe(old.expenses);expect(next.settlements).toBe(old.settlements);expect(next.activities[0].settlementSnapshot).toBe(old.activities[0].settlementSnapshot);expect(next.groups[0].nicknames).toBe(old.groups[0].nicknames);
});
