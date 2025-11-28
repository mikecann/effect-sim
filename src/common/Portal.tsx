/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from "react";

export type PortalContextType = {
  appendPortal: (portal: React.ReactNode) => void;
  removePortal: (portal: React.ReactNode) => void;
};

export const PortalProvider = ({ children }: { children: React.ReactNode }) => {
  const [portals, setPortals] = useState<React.ReactNode[]>([]);

  return (
    <PortalContext.Provider
      value={{
        appendPortal: (p) => setPortals([...portals, p]),
        removePortal: (pp) => setPortals(portals.filter((p) => p !== pp)),
      }}
    >
      {children}
      <>
        {portals.map((p, i) => (
          <React.Fragment key={i}>{p}</React.Fragment>
        ))}
      </>
    </PortalContext.Provider>
  );
};

export const PortalContext = createContext<PortalContextType | null>(null);

export const Portal = ({ children }: { children: React.ReactNode }) => {
  const { appendPortal, removePortal } = usePortal();

  useEffect(() => {
    appendPortal(children);
    return () => {
      removePortal(children);
    };
  }, [appendPortal, removePortal, children]);

  return null;
};

export const usePortal = () => {
  const context = useContext(PortalContext);
  if (!context) 
    throw new Error("usePortal must be used within a PortalProvider");
  
  return context;
};
