import { ArrowRight, FolderKanban, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUI } from '../hooks/useUI';
import { useWorkspace } from '../hooks/useWorkspace';
import { getUserId } from '../lib/session';
import { parseSearch, searchProjects, searchTasks } from '../lib/search';
import { sortTasks } from '../lib/logic';
import { cx } from '../lib/utils';
import { DueLabel, PriorityBadge, StatusIcon } from './task/badges';
import { Kbd, Modal } from './ui';
import { NAV_ITEMS } from './navItems';

interface Item {
  id: string;
  group: string;
  label: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const { searchOpen, setSearchOpen } = useUI();
  if (!searchOpen) return null;
  return <Palette onClose={() => setSearchOpen(false)} />;
}

function Palette({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace();
  const ui = useUI();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    const parsed = parseSearch(q);
    const hasQuery = q.trim().length > 0;

    if (!hasQuery) {
      out.push(
        { id: 'new-task', group: 'Thao tác', label: 'Tạo task mới', hint: <Kbd>Ctrl N</Kbd>, icon: <Plus className="size-4" />, run: () => ui.openQuickAdd() },
        { id: 'new-project', group: 'Thao tác', label: 'Tạo dự án mới', hint: <Kbd>Ctrl ⇧ N</Kbd>, icon: <Plus className="size-4" />, run: () => ui.openProjectForm() },
      );
      for (const n of NAV_ITEMS) {
        out.push({ id: `nav-${n.to}`, group: 'Đi tới', label: n.label, icon: <n.icon className="size-4" />, run: () => navigate(n.to) });
      }
      return out;
    }

    for (const p of searchProjects(parsed, ws.projects).slice(0, 5)) {
      out.push({
        id: `p-${p.id}`, group: 'Dự án', label: p.name, icon: <FolderKanban className="size-4" style={{ color: p.color ?? undefined }} />,
        hint: p.archived_at ? <span className="text-xs text-muted">Đã lưu trữ</span> : undefined,
        run: () => navigate(`/projects/${p.id}`),
      });
    }
    const emailById = new Map(ws.profiles.map((p) => [p.id, `${p.email} ${p.full_name}`]));
    const tasks = searchTasks(parsed, { tasks: ws.tasks, projects: ws.projects, tags: ws.tags, tagIdsByTask: ws.tagIdsByTask, userId: getUserId(), emailById });
    const sorted = sortTasks(tasks, 'score', 'asc', { projectsById: ws.projectsById, blocksCount: ws.blocksCount, blockedIds: ws.blockedIds });
    for (const t of sorted.slice(0, 30)) {
      out.push({
        id: `t-${t.id}`, group: `Task (${tasks.length})`,
        label: <span className={cx(t.status === 'done' && 'text-muted line-through')}>{t.title}</span>,
        hint: <span className="flex items-center gap-2"><DueLabel date={t.due_date} done={t.status === 'done'} /><PriorityBadge priority={t.priority} compact /><span className="max-w-28 truncate text-xs text-muted">{ws.projectsById.get(t.project_id)?.name}</span></span>,
        icon: <StatusIcon status={t.status} />,
        run: () => ui.openTask(t.id),
      });
    }
    if (parsed.text) {
      out.push({ id: 'create', group: 'Thao tác', label: <>Tạo task “{parsed.text}”</>, icon: <Plus className="size-4" />, run: () => ui.openQuickAdd() });
    }
    return out;
  }, [q, ws, ui, navigate]);

  useEffect(() => setActive(0), [q]);

  const choose = (i: number) => {
    const it = items[i];
    if (!it) return;
    onClose();
    it.run();
  };

  let lastGroup = '';
  return (
    <Modal open onClose={onClose} size="lg">
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="size-5 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); choose(active); }
          }}
          placeholder="Tìm task, dự án… (VD: payment, overdue, priority:high, project:website)"
          className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted"
          aria-label="Tìm kiếm"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
        />
        <Kbd>Esc</Kbd>
      </div>
      <div id="palette-list" role="listbox" className="max-h-[60dvh] overflow-y-auto p-2">
        {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted">Không tìm thấy kết quả.</p>}
        {items.map((it, i) => {
          const header = it.group !== lastGroup ? it.group : null;
          lastGroup = it.group;
          return (
            <div key={it.id}>
              {header && <p className="px-3 pt-3 pb-1 text-xs font-medium text-muted">{header}</p>}
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => choose(i)}
                className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === active && 'bg-surface-2')}
              >
                <span className="text-muted">{it.icon}</span>
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint}
                {i === active && <ArrowRight className="size-4 text-muted" />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border px-4 py-2 text-xs text-muted">
        <span>Bộ lọc:</span><code>priority:high</code><code>status:blocked</code><code>project:web</code><code>tag:bug</code><code>assignee:me</code><code>overdue</code><code>today</code>
      </div>
    </Modal>
  );
}
