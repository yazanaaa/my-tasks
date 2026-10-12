// Drag-and-drop across ordered groups (sections, board columns, a single list).
// Keeps a local copy of the order while dragging, then reports one move on drop.
import {
  createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode,
} from 'react';
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, PointerSensor, TouchSensor,
  useDroppable, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HTMLAttributes } from 'react';

type Order = Record<string, string[]>;

interface Ctx {
  order: Order;
  activeId: string | null;
}
const GroupsCtx = createContext<Ctx>({ order: {}, activeId: null });

export interface Move {
  id: string;
  groupId: string;
  /** Ordered ids of the destination group after the move. */
  ids: string[];
}

export function SortableGroups({
  groups, onMove, renderOverlay, children,
}: {
  groups: Order;
  onMove: (move: Move) => void;
  renderOverlay: (id: string) => ReactNode;
  children: ReactNode;
}) {
  const [order, setOrder] = useState<Order>(groups);
  const [activeId, setActiveId] = useState<string | null>(null);
  const startGroup = useRef<string | null>(null);

  // Follow store updates whenever we're not mid-drag.
  useEffect(() => {
    if (!activeId) setOrder(groups);
  }, [groups, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findGroup = (id: string, o = order) => (id in o ? id : Object.keys(o).find((g) => o[g].includes(id)));

  const onStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveId(id);
    startGroup.current = findGroup(id) ?? null;
  };

  const onOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    // Resolve groups from the latest state: several dragover events can fire before a re-render.
    setOrder((o) => {
      const from = findGroup(String(active.id), o);
      const to = findGroup(String(over.id), o);
      if (!from || !to || from === to) return o;
      const fromItems = o[from].filter((x) => x !== active.id);
      const toItems = [...o[to]];
      const overIndex = toItems.indexOf(String(over.id));
      const index = overIndex < 0 ? toItems.length : overIndex;
      toItems.splice(index, 0, String(active.id));
      return { ...o, [from]: fromItems, [to]: toItems };
    });
  };

  const onEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    setActiveId(null);
    if (!over) {
      setOrder(groups);
      return;
    }
    const group = findGroup(id);
    if (!group) return;
    const items = [...order[group]];
    const from = items.indexOf(id);
    const overIndex = items.indexOf(String(over.id));
    if (overIndex >= 0 && overIndex !== from) {
      items.splice(from, 1);
      items.splice(overIndex, 0, id);
    }
    const unchanged = group === startGroup.current && items.join() === groups[group]?.join();
    setOrder({ ...order, [group]: items });
    if (!unchanged) onMove({ id, groupId: group, ids: items });
  };

  const value = useMemo(() => ({ order, activeId }), [order, activeId]);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onStart}
      onDragOver={onOver}
      onDragEnd={onEnd}
      onDragCancel={() => { setActiveId(null); setOrder(groups); }}
    >
      <GroupsCtx.Provider value={value}>{children}</GroupsCtx.Provider>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
        {activeId ? <div className="drag-overlay">{renderOverlay(activeId)}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

export function useDragActive(): boolean {
  return useContext(GroupsCtx).activeId !== null;
}

/** The current (possibly mid-drag) ids for a group. */
export function useGroupIds(groupId: string): string[] {
  return useContext(GroupsCtx).order[groupId] ?? [];
}

export function SortableGroup({
  id, children, className, style,
}: { id: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const ids = useGroupIds(id);
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className={className} data-over={isOver || undefined} style={style}>
        {children}
      </div>
    </SortableContext>
  );
}

export function SortableItem({
  id, children,
}: { id: string; children: (p: { handleProps: HTMLAttributes<HTMLElement>; dragging: boolean }) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} tabIndex={-1}>
      {children({ handleProps: {}, dragging: isDragging })}
    </div>
  );
}

/** Fractional position for an item placed at `index` among `neighbors` (destination order, item excluded). */
export function positionAt(neighbors: { position: number }[], index: number): number {
  const prev = neighbors[index - 1]?.position;
  const next = neighbors[index]?.position;
  if (prev === undefined && next === undefined) return Date.now();
  if (prev === undefined) return next! - 1024;
  if (next === undefined) return prev + 1024;
  return (prev + next) / 2;
}
