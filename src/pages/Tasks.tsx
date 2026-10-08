import { TaskBoard } from '../components/task/TaskBoard';

export function Tasks() {
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      <h1 className="mb-4 hidden text-xl font-semibold md:block">Tasks</h1>
      <TaskBoard />
    </div>
  );
}
