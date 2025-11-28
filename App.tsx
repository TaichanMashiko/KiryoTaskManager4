
import { useEffect, useMemo, useState, useCallback } from 'react';
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
  const [authError, setAuthError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.LIST);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'task' | 'todo'>('task');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterTag, setFilterTag] = useState('');
  
  const [hasSetInitialFilter, setHasSetInitialFilter] = useState(false);

  useEffect(() => {
    const init = async () => {
        try {
            await sheetService.initClient((signedIn) => {
                setIsSignedIn(signedIn);
            });
            setIsInitialized(true);
            if (sheetService.hasStoredAuth()) {
                sheetService.signIn(true);
            }
        } catch (e: any) {
            console.error("Init failed", e);
            let message = "Google APIの初期化に失敗しました。";
            try {
                if (typeof e === 'string') message = e;
                else if (e.result?.error?.message) message = `API Error: ${e.result.error.message}`;
                else if (e.message) message = e.message;
                else message = "詳細: " + JSON.stringify(e);
            } catch (parseError) {
                message += " (エラー詳細の解析に失敗)";
            }
            setInitError(message + " (ヒント: コンソールを確認し、APIキー/クライアントID/有効なAPIを確認してください)");
        }
    };
    init();
  }, []);

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setAuthError(null);
    try {
      if (!silent) await sheetService.initializeSheets();

      if (!currentUser) {
          const userData = await sheetService.getCurrentUser();
          if (!userData) {
              setAuthError("あなたのアカウントは「Googleアカウント管理」シートに登録されていません。管理者に連絡してください。");
              return;
          }
          setCurrentUser(userData);
      }

      const [userList, tagList, taskList] = await Promise.all([
        sheetService.getUsers(),
        sheetService.getTags(),
        sheetService.getTasks(),
      ]);
      setUsers(userList);
      setTags(tagList);
      
      // Ensure tasks are sorted by order
      setTasks(taskList.sort((a, b) => (a.order || 0) - (b.order || 0)));
    } catch (error: any) {
      console.error("Failed to load data", error);
      if (!silent) setAuthError("データの読み込みに失敗しました: " + (error?.result?.error?.message || error.message || "Unknown error"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isSignedIn) {
      loadData();
    }
  }, [isSignedIn, loadData]);

  useEffect(() => {
    if (currentUser && !hasSetInitialFilter) {
      setFilterAssignee(currentUser.email);
      setHasSetInitialFilter(true);
    }
  }, [currentUser, hasSetInitialFilter]);

  useEffect(() => {
    if (!isSignedIn) return;
    const interval = setInterval(() => {
        loadData(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [isSignedIn, loadData]);

  const handleSignIn = () => {
      sheetService.signIn(false);
  };

  const handleSignOut = () => {
    sheetService.signOut(() => {
      setIsSignedIn(false);
      setTasks([]);
      setCurrentUser(null);
      setHasSetInitialFilter(false);
    });
  };

  const checkDependency = (task: Partial<Task>): { ok: boolean; message?: string } => {
    if (task.predecessorTaskId) {
      if (task.status !== Status.NOT_STARTED) {
         const predecessor = tasks.find(t => t.id === task.predecessorTaskId);
         if (predecessor && predecessor.status !== Status.COMPLETED) {
             return { 
                 ok: false, 
                 message: `前提タスク「${predecessor.title}」がまだ完了していません。\n先に前提タスクを完了させてください。` 
             };
         }
      }
    }
    return { ok: true };
  };

  const handleSaveTask = async (taskData: Partial<Task>, addToCalendar: boolean) => {
    const dependencyCheck = checkDependency(taskData);
    if (!dependencyCheck.ok) {
        alert(dependencyCheck.message);
        return;
    }

    setIsModalOpen(false);
    setEditingTask(null);

    try {
      setLoading(true);

      if (taskData.tag) {
        // Check case-insensitive
        const existingTag = tags.find(t => t.name.toLowerCase() === (taskData.tag || '').toLowerCase());
        if (!existingTag) {
            try {
                // Pass existing tags to avoid color collision
                const newTag = await sheetService.createTag(taskData.tag, tags);
                setTags(prev => [...prev, newTag]);
            } catch (e) {
                console.error("Failed to create new tag", e);
            }
        }
      }

      let savedTask: Task;

      if (editingTask) {
        savedTask = await sheetService.updateTask({ ...editingTask, ...taskData } as Task);
      } else {
        // Set default order for new task (end of list)
        const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;
        savedTask = await sheetService.createTask({ ...taskData, order: maxOrder + 1 } as any);
      }

      if (addToCalendar) {
          try {
              const event = await sheetService.addToCalendar(savedTask);
              if (event && event.id) {
                  savedTask.calendarEventId = event.id;
                  await sheetService.updateTask(savedTask);
              }
          } catch (calendarError: any) {
              console.error("Calendar Error", calendarError);
              alert("タスクは保存されましたが、カレンダーへの追加に失敗しました。\n" + calendarError.message);
          }
      }

      await loadData(true);
    } catch (e: any) {
      console.error(e);
      alert("保存に失敗しました: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("本当にこのタスクを削除しますか？カレンダーに連携されている場合、カレンダーからも削除されます。")) return;
    try {
      setLoading(true);
      await sheetService.deleteTask(taskId);
      await loadData(true);
    } catch (e: any) {
      console.error(e);
      alert("削除に失敗しました: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskMove = async (taskId: string, newStatus: Status) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedTaskPreview = { ...task, status: newStatus };
    const dependencyCheck = checkDependency(updatedTaskPreview);
    if (!dependencyCheck.ok) {
        alert(dependencyCheck.message);
        return;
    }

    try {
      // Optimistic update
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      await sheetService.updateTaskStatus(taskId, newStatus);
    } catch (e) {
      console.error("Move failed", e);
      loadData(true);
    }
  };

  const handleTaskReorder = async (taskId: string, newStatus: Status, newIndex: number) => {
      const draggedTask = tasks.find(t => t.id === taskId);
      if (!draggedTask) return;

      // 1. Check dependency constraints if status is changing
      if (draggedTask.status !== newStatus) {
          const check = checkDependency({ ...draggedTask, status: newStatus });
          if (!check.ok) {
              alert(check.message);
              return;
          }
      }

      const sourceStatus = draggedTask.status;

      // 2. Local State Update (Robust logic)
      // Remove dragged task from the current list
      const otherTasks = tasks.filter(t => t.id !== taskId);
      
      // Get all tasks for the *target* status from the remaining tasks
      const targetColumnTasks = otherTasks
          .filter(t => t.status === newStatus)
          .sort((a, b) => (a.order || 0) - (b.order || 0));

      // Determine safe insertion index
      // newIndex comes from UI, which might be based on "before drop" state
      let safeIndex = newIndex;
      if (safeIndex < 0) safeIndex = 0;
      if (safeIndex > targetColumnTasks.length) safeIndex = targetColumnTasks.length;

      // Update dragged task status
      const updatedDraggedTask = { ...draggedTask, status: newStatus };

      // Insert into the target array
      targetColumnTasks.splice(safeIndex, 0, updatedDraggedTask);

      // Re-assign order for the target column (0, 1, 2...)
      const updatedTargetColumn = targetColumnTasks.map((t, index) => ({
          ...t,
          order: index
      }));

      // Combine with tasks from other columns
      const tasksInOtherColumns = otherTasks.filter(t => t.status !== newStatus);
      const newAllTasks = [...tasksInOtherColumns, ...updatedTargetColumn].sort((a, b) => (a.order || 0) - (b.order || 0));

      setTasks(newAllTasks);

      try {
          // 3. Sync to backend
          if (sourceStatus !== newStatus) {
               await sheetService.updateTaskStatus(taskId, newStatus);
          }
          // Update orders for all affected tasks
          await sheetService.updateTaskOrders(updatedTargetColumn);
      } catch (e) {
          console.error("Reorder failed", e);
          loadData(true); // Revert on error
      }
  };

  const openModal = (mode: 'task' | 'todo', task?: Task) => {
      setModalMode(mode);
      setEditingTask(task || null);
      setIsModalOpen(true);
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const isVisible = task.visibility !== 'private' || (currentUser && task.assigneeEmail === currentUser.email);
      if (!isVisible) return false;

      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            task.detail.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesAssignee = filterAssignee ? task.assigneeEmail === filterAssignee : true;
      const matchesStatus = filterStatus ? task.status === filterStatus : true;
      const matchesTag = filterTag ? task.tag === filterTag : true;

      let matchesDepartment = true;
      if (filterDepartment) {
        const assignee = users.find(u => u.email === task.assigneeEmail);
        matchesDepartment = assignee?.department === filterDepartment;
      }

      return matchesSearch && matchesAssignee && matchesStatus && matchesTag && matchesDepartment;
    });
  }, [tasks, searchQuery, filterAssignee, filterStatus, filterDepartment, filterTag, users, currentUser]);

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
          <h2 className="text-red-600 text-xl font-bold mb-2">初期化エラー</h2>
          <p className="text-gray-700 text-sm whitespace-pre-wrap break-words">{initError}</p>
          <button onClick={() => window.location.reload()} className="mt-4 w-full bg-red-100 text-red-700 py-2 px-4 rounded hover:bg-red-200 transition">リロード</button>
        </div>
      </div>
    );
  }

  if (!isInitialized) return <div className="min-h-screen flex items-center justify-center bg-gray-100"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Kiryo Task Manager</h1>
          <p className="text-gray-500 mb-8">Googleスプレッドシートを使用したタスク管理アプリ</p>
          <button onClick={handleSignIn} className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg shadow-md transition-all transform hover:scale-[1.02]">
            Googleアカウントでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-white shadow-sm z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-indigo-600 tracking-tight">Kiryo Tasks</h1>
            <span className="ml-4 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-md font-medium hidden sm:inline-block">Alpha 1.9</span>
          </div>
          <div className="flex items-center space-x-4">
            {currentUser && (
                <div className="flex items-center text-sm text-gray-600 hidden sm:flex">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold mr-2">
                        {currentUser.name.charAt(0)}
                    </div>
                    <span>{currentUser.name}</span>
                </div>
            )}
            <button
                onClick={() => setViewMode(viewMode === ViewMode.DASHBOARD ? ViewMode.LIST : ViewMode.DASHBOARD)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors border ${viewMode === ViewMode.DASHBOARD ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
            >
                {viewMode === ViewMode.DASHBOARD ? 'タスク画面へ戻る' : 'ダッシュボード'}
            </button>
            <button onClick={handleSignOut} className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition">ログアウト</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col overflow-hidden">
        {authError && <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded shadow-sm"><p className="text-sm text-red-700">{authError}</p></div>}

        {viewMode === ViewMode.DASHBOARD ? (
            <div className="flex-1 overflow-auto"><Dashboard tasks={tasks} users={users} /></div>
        ) : (
            <>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="flex flex-wrap gap-3 flex-1 w-full">
                    <div className="relative flex-grow max-w-xs">
                        <input type="text" placeholder="検索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="border border-gray-300 rounded-md text-sm py-2 px-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white flex-shrink-0 sm:w-auto">
                        <option value="">全担当者</option>
                        {users.map(u => <option key={u.email} value={u.email}>{u.name}</option>)}
                    </select>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-md text-sm py-2 px-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white flex-shrink-0 sm:w-auto">
                        <option value="">全ステータス</option>
                        {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="border border-gray-300 rounded-md text-sm py-2 px-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white flex-shrink-0 sm:w-auto">
                        <option value="">全タグ</option>
                        {tags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button onClick={() => setViewMode(ViewMode.LIST)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.LIST ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>リスト</button>
                        <button onClick={() => setViewMode(ViewMode.KANBAN)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.KANBAN ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>カンバン</button>
                        <button onClick={() => setViewMode(ViewMode.GANTT)} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.GANTT ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>ガント</button>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => openModal('todo')} className="flex items-center px-3 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 shadow-sm transition-colors text-sm font-medium whitespace-nowrap">TODO作成</button>
                        <button onClick={() => openModal('task')} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-colors text-sm font-medium whitespace-nowrap">タスク作成</button>
                    </div>
                </div>
                </div>

                <div className="flex-1 overflow-hidden relative">
                {loading && <div className="absolute inset-0 bg-white bg-opacity-50 z-10 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>}
                
                {viewMode === ViewMode.LIST && <TaskTable tasks={filteredTasks} users={users} tags={tags} onEdit={(t) => openModal(t.visibility === 'private' ? 'todo' : 'task', t)} onDelete={handleDeleteTask} />}
                
                {viewMode === ViewMode.KANBAN && (
                    <KanbanBoard
                    tasks={filteredTasks}
                    users={users}
                    tags={tags}
                    onTaskMove={handleTaskMove}
                    onTaskReorder={handleTaskReorder} // Pass reorder handler
                    onEdit={(t) => openModal(t.visibility === 'private' ? 'todo' : 'task', t)}
                    onDelete={handleDeleteTask}
                    />
                )}
                
                {viewMode === ViewMode.GANTT && (
                    <GanttChart
                    tasks={filteredTasks}
                    users={users}
                    tags={tags}
                    onEdit={(t) => openModal(t.visibility === 'private' ? 'todo' : 'task', t)}
                    onTaskUpdate={async (updatedTask) => {
                        setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
                        try { await sheetService.updateTask(updatedTask); } catch(e) { loadData(true); }
                    }}
                    onDelete={handleDeleteTask}
                    />
                )}
                </div>
            </>
        )}
      </main>

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
