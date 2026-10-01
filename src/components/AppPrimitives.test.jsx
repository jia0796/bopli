import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmModal, EmptyState } from './AppPrimitives.jsx';
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

  it('renders a dedicated empty state instead of implying settlement', () => {
    render(<EmptyState icon={ReceiptText} title="尚未開始記帳" detail="新增第一筆支出後才會顯示結算狀態。"/>);
    expect(screen.getByText('尚未開始記帳')).toBeInTheDocument();
    expect(screen.queryByText('目前已結清')).not.toBeInTheDocument();
  });
});
