import {
  forwardRef, useImperativeHandle, useEffect, useRef, useState,
} from "react";
import { useEditor, EditorContent, Extension, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Superscript as SuperIcon, Subscript as SubIcon,
  Pilcrow, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Link as LinkIcon, Table as TableIcon, Image as ImageIcon,
  Undo2, Redo2, ChevronDown, Type, Highlighter,
  Plus, Minus, Trash2,
} from "lucide-react";

// ─── Custom Extensions ────────────────────────────────────────────────────────

const ParagraphStyle = Extension.create({
  name: "paragraphStyle",
  addOptions() { return { types: ["paragraph", "heading"] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        lineHeight: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.lineHeight || null,
          renderHTML: (attrs: Record<string, string | null>) =>
            attrs.lineHeight ? { style: `line-height: ${attrs.lineHeight}` } : {},
        },
        marginTop: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.marginTop || null,
          renderHTML: (attrs: Record<string, string | null>) =>
            attrs.marginTop ? { style: `margin-top: ${attrs.marginTop}` } : {},
        },
        marginBottom: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.marginBottom || null,
          renderHTML: (attrs: Record<string, string | null>) =>
            attrs.marginBottom ? { style: `margin-bottom: ${attrs.marginBottom}` } : {},
        },
      },
    }];
  },
});

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() { return { types: ["textStyle"] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) =>
            el.style.fontSize?.replace(/['"]+/g, "") || null,
          renderHTML: (attrs: Record<string, string | null>) =>
            attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type RichTextEditorHandle = {
  insertText: (text: string) => void;
  focus: () => void;
  getHtml: () => string;
  setContent: (html: string) => void;
};

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number | string;
  onFocus?: () => void;
};

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolbarButton({
  active = false,
  onClick,
  disabled = false,
  title,
  className,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "h-7 w-7 p-0 rounded shrink-0",
        active && "bg-primary/10 text-primary",
        className,
      )}
    >
      {children}
    </Button>
  );
}

// ─── Font Size Menu ───────────────────────────────────────────────────────────

const FONT_SIZE_PRESETS = ["10", "12", "14", "16", "18", "20", "24", "28", "32", "36", "48", "64", "72"];

function FontSizeMenu({ editor }: { editor: Editor }) {
  const [custom, setCustom] = useState("");
  const [open, setOpen] = useState(false);

  const currentSize: string =
    (editor.getAttributes("textStyle") as Record<string, string>).fontSize ?? "";

  function applySize(size: string) {
    let val = size.trim();
    if (!val) return;
    if (/^\d+(\.\d+)?$/.test(val)) val = val + "px";
    editor.chain().focus().setMark("textStyle", { fontSize: val }).run();
    setOpen(false);
  }

  function clearSize() {
    editor.chain().focus().unsetMark("textStyle").run();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Font size"
          className={cn(
            "flex items-center gap-0.5 h-7 px-1.5 rounded text-xs font-medium border border-transparent",
            "hover:bg-muted transition-colors",
            currentSize && "border-border text-primary",
          )}
        >
          <Type className="h-3.5 w-3.5" />
          <span className="min-w-[22px] text-center">{currentSize ? currentSize.replace("px", "") : "—"}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="start">
        <div className="grid grid-cols-5 gap-1 mb-3">
          {FONT_SIZE_PRESETS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => applySize(s + "px")}
              className={cn(
                "h-8 rounded text-xs font-medium border border-transparent hover:border-border hover:bg-muted transition-colors",
                currentSize === s + "px" && "bg-primary/10 border-primary/30 text-primary",
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 mb-2">
          <input
            type="text"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => e.key === "Enter" && applySize(custom)}
            placeholder="e.g. 18px"
            className="flex-1 h-7 px-2 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={() => applySize(custom)}>
            Apply
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={clearSize}>
          Reset
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Color Picker ─────────────────────────────────────────────────────────────

const TEXT_SWATCHES = [
  "#000000", "#374151", "#6B7280", "#9CA3AF",
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#22C55E", "#10B981", "#14B8A6", "#06B6D4",
  "#3B82F6", "#6366F1", "#8B5CF6", "#A855F7",
  "#EC4899", "#F43F5E", "#8BC34A", "#FFFFFF",
];

const HIGHLIGHT_SWATCHES = [
  "#FEF3C7", "#FDE68A", "#FCA5A5", "#F9A8D4",
  "#DDD6FE", "#BFDBFE", "#A7F3D0", "#BBF7D0",
  "#FED7AA", "#FECACA", "#E5E7EB", "#FFFFFF",
];

function ColorPicker({
  editor,
  type,
  icon,
  title,
}: {
  editor: Editor;
  type: "text" | "highlight";
  icon: React.ReactNode;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const swatches = type === "text" ? TEXT_SWATCHES : HIGHLIGHT_SWATCHES;

  const active = type === "text"
    ? editor.isActive("textStyle") && !!(editor.getAttributes("textStyle") as Record<string, string>).color
    : editor.isActive("highlight");

  function applyColor(color: string) {
    if (type === "text") {
      editor.chain().focus().setColor(color).run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    setOpen(false);
  }

  function clearColor() {
    if (type === "text") {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().unsetHighlight().run();
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          className={cn(
            "flex items-center gap-0.5 h-7 px-1 rounded border border-transparent",
            "hover:bg-muted transition-colors",
            active && "bg-primary/10 text-primary",
          )}
        >
          {icon}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-3" align="start">
        <div className={cn("grid gap-1 mb-3", type === "text" ? "grid-cols-5" : "grid-cols-4")}>
          {swatches.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => applyColor(color)}
              className="h-7 w-7 rounded border border-border hover:scale-110 transition-transform"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
        <div className="flex gap-1.5 mb-2 items-center">
          <label className="text-xs text-muted-foreground">Custom:</label>
          <input
            type="color"
            className="h-7 w-10 cursor-pointer rounded border border-input"
            onChange={e => applyColor(e.target.value)}
          />
        </div>
        <Button type="button" variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={clearColor}>
          Clear
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Spacing Menu ─────────────────────────────────────────────────────────────

const LINE_HEIGHTS = ["1.0", "1.15", "1.5", "2.0", "2.5", "3.0"];
const SPACING_VALUES = ["0", "4px", "8px", "12px", "16px", "24px", "32px"];

function SpacingMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);

  const currentLH: string =
    (editor.getAttributes("paragraph") as Record<string, string>).lineHeight ?? "";

  function setLineHeight(lh: string) {
    editor.chain().focus()
      .updateAttributes("paragraph", { lineHeight: lh })
      .updateAttributes("heading", { lineHeight: lh })
      .run();
  }

  function setSpacingBefore(val: string) {
    editor.chain().focus()
      .updateAttributes("paragraph", { marginTop: val === "0" ? null : val })
      .updateAttributes("heading", { marginTop: val === "0" ? null : val })
      .run();
  }

  function setSpacingAfter(val: string) {
    editor.chain().focus()
      .updateAttributes("paragraph", { marginBottom: val === "0" ? null : val })
      .updateAttributes("heading", { marginBottom: val === "0" ? null : val })
      .run();
  }

  function reset() {
    editor.chain().focus()
      .updateAttributes("paragraph", { lineHeight: null, marginTop: null, marginBottom: null })
      .updateAttributes("heading", { lineHeight: null, marginTop: null, marginBottom: null })
      .run();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Line & paragraph spacing"
          className="flex items-center gap-0.5 h-7 px-1 rounded border border-transparent hover:bg-muted transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2h14v1.5H1zm0 4h14v1.5H1zm0 4h14v1.5H1zm0 4h14v1.5H1z" opacity=".4"/>
            <path d="M.5 1 3 4H1.5v8H3l-2.5 3L.5 15V1z"/>
          </svg>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-3" align="start">
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Line spacing</div>
          <div className="grid grid-cols-6 gap-1">
            {LINE_HEIGHTS.map(lh => (
              <button
                key={lh}
                type="button"
                onClick={() => setLineHeight(lh)}
                className={cn(
                  "h-8 rounded text-xs border border-transparent hover:border-border hover:bg-muted transition-colors",
                  parseFloat(currentLH) === parseFloat(lh) && "bg-primary/10 border-primary/30 text-primary",
                )}
              >
                {lh}
              </button>
            ))}
          </div>
        </div>
        <Separator />
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Space before</div>
          <div className="grid grid-cols-4 gap-1">
            {SPACING_VALUES.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setSpacingBefore(v)}
                className="h-7 rounded text-xs border border-transparent hover:border-border hover:bg-muted transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1.5">Space after</div>
          <div className="grid grid-cols-4 gap-1">
            {SPACING_VALUES.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setSpacingAfter(v)}
                className="h-7 rounded text-xs border border-transparent hover:border-border hover:bg-muted transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" className="w-full h-7 text-xs" onClick={reset}>
          Reset all
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Table Menu ───────────────────────────────────────────────────────────────

function TableMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const inTable = editor.isActive("table");

  function act(fn: () => void) {
    fn();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Table"
          className={cn(
            "flex items-center gap-0.5 h-7 px-1.5 rounded border border-transparent text-xs font-medium",
            "hover:bg-muted transition-colors",
            inTable && "bg-primary/10 text-primary",
          )}
        >
          <TableIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline ml-0.5">Table</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        <button
          type="button"
          onClick={() => act(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
          className="w-full flex items-center gap-2 h-8 px-3 text-sm rounded hover:bg-muted transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Insert table (3×3)
        </button>
        <Separator className="my-1" />
        <button
          type="button"
          onClick={() => act(() => editor.chain().focus().addRowAfter().run())}
          disabled={!inTable}
          className="w-full flex items-center gap-2 h-8 px-3 text-sm rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Plus className="h-3.5 w-3.5" /> Add row below
        </button>
        <button
          type="button"
          onClick={() => act(() => editor.chain().focus().deleteRow().run())}
          disabled={!inTable}
          className="w-full flex items-center gap-2 h-8 px-3 text-sm rounded hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Minus className="h-3.5 w-3.5" /> Delete row
        </button>
        <button
          type="button"
          onClick={() => act(() => editor.chain().focus().addColumnAfter().run())}
          disabled={!inTable}
          className="w-full flex items-center gap-2 h-8 px-3 text-sm rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Plus className="h-3.5 w-3.5" /> Add column right
        </button>
        <button
          type="button"
          onClick={() => act(() => editor.chain().focus().deleteColumn().run())}
          disabled={!inTable}
          className="w-full flex items-center gap-2 h-8 px-3 text-sm rounded hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Minus className="h-3.5 w-3.5" /> Delete column
        </button>
        <Separator className="my-1" />
        <button
          type="button"
          onClick={() => act(() => editor.chain().focus().mergeCells().run())}
          disabled={!inTable}
          className="w-full flex items-center gap-2 h-8 px-3 text-sm rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Merge cells
        </button>
        <button
          type="button"
          onClick={() => act(() => editor.chain().focus().splitCell().run())}
          disabled={!inTable}
          className="w-full flex items-center gap-2 h-8 px-3 text-sm rounded hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          Split cell
        </button>
        <Separator className="my-1" />
        <button
          type="button"
          onClick={() => act(() => editor.chain().focus().deleteTable().run())}
          disabled={!inTable}
          className="w-full flex items-center gap-2 h-8 px-3 text-sm rounded hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete table
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: Editor }) {
  const imageInputRef = useRef<HTMLInputElement>(null);

  function insertImage() {
    imageInputRef.current?.click();
  }

  function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function setLink() {
    const prev = (editor.getAttributes("link") as Record<string, string>).href ?? "";
    const url = window.prompt("Enter URL", prev);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  }

  const divider = <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;

  return (
    <div className="border-b border-border bg-muted/30">
      {/* Row 1 */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-border/60">
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold (Ctrl+B)">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic (Ctrl+I)">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline (Ctrl+U)">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("superscript")} onClick={() => editor.chain().focus().unsetSubscript().toggleSuperscript().run()} title="Superscript">
          <SuperIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("subscript")} onClick={() => editor.chain().focus().unsetSuperscript().toggleSubscript().run()} title="Subscript">
          <SubIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        {divider}
        <FontSizeMenu editor={editor} />
        {divider}

        <ColorPicker
          editor={editor}
          type="text"
          title="Text color"
          icon={<Type className="h-3.5 w-3.5" />}
        />
        <ColorPicker
          editor={editor}
          type="highlight"
          title="Highlight color"
          icon={<Highlighter className="h-3.5 w-3.5" />}
        />

        {divider}

        <ToolbarButton active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()} title="Paragraph">
          <Pilcrow className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
          <Heading1 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarButton>

        {divider}

        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
          <Quote className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>

      {/* Row 2 */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
        <ToolbarButton active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left">
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center">
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right">
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()} title="Justify">
          <AlignJustify className="h-3.5 w-3.5" />
        </ToolbarButton>

        {divider}
        <SpacingMenu editor={editor} />
        {divider}

        <ToolbarButton active={editor.isActive("link")} onClick={setLink} title="Insert / edit link">
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarButton>

        {divider}
        <TableMenu editor={editor} />
        {divider}

        <ToolbarButton onClick={insertImage} title="Insert image">
          <ImageIcon className="h-3.5 w-3.5" />
        </ToolbarButton>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onImageFile}
        />

        {divider}

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(
  function RichTextEditor({ value, onChange, placeholder, minHeight = 240 as number | string, onFocus }, ref) {
    const editor = useEditor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        Underline,
        Superscript,
        Subscript,
        Link.configure({ openOnClick: false, autolink: true }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Placeholder.configure({ placeholder: placeholder ?? "Start typing…" }),
        Image.configure({ inline: false, allowBase64: true }),
        Table.configure({ resizable: true, HTMLAttributes: { class: "tiptap-table" } }),
        TableRow,
        TableHeader,
        TableCell,
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        ParagraphStyle,
        FontSize,
      ],
      content: value || "",
      onUpdate: ({ editor }) => onChange(editor.getHTML()),
      onFocus: () => onFocus?.(),
      editorProps: {
        attributes: {
          class: "tiptap-content prose prose-sm max-w-none focus:outline-none px-4 py-3",
        },
      },
    });

    useEffect(() => {
      if (!editor) return;
      if (value !== editor.getHTML()) {
        editor.commands.setContent(value || "", { emitUpdate: false });
      }
    }, [value, editor]);

    useImperativeHandle(ref, () => ({
      insertText: (text) => editor?.chain().focus().insertContent(text).run() ?? false,
      focus: () => editor?.chain().focus().run() ?? false,
      getHtml: () => editor?.getHTML() ?? "",
      setContent: (html) => editor?.commands.setContent(html || "", { emitUpdate: false }) ?? false,
    }), [editor]);

    return (
      <div className="rounded-md border border-input bg-white overflow-hidden shadow-sm">
        {editor && <Toolbar editor={editor} />}
        <div
          className="overflow-y-auto bg-white"
          style={{ minHeight }}
          onClick={() => editor?.commands.focus()}
        >
          <EditorContent editor={editor} />
        </div>
      </div>
    );
  },
);
