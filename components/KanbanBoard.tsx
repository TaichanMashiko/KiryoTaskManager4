
import React, { DragEvent } from 'react';
import { Task, User, Status, Priority } from '../types';
import { Badge } from './Badge';

interface KanbanBoardProps {
  tasks: Task[];
  users: User[];
  onTaskMove: (taskId: string, newStatus: Status) => void;
  onEdit: (task: Task) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, users, onTaskMove, onEdit }) => {
  const statuses = Object.values(Status);

  const getUserName = (email: string) => {
    const user = users.find(u => u.email === email);
    return user ? user.name : email;
  };

  const getHeaderStyles = (status: string) => {
    // Explicitly match the string values from the Enum
    switch (status) {
      case Status.COMPLETED:
        return {
          container: 'bg-green-500 text-white border-green-600',
          badge: 'bg-white text-green-700'
        };
      case Status.IN_PROGRESS:
        return {
          container: 'bg-indigo-500 text-white border-indigo-600',
          badge: 'bg-white text-indigo-700'
        };
      case Status.NOT_STARTED:
        return {
          container: 'bg-gray-400 text-white border-gray-500', // Match Gantt Chart's gray-400
          badge: 'bg-white text-gray-700'
        };
      default:
        return {
          container: 'bg-gray-200 text-gray-700 border-gray-300',
          badge: 'bg-white text-gray-600'
        };
    }
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const onDrop = (e: DragEvent<HTMLDivElement>, status: Status) => {
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      onTaskMove(taskId, status);
    }
  };

  return (
    <div className="flex gap-6 h-full overflow-x-auto pb-4">
      {statuses.map((status) => {
        const statusTasks = tasks.filter(t => t.status === status);
        const styles = getHeaderStyles(status);
        
        return (
          <div
            key={status}
            className="flex-shrink-0 w-80 bg-gray-100 rounded-lg flex flex-col max-h-[calc(100vh-200px)]"
            onDragOver={onDragOver}
            onDrop={(e) => onDrop(e, status)}
          >
            <div className={`p-4 font-bold flex justify-between items-center rounded-t-lg border-b ${styles.container}`}>
              <span>{status}</span>
              <span className={`text-xs px-2 py-1 rounded-full font-bold ${styles.badge}`}>
                {statusTasks.length}
              </span>
            </div>
            
            <div className="p-3 flex-1 overflow-y-auto space-y-3 scrollbar-hide">
              {statusTasks.map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, task.id)}
                  onClick={() => onEdit(task)}
                  className="bg-white p-4 rounded shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow relative group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <Badge type="priority" value={task.priority} />
                    <span className="text-xs text-gray-400">{task.dueDate}まで</span>
                  </div>
                  <h4 className="font-semibold text-gray-800 mb-1">{task.title}</h4>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{task.detail}</p>
                  
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center text-xs text-gray-500">
                       <span className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-[10px] mr-1 font-bold">
                         {getUserName(task.assigneeEmail).charAt(0)}
                       </span>
                       {getUserName(task.assigneeEmail)}
                    </div>
                    <div className={`w-2 h-2 rounded-full ${
                      task.priority === Priority.HIGH ? 'bg-red-500' : 
                      task.priority === Priority.MEDIUM ? 'bg-yellow-500' : 'bg-blue-500'
                    }`} />
                  </div>
                </div>
              ))}
              {statusTasks.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-8 border-2 border-dashed border-gray-300 rounded m-2">
                  タスクなし
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
