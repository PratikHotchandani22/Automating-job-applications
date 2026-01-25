"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
import BulletLineEditor from "./BulletLineEditor";
import type { EditableBullet } from "./types";

interface BulletListEditorProps {
  bullets: EditableBullet[];
  onChange: (next: EditableBullet[]) => void;
  label?: string;
}

function createBulletId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export default function BulletListEditor({ bullets, onChange, label }: BulletListEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleUpdate = (index: number, value: string) => {
    const next = bullets.map((bullet, idx) => {
      if (idx !== index) return bullet;
      const tailoredText = value;
      const wasRewritten = bullet.originalText !== tailoredText;
      return { ...bullet, tailoredText, wasRewritten };
    });
    onChange(next);
  };

  const handleRemove = (index: number) => {
    const next = bullets.filter((_, idx) => idx !== index);
    onChange(next);
  };

  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingFocusId) return;
    requestAnimationFrame(() => {
      const node = document.querySelector(
        `[data-bullet-id="${pendingFocusId}"]`
      ) as HTMLTextAreaElement | null;
      if (node) {
        node.focus();
        const length = node.value.length;
        node.setSelectionRange(length, length);
      }
    });
    setPendingFocusId(null);
  }, [pendingFocusId, bullets]);

  const bulletIds = bullets.map((bullet, idx) => bullet.bulletId || `bullet-${idx}`);

  const handleDragEnd = ({ active, over }: { active: any; over: any }) => {
    if (!over || active.id === over.id) return;
    const oldIndex = bulletIds.indexOf(active.id);
    const newIndex = bulletIds.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(bullets, oldIndex, newIndex));
  };

  const handleInsertAt = (index: number) => {
    const bulletId = createBulletId("bullet");
    const next = bullets.slice();
    next.splice(index, 0, {
      bulletId,
      originalText: "",
      tailoredText: "",
      wasRewritten: true,
    });
    onChange(next);
    setPendingFocusId(bulletId);
  };

  const handleAdd = () => {
    handleInsertAt(bullets.length);
  };

  const handleAddBelow = (index: number) => {
    handleInsertAt(index + 1);
  };

  const handleBackspaceEmpty = (index: number) => {
    if (bullets.length <= 1) return;
    const prev = bullets[index - 1];
    const next = bullets[index + 1];
    const nextFocusId = prev?.bulletId || next?.bulletId || null;
    handleRemove(index);
    if (nextFocusId) {
      setPendingFocusId(nextFocusId);
    }
  };

  return (
    <div className="bullet-editor">
      {label && <div className="bullet-editor-label">{label}</div>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={bulletIds} strategy={verticalListSortingStrategy}>
          {bullets.map((bullet, idx) => (
            <SortableBulletRow
              key={bullet.bulletId || idx}
              id={bullet.bulletId || `bullet-${idx}`}
            >
              <BulletLineEditor
                value={bullet.tailoredText}
                onChange={(value) => handleUpdate(idx, value)}
                placeholder="Bullet text"
                onRemove={() => handleRemove(idx)}
                onAddBelow={() => handleAddBelow(idx)}
                onBackspaceEmpty={() => handleBackspaceEmpty(idx)}
                dataBulletId={bullet.bulletId || `bullet-${idx}`}
              />
            </SortableBulletRow>
          ))}
        </SortableContext>
      </DndContext>
      <button type="button" className="ghost small" onClick={handleAdd}>
        Add bullet
      </button>
    </div>
  );
}

function SortableBulletRow({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
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
    <div ref={setNodeRef} style={style} className="bullet-row inline-row">
      <div className="drag-zone" {...attributes} {...listeners} aria-label="Drag to reorder" />
      {children}
    </div>
  );
}
