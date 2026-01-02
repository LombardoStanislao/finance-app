import { createContext, useContext, useState, type ReactNode } from 'react';

interface PrivacyContextType {
  isPrivacyEnabled: boolean;
  togglePrivacy: () => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

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

  return (
    <PrivacyContext.Provider value={{ isPrivacyEnabled, togglePrivacy }}>
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