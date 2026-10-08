import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FakeServer } from '../test/fakeSupabase';

vi.mock('./supabase', async () => {
  const { FakeServer } = await import('../test/fakeSupabase');
  return { supabase: new FakeServer(), isTauri: () => false, appBaseUrl: () => '', supabaseConfigured: true };
});

const { supabase } = await import('./supabase');
const { getDb, openUserDb } = await import('./db');
const { setSessionUserId } = await import('./session');
const repo = await import('./repo');
const { updateRow } = await import('./store');
const { __testing } = await import('./sync');

const server = supabase as unknown as FakeServer;
const UID = '11111111-1111-4111-8111-111111111111';

async function setup() {
  server.tables.clear();
  server.online = true;
  server.failNext = null;
  server.dropResponseNext = false;
  openUserDb(`${UID}-${Math.random()}`);
  setSessionUserId(UID);
  const project = await repo.createProject({ name: 'P' });
  const task = await repo.createTask({ title: 'Fix payment bug', project_id: project.id });
  expect(await __testing.pushAll()).toBe(true);
  return { project, task };
}

const serverTask = (id: string) => server.rows('tasks').find((r) => r.id === id)!;
const localTask = (id: string) => getDb().t('tasks').get(id);

describe('sync engine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tạo offline -> lưu local, đẩy lên khi có mạng', async () => {
    const { project } = await setup();
    server.online = false;
    const t = await repo.createTask({ title: 'Offline task', project_id: project.id });
    await repo.updateTask(t.id, { title: 'Offline task (sửa)' });
    await repo.updateTask(t.id, { priority: 'high' });

    // Các lần sửa trước khi gửi được gộp vào chính mục insert
    expect(await getDb().outbox.count()).toBe(1);
    expect(await __testing.pushAll()).toBe(false);
    expect(serverTask(t.id)).toBeUndefined();

    server.online = true;
    expect(await __testing.pushAll()).toBe(true);
    expect(serverTask(t.id)).toMatchObject({ title: 'Offline task (sửa)', priority: 'high', version: 1 });
    expect((await localTask(t.id))!.version).toBe(1);
    expect(await getDb().outbox.count()).toBe(0);
  });

  it('mất response sau khi insert thành công -> gửi lại không tạo trùng', async () => {
    const { project } = await setup();
    const t = await repo.createTask({ title: 'Once', project_id: project.id });
    server.dropResponseNext = true;
    expect(await __testing.pushAll()).toBe(false);
    expect(await __testing.pushAll()).toBe(true);
    expect(server.rows('tasks').filter((r) => r.id === t.id)).toHaveLength(1);
  });

  it('cùng sửa 1 trường trên 2 thiết bị -> CONFLICT, không ghi đè âm thầm', async () => {
    const { task } = await setup();
    server.externalUpdate('tasks', task.id, { title: 'Bản của điện thoại' });
    await repo.updateTask(task.id, { title: 'Bản của Windows' });

    expect(await __testing.pushAll()).toBe(true);
    expect(serverTask(task.id).title).toBe('Bản của điện thoại');
    expect((await localTask(task.id))!.title).toBe('Bản của điện thoại');

    const conflicts = await getDb().conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: 'conflict', fields: ['title'], ours: { title: 'Bản của Windows' }, theirs: { title: 'Bản của điện thoại' } });

    // Người dùng chọn "Dùng bản của tôi"
    await updateRow('tasks', task.id, conflicts[0].ours as never);
    expect(await __testing.pushAll()).toBe(true);
    expect(serverTask(task.id).title).toBe('Bản của Windows');
  });

  it('sửa các trường khác nhau -> tự gộp, không báo conflict', async () => {
    const { task } = await setup();
    server.externalUpdate('tasks', task.id, { priority: 'low' });
    await repo.updateTask(task.id, { title: 'Tên mới' });

    expect(await __testing.pushAll()).toBe(true);
    expect(serverTask(task.id)).toMatchObject({ title: 'Tên mới', priority: 'low' });
    expect(await getDb().conflicts.count()).toBe(0);
  });

  it('pull giữ nguyên thay đổi local chưa gửi', async () => {
    const { task } = await setup();
    server.externalUpdate('tasks', task.id, { status: 'done' });
    server.online = false;
    await repo.updateTask(task.id, { title: 'Đang sửa offline' });
    server.online = true;
    await __testing.pullTable('tasks');

    const local = (await localTask(task.id))!;
    expect(local.status).toBe('done');
    expect(local.title).toBe('Đang sửa offline');
  });

  it('server từ chối (RLS/validation) -> khôi phục bản server và báo lỗi', async () => {
    const { task } = await setup();
    await repo.updateTask(task.id, { title: 'Không được phép' });
    server.failNext = { code: '42501', message: 'permission denied' };
    expect(await __testing.pushAll()).toBe(true);

    expect((await localTask(task.id))!.title).toBe('Fix payment bug');
    const [c] = await getDb().conflicts.toArray();
    expect(c).toMatchObject({ kind: 'rejected', message: 'permission denied' });
    expect(await getDb().outbox.count()).toBe(0);
  });

  it('sửa tiếp trong lúc đang gửi -> rebase lên version mới', async () => {
    const { task } = await setup();
    await repo.updateTask(task.id, { title: 'A' });
    // Giả lập mục đầu đang inflight: gửi 1 bước rồi sửa tiếp
    const first = (await getDb().outbox.toArray())[0];
    await getDb().outbox.update(first.seq!, { inflight: 1 });
    await repo.updateTask(task.id, { priority: 'critical' });
    expect(await getDb().outbox.count()).toBe(2);
    await getDb().outbox.update(first.seq!, { inflight: 0 });

    expect(await __testing.pushAll()).toBe(true);
    expect(serverTask(task.id)).toMatchObject({ title: 'A', priority: 'critical', version: 3 });
    expect(await getDb().conflicts.count()).toBe(0);
  });

  it('task xong -> mở khóa task phụ thuộc (autoBlock)', async () => {
    const { project, task } = await setup();
    const b = await repo.createTask({ title: 'Tích hợp thanh toán', project_id: project.id });
    await repo.addDependency(b.id, task.id);
    expect((await localTask(b.id))!.status).toBe('blocked');
    await repo.completeTask(task.id);
    expect((await localTask(b.id))!.status).toBe('todo');
    expect(await repo.wouldCreateCycle(task.id, b.id)).toBe(true);
  });
});
