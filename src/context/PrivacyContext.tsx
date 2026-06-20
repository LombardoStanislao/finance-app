import { createContext, useContext, useState, type ReactNode } from 'react';
import { formatCurrency } from '../lib/utils';

interface PrivacyContextType {
  isPrivacyEnabled: boolean;
  togglePrivacy: () => void;
  hide: (value: number | string, isCurrency?: boolean) => string;
}

export const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

export function PrivacyProvider({ children }: { children: ReactNode }) {
  // Inizializza leggendo dal localStorage per ricordare la scelta dell'utente
  const [isPrivacyEnabled, setIsPrivacyEnabled] = useState(() => {
    const saved = localStorage.getItem('privacyMode');
    return saved === 'true';
  });

  const togglePrivacy = () => {
    setIsPrivacyEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem('privacyMode', String(newValue));
      return newValue;
    });
  };

  const hide = (value: number | string, isCurrency = true) => {
    if (isPrivacyEnabled) return '****'
    if (typeof value === 'number' && isCurrency) return formatCurrency(value)
    return String(value)
  }

  return (
    <PrivacyContext.Provider value={{ isPrivacyEnabled, togglePrivacy, hide }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error('usePrivacy must be used within a PrivacyProvider');
  }
  return context;
}