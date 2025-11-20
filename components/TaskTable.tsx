import React, { useState } from 'react';
import { Task, User } from '../types';
import { Badge } from './Badge';

interface TaskTableProps {
  tasks: Task[];
  users: User[];
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

type SortKey = keyof Task;

export const TaskTable: React.FC<TaskTableProps> = ({ tasks, users, onEdit, onDelete }) => {
  const [sortKey, setSortKey] = useState<SortKey>('dueDate');
  const [isAsc, setIsAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setIsAsc(!isAsc);
    } else {
      setSortKey(key);
      setIsAsc(true);
    }
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    const valA = a[sortKey] || '';
    const valB = b[sortKey] || '';
    if (valA < valB) return isAsc ? -1 : 1;
    if (valA > valB) return isAsc ? 1 : -1;
    return 0;
  });

  const getUserName = (email: string) => {
    const user = users.find(u => u.email === email);
    return user ? user.name : email;
  };

  const thClass = "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-50 transition-colors select-none";

  return (
    <div className="overflow-hidden bg-white shadow sm:rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className={thClass} onClick={() => handleSort('title')}>タスク名 {sortKey === 'title' && (isAsc ? '▲' : '▼')}</th>
            <th className={thClass} onClick={() => handleSort('status')}>ステータス {sortKey === 'status' && (isAsc ? '▲' : '▼')}</th>
            <th className={thClass} onClick={() => handleSort('priority')}>優先度 {sortKey === 'priority' && (isAsc ? '▲' : '▼')}</th>
            <th className={thClass} onClick={() => handleSort('assigneeEmail')}>担当者 {sortKey === 'assigneeEmail' && (isAsc ? '▲' : '▼')}</th>
            <th className={thClass} onClick={() => handleSort('startDate')}>開始日 {sortKey === 'startDate' && (isAsc ? '▲' : '▼')}</th>
            <th className={thClass} onClick={() => handleSort('dueDate')}>期限 {sortKey === 'dueDate' && (isAsc ? '▲' : '▼')}</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">アクション</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedTasks.map((task) => (
            <tr key={task.id} className="hover:bg-gray-50 transition-colors group">
              <td className="px-6 py-4">
                <div className="text-sm font-medium text-gray-900">{task.title}</div>
                <div className="text-xs text-gray-500 truncate max-w-xs">{task.detail}</div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Badge type="status" value={task.status} />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <Badge type="priority" value={task.priority} />
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                <div className="flex items-center">
                  <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold mr-2">
                   {getUserName(task.assigneeEmail).charAt(0)}
                  </div>
                  {getUserName(task.assigneeEmail)}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {task.startDate || '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-medium">
                {task.dueDate}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <button
                  onClick={() => onEdit(task)}
                  className="text-indigo-600 hover:text-indigo-900 mr-4"
                >
                  編集
                </button>
                <button
                  onClick={() => onDelete(task.id)}
                  className="text-red-600 hover:text-red-900 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
          {sortedTasks.length === 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                タスクが見つかりません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};