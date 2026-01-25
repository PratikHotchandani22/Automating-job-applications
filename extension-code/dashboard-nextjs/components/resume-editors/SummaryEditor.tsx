"use client";

import InlineTextarea from "./InlineTextarea";

interface SummaryEditorProps {
  summary: string;
  onChange: (next: string) => void;
}

export default function SummaryEditor({ summary, onChange }: SummaryEditorProps) {
  return (
    <div className="trv-section">
      <h4>Summary</h4>
      <InlineTextarea
        value={summary}
        onChange={onChange}
        placeholder="Summary"
        className="summary-textarea"
      />
    </div>
  );
}
