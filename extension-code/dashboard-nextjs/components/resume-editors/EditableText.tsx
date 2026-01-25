"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface EditableTextProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export default function EditableText({
  value,
  onChange,
  placeholder,
  multiline = false,
  className,
  displayClassName,
  inputClassName,
  disabled = false,
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [originalValue, setOriginalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (!multiline) inputRef.current.select();
    }
  }, [isEditing, multiline]);

  useEffect(() => {
    if (!isEditing) {
      setOriginalValue(value);
    }
  }, [isEditing, value]);

  useLayoutEffect(() => {
    if (!isEditing || !multiline) return;
    const node = inputRef.current;
    if (!node || !(node instanceof HTMLTextAreaElement)) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [isEditing, multiline, value]);

  const handleStartEdit = () => {
    if (disabled) return;
    setOriginalValue(value);
    setIsEditing(true);
  };

  const handleCancel = () => {
    onChange(originalValue);
    setIsEditing(false);
  };

  const handleCommit = () => {
    setIsEditing(false);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement | HTMLTextAreaElement> = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
      return;
    }
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      handleCommit();
      return;
    }
    if (multiline && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleCommit();
    }
  };

  if (!isEditing) {
    return (
      <span
        className={["editable-display", displayClassName].filter(Boolean).join(" ")}
        onClick={handleStartEdit}
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(event) => {
          if (event.key === "Enter") handleStartEdit();
        }}
        aria-disabled={disabled}
      >
        {value && value.trim().length > 0 ? value : placeholder || "Click to edit"}
      </span>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        className={["editable-input", inputClassName || className].filter(Boolean).join(" ")}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
        rows={1}
      />
    );
  }

  return (
    <input
      ref={inputRef as React.RefObject<HTMLInputElement>}
      className={["editable-input", inputClassName || className].filter(Boolean).join(" ")}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onBlur={handleCommit}
      onKeyDown={handleKeyDown}
      type="text"
    />
  );
}
