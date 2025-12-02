
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
  DASHBOARD = 'DASHBOARD',
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
  tag: string; // 旧 category
  startDate: string; // YYYY-MM-DD
  dueDate: string;   // YYYY-MM-DD
  priority: Priority;
  status: Status;
  createdAt: string;
  updatedAt: string;
  calendarEventId?: string; // Google Calendar Event ID
  visibility: 'public' | 'private'; // public: task, private: personal todo
  predecessorTaskId?: string; // 前提タスクのID
  order?: number; // 並び順
}

export interface Tag {
  id: string;
  name: string;
  color: string; // Hex color code (e.g., #EF4444)
}

// ブラウザのURLからコピーしたスプレッドシートIDをここに設定してください
// https://docs.google.com/spreadsheets/d/[この部分]/edit
export const SPREADSHEET_ID = '15rr38dSKNiyquXM0CXalAAs8dXCQLJ7OMe9dDPOk8t0';

// シート名の定義
export const SHEET_NAMES = {
  TASKS: 'タスク',
  USERS: 'Googleアカウント管理', // GASコードに合わせて変更
  TAGS: 'タグマスタ', // 旧 カテゴリマスタ
};
