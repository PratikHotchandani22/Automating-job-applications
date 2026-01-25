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
import BulletListEditor from "./BulletListEditor";
import type { EditableExperience } from "./types";

interface ExperienceEditorProps {
  experiences: EditableExperience[];
  onChange: (next: EditableExperience[]) => void;
}

export default function ExperienceEditor({ experiences, onChange }: ExperienceEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const updateExperience = (index: number, next: Partial<EditableExperience>) => {
    onChange(
      experiences.map((exp, idx) => (idx === index ? { ...exp, ...next } : exp))
    );
  };

  const removeExperience = (index: number) => {
    onChange(experiences.filter((_, idx) => idx !== index));
  };

  const addExperience = () => {
    const now = Date.now();
    const next: EditableExperience = {
      roleId: `exp_${now}_${Math.random().toString(16).slice(2)}`,
      company: "New Company",
      title: "New Title",
      dateRange: "MM/YYYY - MM/YYYY",
      location: "",
      bullets: [
        {
          bulletId: `bullet_${now}_${Math.random().toString(16).slice(2)}`,
          originalText: "",
          tailoredText: "New bullet",
          wasRewritten: true,
        },
      ],
    };
    onChange([...experiences, next]);
  };

  const experienceIds = experiences.map((exp, idx) => exp.roleId || `exp-${idx}`);

  const handleDragEnd = ({ active, over }: { active: any; over: any }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = experienceIds.indexOf(active.id);
    const newIndex = experienceIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(experiences, oldIndex, newIndex));
  };

  return (
    <div className="trv-section">
      <h4>Work Experience</h4>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={experienceIds} strategy={verticalListSortingStrategy}>
          {experiences.map((exp, idx) => (
            <SortableExperienceCard
              key={exp.roleId || idx}
              id={exp.roleId || `exp-${idx}`}
              onRemove={() => removeExperience(idx)}
            >
              <div className="exp-header">
                <InlineInput
                  value={exp.company}
                  onChange={(value) => updateExperience(idx, { company: value })}
                  placeholder="Company"
                  className="exp-company"
                />
                <InlineInput
                  value={exp.dateRange}
                  onChange={(value) => updateExperience(idx, { dateRange: value })}
                  placeholder="MM/YYYY - MM/YYYY"
                  className="exp-dates"
                />
              </div>
              <div className="exp-title">
                <InlineInput
                  value={exp.title}
                  onChange={(value) => updateExperience(idx, { title: value })}
                  placeholder="Title"
                  className="exp-title-text"
                />
                <InlineInput
                  value={exp.location || ""}
                  onChange={(value) => updateExperience(idx, { location: value })}
                  placeholder="Location"
                  className="exp-location"
                />
              </div>
              <BulletListEditor
                bullets={exp.bullets}
                onChange={(next) => updateExperience(idx, { bullets: next })}
              />
            </SortableExperienceCard>
          ))}
        </SortableContext>
      </DndContext>
      <button type="button" className="ghost small" onClick={addExperience}>
        Add experience
      </button>
    </div>
  );
}

function SortableExperienceCard({
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
    <div ref={setNodeRef} style={style} className="trv-experience">
      <div className="card-actions-row">
        <div className="drag-zone card-drag" {...attributes} {...listeners} aria-label="Drag to reorder" />
        <div className="row-actions always-visible">
          <button type="button" className="icon-button" onClick={onRemove} aria-label="Delete experience">
            ×
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
