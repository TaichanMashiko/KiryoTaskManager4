
import { Task, User, Tag, Status, Priority } from './types';

export const MOCK_USERS: User[] = [
  { email: 'demo@kiryo.com', name: '山田 太郎', role: 'admin', avatarUrl: 'https://picsum.photos/32/32?random=1' },
  { email: 'suzuki@kiryo.com', name: '鈴木 花子', role: 'user', avatarUrl: 'https://picsum.photos/32/32?random=2' },
  { email: 'tanaka@kiryo.com', name: '田中 次郎', role: 'user', avatarUrl: 'https://picsum.photos/32/32?random=3' },
];

export const MOCK_TAGS: Tag[] = [
  { id: 'tag1', name: '開発', color: '#3B82F6' }, // Blue
  { id: 'tag2', name: 'デザイン', color: '#EC4899' }, // Pink
  { id: 'tag3', name: 'マーケティング', color: '#F59E0B' }, // Amber
  { id: 'tag4', name: '事務', color: '#10B981' }, // Emerald
];

export const MOCK_TASKS: Task[] = [
  {
    id: 't1',
    title: '要件定義書の作成',
    detail: 'クライアントへのヒアリング結果をまとめる',
    assigneeEmail: 'demo@kiryo.com',
    tag: '開発',
    startDate: '2023-10-01',
    dueDate: '2023-10-05',
    priority: Priority.HIGH,
    status: Status.COMPLETED,
    createdAt: '2023-09-28T09:00:00Z',
    updatedAt: '2023-10-05T14:00:00Z',
    visibility: 'public',
    order: 0,
  },
  {
    id: 't2',
    title: 'UIデザイン作成',
    detail: 'Figmaでトップページのデザインを作成する',
    assigneeEmail: 'suzuki@kiryo.com',
    tag: 'デザイン',
    startDate: '2023-10-06',
    dueDate: '2023-10-15',
    priority: Priority.MEDIUM,
    status: Status.IN_PROGRESS,
    createdAt: '2023-10-01T10:00:00Z',
    updatedAt: '2023-10-06T09:30:00Z',
    visibility: 'public',
    predecessorTaskId: 't1',
    order: 1,
  },
  {
    id: 't3',
    title: 'フロントエンド実装',
    detail: 'ReactとTailwindでのコーディング',
    assigneeEmail: 'demo@kiryo.com',
    tag: '開発',
    startDate: '2023-10-16',
    dueDate: '2023-10-30',
    priority: Priority.HIGH,
    status: Status.NOT_STARTED,
    createdAt: '2023-10-05T11:00:00Z',
    updatedAt: '2023-10-05T11:00:00Z',
    visibility: 'public',
    predecessorTaskId: 't2',
    order: 2,
  },
  {
    id: 't4',
    title: '週次定例ミーティング',
    detail: '進捗確認と課題の共有',
    assigneeEmail: 'tanaka@kiryo.com',
    tag: '事務',
    startDate: '2023-10-20',
    dueDate: '2023-10-20',
    priority: Priority.LOW,
    status: Status.NOT_STARTED,
    createdAt: '2023-10-10T15:00:00Z',
    updatedAt: '2023-10-10T15:00:00Z',
    visibility: 'public',
    order: 3,
  },
];
