import { createContext, useContext, useState, useCallback } from "react";

const ToastContext = createContext(null);

const TYPE_STYLES = {
  error:   { bg: "#FDEDEC", border: "#E74C3C", color: "#922B21", icon: "⚠️" },
  success: { bg: "#E9F7EF", border: "#27AE60", color: "#1E8449", icon: "✓"  },
  info:    { bg: "#EBF5FB", border: "#2980B9", color: "#1A5276", icon: "ℹ️" },
  warning: { bg: "#FEF3E2", border: "#E67E22", color: "#784212", icon: "⚠️" },
};

function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{
      position: "fixed", bottom: "calc(80px + env(safe-area-inset-bottom,0px))",
      left: 12, right: 12, zIndex: 99999,
      display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    }}>
      {toasts.map(t => {
        const s = TYPE_STYLES[t.type] || TYPE_STYLES.error;
        return (
          <div key={t.id} style={{
            background: s.bg, border: `1px solid ${s.border}`, borderLeft: `4px solid ${s.border}`,
            padding: "11px 14px", borderRadius: 6, display: "flex", gap: 10, alignItems: "flex-start",
            boxShadow: "0 2px 12px rgba(0,0,0,.15)", pointerEvents: "auto",
            animation: "toastIn .25s ease",
          }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>{s.icon}</span>
            <span style={{ fontSize: 13, color: s.color, lineHeight: 1.5, flex: 1 }}>{t.msg}</span>
          </div>
        );
      })}
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((msg, type = "error") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  // Fallback: jeśli ktoś użyje poza providerem
  if (!ctx) return { addToast: (msg) => alert(msg) };
  return ctx;
}
