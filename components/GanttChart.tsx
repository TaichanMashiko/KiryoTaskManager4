import React, { useMemo } from 'react';
import { Task, User, Status } from '../types';

interface GanttChartProps {
  tasks: Task[];
  users: User[];
  onEdit: (task: Task) => void;
}

export const GanttChart: React.FC<GanttChartProps> = ({ tasks, users, onEdit }) => {
  const colWidth = 40; // Width of one day column in pixels
  const headerHeight = 48;
  const rowHeight = 48;

  // Calculate timeline range based on tasks
  const { dates, startDate, totalWidth } = useMemo(() => {
    if (tasks.length === 0) {
      const now = new Date();
      return { dates: [now], startDate: now, totalWidth: colWidth };
    }

    // Find min start and max due dates
    let min = new Date();
    let max = new Date();
    let hasSet = false;

    tasks.forEach(t => {
      if (!t.startDate || !t.dueDate) return;
      const s = new Date(t.startDate);
      const e = new Date(t.dueDate);
      if (!hasSet) {
        min = s;
        max = e;
        hasSet = true;
      } else {
        if (s < min) min = s;
        if (e > max) max = e;
      }
    });

    // Add buffer (1 week before and after)
    min = new Date(min);
    min.setDate(min.getDate() - 7);
    max = new Date(max);
    max.setDate(max.getDate() + 14);

    const dateArray = [];
    const curr = new Date(min);
    while (curr <= max) {
      dateArray.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    return {
      dates: dateArray,
      startDate: min,
      totalWidth: dateArray.length * colWidth
    };
  }, [tasks]);

  const getUserInitial = (email: string) => {
    const user = users.find(u => u.email === email);
    return user ? user.name.charAt(0) : '?';
  };

  const getStatusColor = (status: Status) => {
    switch (status) {
      case Status.COMPLETED: return 'bg-green-500 hover:bg-green-600';
      case Status.IN_PROGRESS: return 'bg-indigo-500 hover:bg-indigo-600';
      case Status.NOT_STARTED: return 'bg-gray-400 hover:bg-gray-500';
      default: return 'bg-blue-500';
    }
  };

  const formatDate = (date: Date) => {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const getDayName = (date: Date) => {
    return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-auto relative">
        <div className="inline-block min-w-full relative">
          
          {/* Header Row */}
          <div className="flex sticky top-0 z-20 bg-gray-50 border-b border-gray-200" style={{ height: headerHeight }}>
            <div className="sticky left-0 z-30 w-64 bg-gray-50 border-r border-gray-200 p-3 font-medium text-gray-500 text-xs flex items-center shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
              タスク名
            </div>
            <div className="flex">
              {dates.map((date, i) => {
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <div 
                    key={i} 
                    className={`flex-shrink-0 border-r border-gray-200 flex flex-col justify-center items-center text-xs ${isWeekend ? 'bg-gray-100 text-gray-500' : 'text-gray-700'}`}
                    style={{ width: colWidth }}
                  >
                    <span className="font-semibold">{formatDate(date)}</span>
                    <span className="text-[10px]">{getDayName(date)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Task Rows */}
          <div className="relative">
            {/* Background Grid (Optimized: rendered once) */}
            <div className="absolute inset-0 flex pl-64 pointer-events-none z-0">
               {dates.map((date, i) => {
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <div 
                      key={i} 
                      className={`flex-shrink-0 border-r border-gray-100 h-full ${isWeekend ? 'bg-gray-50/50' : ''}`}
                      style={{ width: colWidth }}
                    />
                  );
               })}
            </div>

            {tasks.map((task) => {
              if (!task.startDate || !task.dueDate) return null;
              
              const tStart = new Date(task.startDate);
              const tEnd = new Date(task.dueDate);
              
              // Calculate days difference from timeline start
              const startDiff = Math.ceil((tStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
              let duration = Math.ceil((tEnd.getTime() - tStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              
              if (duration < 1) duration = 1;

              const left = startDiff * colWidth;
              const width = duration * colWidth;

              return (
                <div key={task.id} className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors relative z-10" style={{ height: rowHeight }}>
                  {/* Sticky Task Name */}
                  <div className="sticky left-0 z-20 w-64 bg-white group-hover:bg-gray-50 border-r border-gray-200 p-3 flex items-center justify-between shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                    <div className="truncate text-sm font-medium text-gray-700 pr-2" title={task.title}>
                      {task.title}
                    </div>
                    <div className="flex-shrink-0 w-6 h-6 bg-indigo-50 rounded-full flex items-center justify-center text-xs text-indigo-600 font-bold">
                      {getUserInitial(task.assigneeEmail)}
                    </div>
                  </div>

                  {/* Timeline Area for this row */}
                  <div className="relative flex-1">
                    <div
                      onClick={() => onEdit(task)}
                      className={`absolute top-2 h-8 rounded-md shadow-sm cursor-pointer flex items-center px-2 text-xs text-white whitespace-nowrap overflow-hidden transition-all ${getStatusColor(task.status)}`}
                      style={{ 
                        left: `${left}px`, 
                        width: `${width}px`,
                        maxWidth: '100%'
                      }}
                      title={`${task.title} (${task.startDate} ~ ${task.dueDate})`}
                    >
                      {task.title}
                    </div>
                  </div>
                </div>
              );
            })}

            {tasks.length === 0 && (
               <div className="p-8 text-center text-gray-500 italic">
                 表示するタスクがありません
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
