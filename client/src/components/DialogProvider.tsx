'use client';

import React, { createContext, useContext, useState, ReactNode, useRef, useEffect } from 'react';
import { Sparkles, Eye, Pencil } from 'lucide-react';

type DialogType = 'alert' | 'confirm' | 'prompt';

interface DialogOptions {
  type: DialogType;
  message: string;
  defaultValue?: string;
}

interface DialogContextValue {
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
  showPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<DialogOptions | null>(null);
  const [inputValue, setInputValue] = useState('');
  const resolveRef = useRef<((value: any) => void) | null>(null);

  const showAlert = (message: string): Promise<void> => {
    return new Promise((resolve) => {
      setOptions({ type: 'alert', message });
      resolveRef.current = resolve as any;
    });
  };

  const showConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setOptions({ type: 'confirm', message });
      resolveRef.current = resolve;
    });
  };

  const showPrompt = (message: string, defaultValue: string = ''): Promise<string | null> => {
    return new Promise((resolve) => {
      setOptions({ type: 'prompt', message, defaultValue });
      setInputValue(defaultValue);
      resolveRef.current = resolve;
    });
  };

  const handleClose = (value: any) => {
    setOptions(null);
    if (resolveRef.current) {
      resolveRef.current(value);
      resolveRef.current = null;
    }
  };

  // Prevent scrolling when dialog is open
  useEffect(() => {
    if (options) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [options]);

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      
      {options && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden w-full max-w-sm transform animate-in zoom-in-95 duration-200 border-4 border-sky-100">
            {/* Header / Art */}
            <div className={`h-16 flex items-center justify-center ${options.type === 'alert' ? 'bg-orange-400' : options.type === 'confirm' ? 'bg-rose-400' : 'bg-sky-400'}`}>
               <span className="text-white drop-shadow-sm flex items-center justify-center">
                 {options.type === 'alert' ? <Sparkles className="w-8 h-8" /> : options.type === 'confirm' ? <Eye className="w-8 h-8" /> : <Pencil className="w-8 h-8" />}
               </span>
            </div>
            
            <div className="p-6 text-center">
              <p className="text-lg font-bold text-slate-700 mb-6 font-nunito leading-snug">
                {options.message}
              </p>
              
              {options.type === 'prompt' && (
                <input
                  type="text"
                  autoFocus
                  className="w-full text-center border-2 border-slate-200 rounded-2xl p-3 mb-6 text-slate-700 font-bold outline-none focus:border-sky-400 transition-colors"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleClose(inputValue);
                    if (e.key === 'Escape') handleClose(null);
                  }}
                />
              )}
              
              <div className="flex gap-3 justify-center font-nunito font-bold">
                {options.type !== 'alert' && (
                  <button
                    onClick={() => handleClose(options.type === 'prompt' ? null : false)}
                    className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
                  >
                    Batal
                  </button>
                )}
                
                <button
                  onClick={() => handleClose(options.type === 'prompt' ? inputValue : true)}
                  className={`flex-1 py-3 px-4 rounded-2xl text-white active:scale-95 transition-all shadow-md ${
                    options.type === 'alert' ? 'bg-orange-500 hover:bg-orange-400' 
                    : options.type === 'confirm' ? 'bg-rose-500 hover:bg-rose-400'
                    : 'bg-sky-500 hover:bg-sky-400'
                  }`}
                >
                  {options.type === 'alert' ? 'OK!' : options.type === 'confirm' ? 'Ya, Yakin!' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
