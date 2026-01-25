"use client";

import type { ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import InlineInput from "./InlineInput";
import type { EditableEducation } from "./types";

interface EducationEditorProps {
  education: EditableEducation[];
  onChange: (next: EditableEducation[]) => void;
}

export default function EducationEditor({ education, onChange }: EducationEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const updateEducation = (index: number, next: Partial<EditableEducation>) => {
    onChange(education.map((edu, idx) => (idx === index ? { ...edu, ...next } : edu)));
  };

  const removeEducation = (index: number) => {
    onChange(education.filter((_, idx) => idx !== index));
  };

  const addEducation = () => {
    const next: EditableEducation = {
      institution: "New Institution",
      degree: "Degree",
      dates: "MM/YYYY - MM/YYYY",
      location: "",
      gpa: "",
    };
    onChange([...education, next]);
  };

  const educationIds = education.map((_, idx) => `edu-${idx}`);

  const handleDragEnd = ({ active, over }: { active: any; over: any }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = educationIds.indexOf(active.id);
    const newIndex = educationIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(education, oldIndex, newIndex));
  };

  return (
    <div className="trv-section">
      <h4>Education</h4>
      {education.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={educationIds} strategy={verticalListSortingStrategy}>
            {education.map((edu, idx) => (
              <SortableEducationCard
                key={idx}
                id={`edu-${idx}`}
                onRemove={() => removeEducation(idx)}
              >
                <div className="edu-header">
                  <InlineInput
                    value={edu.institution}
                    onChange={(value) => updateEducation(idx, { institution: value })}
                    placeholder="Institution"
                    className="edu-school"
                  />
                  <InlineInput
                    value={edu.dates}
                    onChange={(value) => updateEducation(idx, { dates: value })}
                    placeholder="MM/YYYY - MM/YYYY"
                    className="edu-dates"
                  />
                </div>
                <div className="edu-degree">
                  <InlineInput
                    value={edu.degree}
                    onChange={(value) => updateEducation(idx, { degree: value })}
                    placeholder="Degree"
                    className="edu-degree-text"
                  />
                  <InlineInput
                    value={edu.gpa || ""}
                    onChange={(value) => updateEducation(idx, { gpa: value })}
                    placeholder="GPA"
                    className="edu-gpa"
                  />
                </div>
              </SortableEducationCard>
            ))}
          </SortableContext>
        </DndContext>
      )}
      <button type="button" className="ghost small" onClick={addEducation}>
        Add education
      </button>
    </div>
  );
}

function SortableEducationCard({
  id,
  children,
  onRemove,
}: {
  id: string;
  children: ReactNode;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="trv-education">
      <div className="card-actions-row">
        <div className="drag-zone card-drag" {...attributes} {...listeners} aria-label="Drag to reorder" />
        <div className="row-actions always-visible">
          <button type="button" className="icon-button" onClick={onRemove} aria-label="Delete education">
            ×
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
