
import { useEffect, useMemo, useState } from 'react';
import { TaskTable } from './components/TaskTable';
import { KanbanBoard } from './components/KanbanBoard';
import { GanttChart } from './components/GanttChart';
import { TaskModal } from './components/TaskModal';
import { sheetService } from './services/sheetService';
import { Task, User, Category, ViewMode, Status } from './types';

function App() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.LIST);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Initialize Google API Client on Mount
  useEffect(() => {
    const init = async () => {
        try {
            await sheetService.initClient((signedIn) => {
                setIsSignedIn(signedIn);
            });
            setIsInitialized(true);
        } catch (e: any) {
            console.error("Init failed", e);
            setInitError(e?.message || JSON.stringify(e) || "Google APIの初期化に失敗しました。");
        }
    };
    init();
  }, []);

  // Load Data when Signed In
  useEffect(() => {
    if (isSignedIn) {
      const loadData = async () => {
        setLoading(true);
        setAuthError(null);
        try {
          // Ensure sheets exist
          await sheetService.initializeSheets();

          const userData = await sheetService.getCurrentUser();
          if (!userData) {
             setAuthError("あなたのアカウントは「Googleアカウント管理」シートに登録されていません。管理者に連絡してください。");
             return;
          }
          setCurrentUser(userData);

          const [userList, catList, taskList] = await Promise.all([
            sheetService.getUsers(),
            sheetService.getCategories(),
            sheetService.getTasks(),
          ]);
          setUsers(userList);
          setCategories(catList);
          setTasks(taskList);
        } catch (error: any) {
          console.error("Failed to load data", error);
          setAuthError("データの読み込みに失敗しました: " + (error?.result?.error?.message || error.message));
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [isSignedIn]);

  const handleSignIn = () => {
      sheetService.signIn();
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            task.detail.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesAssignee = filterAssignee ? task.assigneeEmail === filterAssignee : true;
      const matchesStatus = filterStatus ? task.status === filterStatus : true;
      return matchesSearch && matchesAssignee && matchesStatus;
    });
  }, [tasks, searchQuery, filterAssignee, filterStatus]);

  const handleCreateTask = () => {
    setEditingTask(null);
    setIsModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleSaveTask = async (taskData: Partial<Task>) => {
    setLoading(true);
    try {
      if (editingTask) {
        // Update
        const updated = await sheetService.updateTask({ ...editingTask, ...taskData } as Task);
        setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      } else {
        // Create
        const created = await sheetService.createTask(taskData as any);
        setTasks(prev => [...prev, created]);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error("Save failed", error);
      alert("保存に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (window.confirm("本当にこのタスクを削除しますか？")) {
      setLoading(true);
      try {
        await sheetService.deleteTask(taskId);
        setTasks(prev => prev.filter(t => t.id !== taskId));
      } catch (error) {
        alert("削除に失敗しました。");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleTaskMove = async (taskId: string, newStatus: Status) => {
    // Optimistic update
    const oldTasks = [...tasks];
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    
    try {
      await sheetService.updateTaskStatus(taskId, newStatus);
    } catch (error) {
      // Revert if failed
      setTasks(oldTasks);
      alert("ステータス更新に失敗しました。");
    }
  };

  // Init Error State
  if (initError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full border-l-4 border-red-500">
            <h1 className="text-xl font-bold text-red-600 mb-2">初期化エラー</h1>
            <div className="bg-gray-100 p-3 rounded text-left text-xs font-mono text-gray-600 overflow-auto max-h-32 mb-4">
              {initError}
            </div>
            <p className="text-sm text-gray-500">ページを再読み込みしてください。</p>
        </div>
      </div>
    );
  }

  // Authentication Error State (User not found in sheet)
  if (authError) {
     return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full border-l-4 border-orange-500">
            <h1 className="text-xl font-bold text-orange-600 mb-2">アクセス許可エラー</h1>
            <p className="text-gray-700 mb-6">{authError}</p>
            <button 
                onClick={() => window.location.reload()}
                className="text-indigo-600 hover:text-indigo-800 underline"
            >
                再読み込み
            </button>
        </div>
      </div>
     );
  }

  if (!isInitialized) {
     return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-gray-500 font-medium">システムを起動中...</p>
      </div>
     );
  }

  if (!isSignedIn) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
            <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md w-full">
                <h1 className="text-2xl font-bold text-gray-800 mb-2">KiryoTaskManager</h1>
                <p className="text-gray-600 mb-8">チームのタスクをGoogleスプレッドシートで管理します。</p>
                <button 
                    onClick={handleSignIn}
                    className="w-full bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-4 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors shadow-sm"
                >
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6 mr-3" alt="Google" />
                    Googleアカウントでログイン
                </button>
            </div>
        </div>
      );
  }

  // Main App
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-indigo-600 tracking-tight">KiryoTaskManager</h1>
              <div className="hidden md:flex space-x-1 bg-gray-100 p-1 rounded-lg">
                {[ViewMode.LIST, ViewMode.KANBAN, ViewMode.GANTT].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                      viewMode === mode
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {mode === ViewMode.LIST && 'リスト'}
                    {mode === ViewMode.KANBAN && 'かんばん'}
                    {mode === ViewMode.GANTT && 'ガント'}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <button
                onClick={handleCreateTask}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-sm transition-colors flex items-center disabled:opacity-50"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                新規タスク
              </button>
              {currentUser && (
                <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium text-gray-900">{currentUser.name}</p>
                    <p className="text-xs text-gray-500">{currentUser.role === 'admin' ? '管理者' : '一般'}</p>
                  </div>
                  {currentUser.avatarUrl ? (
                      <img src={currentUser.avatarUrl} alt="profile" className="h-8 w-8 rounded-full bg-gray-200" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                        {currentUser.name.charAt(0)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      
       {/* Loading Indicator Overlay */}
       {loading && (
          <div className="fixed inset-0 bg-white bg-opacity-50 z-50 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
       )}

      {/* Filters & Toolbar */}
      <div className="bg-white border-b border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative flex-1 w-full sm:max-w-xs">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              placeholder="キーワードで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex gap-3 w-full sm:w-auto overflow-x-auto pb-2 sm:pb-0">
            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-gray-600"
            >
              <option value="">すべての担当者</option>
              {users.map(u => (
                <option key={u.email} value={u.email}>{u.name}</option>
              ))}
            </select>
            
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-gray-600"
            >
              <option value="">すべてのステータス</option>
              {Object.values(Status).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
          {viewMode === ViewMode.LIST && (
            <div className="h-full overflow-auto">
              <TaskTable
                tasks={filteredTasks}
                users={users}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
              />
            </div>
          )}
          {viewMode === ViewMode.KANBAN && (
            <KanbanBoard
              tasks={filteredTasks}
              users={users}
              onTaskMove={handleTaskMove}
              onEdit={handleEditTask}
            />
          )}
          {viewMode === ViewMode.GANTT && (
             <GanttChart
               tasks={filteredTasks}
               users={users}
               onEdit={handleEditTask}
             />
          )}
        </div>
      </main>

      <TaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTask}
        task={editingTask}
        users={users}
        categories={categories}
      />
    </div>
  );
}

export default App;
