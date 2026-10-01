import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from './store.js';
import { useStorePersistence } from './useStorePersistence.js';

const store=(marker)=>({
  version:23,currentUserId:marker,account:{primaryUserId:marker,testIdentityIds:[]},
  users:{[marker]:{id:marker}},groups:[],activities:[],expenses:[],settlements:[],drafts:[],notifications:[]
});

describe('debounced store persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initial render does not rewrite the full store', () => {
    const spy=vi.spyOn(Storage.prototype,'setItem');
    renderHook(({data})=>useStorePersistence(data,{delay:300}),{initialProps:{data:store('a')}});
    expect(spy).not.toHaveBeenCalled();
  });

  it('rapid updates collapse into one write containing only the latest state', () => {
    const spy=vi.spyOn(Storage.prototype,'setItem');
    const {rerender}=renderHook(({data})=>useStorePersistence(data,{delay:300}),{initialProps:{data:store('a')}});
    rerender({data:store('b')});
    rerender({data:store('c')});
    rerender({data:store('d')});
    act(()=>vi.advanceTimersByTime(299));
    expect(spy).not.toHaveBeenCalled();
    act(()=>vi.advanceTimersByTime(1));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).currentUserId).toBe('d');
  });

  it('pagehide flushes pending changes immediately', () => {
    const spy=vi.spyOn(Storage.prototype,'setItem');
    const {rerender}=renderHook(({data})=>useStorePersistence(data,{delay:5000}),{initialProps:{data:store('a')}});
    rerender({data:store('b')});
    act(()=>window.dispatchEvent(new Event('pagehide')));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)).currentUserId).toBe('b');
  });

  it('write errors remain dirty and are surfaced to the UI callback', () => {
    const onError=vi.fn();
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{const e=new Error('quota');e.name='QuotaExceededError';throw e;});
    const {rerender}=renderHook(({data})=>useStorePersistence(data,{delay:300,onError}),{initialProps:{data:store('a')}});
    rerender({data:store('b')});
    act(()=>vi.advanceTimersByTime(300));
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/儲存空間已滿|尚未安全寫入/));
  });
});
