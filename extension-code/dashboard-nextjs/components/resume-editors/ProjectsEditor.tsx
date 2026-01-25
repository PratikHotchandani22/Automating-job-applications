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
import type { EditableProject } from "./types";

interface ProjectsEditorProps {
  projects: EditableProject[];
  onChange: (next: EditableProject[]) => void;
}

export default function ProjectsEditor({ projects, onChange }: ProjectsEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const updateProject = (index: number, next: Partial<EditableProject>) => {
    onChange(projects.map((proj, idx) => (idx === index ? { ...proj, ...next } : proj)));
  };

  const removeProject = (index: number) => {
    onChange(projects.filter((_, idx) => idx !== index));
  };

  const addProject = () => {
    const now = Date.now();
    const next: EditableProject = {
      projectId: `proj_${now}_${Math.random().toString(16).slice(2)}`,
      name: "New Project",
      date: "",
      bullets: [
        {
          bulletId: `bullet_${now}_${Math.random().toString(16).slice(2)}`,
          originalText: "",
          tailoredText: "Project description",
          wasRewritten: true,
        },
      ],
    };
    onChange([...projects, next]);
  };

  const projectIds = projects.map((proj, idx) => proj.projectId || `proj-${idx}`);

  const handleDragEnd = ({ active, over }: { active: any; over: any }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = projectIds.indexOf(active.id);
    const newIndex = projectIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(projects, oldIndex, newIndex));
  };

  return (
    <div className="trv-section">
      <h4>Projects</h4>
      {projects.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={projectIds} strategy={verticalListSortingStrategy}>
            {projects.map((proj, idx) => (
              <SortableProjectCard
                key={proj.projectId || idx}
                id={proj.projectId || `proj-${idx}`}
                onRemove={() => removeProject(idx)}
              >
                <div className="proj-header">
                  <InlineInput
                    value={proj.name}
                    onChange={(value) => updateProject(idx, { name: value })}
                    placeholder="Project name"
                    className="proj-name"
                  />
                  <InlineInput
                    value={proj.date || ""}
                    onChange={(value) => updateProject(idx, { date: value })}
                    placeholder="MM/YYYY"
                    className="proj-date"
                  />
                </div>
                <BulletListEditor
                  bullets={proj.bullets}
                  onChange={(next) => updateProject(idx, { bullets: next })}
                />
              </SortableProjectCard>
            ))}
          </SortableContext>
        </DndContext>
      )}
      <button type="button" className="ghost small" onClick={addProject}>
        Add project
      </button>
    </div>
  );
}

function SortableProjectCard({
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
    <div ref={setNodeRef} style={style} className="trv-project">
      <div className="card-actions-row">
        <div className="drag-zone card-drag" {...attributes} {...listeners} aria-label="Drag to reorder" />
        <div className="row-actions always-visible">
          <button type="button" className="icon-button" onClick={onRemove} aria-label="Delete project">
            ×
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
