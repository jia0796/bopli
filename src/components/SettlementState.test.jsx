import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import App from '../App.jsx';
import { ExpenseDetail } from './ExpenseViews.jsx';
import { freshStore, STORAGE_KEY, RESET_MARKER_KEY } from '../lib/store.js';

beforeEach(()=>{
  localStorage.clear();localStorage.setItem(RESET_MARKER_KEY,'1');
  vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  vi.stubGlobal('requestAnimationFrame',fn=>setTimeout(fn,0));
  vi.stubGlobal('cancelAnimationFrame',id=>clearTimeout(id));
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

function seed(empty=true){
  const data=freshStore();data.currentUserId='u';data.account.primaryUserId='u';
  data.users={u:{id:'u',nickname:'Owner',accountName:'Owner'},v:{id:'v',nickname:'Friend'}};
  data.groups=[{id:'g',name:'Group',ownerUid:'u',memberIds:['u','v'],nicknames:{u:'Owner',v:'Friend'},deputyUids:[]}];
  data.activities=[{id:'a',groupId:'g',title:'Trip',participantIds:['u','v'],memberReviewIds:[],auditHistory:[]}];
  if(!empty)data.expenses=[{id:'e',activityId:'a',title:'Lunch',amount:100,paidBy:'u',allocations:{u:50,v:50},participantIds:['u','v'],splitMode:'equal'}];
  localStorage.setItem(STORAGE_KEY,JSON.stringify(data));
}

it('empty activity uses shared not-started status on expense, ledger, and settlement screens',()=>{
  seed();render(<App/>);
  fireEvent.click(screen.getByText('Group'));
  fireEvent.click(screen.getByText('Trip'));
  expect(screen.getByText('尚未開始記帳')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'帳目',exact:true}));
  expect(screen.getByText(/尚未開始記帳/)).toBeInTheDocument();
  expect(screen.queryByText(/已結清/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'結算',exact:true}));
  expect(screen.getByText('尚未開始記帳')).toBeInTheDocument();
});

it('shared modal behavior locks background scrolling and restores it on close',async()=>{
  seed();render(<App/>);
  fireEvent.click(screen.getAllByRole('button',{name:'建立群組',exact:true}).at(-1));
  await waitFor(()=>expect(document.body.style.overflow).toBe('hidden'));
  fireEvent.click(document.querySelector('.modal-top .icon-button'));
  await waitFor(()=>expect(document.body.style.overflow).toBe(''));
});

it('expense history shows who, time, and allocation changes without revision numbers',()=>{
  const before={title:'Lunch',amount:100,paidBy:'u',participantIds:['u','v'],splitMode:'equal',allocations:{u:50,v:50}};
  const after={...before,allocations:{u:40,v:60}};
  const expense={id:'e',...after,createdBy:'u',revision:2,history:[{id:'h',by:'v',at:'2026-10-01T00:00:00Z',before,after}]};
  render(<ExpenseDetail expense={expense} actorId="u" userName={id=>id==='u'?'Owner':'Friend'} onClose={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'查看修改紀錄'}));
  expect(screen.getByText(/Friend 修改了這筆支出/)).toBeInTheDocument();
  expect(screen.getByText(/Friend 分攤：NT\$ 50 → NT\$ 60/)).toBeInTheDocument();
  expect(screen.queryByText(/第.*版/)).not.toBeInTheDocument();
});
