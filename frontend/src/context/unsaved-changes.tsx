import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";
import { ConfirmDialog } from "../components/ConfirmDialog";

export type UnsavedChangesDialogController = {
  open: boolean;
  onStay: () => void;
  onLeave: () => void;
};

type Registration = {
  isDirty: boolean;
  bypass: boolean;
  title?: string;
  description?: string;
  getRenderDialog?: () =>
    | ((ctrl: UnsavedChangesDialogController) => ReactNode)
    | undefined;
};

type UnsavedChangesContextValue = {
  setRegistration: (id: string, registration: Registration | null) => void;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(
  null,
);

const DEFAULT_TITLE = "Leave this page?";
const DEFAULT_DESCRIPTION =
  "You have unsaved changes. Leave this page?";

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState<
    Record<string, Registration>
  >({});

  const setRegistration = useCallback(
    (id: string, registration: Registration | null) => {
      setRegistrations((prev) => {
        if (registration == null) {
          if (!(id in prev)) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        }
        const existing = prev[id];
        if (
          existing &&
          existing.isDirty === registration.isDirty &&
          existing.bypass === registration.bypass &&
          existing.title === registration.title &&
          existing.description === registration.description &&
          existing.getRenderDialog === registration.getRenderDialog
        ) {
          return prev;
        }
        return { ...prev, [id]: registration };
      });
    },
    [],
  );

  const active = useMemo(() => {
    return (
      Object.values(registrations).find((r) => r.isDirty && !r.bypass) ?? null
    );
  }, [registrations]);

  const shouldBlock = Boolean(active);

  useEffect(() => {
    if (!shouldBlock) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [shouldBlock]);

  const shouldBlockRouterNavigation = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      shouldBlock && currentLocation.pathname !== nextLocation.pathname,
    [shouldBlock],
  );

  const blocker = useBlocker(shouldBlockRouterNavigation);

  const ctrl: UnsavedChangesDialogController = {
    open: blocker.state === "blocked",
    onStay: () => blocker.reset?.(),
    onLeave: () => blocker.proceed?.(),
  };

  const customDialog = active?.getRenderDialog?.()?.(ctrl);

  return (
    <UnsavedChangesContext.Provider value={{ setRegistration }}>
      {children}
      {customDialog ?? (
        <ConfirmDialog
          open={ctrl.open}
          title={active?.title ?? DEFAULT_TITLE}
          description={active?.description ?? DEFAULT_DESCRIPTION}
          cancelLabel="Stay"
          confirmLabel="Leave"
          onCancel={ctrl.onStay}
          onConfirm={ctrl.onLeave}
        />
      )}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChangesGuard(options: {
  isDirty: boolean;
  bypass?: boolean;
  title?: string;
  description?: string;
  renderDialog?: (ctrl: UnsavedChangesDialogController) => ReactNode;
}): void {
  const ctx = useContext(UnsavedChangesContext);
  const id = useId();
  const bypass = options.bypass ?? false;
  const renderDialogRef = useRef(options.renderDialog);
  renderDialogRef.current = options.renderDialog;

  const getRenderDialog = useCallback(
    () => renderDialogRef.current,
    [],
  );

  useEffect(() => {
    if (!ctx) return;
    ctx.setRegistration(id, {
      isDirty: options.isDirty,
      bypass,
      title: options.title,
      description: options.description,
      getRenderDialog: options.renderDialog ? getRenderDialog : undefined,
    });
    return () => ctx.setRegistration(id, null);
  }, [
    ctx,
    id,
    options.isDirty,
    options.title,
    options.description,
    options.renderDialog,
    bypass,
    getRenderDialog,
  ]);
}
