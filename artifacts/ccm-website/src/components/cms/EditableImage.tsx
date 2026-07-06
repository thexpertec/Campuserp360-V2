import { useEffect, useRef, useState, type ReactNode } from "react";
import { useEditMode } from "@/lib/edit-mode";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, Loader2, ImageOff } from "lucide-react";
import { MediaPicker } from "./MediaPicker";

type Props = {
  /** Current image URL (block content / setting / hardcoded fallback). */
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  /** Inline styles applied directly to the <img> element. */
  imgStyle?: React.CSSProperties;
  width?: number;
  height?: number;
  loading?: "lazy" | "eager";
  /** Persist target — supply either a page-block (page+blockKey) or a setting. */
  page?: string;
  blockKey?: string;
  settingKey?: string;
  /** Notify parent of a new URL (for local state mirrors). */
  onChange?: (url: string) => void;
  /** Rendered instead of an <img> when no image URL is set yet. */
  placeholder?: ReactNode;
};

/**
 * Click-to-replace image.
 *
 * - Never renders <img src=""> — avoids browser page re-download.
 * - Shows a shimmer skeleton while the image is loading, then fades it in.
 * - In view mode with no src: renders `placeholder` if provided, else nothing.
 * - In edit mode with no src: renders an upload-prompt placeholder.
 */
export default function EditableImage({
  src, alt = "", className, imgClassName, imgStyle, width, height, loading = "lazy",
  page, blockKey, settingKey, onChange, placeholder,
}: Props) {
  const { enabled, savePageBlock, saveSetting } = useEditMode();
  const { toast } = useToast();
  const [current, setCurrent] = useState(src || "");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) {
      const next = src || "";
      if (next !== current) {
        setCurrent(next);
        setLoaded(false);
        setErrored(false);
      }
    }
  }, [src]);

  async function applyUrl(url: string) {
    setBusy(true);
    try {
      if (settingKey) await saveSetting(settingKey, url);
      else if (page && blockKey) await savePageBlock(page, blockKey, url, "image");
      dirty.current = true;
      setCurrent(url);
      setLoaded(false);
      setErrored(false);
      onChange?.(url);
      toast({ title: "Image updated" });
    } catch (err: any) {
      toast({ title: "Save failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  const hasUrl = !!current;

  // Build the body to display
  let body: ReactNode;

  if (hasUrl) {
    // Combine class names: shimmer during load, nothing after load
    const shimmerCls = !loaded && !errored
      ? "bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 animate-pulse"
      : "";

    body = (
      <img
        src={current}
        alt={alt}
        className={[imgClassName ?? className, shimmerCls].filter(Boolean).join(" ")}
        {...(width ? { width } : {})}
        {...(height ? { height } : {})}
        style={{
          opacity: loaded ? 1 : errored ? 0.4 : 0.01,
          transition: "opacity 0.35s ease",
          ...(imgStyle ?? {}),
        }}
        loading={loading}
        onLoad={() => { setLoaded(true); setErrored(false); }}
        onError={() => { setErrored(true); setLoaded(false); }}
      />
    );
  } else if (placeholder) {
    body = placeholder;
  } else if (enabled) {
    // Edit mode — show an upload prompt in place of the missing image
    body = (
      <div
        className={[imgClassName ?? className, "flex items-center justify-center bg-gray-100 border-2 border-dashed border-gray-300 text-gray-400 cursor-pointer hover:bg-gray-50 transition-colors"].filter(Boolean).join(" ")}
        style={imgStyle}
      >
        <div className="flex flex-col items-center gap-1 text-xs">
          <ImagePlus className="h-6 w-6 opacity-50" />
          <span>Click to add image</span>
        </div>
      </div>
    );
  } else {
    // View mode, no src, no placeholder — render nothing (no broken img)
    body = null;
  }

  if (!enabled) return body;

  return (
    <div className={`cms-image-edit ${className ?? ""}`.trim()}>
      {body}
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        disabled={busy}
        className="cms-image-edit__btn"
        title="Change image"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
        <span>{busy ? "Saving…" : "Change image"}</span>
      </button>
      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={applyUrl}
      />
    </div>
  );
}
