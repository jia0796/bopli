import React from 'react';

export function BrandMark({ size = 48, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 120 100"
      role="img"
      aria-label="Bopli 雙角色吉祥物"
    >
      <ellipse cx="40" cy="50" rx="34" ry="38" fill="#F6A08B" />
      <ellipse cx="74" cy="57" rx="34" ry="31" fill="#FFE0D5" />
      <circle cx="34" cy="44" r="3.4" fill="#FFFFFF" />
      <circle cx="46" cy="44" r="3.4" fill="#FFFFFF" />
      <path d="M32 53c4 5 12 5 16 0" stroke="#FFFFFF" strokeWidth="3.8" strokeLinecap="round" fill="none" />
      <circle cx="66" cy="53" r="3.2" fill="#24334F" />
      <circle cx="82" cy="53" r="3.2" fill="#24334F" />
      <path d="M64 62c4.5 5 13.5 5 18 0" stroke="#D96A55" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <circle cx="102" cy="18" r="8" fill="#F6A08B" />
    </svg>
  );
}

export function BrandName() {
  return (
    <span className="brand-name-wrap" aria-label="Bopli 朋友分帳管家">
      <span className="brand-name brand-name-capital">Bopli</span>
      <span className="brand-period brand-period-floating">.</span>
      <span className="brand-subtitle">朋友分帳管家</span>
    </span>
  );
}

export function BrandLockup({ compact = false }) {
  return (
    <span className={`brand-lockup ${compact ? 'compact' : ''}`}>
      <BrandMark size={compact ? 44 : 56} />
      <BrandName />
    </span>
  );
}
