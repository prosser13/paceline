'use client';

// Tabbed sub-navigation for the Settings page. Each section's content is a group of
// server-rendered SettingsCards passed in as a prop (supported: Server Components as
// props to a Client Component); only the active section is mounted. The initial tab
// comes from the server (?tab=), and switching updates the URL via replaceState — no
// navigation, no reload, no useSearchParams/Suspense.

import { useState, type ReactNode } from 'react';

export interface SettingsSection {
  id: string;
  label: string;
  color: string;   // CSS colour for the active pill
  content: ReactNode;
}

export default function SettingsTabs({ sections, initialTab }: { sections: SettingsSection[]; initialTab?: string }) {
  const [active, setActive] = useState(() =>
    sections.some(s => s.id === initialTab) ? (initialTab as string) : sections[0]?.id,
  );
  const activeSection = sections.find(s => s.id === active) ?? sections[0];

  const select = (id: string) => {
    setActive(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', id);
      window.history.replaceState(null, '', url);
    }
  };

  return (
    <>
      <div role="tablist" aria-label="Settings sections" className="flex flex-wrap gap-[6px] mb-[18px]">
        {sections.map(s => {
          const on = s.id === active;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={on}
              onClick={() => select(s.id)}
              className={`text-[12px] font-semibold rounded-full px-[13px] py-[6px] border transition-colors ${
                on ? '' : 'text-stone border-fog hover:text-ink hover:border-stone'
              }`}
              style={on ? { background: s.color, borderColor: s.color, color: 'var(--color-bone)' } : undefined}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{activeSection?.content}</div>
    </>
  );
}
