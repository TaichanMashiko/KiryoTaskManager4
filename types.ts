
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
  department?: string; // 部署・所属
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

// ブラウザのURLからコピーしたスプレッドシートIDをここに設定してください
// https://docs.google.com/spreadsheets/d/[この部分]/edit
export const SPREADSHEET_ID = '15rr38dSKNiyquXM0CXalAAs8dXCQLJ7OMe9dDPOk8t0';

// シート名の定義
export const SHEET_NAMES = {
  TASKS: 'タスク',
  USERS: 'Googleアカウント管理', // GASコードに合わせて変更
  CATEGORIES: 'カテゴリマスタ',
};
