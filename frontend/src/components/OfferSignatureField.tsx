import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Mode = "draw" | "upload";

type Props = {
  disabled?: boolean;
  onSignatureChange: (file: File | null) => void;
};

const CANVAS_H = 140;

/**
 * Capture affixed signature: draw on canvas or upload an image file.
 */
export function OfferSignatureField({ disabled, onSignatureChange }: Props) {
  const [mode, setMode] = useState<Mode>("draw");
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  const emitCanvasPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size < 40) {
          onSignatureChange(null);
          return;
        }
        onSignatureChange(
          new File([blob], "signature.png", { type: "image/png" }),
        );
      },
      "image/png",
      0.92,
    );
  }, [onSignatureChange]);

  useLayoutEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const w = Math.max(280, wrap.clientWidth);
    const h = CANVAS_H;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    onSignatureChange(null);
  }, [mode, onSignatureChange]);

  useEffect(() => {
    return () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    };
  }, [uploadPreview]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = pos(e);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    emitCanvasPng();
  };

  const clearDrawing = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const w = Math.max(280, wrap.clientWidth);
    const h = CANVAS_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    onSignatureChange(null);
  };

  const switchMode = (next: Mode) => {
    if (disabled) return;
    if (next === mode) return;
    if (uploadPreview) {
      URL.revokeObjectURL(uploadPreview);
      setUploadPreview(null);
    }
    setMode(next);
    if (next === "upload") {
      onSignatureChange(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchMode("draw")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "draw"
              ? "bg-violet-100 text-violet-900"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          } disabled:opacity-50`}
        >
          Draw
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => switchMode("upload")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
            mode === "upload"
              ? "bg-violet-100 text-violet-900"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          } disabled:opacity-50`}
        >
          Upload
        </button>
      </div>

      {mode === "draw" ? (
        <div ref={wrapRef} className="w-full">
          <canvas
            ref={canvasRef}
            className="w-full touch-none rounded-lg border border-slate-300 bg-white"
            style={{ height: CANVAS_H, touchAction: "none" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={clearDrawing}
            className="mt-2 text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:opacity-50"
          >
            Clear drawing
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Upload signature image"
            disabled={disabled}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f || !f.type.startsWith("image/")) {
                if (uploadPreview) URL.revokeObjectURL(uploadPreview);
                setUploadPreview(null);
                onSignatureChange(null);
                return;
              }
              if (uploadPreview) URL.revokeObjectURL(uploadPreview);
              const url = URL.createObjectURL(f);
              setUploadPreview(url);
              onSignatureChange(f);
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Choose image…
          </button>
          {uploadPreview ? (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
              <img
                src={uploadPreview}
                alt="Signature preview"
                className="mx-auto max-h-32 max-w-full object-contain"
              />
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              PNG or JPG, max 5 MB recommended.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
