import { Archive, BarChart3, Bell, CalendarDays, FolderKanban, Home, ListChecks, Settings, Sun } from 'lucide-react';

export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: Home, mobile: true, mobileLabel: 'Home' },
  { to: '/my-day', label: 'My Day', icon: Sun, mobile: true },
  { to: '/tasks', label: 'Tasks', icon: ListChecks, mobile: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban, mobile: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, mobile: true },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/archive', label: 'Archive', icon: Archive },
  { to: '/settings', label: 'Settings', icon: Settings },
];
