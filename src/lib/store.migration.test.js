import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_STORAGE_KEYS, RESET_MARKER_KEY, STORAGE_KEY, loadStore, saveStore } from './store.js';

describe('2.4 one-time localStorage reset', () => {
  beforeEach(() => localStorage.clear());

  it('first 2.4 load deletes prior test data and starts fresh', () => {
    localStorage.setItem(LEGACY_STORAGE_KEYS[0], JSON.stringify({
      version:23,
      currentUserId:'u1',
      account:{primaryUserId:'u1',testIdentityIds:[]},
      users:{u1:{id:'u1',nickname:'Cayden'}},
      groups:[],activities:[],expenses:[],settlements:[],drafts:[],notifications:[],
    }));
    const loaded=loadStore();
    expect(loaded.version).toBe(24);
    expect(loaded.currentUserId).toBe(null);
    expect(localStorage.getItem(LEGACY_STORAGE_KEYS[0])).toBe(null);
    expect(localStorage.getItem(RESET_MARKER_KEY)).toBe('1');
  });

  it('reset only happens once and later refresh keeps 2.4 data', () => {
    loadStore();
    const current={
      version:24,currentUserId:'new',account:{primaryUserId:'new',testIdentityIds:[]},
      users:{new:{id:'new',nickname:'New'}},groups:[],activities:[],expenses:[],settlements:[],drafts:[],notifications:[],
    };
    saveStore(current);
    expect(loadStore().currentUserId).toBe('new');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).version).toBe(24);
  });

  it('future schema is never downgraded after the reset marker exists', () => {
    localStorage.setItem(RESET_MARKER_KEY,'1');
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      version:999,currentUserId:'future',account:{primaryUserId:'future'},
      users:{future:{id:'future'}},groups:[],activities:[],expenses:[],settlements:[]
    }));
    expect(loadStore()).toEqual(expect.objectContaining({version:999}));
  });

  it('future schema cannot be overwritten by 2.4 saveStore', () => {
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
        version:24,currentUserId:null,account:{},users:{},groups:[],activities:[],expenses:[],settlements:[],drafts:[],notifications:[]
      })).toThrow(/儲存空間已滿|尚未安全寫入/);
    } finally {
      Storage.prototype.setItem=original;
    }
  });
});
