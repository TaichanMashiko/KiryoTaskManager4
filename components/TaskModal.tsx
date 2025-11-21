
import React, { useEffect, useState, useRef } from 'react';
import { Task, User, Tag, Priority, Status } from '../types';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Partial<Task>, addToCalendar: boolean) => void;
  task?: Task | null;
  users: User[];
  tags: Tag[];
  currentUser?: User | null;
  mode: 'task' | 'todo'; // mode prop
  allTasks: Task[]; // 全タスクリスト（前提タスク検索用）
}

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSave, task, users, tags, currentUser, mode, allTasks }) => {
  const [formData, setFormData] = useState<Partial<Task>>({});
  const [addToCalendar, setAddToCalendar] = useState(false);
  
  // 前提タスク検索用の状態
  const [predecessorSearch, setPredecessorSearch] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // タグドロップダウン用の状態
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  // タグドロップダウン外のクリック検知
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
            setIsTagDropdownOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setAddToCalendar(false); // Reset on open
      setPredecessorSearch('');
      setIsTagDropdownOpen(false);
      if (task) {
        setFormData({ ...task });
      } else {
        // Defaults for new task/todo
        setFormData({
          title: '',
          detail: '',
          assigneeEmail: mode === 'todo' && currentUser ? currentUser.email : (users[0]?.email || ''),
          tag: '', // デフォルトは空欄
          priority: Priority.MEDIUM,
          status: Status.NOT_STARTED,
          startDate: new Date().toISOString().split('T')[0],
          dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
          visibility: mode === 'todo' ? 'private' : 'public',
          predecessorTaskId: '',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task, mode]); 

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData, addToCalendar);
  };

  // タグフィルタリングロジック
  const currentTagInput = formData.tag || '';
  let displayTags = tags;
  
  if (currentTagInput) {
      // 部分一致でフィルタリング
      const matches = tags.filter(t => t.name.toLowerCase().includes(currentTagInput.toLowerCase()));
      displayTags = matches;
  }

  // 前提タスク関連
  const predecessorTask = formData.predecessorTaskId 
    ? allTasks.find(t => t.id === formData.predecessorTaskId) 
    : null;

  const filteredPredecessorCandidates = allTasks
    .filter(t => {
        if (task && t.id === task.id) return false;
        if (t.id === formData.predecessorTaskId) return false;
        return t.title.toLowerCase().includes(predecessorSearch.toLowerCase());
    })
    .slice(0, 5); 

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-800">
            {task ? (task.visibility === 'private' ? 'TODOを編集' : 'タスクを編集') : (mode === 'todo' ? '新規TODO作成' : '新規タスク作成')}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                 {mode === 'todo' || (task && task.visibility === 'private') ? 'TODO名' : 'タスク名'}
              </label>
              <input
                required
                name="title"
                value={formData.title || ''}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                placeholder={mode === 'todo' ? "例: 個人の買い物" : "例: 要件定義書の作成"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当者</label>
                {mode === 'todo' || (task && task.visibility === 'private') ? (
                    <div className="w-full px-3 py-2 border border-gray-300 bg-gray-100 rounded-lg text-gray-500">
                        {users.find(u => u.email === formData.assigneeEmail)?.name || formData.assigneeEmail}
                        <span className="ml-2 text-xs text-gray-400">(自分)</span>
                    </div>
                ) : (
                    <select
                    name="assigneeEmail"
                    value={formData.assigneeEmail || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                    {users.map(u => (
                        <option key={u.email} value={u.email}>{u.name}</option>
                    ))}
                    </select>
                )}
              </div>
              
              {/* タグ カスタムドロップダウン */}
              <div className="relative" ref={tagDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-1">タグ</label>
                <div className="relative">
                    <input
                    name="tag"
                    value={formData.tag || ''}
                    onChange={(e) => {
                        handleChange(e);
                        setIsTagDropdownOpen(true);
                    }}
                    onFocus={() => setIsTagDropdownOpen(true)}
                    onClick={() => setIsTagDropdownOpen(true)}
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none pr-8"
                    placeholder="タグを選択または新規入力"
                    />
                    <div 
                        className="absolute inset-y-0 right-0 flex items-center px-2 cursor-pointer text-gray-400 hover:text-gray-600"
                        onClick={() => {
                            setIsTagDropdownOpen(!isTagDropdownOpen);
                            // Toggle click should focus input but logic handled by isOpen
                        }}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                </div>

                {isTagDropdownOpen && (
                    <ul className="absolute z-20 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 ring-1 ring-black ring-opacity-5 overflow-auto text-sm">
                        {/* もし入力があり、かつ一致するものがなければ新規作成オプションを表示 */}
                        {currentTagInput && !tags.some(t => t.name === currentTagInput) && (
                             <li 
                                className="px-3 py-2 cursor-pointer hover:bg-indigo-50 text-indigo-600 font-medium border-b border-gray-100"
                                onClick={() => {
                                    setIsTagDropdownOpen(false);
                                }}
                            >
                                "{currentTagInput}" を新規作成
                            </li>
                        )}

                        {/* 入力が空の場合は全件表示、入力がある場合はフィルタ結果を表示 */}
                        {(currentTagInput ? displayTags : tags).map((t) => (
                            <li 
                                key={t.id}
                                className="px-3 py-2 cursor-pointer hover:bg-gray-100 flex items-center"
                                onClick={() => {
                                    setFormData(prev => ({ ...prev, tag: t.name }));
                                    setIsTagDropdownOpen(false);
                                }}
                            >
                                <span className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: t.color }}></span>
                                <span className="truncate">{t.name}</span>
                            </li>
                        ))}

                        {(currentTagInput ? displayTags : tags).length === 0 && currentTagInput && tags.some(t => t.name === currentTagInput) && (
                             <li className="px-3 py-2 text-gray-500 italic">一致するタグ選択済み</li>
                        )}
                        
                        {tags.length === 0 && !currentTagInput && (
                            <li className="px-3 py-2 text-gray-400 italic">登録済みタグがありません</li>
                        )}
                    </ul>
                )}
              </div>
            </div>

            {/* 前提タスク入力エリア */}
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">前提タスク <span className="text-xs text-gray-400 font-normal">(完了しないとこのタスクを開始できません)</span></label>
                {predecessorTask ? (
                    <div className="flex items-center justify-between bg-indigo-50 border border-indigo-200 text-indigo-700 px-3 py-2 rounded-lg">
                        <span className="text-sm truncate flex-1 mr-2">
                             <span className="font-bold mr-2">ID:{predecessorTask.id.slice(-4)}</span>
                             {predecessorTask.title}
                             {predecessorTask.status === Status.COMPLETED ? (
                                 <span className="ml-2 text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded">完了済</span>
                             ) : (
                                 <span className="ml-2 text-xs bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded">未完了</span>
                             )}
                        </span>
                        <button 
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, predecessorTaskId: '' }))}
                            className="text-indigo-400 hover:text-indigo-600 focus:outline-none"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>
                ) : (
                    <div className="relative">
                        <input
                            type="text"
                            value={predecessorSearch}
                            onChange={(e) => setPredecessorSearch(e.target.value)}
                            onFocus={() => setIsSearchFocused(true)}
                            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)} // クリックイベントを許可するための遅延
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="タスク名で検索..."
                        />
                        {isSearchFocused && predecessorSearch && (
                            <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto sm:text-sm">
                                {filteredPredecessorCandidates.length > 0 ? (
                                    filteredPredecessorCandidates.map((t) => (
                                        <div
                                            key={t.id}
                                            onClick={() => {
                                                setFormData(prev => ({ ...prev, predecessorTaskId: t.id }));
                                                setPredecessorSearch('');
                                            }}
                                            className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-indigo-50 text-gray-900"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="truncate font-medium">{t.title}</span>
                                                <span className={`text-xs px-2 py-0.5 rounded-full ml-2 ${t.status === Status.COMPLETED ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                                    {t.status}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500 truncate">{t.detail}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="cursor-default select-none relative py-2 pl-3 pr-9 text-gray-700">
                                        見つかりません
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">詳細</label>
              <textarea
                name="detail"
                value={formData.detail || ''}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                placeholder="詳細を入力してください"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始日</label>
                <input
                  type="date"
                  name="startDate"
                  value={formData.startDate || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">期限</label>
                <input
                  type="date"
                  name="dueDate"
                  value={formData.dueDate || ''}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">優先度</label>
                <select
                  name="priority"
                  value={formData.priority || Priority.MEDIUM}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {Object.values(Priority).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                <select
                  name="status"
                  value={formData.status || Status.NOT_STARTED}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {Object.values(Status).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Visibility Hidden Field */}
            <input type="hidden" name="visibility" value={formData.visibility} />
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center flex-shrink-0">
            <div className="flex items-center">
               <input
                 id="calendar-check"
                 type="checkbox"
                 checked={addToCalendar}
                 onChange={(e) => setAddToCalendar(e.target.checked)}
                 className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
               />
               <label htmlFor="calendar-check" className="ml-2 block text-sm text-gray-700 select-none cursor-pointer">
                 Googleカレンダーに追加
               </label>
            </div>
            
            <div className="flex space-x-3">
                <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                キャンセル
                </button>
                <button
                type="submit"
                className="px-4 py-2 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                保存する
                </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
