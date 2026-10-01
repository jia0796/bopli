import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExpenseForm from './ExpenseForm.jsx';
import { ActivitySettings, GroupSettings } from './SecondaryScreens.jsx';

const group={id:'g',name:'法國旅行',ownerUid:'owner',memberIds:['owner','member'],deputyUids:[],allowMemberInvites:false,editPolicy:'creatorOnly'};
const activity={id:'a',groupId:'g',title:'巴黎',participantIds:['owner','member'],auditHistory:[],memberReviewIds:[]};
const users={owner:{id:'owner',nickname:'Cayden'},member:{id:'member',nickname:'小安'}};

describe('2.3 clarity UI',()=>{
  it('新增支出先顯示基本操作，進階功能收在更多記帳方式',()=>{
    render(<ExpenseForm activity={activity} users={users} actorId="owner" onClose={vi.fn()} onSave={vi.fn()} onDraft={vi.fn()}/>);
    expect(screen.getByText('誰付的？')).toBeInTheDocument();
    expect(screen.getByText('一起分')).toBeInTheDocument();
    expect(screen.getByText('更多記帳方式')).toBeInTheDocument();
    expect(screen.queryByText('購物單模式')).not.toBeInTheDocument();
  });

  it('群主看到白話權限與群組管理',()=>{
    render(<GroupSettings group={group} actorId="owner" nameFor={()=>''} onBack={vi.fn()} onToggleInvites={vi.fn()} onToggleEdit={vi.fn()} onMembers={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()}/>);
    expect(screen.getByText('誰可以邀請朋友')).toBeInTheDocument();
    expect(screen.getByText('誰可以修改支出')).toBeInTheDocument();
    expect(screen.getByText('永久刪除群組')).toBeInTheDocument();
  });

  it('一般成員不會看到群主專屬永久刪除操作',()=>{
    const first=render(<GroupSettings group={group} actorId="member" nameFor={()=>''} onBack={vi.fn()} onToggleInvites={vi.fn()} onToggleEdit={vi.fn()} onMembers={vi.fn()} onArchive={vi.fn()} onDelete={vi.fn()}/>);
    expect(screen.queryByText('永久刪除群組')).not.toBeInTheDocument();
    first.unmount();
    render(<ActivitySettings activity={activity} group={group} canManage={false} canDelete={false} nameFor={()=>''} onBack={vi.fn()} onMembers={vi.fn()} onDelete={vi.fn()}/>);
    expect(screen.queryByText('永久刪除活動')).not.toBeInTheDocument();
  });
});
