import React, { useEffect } from 'react';
import { X, Keyboard, Command, ArrowRight, CornerDownLeft, Sparkles } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcutSections = [
    {
      title: 'Global Navigation',
      shortcuts: [
        { keys: ['Alt', '1...9'], desc: 'Jump directly to module (Dashboard, Inventory, Sales, Order Requests, etc.)' },
        { keys: ['Alt', 'B'], desc: 'Toggle active brand between Hyundai and Mahindra' },
        { keys: ['/'], desc: 'Quick-focus search bar on the active page (or Ctrl+K)' },
        { keys: ['Shift', 'R'], desc: 'Trigger global database sync & refresh' },
        { keys: ['?'], desc: 'Open / close this keyboard shortcuts guide (or Ctrl+/)' },
        { keys: ['Esc'], desc: 'Close open modal, dropdown, drawer, or clear search' },
      ],
    },
    {
      title: 'Order Requests & Bulk Actions',
      shortcuts: [
        { keys: ['Ctrl', 'A'], desc: 'Select all / deselect all order request items' },
        { keys: ['Ctrl', 'E'], desc: 'Export selected / all order requests to Excel' },
        { keys: ['Ctrl', 'Enter'], desc: 'Instantly confirm batch acceptance modal' },
        { keys: ['Esc'], desc: 'Cancel selection, close export menu or modals' },
      ],
    },
    {
      title: 'Operator Portal & Login',
      shortcuts: [
        { keys: ['1', 'or', 'H'], desc: 'Select Hyundai Business Unit on Brand Link screen' },
        { keys: ['2', 'or', 'M'], desc: 'Select Mahindra Business Unit on Brand Link screen' },
        { keys: ['Alt', 'P'], desc: 'Toggle password show/hide on login' },
        { keys: ['Enter'], desc: 'Submit operator login or registration form' },
        { keys: ['Esc'], desc: 'Log out of current session' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/70 backdrop-blur-xs animate-fade-in no-print">
      <div 
        className="fixed inset-0" 
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                Sparezy Keyboard Optimization Guide
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  v2.4
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Speed up workflows and data entry without reaching for the mouse.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close keyboard shortcuts"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Shortcuts Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs divide-y divide-slate-800/80">
          {shortcutSections.map((section, idx) => (
            <div key={section.title} className={idx > 0 ? "pt-5" : ""}>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-1.5">
                <span>{section.title}</span>
              </h3>
              <div className="grid grid-cols-1 gap-2.5">
                {section.shortcuts.map((item, sIdx) => (
                  <div 
                    key={sIdx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition"
                  >
                    <span className="text-slate-300 font-medium text-xs leading-normal pr-4">
                      {item.desc}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, kIdx) => {
                        if (k === 'or') {
                          return <span key={kIdx} className="text-[10px] text-slate-500 font-sans mx-0.5">or</span>;
                        }
                        return (
                          <kbd 
                            key={kIdx}
                            className="inline-flex items-center justify-center min-w-[22px] px-2 py-1 text-[11px] font-mono font-bold text-slate-200 bg-slate-900 border border-slate-700/80 rounded-md shadow-xs shadow-black/40"
                          >
                            {k}
                          </kbd>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800/90 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Shortcuts are active across all modules</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer"
          >
            Close (Esc)
          </button>
        </div>

      </div>
    </div>
  );
}
