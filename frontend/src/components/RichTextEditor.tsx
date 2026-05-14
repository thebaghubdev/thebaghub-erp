import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

type RichTextEditorProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

export function RichTextEditor({ id, value, onChange }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        id,
        "aria-multiline": "true",
        class:
          "min-h-[10rem] px-3 py-2 text-sm text-slate-900 outline-none dark:text-slate-100",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  const toolbarButtonClass = (active = false) =>
    `inline-flex h-8 w-8 items-center justify-center rounded-md border text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
      active
        ? "border-violet-500 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-950/50 dark:text-violet-200"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
    }`;

  const iconClass = "h-4 w-4";

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-500 dark:border-slate-600 dark:bg-slate-950">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          className={toolbarButtonClass(editor?.isActive("bold"))}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={!editor}
          aria-label="Bold"
          title="Bold"
        >
          <svg
            className={iconClass}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 5h6a4 4 0 0 1 0 8H7z" />
            <path d="M7 13h7a4 4 0 0 1 0 8H7z" />
            <path d="M7 5v16" />
          </svg>
        </button>
        <button
          type="button"
          className={toolbarButtonClass(editor?.isActive("italic"))}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={!editor}
          aria-label="Italic"
          title="Italic"
        >
          <svg
            className={iconClass}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 5h8" />
            <path d="M6 19h8" />
            <path d="M14 5 10 19" />
          </svg>
        </button>
        <button
          type="button"
          className={toolbarButtonClass(
            editor?.isActive("heading", { level: 2 }),
          )}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
          disabled={!editor}
          aria-label="Heading 2"
          title="Heading 2"
        >
          <span className="text-[0.7rem] font-bold leading-none" aria-hidden>
            H2
          </span>
        </button>
        <button
          type="button"
          className={toolbarButtonClass(
            editor?.isActive("heading", { level: 3 }),
          )}
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 3 }).run()
          }
          disabled={!editor}
          aria-label="Heading 3"
          title="Heading 3"
        >
          <span className="text-[0.7rem] font-bold leading-none" aria-hidden>
            H3
          </span>
        </button>
        <button
          type="button"
          className={toolbarButtonClass(editor?.isActive("bulletList"))}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={!editor}
          aria-label="Bulleted list"
          title="Bulleted list"
        >
          <svg
            className={iconClass}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 6h10" />
            <path d="M9 12h10" />
            <path d="M9 18h10" />
            <path d="M5 6h.01" />
            <path d="M5 12h.01" />
            <path d="M5 18h.01" />
          </svg>
        </button>
        <button
          type="button"
          className={toolbarButtonClass(editor?.isActive("orderedList"))}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={!editor}
          aria-label="Numbered list"
          title="Numbered list"
        >
          <svg
            className={iconClass}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 6h9" />
            <path d="M10 12h9" />
            <path d="M10 18h9" />
            <path d="M4 6h1v4" />
            <path d="M4 10h2" />
            <path d="M4 14h2l-2 4h2" />
          </svg>
        </button>
        <button
          type="button"
          className={toolbarButtonClass()}
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor || !editor.can().undo()}
          aria-label="Undo"
          title="Undo"
        >
          <svg
            className={iconClass}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
          </svg>
        </button>
        <button
          type="button"
          className={toolbarButtonClass()}
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor || !editor.can().redo()}
          aria-label="Redo"
          title="Redo"
        >
          <svg
            className={iconClass}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H10a6 6 0 0 0 0 12h2" />
          </svg>
        </button>
      </div>
      <EditorContent
        editor={editor}
        className="[&_.ProseMirror]:min-h-[10rem] [&_.ProseMirror]:break-words [&_.ProseMirror_h2]:my-3 [&_.ProseMirror_h2]:text-lg [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h3]:my-2 [&_.ProseMirror_h3]:text-base [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-5 [&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-5"
      />
    </div>
  );
}
