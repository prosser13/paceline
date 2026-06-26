'use client';

import { useState } from 'react';

export default function PastWeeksAccordion({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-[18px] py-[12px] border border-fog rounded-[14px] bg-[#efe9dc] hover:bg-[#e8e1d2] transition-colors text-left"
      >
        <span className="font-mono text-[12px] tracking-[.12em] uppercase text-stone">{label}</span>
        <span
          className="font-mono text-[18px] text-stone/50 leading-none"
          style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}
        >
          ▾
        </span>
      </button>
      {open && <div className="mt-[10px] flex flex-col gap-[10px]">{children}</div>}
    </div>
  );
}
