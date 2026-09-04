import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
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

function pickActive(
  registrations: Record<string, Registration>,
): Registration | null {
  return (
    Object.values(registrations).find((r) => r.isDirty && !r.bypass) ?? null
  );
}

function sameRegistration(
  a: Registration | undefined,
  b: Registration,
): boolean {
  return Boolean(
    a &&
      a.isDirty === b.isDirty &&
      a.bypass === b.bypass &&
      a.title === b.title &&
      a.description === b.description &&
      a.getRenderDialog === b.getRenderDialog,
  );
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const registrationsRef = useRef<Record<string, Registration>>({});
  const [active, setActive] = useState<Registration | null>(null);

  const setRegistration = useCallback(
    (id: string, registration: Registration | null) => {
      const prev = registrationsRef.current;
      if (registration == null) {
        if (!(id in prev)) return;
        const next = { ...prev };
        delete next[id];
        registrationsRef.current = next;
      } else if (sameRegistration(prev[id], registration)) {
        return;
      } else {
        registrationsRef.current = { ...prev, [id]: registration };
      }
      const nextActive = pickActive(registrationsRef.current);
      setActive((current) => {
        if (current == null && nextActive == null) return current;
        if (current && nextActive && sameRegistration(current, nextActive)) {
          return current;
        }
        return nextActive;
      });
    },
    [],
  );

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
      currentLocation.pathname !== nextLocation.pathname,
    [],
  );

  // Pass `false` when idle so React Router does not keep a blocker subscribed.
  // An always-on function blocker can leave PUSH navigations with a new URL and
  // a stuck UI after the source page unregisters during the transition.
  const blocker = useBlocker(
    shouldBlock ? shouldBlockRouterNavigation : false,
  );

  useEffect(() => {
    if (blocker.state !== "blocked" || shouldBlock) return;
    blocker.proceed?.();
  }, [blocker.state, blocker.proceed, shouldBlock]);

  const ctrl: UnsavedChangesDialogController = {
    open: blocker.state === "blocked" && shouldBlock,
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
  const isBlocking = options.isDirty && !bypass;
  const renderDialogRef = useRef(options.renderDialog);
  renderDialogRef.current = options.renderDialog;

  const getRenderDialog = useCallback(
    () => renderDialogRef.current,
    [],
  );

  useEffect(() => {
    if (!ctx) return;
    if (!isBlocking) {
      ctx.setRegistration(id, null);
      return;
    }
    ctx.setRegistration(id, {
      isDirty: true,
      bypass: false,
      title: options.title,
      description: options.description,
      getRenderDialog: options.renderDialog ? getRenderDialog : undefined,
    });
    return () => ctx.setRegistration(id, null);
  }, [
    ctx,
    id,
    isBlocking,
    options.title,
    options.description,
    options.renderDialog,
    getRenderDialog,
  ]);
}
