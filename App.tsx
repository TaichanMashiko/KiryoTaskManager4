
import { useEffect, useMemo, useState, useCallback } from 'react';
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
  const [modalMode, setModalMode] = useState<'task' | 'todo'>('task');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');

  // Initialize Google API Client on Mount
  useEffect(() => {
    const init = async () => {
        try {
            await sheetService.initClient((signedIn) => {
                setIsSignedIn(signedIn);
            });
            setIsInitialized(true);
            
            // Try silent login if storage key exists
            if (sheetService.hasStoredAuth()) {
                sheetService.signIn(true);
            }
        } catch (e: any) {
            console.error("Init failed", e);
            
            let message = "Google APIの初期化に失敗しました。";
            
            // Better error parsing
            try {
                if (typeof e === 'string') {
                    message = e;
                } else if (e.result && e.result.error && e.result.error.message) {
                    message = `API Error: ${e.result.error.message}`;
                } else if (e.message) {
                    message = e.message;
                } else {
                    message = "詳細: " + JSON.stringify(e);
                }
            } catch (parseError) {
                message += " (エラー詳細の解析に失敗)";
            }

            setInitError(message + " (ヒント: コンソールを確認し、APIキー/クライアントID/有効なAPIを確認してください)");
        }
    };
    init();
  }, []);

  // Load Data
  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setAuthError(null);
    try {
      // Ensure sheets exist
      if (!silent) await sheetService.initializeSheets();

      if (!currentUser) {
          const userData = await sheetService.getCurrentUser();
          if (!userData) {
              setAuthError("あなたのアカウントは「Googleアカウント管理」シートに登録されていません。管理者に連絡してください。");
              return;
          }
          setCurrentUser(userData);
      }

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
      if (!silent) setAuthError("データの読み込みに失敗しました: " + (error?.result?.error?.message || error.message || "Unknown error"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUser]);

  // Initial Load when Signed In
  useEffect(() => {
    if (isSignedIn) {
      loadData();
    }
  }, [isSignedIn, loadData]);

  // Polling for concurrent edits (every 30 seconds)
  useEffect(() => {
    if (!isSignedIn) return;
    const interval = setInterval(() => {
        loadData(true); // Silent load
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
    });
  };

  // --- Task Operations ---

  const handleSaveTask = async (taskData: Partial<Task>, addToCalendar: boolean) => {
    try {
      setLoading(true);
      let savedTask: Task;

      if (editingTask) {
        savedTask = await sheetService.updateTask({ ...editingTask, ...taskData } as Task);
      } else {
        savedTask = await sheetService.createTask(taskData as any);
      }

      // Handle Calendar Integration
      if (addToCalendar) {
          try {
              // Add to calendar and get the returned event object
              const event = await sheetService.addToCalendar(savedTask);
              
              // Update the task with the Google Calendar Event ID
              if (event && event.id) {
                  savedTask.calendarEventId = event.id;
                  await sheetService.updateTask(savedTask);
              }
              
              alert("Googleカレンダーに予定を追加しました。");
          } catch (calendarError: any) {
              console.error("Calendar Error", calendarError);
              alert("タスクは保存されましたが、カレンダーへの追加に失敗しました。\n" + calendarError.message);
          }
      }

      await loadData(true);
      setIsModalOpen(false);
      setEditingTask(null);
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
    try {
      // Optimistic update
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      await sheetService.updateTaskStatus(taskId, newStatus);
    } catch (e) {
      console.error("Move failed", e);
      loadData(true); // Revert on fail
    }
  };

  const openModal = (mode: 'task' | 'todo', task?: Task) => {
      setModalMode(mode);
      setEditingTask(task || null);
      setIsModalOpen(true);
  }

  // --- Filtering ---

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      // Visibility Filter: Show if public OR (private AND assignee is current user)
      const isVisible = task.visibility !== 'private' || (currentUser && task.assigneeEmail === currentUser.email);
      if (!isVisible) return false;

      const matchesSearch = task.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            task.detail.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesAssignee = filterAssignee ? task.assigneeEmail === filterAssignee : true;
      const matchesStatus = filterStatus ? task.status === filterStatus : true;

      let matchesDepartment = true;
      if (filterDepartment) {
        const assignee = users.find(u => u.email === task.assigneeEmail);
        matchesDepartment = assignee?.department === filterDepartment;
      }

      return matchesSearch && matchesAssignee && matchesStatus && matchesDepartment;
    });
  }, [tasks, searchQuery, filterAssignee, filterStatus, filterDepartment, users, currentUser]);

  // --- UI Rendering ---

  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
          <h2 className="text-red-600 text-xl font-bold mb-2">初期化エラー</h2>
          <p className="text-gray-700 text-sm whitespace-pre-wrap break-words">{initError}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 w-full bg-red-100 text-red-700 py-2 px-4 rounded hover:bg-red-200 transition"
          >
            リロード
          </button>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Kiryo Task Manager</h1>
          <p className="text-gray-500 mb-8">Googleスプレッドシートを使用したタスク管理アプリ</p>
          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg shadow-md transition-all transform hover:scale-[1.02]"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z" />
            </svg>
            Googleアカウントでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-indigo-600 tracking-tight">Kiryo Tasks</h1>
            <span className="ml-4 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs rounded-md font-medium hidden sm:inline-block">Alpha 1.2</span>
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
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 transition"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col overflow-hidden">
        
        {/* Auth Error Message */}
        {authError && (
             <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded shadow-sm">
                <div className="flex">
                    <div className="ml-3">
                        <p className="text-sm text-red-700">{authError}</p>
                    </div>
                </div>
            </div>
        )}

        {/* Controls Bar */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          
          {/* Filters */}
          <div className="flex flex-wrap gap-3 flex-1 w-full">
            <div className="relative flex-grow max-w-xs">
                <input
                    type="text"
                    placeholder="検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>

            <select
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="border border-gray-300 rounded-md text-sm py-2 px-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
            >
              <option value="">全ての担当者</option>
              {users.map(u => (
                <option key={u.email} value={u.email}>{u.name}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border border-gray-300 rounded-md text-sm py-2 px-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
            >
              <option value="">全てのステータス</option>
              {Object.values(Status).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* View Switcher & Add Button */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
             <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                    onClick={() => setViewMode(ViewMode.LIST)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.LIST ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                    リスト
                </button>
                <button
                    onClick={() => setViewMode(ViewMode.KANBAN)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.KANBAN ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                    カンバン
                </button>
                <button
                    onClick={() => setViewMode(ViewMode.GANTT)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === ViewMode.GANTT ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                    ガント
                </button>
             </div>

             <div className="flex gap-2">
                <button
                    onClick={() => openModal('todo')}
                    className="flex items-center px-3 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 shadow-sm transition-colors text-sm font-medium whitespace-nowrap"
                >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    TODO作成
                </button>
                <button
                    onClick={() => openModal('task')}
                    className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 shadow-sm transition-colors text-sm font-medium whitespace-nowrap"
                >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                    タスク作成
                </button>
             </div>
          </div>
        </div>

        {/* View Content */}
        <div className="flex-1 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 bg-white bg-opacity-50 z-10 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {viewMode === ViewMode.LIST && (
            <TaskTable
              tasks={filteredTasks}
              users={users}
              onEdit={(t) => openModal(t.visibility === 'private' ? 'todo' : 'task', t)}
              onDelete={handleDeleteTask}
            />
          )}

          {viewMode === ViewMode.KANBAN && (
            <KanbanBoard
              tasks={filteredTasks}
              users={users}
              onTaskMove={handleTaskMove}
              onEdit={(t) => openModal(t.visibility === 'private' ? 'todo' : 'task', t)}
              onDelete={handleDeleteTask}
            />
          )}

          {viewMode === ViewMode.GANTT && (
             <GanttChart
               tasks={filteredTasks}
               users={users}
               onEdit={(t) => openModal(t.visibility === 'private' ? 'todo' : 'task', t)}
               onTaskUpdate={async (updatedTask) => {
                  // Immediate local update for smoothness
                  setTasks(prev => prev.map(t => t.id === updatedTask.id ? updatedTask : t));
                  try {
                      await sheetService.updateTask(updatedTask);
                  } catch(e) {
                      loadData(true);
                  }
               }}
               onDelete={handleDeleteTask}
             />
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
        categories={categories.map(c => c.name)}
        currentUser={currentUser}
        mode={modalMode}
      />
    </div>
  );
}

export default App;
