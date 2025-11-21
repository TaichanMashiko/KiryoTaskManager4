
import { Task, User, Category, Status, Priority } from './types';

export const MOCK_USERS: User[] = [
  { email: 'demo@kiryo.com', name: '山田 太郎', role: 'admin', department: '教務部', avatarUrl: 'https://picsum.photos/32/32?random=1' },
  { email: 'suzuki@kiryo.com', name: '鈴木 花子', role: 'user', department: '進路指導部', avatarUrl: 'https://picsum.photos/32/32?random=2' },
  { email: 'tanaka@kiryo.com', name: '田中 次郎', role: 'user', department: '第1学年', avatarUrl: 'https://picsum.photos/32/32?random=3' },
];

export const MOCK_CATEGORIES: Category[] = [
  { id: 'c1', name: '開発' },
  { id: 'c2', name: 'デザイン' },
  { id: 'c3', name: 'マーケティング' },
  { id: 'c4', name: '事務' },
];

export const MOCK_TASKS: Task[] = [
  {
    id: 't1',
    title: '要件定義書の作成',
    detail: 'クライアントへのヒアリング結果をまとめる',
    assigneeEmail: 'demo@kiryo.com',
    category: '開発',
    startDate: '2023-10-01',
    dueDate: '2023-10-05',
    priority: Priority.HIGH,
    status: Status.COMPLETED,
    createdAt: '2023-09-28T09:00:00Z',
    updatedAt: '2023-10-05T14:00:00Z',
    visibility: 'public',
  },
  {
    id: 't2',
    title: 'UIデザイン作成',
    detail: 'Figmaでトップページのデザインを作成する',
    assigneeEmail: 'suzuki@kiryo.com',
    category: 'デザイン',
    startDate: '2023-10-06',
    dueDate: '2023-10-15',
    priority: Priority.MEDIUM,
    status: Status.IN_PROGRESS,
    createdAt: '2023-10-01T10:00:00Z',
    updatedAt: '2023-10-06T09:30:00Z',
    visibility: 'public',
  },
  {
    id: 't3',
    title: 'フロントエンド実装',
    detail: 'ReactとTailwindでのコーディング',
    assigneeEmail: 'demo@kiryo.com',
    category: '開発',
    startDate: '2023-10-16',
    dueDate: '2023-10-30',
    priority: Priority.HIGH,
    status: Status.NOT_STARTED,
    createdAt: '2023-10-05T11:00:00Z',
    updatedAt: '2023-10-05T11:00:00Z',
    visibility: 'public',
  },
  {
    id: 't4',
    title: '週次定例ミーティング',
    detail: '進捗確認と課題の共有',
    assigneeEmail: 'tanaka@kiryo.com',
    category: '事務',
    startDate: '2023-10-20',
    dueDate: '2023-10-20',
    priority: Priority.LOW,
    status: Status.NOT_STARTED,
    createdAt: '2023-10-10T15:00:00Z',
    updatedAt: '2023-10-10T15:00:00Z',
    visibility: 'public',
  },
];
