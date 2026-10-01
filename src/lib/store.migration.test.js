import { beforeEach, describe, expect, it } from 'vitest';
import { LEGACY_STORAGE_KEYS, STORAGE_KEY, loadStore } from './store.js';

describe('2.3 localStorage migration', () => {
  beforeEach(() => localStorage.clear());

  it('copies 2.2 data into the 2.3 key without deleting the legacy key', () => {
    const legacyKey=LEGACY_STORAGE_KEYS[0];
    const legacy={
      version:22,
      currentUserId:'u1',
      account:{primaryUserId:'u1',testIdentityIds:[]},
      users:{u1:{id:'u1',nickname:'Cayden'}},
      groups:[],
      activities:[],
      expenses:[],
      settlements:[],
      drafts:[],
      notifications:[],
    };
    localStorage.setItem(legacyKey,JSON.stringify(legacy));
    const loaded=loadStore();
    expect(loaded.version).toBe(23);
    expect(loaded.currentUserId).toBe('u1');
    expect(localStorage.getItem(legacyKey)).toBe(JSON.stringify(legacy));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).version).toBe(23);
  });

  it('prefers existing 2.3 data over legacy data', () => {
    localStorage.setItem(LEGACY_STORAGE_KEYS[0],JSON.stringify({
      version:22,currentUserId:'old',account:{},users:{old:{id:'old'}},groups:[],activities:[],expenses:[],settlements:[]
    }));
    localStorage.setItem(STORAGE_KEY,JSON.stringify({
      version:23,currentUserId:'new',account:{},users:{new:{id:'new'}},groups:[],activities:[],expenses:[],settlements:[]
    }));
    expect(loadStore().currentUserId).toBe('new');
  });
});
