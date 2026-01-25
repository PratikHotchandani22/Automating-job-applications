"use client";

import type { TextareaHTMLAttributes } from "react";
import { useLayoutEffect, useRef } from "react";

interface InlineTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> {
  value: string;
  onChange: (next: string) => void;
  allowNewlines?: boolean;
}

export default function InlineTextarea({
  value,
  onChange,
  className,
  allowNewlines = true,
  onKeyDown,
  ...rest
}: InlineTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={["inline-textarea", className].filter(Boolean).join(" ")}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (!allowNewlines && event.key === "Enter") {
          event.preventDefault();
        }
        onKeyDown?.(event);
      }}
      rows={1}
      {...rest}
    />
  );
}
