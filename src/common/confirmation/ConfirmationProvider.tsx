/* eslint-disable react-refresh/only-export-components */
import type {
  ReactNode} from "react";
import React, {
  createContext,
  useContext,
  useState,
  useRef,
} from "react";
import ConfirmationModal from "./ConfirmationModal";

interface ConfirmationOptions {
  title: string;
  content: ReactNode;
  cancelButton?: ReactNode | string;
  confirmButton?: ReactNode | string;
  confirmButtonColor?: string;
  confirmButtonVariant?: string;
}

interface ConfirmationContextType {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextType | null>(null);

interface ConfirmationState extends ConfirmationOptions {
  opened: boolean;
  loading: boolean;
}

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmationState>({
    title: "",
    content: "",
    opened: false,
    loading: false,
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = (options: ConfirmationOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        ...options,
        opened: true,
        loading: false,
      });
    });
  };

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      <ConfirmationModal
        opened={state.opened}
        onClose={() => {
          setState((prev) => ({ ...prev, opened: false }));
          if (resolveRef.current) {
            resolveRef.current(false);
            resolveRef.current = null;
          }
        }}
        title={state.title}
        cancelButton={state.cancelButton}
        confirmButton={state.confirmButton}
        confirmButtonColor={state.confirmButtonColor}
        confirmButtonVariant={state.confirmButtonVariant}
        confirmLoading={state.loading}
        onConfirm={() => {
          setState((prev) => ({ ...prev, loading: true }));
          if (resolveRef.current) {
            resolveRef.current(true);
            resolveRef.current = null;
          }
          setState((prev) => ({ ...prev, opened: false, loading: false }));
        }}
      >
        {state.content}
      </ConfirmationModal>
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const context = useContext(ConfirmationContext);
  if (!context) 
    throw new Error(
      "useConfirmation must be used within a ConfirmationProvider",
    );
  
  return context;
}
