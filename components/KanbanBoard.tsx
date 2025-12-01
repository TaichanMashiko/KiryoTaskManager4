
import React, { DragEvent, useState } from 'react';
import { Task, User, Tag, Status, Priority } from '../types';
import { Badge } from './Badge';

interface KanbanBoardProps {
  tasks: Task[];
  users: User[];
  tags: Tag[];
  onTaskMove: (taskId: string, newStatus: Status) => void;
  onTaskReorder?: (taskId: string, newStatus: Status, newIndex: number) => void;
  onEdit: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, users, tags, onTaskMove, onTaskReorder, onEdit, onDelete }) => {
  const statuses = Object.values(Status);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverTrash, setIsOverTrash] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  
  // Display Options
  const [isCompact, setIsCompact] = useState(false);
  const [collapsedColumns, setCollapsedColumns] = useState<Set<Status>>(new Set());

  const toggleColumn = (status: Status) => {
      const newSet = new Set(collapsedColumns);
      if (newSet.has(status)) {
          newSet.delete(status);
      } else {
          newSet.add(status);
      }
      setCollapsedColumns(newSet);
  };

  const getUserName = (email: string) => {
    const user = users.find(u => u.email === email);
    return user ? user.name : email;
  };

  const getPredecessorName = (predecessorId: string) => {
    const task = tasks.find(t => t.id === predecessorId);
    return task ? task.title : '不明';
  };

  const getTagColor = (tagName: string) => {
      const tag = tags.find(t => t.name === tagName);
      return tag ? tag.color : '#9CA3AF';
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
    setDraggedTaskId(taskId);
  };

  const onDragEnd = () => {
    setIsDragging(false);
    setIsOverTrash(false);
    setDraggedTaskId(null);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Drop on Column (Append to end)
  const onColumnDrop = (e: DragEvent<HTMLDivElement>, status: Status, statusTasksCount: number) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    if (!taskId) return;
    
    onDragEnd(); // Clear UI state immediately

    if (onTaskReorder) {
        onTaskReorder(taskId, status, statusTasksCount);
    } else {
        onTaskMove(taskId, status);
    }
  };

  // Drop on Card (Insert before or after based on mouse position)
  const onCardDrop = (e: DragEvent<HTMLDivElement>, targetTask: Task, index: number) => {
      e.preventDefault();
      e.stopPropagation(); // Stop bubbling to column drop!
      
      const draggedId = e.dataTransfer.getData('taskId');
      if (!draggedId || draggedId === targetTask.id) return;

      onDragEnd(); // Clear UI state immediately

      // Determine insert position based on mouse Y relative to card center
      const rect = e.currentTarget.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      
      // If dropping on top half, insert at current index (before)
      // If dropping on bottom half, insert at index + 1 (after)
      const insertIndex = e.clientY > midY ? index + 1 : index;

      if (onTaskReorder) {
          onTaskReorder(draggedId, targetTask.status, insertIndex);
      }
  };

  const onTrashDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOverTrash(true);
  };

  const onTrashDragLeave = () => {
    setIsOverTrash(false);
  };

  const onTrashDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation(); // Stop propagation
    
    const taskId = e.dataTransfer.getData('taskId');
    
    // 1. Reset Drag State Immediately
    onDragEnd();

    // 2. Use setTimeout to defer the delete confirmation.
    // This allows the drag operation to fully complete and the UI to update (removing the ghost image)
    // BEFORE the blocking window.confirm dialog appears.
    if (taskId) {
      setTimeout(() => {
          onDelete(taskId);
      }, 10);
    }
  };

  return (
    <div className="h-full flex flex-col">
        {/* Controls Toolbar */}
        <div className="flex justify-end items-center mb-3 px-1">
            <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-gray-200">
                <span className="text-xs font-medium text-gray-600">表示モード:</span>
                <button 
                    onClick={() => setIsCompact(!isCompact)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${isCompact ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                    コンパクト
                </button>
                <button 
                    onClick={() => setIsCompact(false)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${!isCompact ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                    詳細
                </button>
            </div>
        </div>

        <div className="flex gap-4 h-full overflow-x-auto pb-4 relative">
        {statuses.map((status) => {
            // Sort tasks by order before rendering
            const statusTasks = tasks.filter(t => t.status === status).sort((a, b) => (a.order || 0) - (b.order || 0));
            const styles = getHeaderStyles(status);
            const isCollapsed = collapsedColumns.has(status);
            
            // Collapsed View
            if (isCollapsed) {
                return (
                    <div 
                        key={status}
                        className={`flex-shrink-0 w-12 rounded-lg flex flex-col items-center cursor-pointer transition-all border ${styles.container}`}
                        onClick={() => toggleColumn(status)}
                        title={`${status} (クリックで展開)`}
                    >
                         <div className="py-4 writing-vertical-rl font-bold tracking-wider transform rotate-180 text-sm">
                            {status}
                         </div>
                         <div className={`mt-2 text-xs w-6 h-6 rounded-full flex items-center justify-center ${styles.badge}`}>
                            {statusTasks.length}
                         </div>
                    </div>
                );
            }

            // Expanded View
            return (
            <div
                key={status}
                className="flex-shrink-0 w-80 bg-gray-100 rounded-lg flex flex-col max-h-[calc(100vh-220px)]"
                onDragOver={onDragOver}
                onDrop={(e) => onColumnDrop(e, status, statusTasks.length)}
            >
                <div className={`p-3 font-bold flex justify-between items-center rounded-t-lg border-b ${styles.container}`}>
                <div className="flex items-center">
                    <span>{status}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-bold ${styles.badge}`}>
                        {statusTasks.length}
                    </span>
                </div>
                <button 
                    onClick={() => toggleColumn(status)}
                    className="text-white hover:bg-white/20 rounded p-1 focus:outline-none"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </button>
                </div>
                
                <div className="p-2 flex-1 overflow-y-auto space-y-2 scrollbar-hide">
                {statusTasks.map((task, index) => (
                    <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, task.id)}
                    onDragEnd={onDragEnd}
                    onDrop={(e) => onCardDrop(e, task, index)} // Handle drop on card
                    onClick={() => onEdit(task)}
                    className={`bg-white rounded shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow relative group
                        ${isCompact ? 'p-2' : 'p-3'}
                        ${draggedTaskId === task.id ? 'opacity-40 border-dashed border-2 border-indigo-400 bg-indigo-50' : 'opacity-100'}
                    `}
                    >
                    {isCompact ? (
                        // Compact Card View
                        <div className="flex items-center justify-between pointer-events-none">
                            <div className="flex items-center overflow-hidden mr-2">
                                {/* Status/Priority Color Bar */}
                                <div className={`flex-shrink-0 w-1.5 h-8 rounded-full mr-2 ${
                                    task.priority === Priority.HIGH ? 'bg-red-500' : 
                                    task.priority === Priority.MEDIUM ? 'bg-yellow-500' : 'bg-blue-500'
                                }`} />
                                <div className="truncate">
                                    <div className="text-xs font-medium text-gray-800 truncate">{task.title}</div>
                                    <div className="text-[10px] text-gray-500 flex items-center">
                                         {task.visibility === 'private' && <span className="mr-1">🔒</span>}
                                         {task.tag && (
                                            <span 
                                                className="inline-block w-2 h-2 rounded-full mr-1" 
                                                style={{backgroundColor: getTagColor(task.tag)}} 
                                                title={task.tag}
                                            />
                                         )}
                                         {getUserName(task.assigneeEmail)}
                                    </div>
                                </div>
                            </div>
                             {task.predecessorTaskId && <span className="text-xs text-indigo-500">🔗</span>}
                        </div>
                    ) : (
                        // Full Card View
                        <div className="pointer-events-none">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex gap-1">
                                    <Badge type="priority" value={task.priority} />
                                    {task.tag && (
                                        <span 
                                            className="px-2 py-1 rounded-full text-xs font-medium text-white"
                                            style={{ backgroundColor: getTagColor(task.tag) }}
                                        >
                                            {task.tag}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xs text-gray-400">{task.dueDate}まで</span>
                                    {task.visibility === 'private' && (
                                        <span title="非公開タスク" className="text-gray-400 mt-1">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                                        </span>
                                    )}
                                </div>
                            </div>
                            <h4 className="font-semibold text-gray-800 mb-1 text-sm">{task.title}</h4>
                            <p className="text-xs text-gray-500 line-clamp-2 mb-2">{task.detail}</p>
                            
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
                    )}
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
    </div>
  );
};