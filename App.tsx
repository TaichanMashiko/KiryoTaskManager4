
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { TaskTable } from './components/TaskTable';
import { KanbanBoard } from './components/KanbanBoard';
import { GanttChart } from './components/GanttChart';
import { TaskModal } from './components/TaskModal';
import { Dashboard } from './components/AdminDashboard';
import { sheetService } from './services/sheetService';
import { Task, User, Tag, ViewMode, Status } from './types';

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.LIST);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [modalMode, setModalMode] = useState<'task' | 'todo'>('task');

  // Filters
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterTag, setFilterTag] = useState('ALL');
  const [filterDepartment, setFilterDepartment] = useState('ALL');

  const loadData = useCallback(async () => {
    try {
      const [fetchedTasks, fetchedUsers, fetchedTags] = await Promise.all([
        sheetService.getTasks(),
        sheetService.getUsers(),
        sheetService.getTags(),
      ]);
      setTasks(fetchedTasks);
      setUsers(fetchedUsers);
      setTags(fetchedTags);

      const user = await sheetService.getCurrentUser();
      setCurrentUser(user);
      
      // Initial filter setting: show my tasks by default
      if (user && filterAssignee === 'ALL' && !isInitialized) {
          setFilterAssignee(user.email);
      }

    } catch (e: any) {
      console.error("Failed to load data", e);
      if (e.result?.error?.code === 401) {
          setIsSignedIn(false);
      }
    }
  }, [filterAssignee, isInitialized]);

  useEffect(() => {
    const init = async () => {
      try {
        await sheetService.initClient((signedIn) => {
          setIsSignedIn(signedIn);
          if (signedIn) {
             loadData().then(() => setIsInitialized(true));
          } else {
             setIsInitialized(true);
             // Attempt silent login if token exists in storage
             if (sheetService.hasStoredAuth()) {
                 sheetService.signIn(true);
             }
          }
        });
      } catch (e: any) {
        console.error("Init Error:", e);
        let msg = "初期化に失敗しました。";
        if (e?.result?.error?.message) {
            msg += ` (${e.result.error.message})`;
        } else if (e?.message) {
            msg += ` (${e.message})`;
        } else {
            msg += " APIの設定やネットワーク接続を確認してください。";
        }
        
        // Specific hints for common errors
        if (msg.includes("Calendar API")) {
             msg = "Google Calendar API が有効になっていません。Google Cloud Consoleで有効化してください。";
        }
        setInitError(msg);
        setIsInitialized(true);
      }
    };
    init();

    // Polling for updates every 30 seconds
    const intervalId = setInterval(() => {
        if (isSignedIn) {
            loadData();
        }
    }, 30000);

    return () => clearInterval(intervalId);
  }, [loadData, isSignedIn]);

  const handleLogin = () => {
    sheetService.signIn();
  };

  const handleLogout = () => {
    sheetService.signOut(() => {
      setIsSignedIn(false);
      setTasks([]);
      setUsers([]);
      setCurrentUser(null);
    });
  };

  const handleSaveTask = async (taskData: Partial<Task>, addToCalendar: boolean) => {
    try {
      // 1. Check if tag is new and create it
      if (taskData.tag) {
          const existingTag = tags.find(t => t.name === taskData.tag);
          if (!existingTag) {
              const newTag = await sheetService.createTag(taskData.tag, tags);
              setTags(prev => [...prev, newTag]);
          }
      }

      // 2. Save Task
      if (editingTask) {
        // Update
        const updated = await sheetService.updateTask({ ...editingTask, ...taskData } as Task);
        
        // Calendar logic
        if (addToCalendar && updated.startDate && updated.dueDate) {
             try {
                 const event = await sheetService.addToCalendar(updated);
                 // Save event ID back to task
                 if (event.id) {
                     const taskWithEvent = { ...updated, calendarEventId: event.id };
                     await sheetService.updateTask(taskWithEvent);
                     setTasks(prev => prev.map(t => t.id === taskWithEvent.id ? taskWithEvent : t));
                 } else {
                     setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
                 }
             } catch (e) {
                 alert("カレンダーへの追加に失敗しましたが、タスクは保存されました。");
                 setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
             }
        } else {
             setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
        }
      } else {
        // Create
        const created = await sheetService.createTask(taskData as Task);
        
        // Calendar logic
        if (addToCalendar && created.startDate && created.dueDate) {
            try {
                const event = await sheetService.addToCalendar(created);
                 if (event.id) {
                     const taskWithEvent = { ...created, calendarEventId: event.id };
                     await sheetService.updateTask(taskWithEvent);
                     setTasks(prev => [...prev, taskWithEvent]);
                 } else {
                     setTasks(prev => [...prev, created]);
                 }
            } catch (e) {
                 alert("カレンダーへの追加に失敗しましたが、タスクは保存されました。");
                 setTasks(prev => [...prev, created]);
            }
        } else {
            setTasks(prev => [...prev, created]);
        }
      }
      setIsModalOpen(false);
      setEditingTask(null);
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    // 1. 確認ダイアログ
    if (!window.confirm('このタスクを削除してもよろしいですか？（Googleカレンダーのイベントも削除されます）')) {
        return;
    }

    // 2. Optimistic Update (画面から即座に消す)
    const originalTasks = [...tasks];
    const taskToDelete = tasks.find(t => t.id === taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));

    // 3. API Call
    try {
      // Pass the task title as well to ensure we delete the correct row if IDs are duplicated in the sheet
      await sheetService.deleteTask(taskId, taskToDelete?.title);
    } catch (e) {
      console.error(e);
      alert('削除に失敗しました。データを復元します。');
      setTasks(originalTasks); // Revert
      loadData();
    }
  };

  const handleTaskMove = async (taskId: string, newStatus: Status) => {
    // Validation: Predecessor check
    const task = tasks.find(t => t.id === taskId);
    if (task && task.predecessorTaskId && (newStatus === Status.IN_PROGRESS || newStatus === Status.COMPLETED)) {
        const predecessor = tasks.find(t => t.id === task.predecessorTaskId);
        if (predecessor && predecessor.status !== Status.COMPLETED) {
            alert(`前提タスク「${predecessor.title}」が完了していません。`);
            return; // Cancel move
        }
    }

    // Optimistic Update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      await sheetService.updateTaskStatus(taskId, newStatus);
    } catch (e) {
      console.error(e);
      loadData(); // Revert on error
    }
  };

  const handleTaskReorder = async (taskId: string, newStatus: Status, newIndex: number) => {
      // 1. Predecessor Validation
      const taskToCheck = tasks.find(t => t.id === taskId);
      if (taskToCheck && taskToCheck.predecessorTaskId && (newStatus === Status.IN_PROGRESS || newStatus === Status.COMPLETED)) {
          const predecessor = tasks.find(t => t.id === taskToCheck.predecessorTaskId);
          if (predecessor && predecessor.status !== Status.COMPLETED) {
              alert(`前提タスク「${predecessor.title}」が完了していません。`);
              return;
          }
      }

      // 2. Optimistic Update with Robust Reordering
      const newTasks = [...tasks];
      const movedTaskIndex = newTasks.findIndex(t => t.id === taskId);
      if (movedTaskIndex === -1) return;

      const [movedTask] = newTasks.splice(movedTaskIndex, 1);
      movedTask.status = newStatus;

      // Filter tasks in the destination column (excluding the moved one which is already removed)
      const destColumnTasks = newTasks.filter(t => t.status === newStatus);
      
      // Sort them by current order to ensure we insert at the correct visual position
      destColumnTasks.sort((a, b) => (a.order || 0) - (b.order || 0));

      // Insert moved task at newIndex
      destColumnTasks.splice(newIndex, 0, movedTask);

      // Re-assign order for the whole column
      const updatedOrderTasks: Task[] = [];
      destColumnTasks.forEach((t, i) => {
          t.order = i;
          updatedOrderTasks.push(t);
      });

      // Update the main tasks array:
      // Remove all tasks of this status from main array and push the re-ordered ones back
      const otherTasks = newTasks.filter(t => t.status !== newStatus);
      const finalTasks = [...otherTasks, ...updatedOrderTasks];

      setTasks(finalTasks);

      // 3. API Call (Batch update orders)
      try {
          await sheetService.updateTask(movedTask); // Update status
          await sheetService.updateTaskOrders(updatedOrderTasks); // Update orders
      } catch (e) {
          console.error("Failed to reorder", e);
          loadData(); // Revert
      }
  };

  const handleDirectUpdate = async (task: Task) => {
      // Optimistic update for Gantt chart drag
      setTasks(prev => prev.map(t => t.id === task.id ? task : t));
      try {
          await sheetService.updateTask(task);
      } catch (e) {
          console.error(e);
          loadData();
      }
  };

  const openCreateModal = (mode: 'task' | 'todo') => {
      setModalMode(mode);
      setEditingTask(null);
      setIsModalOpen(true);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Search Keyword
      const matchesSearch = task.title.toLowerCase().includes(searchKeyword.toLowerCase()) || 
                            task.detail.toLowerCase().includes(searchKeyword.toLowerCase());
      
      // Filters
      const matchesAssignee = filterAssignee === 'ALL' || task.assigneeEmail === filterAssignee;
      const matchesStatus = filterStatus === 'ALL' || task.status === filterStatus;
      const matchesTag = filterTag === 'ALL' || task.tag === filterTag;

      // Department Filter
      let matchesDepartment = true;
      if (filterDepartment !== 'ALL') {
          const assignee = users.find(u => u.email === task.assigneeEmail);
          matchesDepartment = assignee ? assignee.department === filterDepartment : false;
      }
      
      // Visibility Filter (Privacy)
      // Hide private tasks (TODOs) of OTHER users
      let isVisible = true;
      if (task.visibility === 'private') {
          if (!currentUser || task.assigneeEmail !== currentUser.email) {
              isVisible = false;
          }
      }

      return matchesSearch && matchesAssignee && matchesStatus && matchesTag && matchesDepartment && isVisible;
    });
  }, [tasks, searchKeyword, filterAssignee, filterStatus, filterTag, filterDepartment, users, currentUser]);

  // Unique departments for filter
  const departments = useMemo(() => {
      const depts = new Set(users.map(u => u.department).filter(Boolean));
      return Array.from(depts);
  }, [users]);

  if (!isInitialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
            {initError ? (
                <div className="mb-4 text-red-600">
                    <p className="font-bold text-lg mb-2">初期化エラー</p>
                    <p>{initError}</p>
                    <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">再読み込み</button>
                </div>
            ) : (
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            )}
            <p className="mt-4 text-gray-600">{!initError && 'アプリケーションを読み込み中...'}</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-indigo-600 mb-2">Kiryo Tasks</h1>
          <p className="text-gray-500 mb-8">チームのタスクをGoogleスプレッドシートで管理します。</p>
          
          <button
            onClick={handleLogin}
            className="flex items-center justify-center w-full px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border-gray-300 transition-colors"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 mr-3" alt="Google" />
            Googleアカウントでログイン
          </button>
          
          {initError && (
              <div className="mt-6 p-3 bg-red-50 text-red-700 text-sm rounded-lg text-left">
                  <p className="font-bold">アクセス許可エラー</p>
                  <p className="mt-1">{initError}</p>
                  <button onClick={handleLogin} className="mt-2 text-indigo-600 underline">再読み込み</button>
              </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm z-10 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center">
            <h1 className="text-xl font-bold text-indigo-600 mr-8">Kiryo Tasks <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full ml-1 font-normal">Alpha 1.9</span></h1>
            
            <div className="hidden md:flex space-x-1">
              <button 
                onClick={() => setViewMode(ViewMode.LIST)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === ViewMode.LIST ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                リスト
              </button>
              <button 
                onClick={() => setViewMode(ViewMode.KANBAN)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === ViewMode.KANBAN ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                カンバン
              </button>
              <button 
                onClick={() => setViewMode(ViewMode.GANTT)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === ViewMode.GANTT ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
              >
                ガント
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-4">
             {/* User Info */}
             <div className="flex items-center text-right">
                <div className="mr-3 hidden sm:block">
                    <div className="text-sm font-medium text-gray-900">{currentUser?.name}</div>
                    <div className="text-xs text-gray-500">{currentUser?.role === 'admin' ? '管理者' : '一般'}</div>
                </div>
                <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold border border-indigo-200">
                    {currentUser?.name?.charAt(0)}
                </div>
             </div>

             <div className="flex items-center space-x-2">
                 <button 
                    onClick={() => setViewMode(ViewMode.DASHBOARD)}
                    className={`px-3 py-1.5 rounded border text-sm font-medium transition-colors ${viewMode === ViewMode.DASHBOARD ? 'bg-indigo-500 text-white border-transparent' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                 >
                    ダッシュボード
                 </button>
                 <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-900 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors">ログアウト</button>
             </div>
          </div>
        </div>
      </header>

      {/* Toolbar & Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="relative w-full sm:w-64">
                <input
                    type="text"
                    placeholder="検索..."
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
            
            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-hide">
                <select 
                    value={filterAssignee} 
                    onChange={(e) => setFilterAssignee(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 outline-none flex-shrink-0 sm:w-auto"
                >
                    <option value="ALL">全担当者</option>
                    {users.map(u => <option key={u.email} value={u.email}>{u.name}</option>)}
                </select>

                <select 
                    value={filterStatus} 
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 outline-none flex-shrink-0 sm:w-auto"
                >
                    <option value="ALL">全ステータス</option>
                    {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                
                <select 
                    value={filterDepartment} 
                    onChange={(e) => setFilterDepartment(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 outline-none flex-shrink-0 sm:w-auto"
                >
                    <option value="ALL">全部署</option>
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>

                <select 
                    value={filterTag} 
                    onChange={(e) => setFilterTag(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-indigo-500 outline-none flex-shrink-0 sm:w-auto"
                >
                    <option value="ALL">全タグ</option>
                    {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>

                <div className="h-6 w-px bg-gray-300 mx-2 hidden sm:block"></div>

                {/* Mobile View Toggles */}
                <div className="flex sm:hidden border border-gray-300 rounded-lg overflow-hidden flex-shrink-0">
                    <button onClick={() => setViewMode(ViewMode.LIST)} className={`px-3 py-2 text-xs ${viewMode === ViewMode.LIST ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700'}`}>リスト</button>
                    <button onClick={() => setViewMode(ViewMode.KANBAN)} className={`px-3 py-2 text-xs ${viewMode === ViewMode.KANBAN ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700'}`}>カンバン</button>
                    <button onClick={() => setViewMode(ViewMode.GANTT)} className={`px-3 py-2 text-xs ${viewMode === ViewMode.GANTT ? 'bg-indigo-500 text-white' : 'bg-white text-gray-700'}`}>ガント</button>
                </div>

                <button 
                    onClick={() => openCreateModal('todo')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center whitespace-nowrap flex-shrink-0"
                >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    TODO作成
                </button>
                <button 
                    onClick={() => openCreateModal('task')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center whitespace-nowrap flex-shrink-0"
                >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                    タスク作成
                </button>
            </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
          {viewMode === ViewMode.LIST && (
            <div className="flex-1 overflow-auto">
                <TaskTable 
                    tasks={filteredTasks} 
                    users={users} 
                    tags={tags}
                    onEdit={(task) => { setEditingTask(task); setIsModalOpen(true); }}
                    onDelete={handleDeleteTask}
                />
            </div>
          )}
          
          {viewMode === ViewMode.KANBAN && (
            <KanbanBoard 
                tasks={filteredTasks} 
                users={users} 
                tags={tags}
                onTaskMove={handleTaskMove}
                onTaskReorder={handleTaskReorder}
                onEdit={(task) => { setEditingTask(task); setIsModalOpen(true); }}
                onDelete={handleDeleteTask}
            />
          )}

          {viewMode === ViewMode.GANTT && (
            <div className="flex-1 min-h-0">
                <GanttChart 
                    tasks={filteredTasks} 
                    users={users} 
                    tags={tags}
                    onEdit={(task) => { setEditingTask(task); setIsModalOpen(true); }}
                    onTaskUpdate={handleDirectUpdate}
                    onDelete={handleDeleteTask}
                />
            </div>
          )}

          {viewMode === ViewMode.DASHBOARD && (
             <div className="flex-1 overflow-auto">
                 <Dashboard tasks={tasks} users={users} />
             </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <TaskModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTask}
        task={editingTask}
        users={users}
        tags={tags}
        currentUser={currentUser}
        mode={modalMode}
        allTasks={tasks}
      />
    </div>
  );
}

export default App;
