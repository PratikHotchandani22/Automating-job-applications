"use client";

import InlineTextarea from "./InlineTextarea";

interface BulletLineEditorProps {
  value: string;
  onChange: (next: string) => void;
  onRemove?: () => void;
  onAddBelow?: () => void;
  onBackspaceEmpty?: () => void;
  placeholder?: string;
  allowNewlines?: boolean;
  dataBulletId?: string;
}

export default function BulletLineEditor({
  value,
  onChange,
  onRemove,
  onAddBelow,
  onBackspaceEmpty,
  placeholder,
  allowNewlines = false,
  dataBulletId,
}: BulletLineEditorProps) {
  return (
    <div className="bullet-line-editor">
      <span className="bullet-prefix">•</span>
      <InlineTextarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        allowNewlines={allowNewlines}
        className="bullet-line-input"
        data-bullet-id={dataBulletId}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !allowNewlines) {
            event.preventDefault();
            onAddBelow?.();
          }
          if (event.key === "Backspace" && value.trim().length === 0) {
            event.preventDefault();
            onBackspaceEmpty?.();
          }
        }}
      />
      {onRemove && (
        <div className="row-actions">
          <button type="button" className="icon-button" onClick={onRemove} aria-label="Delete bullet">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
