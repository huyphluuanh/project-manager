import { useConfirm, useToast } from '../components/feedback';
import * as repo from '../lib/repo';
import type { Priority, Task } from '../lib/types';

/** Các thao tác task kèm xác nhận / Undo / thông báo lỗi */
export function useTaskActions() {
  const toast = useToast();
  const confirm = useConfirm();

  const toggleDone = (t: Task) =>
    toast.run(async () => {
      const prev = t.status;
      if (t.status === 'done') {
        await repo.reopenTask(t.id);
        toast.show(`Đã mở lại "${t.title}"`);
      } else {
        await repo.completeTask(t.id);
        toast.show(`Đã hoàn thành "${t.title}"`, {
          tone: 'success',
          action: { label: 'Hoàn tác', onClick: () => void repo.updateTask(t.id, { status: prev }) },
        });
      }
    });

  const remove = async (t: Task) => {
    const ok = await confirm({
      title: 'Xóa task?',
      message: `"${t.title}" sẽ được chuyển vào thùng rác (khôi phục được trong mục Lưu trữ).`,
      confirmLabel: 'Xóa',
      danger: true,
    });
    if (!ok) return false;
    await toast.run(async () => {
      await repo.deleteTask(t.id);
      toast.show('Đã xóa task', { action: { label: 'Hoàn tác', onClick: () => void repo.restoreTask(t.id) } });
    });
    return true;
  };

  const setPriority = (t: Task, p: Priority) => toast.run(() => repo.setPriority(t.id, p));

  const snooze = (t: Task, days: number) =>
    toast.run(async () => {
      const until = new Date();
      until.setDate(until.getDate() + days);
      until.setHours(8, 0, 0, 0);
      await repo.snoozeTask(t.id, until.toISOString());
    }, days === 1 ? 'Đã tạm hoãn tới sáng mai' : `Đã tạm hoãn ${days} ngày`);

  const toggleMyDay = (t: Task, today: string) =>
    toast.run(() => repo.setMyDay(t.id, t.my_day_date !== today), t.my_day_date === today ? 'Đã bỏ khỏi My Day' : 'Đã thêm vào My Day');

  return { toggleDone, remove, setPriority, snooze, toggleMyDay };
}
