
import React, { DragEvent, useState } from 'react';
import { Task, User, Status, Priority } from '../types';
import { Badge } from './Badge';

interface KanbanBoardProps {
  tasks: Task[];
  users: User[];
  onTaskMove: (taskId: string, newStatus: Status) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, users, onTaskMove, onEdit, onDelete }) => {
  const statuses = Object.values(Status);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverTrash, setIsOverTrash] = useState(false);

  const getUserName = (email: string) => {
    const user = users.find(u => u.email === email);
    return user ? user.name : email;
  };

  const getPredecessorName = (predecessorId: string) => {
    const task = tasks.find(t => t.id === predecessorId);
    return task ? task.title : '不明';
  };

  const getHeaderStyles = (status: string) => {
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
          container: 'bg-gray-400 text-white border-gray-500',
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
    setIsDragging(true);
  };

  const onDragEnd = () => {
    setIsDragging(false);
    setIsOverTrash(false);
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

  const onTrashDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOverTrash(true);
  };

  const onTrashDragLeave = () => {
    setIsOverTrash(false);
  };

  const onTrashDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      onDelete(taskId);
    }
    setIsOverTrash(false);
  };

  return (
    <div className="flex gap-6 h-full overflow-x-auto pb-4 relative">
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
                  onDragEnd={onDragEnd}
                  onClick={() => onEdit(task)}
                  className="bg-white p-4 rounded shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow relative group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <Badge type="priority" value={task.priority} />
                    <div className="flex flex-col items-end">
                        <span className="text-xs text-gray-400">{task.dueDate}まで</span>
                        {task.visibility === 'private' && (
                            <span title="非公開タスク" className="text-gray-400 mt-1">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                            </span>
                        )}
                    </div>
                  </div>
                  <h4 className="font-semibold text-gray-800 mb-1">{task.title}</h4>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{task.detail}</p>
                  
                  {task.predecessorTaskId && (
                      <div className="mb-2 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                          <span className="truncate">待: {getPredecessorName(task.predecessorTaskId)}</span>
                      </div>
                  )}

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

      {/* Trash Bin Drop Zone (Always Visible) */}
      <div 
        className={`fixed bottom-8 right-8 w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 z-50 ${
            isOverTrash ? 'bg-red-600 scale-110' : 'bg-gray-700 hover:bg-gray-800'
        }`}
        onDragOver={onTrashDragOver}
        onDragLeave={onTrashDragLeave}
        onDrop={onTrashDrop}
        title="ここにタスクをドラッグして削除"
      >
          <svg className={`w-8 h-8 ${isOverTrash ? 'text-white' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
          </svg>
      </div>
    </div>
  );
};
