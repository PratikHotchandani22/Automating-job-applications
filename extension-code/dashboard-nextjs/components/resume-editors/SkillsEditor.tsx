"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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

interface SkillsEditorProps {
  skills: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  highlightedSkills?: string[];
  onHighlightedChange?: (next: string[]) => void;
}

function createCategoryName(existing: Record<string, string[]>) {
  let idx = 1;
  let name = `Category ${idx}`;
  while (existing[name]) {
    idx += 1;
    name = `Category ${idx}`;
  }
  return name;
}

export default function SkillsEditor({
  skills,
  onChange,
  highlightedSkills,
  onHighlightedChange,
}: SkillsEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const entries = useMemo(() => Object.entries(skills || {}), [skills]);
  const categoryIds = entries.map(([category]) => category);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [highlightedCollapsed, setHighlightedCollapsed] = useState(false);

  const toggleCategory = (key: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renameCategory = (oldKey: string, newKey: string) => {
    const trimmed = newKey.trim() || oldKey;
    if (trimmed === oldKey) return;
    const next: Record<string, string[]> = {};
    Object.entries(skills).forEach(([key, value]) => {
      if (key === oldKey) {
        if (next[trimmed]) {
          next[trimmed] = [...next[trimmed], ...(value || [])];
        } else {
          next[trimmed] = value || [];
        }
        return;
      }
      if (key === trimmed) {
        if (next[trimmed]) {
          next[trimmed] = [...next[trimmed], ...(value || [])];
        } else {
          next[trimmed] = value || [];
        }
        return;
      }
      next[key] = value;
    });
    setCollapsedCategories((prev) => {
      const nextState = { ...prev };
      if (oldKey in nextState) {
        nextState[trimmed] = nextState[oldKey];
        delete nextState[oldKey];
      }
      return nextState;
    });
    onChange(next);
  };

  const updateSkills = (key: string, nextList: string[]) => {
    onChange({ ...skills, [key]: nextList });
  };

  const removeCategory = (key: string) => {
    const next: Record<string, string[]> = {};
    Object.entries(skills).forEach(([existingKey, value]) => {
      if (existingKey === key) return;
      next[existingKey] = value;
    });
    setCollapsedCategories((prev) => {
      const nextState = { ...prev };
      delete nextState[key];
      return nextState;
    });
    onChange(next);
  };

  const addCategory = () => {
    const name = createCategoryName(skills);
    onChange({ ...skills, [name]: [] });
    setCollapsedCategories((prev) => ({ ...prev, [name]: false }));
  };

  const highlighted = Array.isArray(highlightedSkills) ? highlightedSkills : [];

  const updateHighlighted = (next: string[]) => {
    onHighlightedChange?.(next);
  };

  const handleCategoryDragEnd = ({ active, over }: { active: any; over: any }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = categoryIds.indexOf(active.id);
    const newIndex = categoryIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextOrder = arrayMove(entries, oldIndex, newIndex);
    const next: Record<string, string[]> = {};
    nextOrder.forEach(([key, list]) => {
      next[key] = list;
    });
    onChange(next);
  };

  return (
    <div className="trv-section">
      <h4>Skills</h4>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
        <SortableContext items={categoryIds} strategy={verticalListSortingStrategy}>
          {entries.map(([category, list]) => (
            <SortableCategoryCard key={category} id={category}>
              <div className="skill-category-header">
                <button
                  type="button"
                  className="collapse-toggle"
                  onClick={() => toggleCategory(category)}
                  aria-label={`Toggle ${category}`}
                >
                  {collapsedCategories[category] ? ">" : "v"}
                </button>
                <InlineInput
                  value={category}
                  onChange={(value) => renameCategory(category, value)}
                  placeholder="Category"
                  className="skill-category-title"
                />
                <div className="row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => removeCategory(category)}
                    aria-label="Delete category"
                  >
                    x
                  </button>
                </div>
              </div>
              {!collapsedCategories[category] && (
                <SkillList
                  category={category}
                  list={list || []}
                  onChange={(next) => updateSkills(category, next)}
                  sensors={sensors}
                />
              )}
            </SortableCategoryCard>
          ))}
        </SortableContext>
      </DndContext>
      <button type="button" className="ghost small" onClick={addCategory}>
        Add category
      </button>
    </div>
  );
}

function SortableCategoryCard({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="skill-category">
      <div className="drag-zone category-drag" {...attributes} {...listeners} aria-label="Drag to reorder category" />
      {children}
    </div>
  );
}

function SkillList({
  category,
  list,
  sensors,
  onChange,
}: {
  category: string;
  list: string[];
  sensors: ReturnType<typeof useSensors>;
  onChange: (next: string[]) => void;
}) {
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null);
  const skillIds = list.map((_, idx) => `${category}-${idx}`);

  useEffect(() => {
    if (pendingFocusIndex === null) return;
    requestAnimationFrame(() => {
      const node = document.querySelector(
        `[data-skill-id="${category}-${pendingFocusIndex}"]`
      ) as HTMLInputElement | null;
      if (node) {
        node.focus();
        const length = node.value.length;
        node.setSelectionRange(length, length);
      }
    });
    setPendingFocusIndex(null);
  }, [pendingFocusIndex, list, category]);

  const handleSkillDragEnd = ({ active, over }: { active: any; over: any }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = skillIds.indexOf(active.id);
    const newIndex = skillIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(list, oldIndex, newIndex));
  };

  const handleUpdate = (index: number, value: string) => {
    const next = list.map((item, idx) => (idx === index ? value : item));
    onChange(next);
  };

  const handleRemove = (index: number) => {
    const next = list.filter((_, idx) => idx !== index);
    onChange(next);
  };

  const handleAdd = () => {
    onChange(list.concat(""));
    setPendingFocusIndex(list.length);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSkillDragEnd}>
      <SortableContext items={skillIds} strategy={verticalListSortingStrategy}>
        {list.map((skill, idx) => (
          <SortableSkillRow key={`${category}-${idx}`} id={`${category}-${idx}`}>
            <InlineInput
              value={skill}
              onChange={(value) => handleUpdate(idx, value)}
              placeholder="Skill"
              className="skill-text"
              data-skill-id={`${category}-${idx}`}
            />
            <div className="row-actions">
              <button
                type="button"
                className="icon-button"
                onClick={() => handleRemove(idx)}
                aria-label="Delete skill"
              >
                x
              </button>
            </div>
          </SortableSkillRow>
        ))}
      </SortableContext>
      <button type="button" className="ghost small" onClick={handleAdd}>
        Add skill
      </button>
    </DndContext>
  );
}

function SortableSkillRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.75 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="skill-item inline-row">
      <div className="drag-zone" {...attributes} {...listeners} aria-label="Drag to reorder" />
      {children}
    </div>
  );
}
