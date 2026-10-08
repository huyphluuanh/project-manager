import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { getDb } from '../lib/db';
import { dependencyIndex, projectProgress, projectRisk, taskProgress, type ProjectRisk } from '../lib/logic';
import { DEFAULT_SETTINGS } from '../lib/session';
import { getSyncState, subscribeSyncState } from '../lib/sync';
import type {
  AppSettings, Milestone, Profile, Project, Subtask, Tag, Task, TaskDependency, TaskTag, UserSettingsRow,
} from '../lib/types';
import { todayKey } from '../lib/utils';

export interface Workspace {
  loaded: boolean;
  today: string;
  projects: Project[];          // chưa xóa (gồm cả archived)
  activeProjects: Project[];    // chưa xóa, chưa archive
  tasks: Task[];                // chưa xóa, thuộc project còn tồn tại
  subtasks: Subtask[];
  deps: TaskDependency[];
  tags: Tag[];
  taskTags: TaskTag[];
  milestones: Milestone[];
  profiles: Profile[];
  settings: AppSettings;
  theme: UserSettingsRow['theme'];
  projectsById: Map<string, Project>;
  tasksById: Map<string, Task>;
  tagsById: Map<string, Tag>;
  subtasksByTask: Map<string, Subtask[]>;
  tagIdsByTask: Map<string, string[]>;
  blocksCount: Map<string, number>;
  blockedBy: Map<string, Task[]>;
  blockedIds: Set<string>;
  taskProgressOf: (t: Task) => number;
  projectProgressOf: (p: Project) => number;
  projectRiskOf: (p: Project) => ProjectRisk;
}

const Ctx = createContext<Workspace | null>(null);

const live = <T extends { deleted_at?: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at);

export function WorkspaceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const raw = useLiveQuery(async () => {
    const db = getDb();
    const [projects, tasks, subtasks, deps, tags, taskTags, milestones, profiles, settings] = await Promise.all([
      db.t('projects').toArray(),
      db.t('tasks').toArray(),
      db.t('subtasks').toArray(),
      db.t('task_dependencies').toArray(),
      db.t('tags').toArray(),
      db.t('task_tags').toArray(),
      db.t('milestones').toArray(),
      db.t('profiles').toArray(),
      db.t('user_settings').get(userId),
    ]);
    return { projects, tasks, subtasks, deps, tags, taskTags, milestones, profiles, settings };
  }, [userId]);

  // Đổi ngày khi qua nửa đêm (dựa theo lần sync / render gần nhất)
  useSyncExternalStore(subscribeSyncState, getSyncState);
  const today = todayKey();

  const ws = useMemo<Workspace>(() => {
    const projects = live(raw?.projects ?? []);
    const projectsById = new Map(projects.map((p) => [p.id, p]));
    const tasks = live(raw?.tasks ?? []).filter((t) => projectsById.has(t.project_id));
    const tasksById = new Map(tasks.map((t) => [t.id, t]));
    const subtasks = live(raw?.subtasks ?? []).filter((s) => tasksById.has(s.task_id)).sort((a, b) => a.sort_order - b.sort_order);
    const deps = live(raw?.deps ?? []).filter((d) => tasksById.has(d.task_id) && tasksById.has(d.depends_on_task_id));
    const tags = live(raw?.tags ?? []).sort((a, b) => a.name.localeCompare(b.name));
    const tagsById = new Map(tags.map((t) => [t.id, t]));
    const taskTags = live(raw?.taskTags ?? []).filter((x) => tagsById.has(x.tag_id));
    const milestones = live(raw?.milestones ?? []).filter((m) => projectsById.has(m.project_id));

    const subtasksByTask = new Map<string, Subtask[]>();
    for (const s of subtasks) subtasksByTask.set(s.task_id, [...(subtasksByTask.get(s.task_id) ?? []), s]);
    const tagIdsByTask = new Map<string, string[]>();
    for (const x of taskTags) tagIdsByTask.set(x.task_id, [...(tagIdsByTask.get(x.task_id) ?? []), x.tag_id]);

    const { blocksCount, blockedBy, blockedIds } = dependencyIndex(tasks, deps);
    const tasksByProject = new Map<string, Task[]>();
    for (const t of tasks) tasksByProject.set(t.project_id, [...(tasksByProject.get(t.project_id) ?? []), t]);

    const taskProgressOf = (t: Task) => taskProgress(t, subtasksByTask.get(t.id));
    const projectProgressOf = (p: Project) => projectProgress(p, tasksByProject.get(p.id) ?? []);
    const projectRiskOf = (p: Project) => projectRisk(p, tasksByProject.get(p.id) ?? [], projectProgressOf(p), today, blockedIds);

    return {
      loaded: raw !== undefined,
      today,
      projects,
      activeProjects: projects.filter((p) => !p.archived_at),
      tasks,
      subtasks,
      deps,
      tags,
      taskTags,
      milestones,
      profiles: raw?.profiles ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(raw?.settings?.settings ?? {}) },
      theme: raw?.settings?.theme ?? 'system',
      projectsById,
      tasksById,
      tagsById,
      subtasksByTask,
      tagIdsByTask,
      blocksCount,
      blockedBy,
      blockedIds,
      taskProgressOf,
      projectProgressOf,
      projectRiskOf,
    };
  }, [raw, today]);

  return <Ctx.Provider value={ws}>{children}</Ctx.Provider>;
}

export function useWorkspace(): Workspace {
  const ws = useContext(Ctx);
  if (!ws) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ws;
}

export function useSyncState() {
  return useSyncExternalStore(subscribeSyncState, getSyncState);
}
