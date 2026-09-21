interface UpdateAvailableProps {
  version: string;
  onUpdate: () => void;
}

export function UpdateAvailable({
  version,
  onUpdate,
}: UpdateAvailableProps) {
  return (
    <div
      style={{
        position: "fixed",
        right: "20px",
        bottom: "20px",
        zIndex: 99999,
        width: "360px",
        maxWidth: "calc(100vw - 40px)",
        background: "#0f172a",
        border: "1px solid rgba(59,130,246,0.35)",
        borderRadius: "18px",
        padding: "20px",
        color: "#fff",
        boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background:
              "linear-gradient(135deg, #2563eb, #06b6d4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "22px",
            fontWeight: 900,
          }}
        >
          ↻
        </div>

        <div>
          <div
            style={{
              fontSize: "16px",
              fontWeight: 800,
            }}
          >
            Update Available
          </div>

          <div
            style={{
              fontSize: "12px",
              color: "#94a3b8",
              marginTop: "3px",
            }}
          >
            Sparezy {version} is ready
          </div>
        </div>
      </div>

      <p
        style={{
          margin: "0 0 16px",
          fontSize: "13px",
          lineHeight: 1.5,
          color: "#cbd5e1",
        }}
      >
        A new version of Sparezy is available.
        Update now to get the latest changes.
      </p>

      <button
        onClick={onUpdate}
        style={{
          width: "100%",
          border: "none",
          borderRadius: "10px",
          padding: "12px 16px",
          background:
            "linear-gradient(135deg, #2563eb, #06b6d4)",
          color: "#fff",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        Update Now
      </button>
    </div>
  );
}