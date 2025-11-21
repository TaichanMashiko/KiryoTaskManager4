
import React, { useMemo } from 'react';
import { Task, User, Status } from '../types';

interface DashboardProps {
  tasks: Task[];
  users: User[];
}

export const Dashboard: React.FC<DashboardProps> = ({ tasks, users }) => {
  const stats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    return users.map(user => {
      const userTasks = tasks.filter(t => t.assigneeEmail === user.email);
      
      // 今日のタスク（未完了 かつ 期限が今日）
      const tasksDueToday = userTasks.filter(t => 
        t.status !== Status.COMPLETED && 
        t.dueDate === todayStr
      );

      // 現在抱えているタスク（未完了すべて）
      const activeTasks = userTasks.filter(t => t.status !== Status.COMPLETED);
      
      // 完了したタスク（実績）
      const completedTasks = userTasks.filter(t => t.status === Status.COMPLETED);

      return {
        user,
        dueTodayCount: tasksDueToday.length,
        activeCount: activeTasks.length,
        completedCount: completedTasks.length,
        totalAssigned: userTasks.length
      };
    }).sort((a, b) => b.activeCount - a.activeCount); // 忙しい順にソート
  }, [tasks, users]);

  // 全体の最大値を計算してグラフのスケールに使用
  const maxActive = Math.max(...stats.map(s => s.activeCount), 1);

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-4">チーム負荷状況ダッシュボード</h2>
        <p className="text-sm text-gray-500 mb-6">
            各メンバーの現在のタスク保有数、本日の締切数、および過去の消化実績を表示しています。<br/>
            タスクの偏りを確認し、助け合いの目安にしてください。
        </p>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">メンバー</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    本日締切<br/><span className="text-[10px] font-normal text-red-500">要対応</span>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">現在の負荷状況 (残タスク数)</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">完了実績</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.map(({ user, dueTodayCount, activeCount, completedCount }) => (
                <tr key={user.email} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                        {user.name.charAt(0)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                        <div className="text-xs text-gray-500">{user.department || '部署未設定'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {dueTodayCount > 0 ? (
                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-red-100 text-red-800 animate-pulse">
                          {dueTodayCount} 件
                        </span>
                    ) : (
                        <span className="text-gray-400 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap align-middle">
                    <div className="w-full max-w-xs">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700">{activeCount} 件</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                            <div 
                                className={`h-2.5 rounded-full ${activeCount > 5 ? 'bg-orange-500' : 'bg-indigo-500'}`} 
                                style={{ width: `${(activeCount / maxActive) * 100}%` }}
                            ></div>
                        </div>
                        {activeCount > 5 && <span className="text-[10px] text-orange-500 mt-1">負荷高</span>}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">
                    <span className="font-bold text-green-600">{completedCount}</span> 件
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-indigo-500">
              <h3 className="text-gray-500 text-sm font-medium uppercase">チーム総残務タスク</h3>
              <p className="text-3xl font-bold text-gray-800 mt-2">
                  {stats.reduce((acc, cur) => acc + cur.activeCount, 0)} <span className="text-sm font-normal text-gray-500">件</span>
              </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
              <h3 className="text-gray-500 text-sm font-medium uppercase">本日締切の総タスク (未完了)</h3>
              <p className="text-3xl font-bold text-gray-800 mt-2">
                  {stats.reduce((acc, cur) => acc + cur.dueTodayCount, 0)} <span className="text-sm font-normal text-gray-500">件</span>
              </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
              <h3 className="text-gray-500 text-sm font-medium uppercase">これまでの総完了数</h3>
              <p className="text-3xl font-bold text-gray-800 mt-2">
                  {stats.reduce((acc, cur) => acc + cur.completedCount, 0)} <span className="text-sm font-normal text-gray-500">件</span>
              </p>
          </div>
      </div>
    </div>
  );
};
