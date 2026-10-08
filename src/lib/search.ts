// Cú pháp tìm kiếm: "payment", "overdue", "priority:high", "project:website",
// "status:done", "tag:bug", "assignee:me", kết hợp được: "project:web priority:high login"

import { PRIORITIES, TASK_STATUSES } from './labels';
import { isDueToday, isOverdue } from './logic';
import type { Priority, Project, Tag, Task, TaskStatus } from './types';

export interface ParsedSearch {
  text: string;
  priority?: Priority[];
  status?: TaskStatus[];
  project?: string;
  tag?: string;
  assignee?: string;
  overdue?: boolean;
  today?: boolean;
}

const STATUS_ALIASES: Record<string, TaskStatus> = {
  todo: 'todo', 'in_progress': 'in_progress', inprogress: 'in_progress', progress: 'in_progress', doing: 'in_progress',
  review: 'review', blocked: 'blocked', block: 'blocked', done: 'done', completed: 'done', xong: 'done',
};

export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

export function parseSearch(q: string): ParsedSearch {
  const out: ParsedSearch = { text: '' };
  const free: string[] = [];
  for (const raw of q.trim().split(/\s+/).filter(Boolean)) {
    const tok = raw.toLowerCase();
    const [k, ...rest] = tok.split(':');
    const v = rest.join(':');
    if (v) {
      if (k === 'priority' || k === 'p') {
        const p = PRIORITIES.filter((x) => x.startsWith(v));
        if (p.length) { out.priority = p; continue; }
      }
      if (k === 'status' || k === 's') {
        const s = STATUS_ALIASES[v] ?? TASK_STATUSES.find((x) => x.startsWith(v));
        if (s) { out.status = [s]; continue; }
      }
      if (k === 'project') { out.project = v; continue; }
      if (k === 'tag') { out.tag = v; continue; }
      if (k === 'assignee' || k === 'a') { out.assignee = v; continue; }
    }
    if (tok === 'overdue' || tok === 'quáhạn' || tok === 'trễ') { out.overdue = true; continue; }
    if (tok === 'today' || tok === 'hômnay') { out.today = true; continue; }
    free.push(raw);
  }
  // cụm "quá hạn" / "hôm nay" viết tách
  let text = free.join(' ');
  if (/quá hạn/i.test(text)) { out.overdue = true; text = text.replace(/quá hạn/gi, ''); }
  if (/hôm nay/i.test(text)) { out.today = true; text = text.replace(/hôm nay/gi, ''); }
  out.text = text.trim();
  return out;
}

export interface SearchData {
  tasks: Task[];
  projects: Project[];
  tags: Tag[];
  tagIdsByTask: Map<string, string[]>;
  userId?: string;
  emailById?: Map<string, string>;
}

export function searchTasks(parsed: ParsedSearch, d: SearchData): Task[] {
  const projectsById = new Map(d.projects.map((p) => [p.id, p]));
  const tagsById = new Map(d.tags.map((t) => [t.id, t]));
  const text = fold(parsed.text);
  return d.tasks.filter((t) => {
    if (t.deleted_at) return false;
    const project = projectsById.get(t.project_id);
    if (!project || project.deleted_at) return false;
    if (parsed.priority && !parsed.priority.includes(t.priority)) return false;
    if (parsed.status && !parsed.status.includes(t.status)) return false;
    if (parsed.overdue && !isOverdue(t)) return false;
    if (parsed.today && !isDueToday(t)) return false;
    if (parsed.project && !fold(project.name).includes(fold(parsed.project))) return false;
    const tagNames = (d.tagIdsByTask.get(t.id) ?? []).map((id) => tagsById.get(id)?.name ?? '');
    if (parsed.tag && !tagNames.some((n) => fold(n).includes(fold(parsed.tag!)))) return false;
    if (parsed.assignee) {
      if (parsed.assignee === 'me') {
        if (t.assignee_id && t.assignee_id !== d.userId) return false;
      } else if (!fold(d.emailById?.get(t.assignee_id ?? '') ?? '').includes(fold(parsed.assignee))) return false;
    }
    if (text) {
      const hay = fold(`${t.title} ${t.description} ${project.name} ${tagNames.join(' ')} ${t.status} ${t.priority}`);
      if (!text.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
}

export function searchProjects(parsed: ParsedSearch, projects: Project[]): Project[] {
  if (parsed.priority || parsed.status || parsed.overdue || parsed.today || parsed.tag || parsed.assignee) return [];
  const text = fold(parsed.text || parsed.project || '');
  if (!text) return [];
  return projects.filter((p) => !p.deleted_at && fold(`${p.name} ${p.description}`).includes(text));
}
