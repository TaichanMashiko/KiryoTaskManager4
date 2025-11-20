export enum Status {
  NOT_STARTED = '未着手',
  IN_PROGRESS = '進行中',
  COMPLETED = '完了',
}

export enum Priority {
  HIGH = '高',
  MEDIUM = '中',
  LOW = '低',
}

export enum ViewMode {
  LIST = 'LIST',
  KANBAN = 'KANBAN',
  GANTT = 'GANTT',
}

export interface User {
  email: string;
  name: string;
  role: 'admin' | 'user';
  avatarUrl?: string;
}

export interface Task {
  id: string;
  title: string;
  detail: string;
  assigneeEmail: string;
  category: string;
  startDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  priority: Priority;
  status: Status;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
}

export const SPREADSHEET_ID = '1IF4upVHvvfPWwC2FfTGIbTZGoxd_IZDQmR3DXlY76zY';