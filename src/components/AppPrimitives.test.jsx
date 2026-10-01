import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmModal, EmptyState, PersonAvatar, SwipeMemberRow } from './AppPrimitives.jsx';
import { ReceiptText } from 'lucide-react';

describe('shared UI primitives', () => {
  it('confirm modal only performs destructive action after explicit confirmation', () => {
    const onConfirm=vi.fn();
    const onClose=vi.fn();
    render(<ConfirmModal title="刪除？" danger confirmText="確認刪除" onConfirm={onConfirm} onClose={onClose}><p>不可復原</p></ConfirmModal>);
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'確認刪除'}));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('can render a single-action information modal', () => {
    render(<ConfirmModal title="說明" hideCancel confirmText="知道了" onConfirm={vi.fn()} onClose={vi.fn()}><p>內容</p></ConfirmModal>);
    expect(screen.getByRole('button',{name:'知道了'})).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'再想想'})).not.toBeInTheDocument();
  });

  it('renders a dedicated empty state instead of implying settlement', () => {
    render(<EmptyState icon={ReceiptText} title="尚未開始記帳" detail="新增第一筆支出後才會顯示結算狀態。"/>);
    expect(screen.getByText('尚未開始記帳')).toBeInTheDocument();
    expect(screen.queryByText('目前已結清')).not.toBeInTheDocument();
  });

  it('renders extracted avatar and swipe member primitives without missing runtime dependencies', () => {
    render(<><PersonAvatar name="Cayden"/><SwipeMemberRow memberId="u1" name="小安" role="一般成員" canRemove={true} onOpen={vi.fn()} onRemove={vi.fn()}/></>);
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.getByText('小安')).toBeInTheDocument();
    expect(screen.getByText('一般成員')).toBeInTheDocument();
  });
});
