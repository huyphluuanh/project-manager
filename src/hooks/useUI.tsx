import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Project, Task } from '../lib/types';

export interface QuickAddDefaults {
  kind?: 'task' | 'project' | 'reminder' | 'milestone';
  project_id?: string;
  due_date?: string;
  status?: Task['status'];
  my_day?: boolean;
}

interface UIState {
  taskId: string | null;
  openTask: (id: string | null) => void;
  quickAdd: QuickAddDefaults | null;
  openQuickAdd: (d?: QuickAddDefaults) => void;
  closeQuickAdd: () => void;
  projectForm: { project?: Project } | null;
  openProjectForm: (project?: Project) => void;
  closeProjectForm: () => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;
  /** task đang được chọn bằng bàn phím trong danh sách */
  focusedTaskId: string | null;
  setFocusedTaskId: (id: string | null) => void;
}

const Ctx = createContext<UIState | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddDefaults | null>(null);
  const [projectForm, setProjectForm] = useState<{ project?: Project } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);

  const openQuickAdd = useCallback((d: QuickAddDefaults = {}) => setQuickAdd(d), []);
  const closeQuickAdd = useCallback(() => setQuickAdd(null), []);
  const openProjectForm = useCallback((project?: Project) => setProjectForm({ project }), []);
  const closeProjectForm = useCallback(() => setProjectForm(null), []);

  const value = useMemo<UIState>(() => ({
    taskId, openTask: setTaskId,
    quickAdd, openQuickAdd, closeQuickAdd,
    projectForm, openProjectForm, closeProjectForm,
    searchOpen, setSearchOpen,
    shortcutsOpen, setShortcutsOpen,
    focusedTaskId, setFocusedTaskId,
  }), [taskId, quickAdd, openQuickAdd, closeQuickAdd, projectForm, openProjectForm, closeProjectForm, searchOpen, shortcutsOpen, focusedTaskId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI(): UIState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI outside provider');
  return v;
}
