"use client";

import type { ChangeEvent, InputHTMLAttributes } from "react";

interface InlineInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onChange: (next: string) => void;
}

export default function InlineInput({
  value,
  onChange,
  className,
  ...rest
}: InlineInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <input
      className={["inline-input", className].filter(Boolean).join(" ")}
      value={value}
      onChange={handleChange}
      type="text"
      {...rest}
    />
  );
}
