
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Task, User, Tag, Status } from '../types';

interface GanttChartProps {
  tasks: Task[];
  users: User[];
  tags: Tag[];
  onEdit: (task: Task) => void;
  onTaskUpdate?: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

interface DragState {
  taskId: string;
  type: 'left' | 'right' | 'move';
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

interface GanttDateRange {
    dates: Date[];
    startDate: Date;
}

export const GanttChart: React.FC<GanttChartProps> = ({ tasks, users, tags, onEdit, onTaskUpdate, onDelete }) => {
  const colWidth = 40; // Width of one day column in pixels
  const headerHeight = 48;
  const rowHeight = 48;

  // Dragging state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  // Calculate timeline range based on tasks
  // Explicitly return GanttDateRange to avoid implicit Any or circular reference issues in build
  const timelineData = useMemo<GanttDateRange>((): GanttDateRange => {
    if (tasks.length === 0) {
      const now = new Date();
      return { dates: [now], startDate: now };
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

    const dateArray: Date[] = [];
    const curr = new Date(min);
    while (curr <= max) {
      dateArray.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    return {
      dates: dateArray,
      startDate: min
    };
  }, [tasks]);

  const { dates, startDate } = timelineData;

  // 1. Filter valid tasks (must have dates)
  // 2. Sort tasks topologically so connected tasks are adjacent
  const sortedValidTasks = useMemo(() => {
      const validTasks = tasks.filter(t => t.startDate && t.dueDate);
      
      // Map for quick access
      const taskMap = new Map(validTasks.map(t => [t.id, t]));
      
      // Adjacency list: Parent ID -> [Child IDs]
      const adjacency = new Map<string, string[]>();
      const roots: Task[] = [];

      // Build graph
      validTasks.forEach(t => {
          if (t.predecessorTaskId && taskMap.has(t.predecessorTaskId)) {
              const parentId = t.predecessorTaskId;
              if (!adjacency.has(parentId)) adjacency.set(parentId, []);
              adjacency.get(parentId)!.push(t.id);
          } else {
              roots.push(t);
          }
      });

      // Sort roots by start date initially
      roots.sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));

      // DFS flatten
      const result: Task[] = [];
      const visited = new Set<string>();

      const visit = (t: Task) => {
          if (visited.has(t.id)) return;
          visited.add(t.id);
          result.push(t);

          const childrenIds = adjacency.get(t.id) || [];
          // Sort children by start date too
          const children = childrenIds
            .map((id: string) => taskMap.get(id)!) // Explicitly type ID
            .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
            
          children.forEach(child => visit(child));
      };

      roots.forEach(visit);

      // Catch any orphans (cycles or disconnected parts not caught)
      validTasks.forEach(t => {
          if (!visited.has(t.id)) {
              result.push(t);
          }
      });

      return result;
  }, [tasks]);

  const getUserInitial = (email: string) => {
    const user = users.find(u => u.email === email);
    return user ? user.name.charAt(0) : '?';
  };

  const getTagColor = (tagName: string) => {
    const tag = tags.find(t => t.name === tagName);
    return tag ? tag.color : '#9CA3AF';
  };

  const formatDate = (date: Date) => {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };
  
  const formatDateForInput = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
  }

  const getDayName = (date: Date) => {
    return ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  };

  // Mouse Event Handlers
  const handleMouseDown = (e: React.MouseEvent, taskId: string, type: 'left' | 'right' | 'move', task: Task) => {
      if (!task.startDate || !task.dueDate) return;
      e.stopPropagation();
      e.preventDefault();
      setDragState({
          taskId,
          type,
          startX: e.clientX,
          originalStart: new Date(task.startDate),
          originalEnd: new Date(task.dueDate)
      });
      setDragOffset(0);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    e.preventDefault();
    setDragOffset(e.clientX - dragState.startX);
  }, [dragState]);

  const handleMouseUp = useCallback(() => {
      if (!dragState || !onTaskUpdate) {
          setDragState(null);
          setDragOffset(0);
          return;
      }
      
      // Apply changes
      const daysDelta = Math.round(dragOffset / colWidth);
      if (daysDelta !== 0) {
          const task = tasks.find(t => t.id === dragState.taskId);
          if (task) {
              let newStart = new Date(dragState.originalStart);
              let newEnd = new Date(dragState.originalEnd);

              if (dragState.type === 'move') {
                  newStart.setDate(newStart.getDate() + daysDelta);
                  newEnd.setDate(newEnd.getDate() + daysDelta);
              } else if (dragState.type === 'left') {
                  newStart.setDate(newStart.getDate() + daysDelta);
              } else {
                  newEnd.setDate(newEnd.getDate() + daysDelta);
              }

              // Validation: End cannot be before start
              if (newStart <= newEnd) {
                   onTaskUpdate({
                       ...task,
                       startDate: formatDateForInput(newStart),
                       dueDate: formatDateForInput(newEnd)
                   });
              }
          }
      }

      setDragState(null);
      setDragOffset(0);
  }, [dragState, dragOffset, colWidth, tasks, onTaskUpdate]);

  // Global Listeners for Drag
  useEffect(() => {
      if (dragState) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      }
  }, [dragState, handleMouseMove, handleMouseUp]);

  // Helper to get coordinates for a task
  const getTaskCoordinates = (task: Task, index: number) => {
      if (!task.startDate || !task.dueDate) return null;
      const tStart = new Date(task.startDate);
      const tEnd = new Date(task.dueDate);
      const startDiff = Math.ceil((tStart.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const duration = Math.ceil((tEnd.getTime() - tStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      const x = startDiff * colWidth;
      const width = duration * colWidth;
      const y = (index * rowHeight) + (rowHeight / 2);

      return { x, width, y };
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow flex flex-col h-full overflow-hidden select-none">
      <div className="flex-1 overflow-auto relative">
        <div className="inline-block min-w-full relative">
          
          {/* Header Row */}
          <div className="flex sticky top-0 z-20 bg-gray-50 border-b border-gray-200" style={{ height: headerHeight }}>
            <div className="sticky left-0 z-30 w-64 bg-gray-50 border-r border-gray-200 p-3 font-medium text-gray-500 text-xs flex items-center shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
              タスク名
            </div>
            <div className="flex">
              {dates.map((date: Date, i: number) => {
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
               {dates.map((date: Date, i: number) => {
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

            {/* Dependency Lines Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" style={{ left: 256 }}>
                {sortedValidTasks.map((task, index) => {
                    if (!task.predecessorTaskId) return null;
                    const predecessorIndex = sortedValidTasks.findIndex(t => t.id === task.predecessorTaskId);
                    if (predecessorIndex === -1) return null;
                    
                    const predecessor = sortedValidTasks[predecessorIndex];
                    const currentCoords = getTaskCoordinates(task, index);
                    const prevCoords = getTaskCoordinates(predecessor, predecessorIndex);
                    
                    if (!currentCoords || !prevCoords) return null;

                    // Calculate connection points
                    const startX = prevCoords.x + prevCoords.width;
                    const startY = prevCoords.y;
                    const endX = currentCoords.x;
                    const endY = currentCoords.y;

                    const path = `M ${startX} ${startY} C ${startX + 20} ${startY}, ${endX - 20} ${endY}, ${endX} ${endY}`;

                    return (
                        <g key={`link-${task.id}`}>
                            <path d={path} fill="none" stroke="#9CA3AF" strokeWidth="1.5" markerEnd="url(#arrowhead)" />
                        </g>
                    );
                })}
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF" />
                    </marker>
                </defs>
            </svg>

            {/* Tasks */}
            {sortedValidTasks.map((task, index) => {
              const coords = getTaskCoordinates(task, index);
              if (!coords) return null;
              
              const { x: leftBase, width: widthBase } = coords;

              // Apply Drag Offsets
              let left = leftBase;
              let width = widthBase;

              if (dragState && dragState.taskId === task.id) {
                  const pixelDelta = dragOffset;
                  const daysDelta = pixelDelta / colWidth;

                  if (dragState.type === 'move') {
                      left += pixelDelta;
                  } else if (dragState.type === 'left') {
                      left += pixelDelta;
                      width -= pixelDelta;
                  } else {
                      width += pixelDelta;
                  }
              }

              if (width < colWidth) width = colWidth; // Minimum 1 day visual

              // Colors & Opacity based on status/tag
              const barColor = getTagColor(task.tag);
              const isCompleted = task.status === Status.COMPLETED;
              const isNotStarted = task.status === Status.NOT_STARTED;
              
              const barOpacity = isNotStarted ? 0.6 : 1;

              return (
                <div key={task.id} className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors relative z-10 group" style={{ height: rowHeight }}>
                  {/* Sticky Task Name */}
                  <div className="sticky left-0 z-20 w-64 bg-white group-hover:bg-gray-50 border-r border-gray-200 p-3 flex items-center justify-between shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                    
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                        className="text-gray-300 hover:text-red-500 mr-2 p-1 rounded transition-colors"
                        title="削除"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </button>

                    <div className="truncate text-sm font-medium text-gray-700 pr-2 flex-1 cursor-pointer hover:text-indigo-600 flex items-center" onClick={() => onEdit(task)} title={task.title}>
                      {task.visibility === 'private' && (
                          <svg className="w-3 h-3 mr-1 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                      )}
                      {task.title}
                    </div>

                    <div className="flex-shrink-0 flex items-center">
                         <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-[10px] font-bold flex items-center justify-center border border-indigo-200 mr-1">
                             {getUserInitial(task.assigneeEmail)}
                         </div>
                    </div>
                  </div>

                  {/* Bar Area */}
                  <div className="flex-1 relative">
                      {/* Bar */}
                      <div 
                        className={`absolute top-2 h-8 rounded-md shadow-sm border border-white/20 flex items-center px-2 text-xs text-white overflow-hidden whitespace-nowrap cursor-pointer hover:brightness-95 transition-all
                            ${isCompleted ? 'bg-green-500' : isNotStarted ? 'bg-gray-400' : 'bg-indigo-500'}
                        `}
                        style={{ 
                            left: left, 
                            width: width,
                            backgroundColor: barColor, // Override with tag color if exists
                            opacity: barOpacity,
                            cursor: 'grab'
                        }}
                        onMouseDown={(e) => handleMouseDown(e, task.id, 'move', task)}
                        onClick={() => onEdit(task)}
                      >
                         {/* Left Resize Handle */}
                         <div 
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize hover:bg-black/10 z-10"
                            onMouseDown={(e) => handleMouseDown(e, task.id, 'left', task)}
                         />

                         <span className="font-medium drop-shadow-md truncate w-full pl-1">{task.title}</span>

                         {/* Right Resize Handle */}
                         <div 
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize hover:bg-black/10 z-10"
                            onMouseDown={(e) => handleMouseDown(e, task.id, 'right', task)}
                         />
                      </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}