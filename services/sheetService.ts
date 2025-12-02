
import { Task, User, Tag, Status, Priority, SPREADSHEET_ID, SHEET_NAMES } from '../types';
import { GOOGLE_API_KEY, GOOGLE_CLIENT_ID, SCOPES, DISCOVERY_DOCS } from '../config';

// Global types for Google API
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const AUTH_STORAGE_KEY = 'kiryo_task_manager_auth';

// Preset colors for new tags
const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#84CC16', // Lime
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#64748B', // Slate
];

export class SheetService {
  private tokenClient: any;
  private gapiInited = false;
  private gisInited = false;
  private currentUserEmail: string = '';
  private currentUserName: string = '';
  
  // Token expiration management
  private tokenExpiresAt: number = 0;
  private refreshResolver: ((value: void | PromiseLike<void>) => void) | null = null;

  // Initialize the Google API Client
  async initClient(onSignInUpdate: (isSignedIn: boolean) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const loadGapi = () => {
        if (window.gapi) {
          window.gapi.load('client', async () => {
            try {
              await window.gapi.client.init({
                apiKey: GOOGLE_API_KEY,
                discoveryDocs: DISCOVERY_DOCS,
              });
              this.gapiInited = true;
              if (this.gisInited) resolve();
            } catch (err) {
              reject(err);
            }
          });
        }
      };

      const loadGis = () => {
        if (window.google) {
          this.tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: async (resp: any) => {
              if (resp.error !== undefined) {
                // If silent login failed, clear storage so we don't loop
                if (resp.error === 'interaction_required' || resp.error === 'login_required') {
                    console.log("Silent login failed, manual login required.");
                    localStorage.removeItem(AUTH_STORAGE_KEY);
                    // Resolve waiting promise if exists (to prevent hanging)
                    if (this.refreshResolver) {
                        this.refreshResolver();
                        this.refreshResolver = null;
                    }
                    return;
                }
                throw resp;
              }
              // IMPORTANT: Set the token for gapi client to use in subsequent requests
              const token = resp.access_token;
              if (token) {
                // Set expiration time (expires_in is in seconds) - buffer 5 mins (300000ms)
                const expiresInSeconds = Number(resp.expires_in);
                this.tokenExpiresAt = Date.now() + (expiresInSeconds * 1000) - 300000;

                window.gapi.client.setToken(resp);
                // Save auth state
                localStorage.setItem(AUTH_STORAGE_KEY, 'true');
              }

              // Resolve any pending refresh promise
              if (this.refreshResolver) {
                  this.refreshResolver();
                  this.refreshResolver = null;
              }

              // Token acquired, now we can check user info
              // We only fetch user info if we haven't already, or if this was an explicit login
              if (!this.currentUserEmail) {
                  await this.fetchUserInfo();
              }
              onSignInUpdate(true);
            },
          });
          this.gisInited = true;
          if (this.gapiInited) resolve();
        }
      };

      // Check if scripts are already loaded
      if (document.querySelector('script[src="https://apis.google.com/js/api.js"]')) {
         if (window.gapi) loadGapi();
         else {
             const existingScript = document.querySelector('script[src="https://apis.google.com/js/api.js"]') as HTMLScriptElement;
             existingScript.addEventListener('load', loadGapi);
         }
      } else {
        const script1 = document.createElement('script');
        script1.src = 'https://apis.google.com/js/api.js';
        script1.async = true;
        script1.defer = true;
        script1.onload = loadGapi;
        document.body.appendChild(script1);
      }

      if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
        if (window.google) loadGis();
         else {
             const existingScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]') as HTMLScriptElement;
             existingScript.addEventListener('load', loadGis);
         }
      } else {
        const script2 = document.createElement('script');
        script2.src = 'https://accounts.google.com/gsi/client';
        script2.async = true;
        script2.defer = true;
        script2.onload = loadGis;
        document.body.appendChild(script2);
      }
    });
  }

  // Ensure we have a valid token before making requests
  private async ensureAuth(): Promise<void> {
      // If token is missing or expired
      if (!window.gapi.client.getToken() || Date.now() >= this.tokenExpiresAt) {
          console.log("Token expired or missing, attempting silent refresh...");
          
          // If a refresh is already in progress, join the queue
          if (this.refreshResolver) {
              return new Promise((resolve) => {
                  const originalResolver = this.refreshResolver;
                  this.refreshResolver = () => {
                      if (originalResolver) originalResolver();
                      resolve();
                  };
              });
          }

          return new Promise((resolve) => {
              this.refreshResolver = resolve;
              // Trigger silent refresh
              if (this.tokenClient) {
                this.tokenClient.requestAccessToken({ prompt: 'none' });
              } else {
                  // Fallback if client not init (shouldn't happen in normal flow)
                  resolve(); 
              }
          });
      }
  }

  // Prompt user to sign in
  signIn(silent: boolean = false): void {
    if (this.tokenClient) {
      this.tokenClient.requestAccessToken({ 
          prompt: silent ? 'none' : ''
      });
    }
  }

  hasStoredAuth(): boolean {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
  }

  signOut(onSignOut: () => void): void {
    const token = window.gapi.client.getToken();
    if (token !== null) {
      window.google.accounts.oauth2.revoke(token.access_token, () => {
        window.gapi.client.setToken('');
        localStorage.removeItem(AUTH_STORAGE_KEY);
        this.currentUserEmail = '';
        this.currentUserName = '';
        this.tokenExpiresAt = 0;
        onSignOut();
      });
    } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        this.tokenExpiresAt = 0;
        onSignOut();
    }
  }

  private async fetchUserInfo() {
    try {
      const tokenObj = window.gapi.client.getToken();
      if (!tokenObj) {
        console.warn("No token available for fetchUserInfo");
        return;
      }

      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${tokenObj.access_token}`,
        },
      });
      
      if (!response.ok) {
          throw new Error(`UserInfo fetch failed: ${response.status}`);
      }

      const data = await response.json();
      this.currentUserEmail = data.email;
      this.currentUserName = data.name;
      return data;
    } catch (e) {
      console.error("Failed to fetch user info", e);
    }
  }

  // --- Helper Methods for Sheet Operations ---

  async initializeSheets(): Promise<void> {
    await this.ensureAuth();
    try {
      const spreadsheet = await window.gapi.client.sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
      });
      const sheets = spreadsheet.result.sheets;
      const existingTitles = sheets.map((s: any) => s.properties.title);

      const requests = [];

      // Define headers for each sheet
      const headers: Record<string, string[]> = {
        [SHEET_NAMES.TASKS]: ['ID', 'Title', 'Detail', 'Assignee', 'Tag', 'StartDate', 'DueDate', 'Priority', 'Status', 'CreatedAt', 'UpdatedAt', 'CalendarEventId', 'Visibility', 'PredecessorTaskId', 'Order'],
        [SHEET_NAMES.USERS]: ['ID', 'Email', 'Role', 'Department', 'Name'],
        [SHEET_NAMES.TAGS]: ['ID', 'Name', 'Color']
      };

      for (const name of Object.values(SHEET_NAMES)) {
        if (!existingTitles.includes(name)) {
          requests.push({ addSheet: { properties: { title: name } } });
        }
      }

      if (requests.length > 0) {
        await window.gapi.client.sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          resource: { requests }
        });
      }

      for (const [name, headerRow] of Object.entries(headers)) {
        const range = `${name}!A1:Z1`;
        const data = await window.gapi.client.sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range,
        });
        
        if (!data.result.values || data.result.values.length === 0) {
          await window.gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `${name}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [headerRow] }
          });
          
          if (name === SHEET_NAMES.USERS && this.currentUserEmail) {
             await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAMES.USERS}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['0001', this.currentUserEmail, '管理者', 'システム管理', this.currentUserName || 'Admin User']] }
             });
          }
          if (name === SHEET_NAMES.TAGS) {
             await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAMES.TAGS}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [
                    ['1', '教務', '#3B82F6'], 
                    ['2', '進路', '#EC4899'], 
                    ['3', '生徒指導', '#F59E0B'], 
                    ['4', '総務', '#10B981'], 
                    ['5', '学年団', '#6366F1']
                ] }
             });
          }
        }
      }

    } catch (e) {
      console.error("Error initializing sheets", e);
      throw e;
    }
  }

  // --- Helper to find correct row by ID ---
  // We search the entire A column (including header) to get the correct row index.
  // The row number is 1-based.
  private async getRowIndex(taskId: string): Promise<number> {
    if (!taskId) return -1;
    await this.ensureAuth();
    
    // Fetch the entire column A to ensure we get absolute row positions
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A:A`, 
    });
    
    const rows = res.result.values || [];
    // rows[0] is Row 1 (Header), rows[1] is Row 2...
    // The physical row number is index + 1
    const index = rows.findIndex((row: string[]) => row[0] === taskId);
    
    if (index === -1) return -1;
    return index + 1; // Return 1-based row number
  }

  // --- Data Access Methods ---

  async getCurrentUser(): Promise<User | null> {
    await this.ensureAuth();
    if (!this.currentUserEmail) await this.fetchUserInfo();
    if (!this.currentUserEmail) return null;

    const users = await this.getUsers();
    let user = users.find(u => u.email.toLowerCase() === this.currentUserEmail.toLowerCase());
    
    if (!user) {
      try {
        const newName = this.currentUserName || this.currentUserEmail.split('@')[0];
        const newRole = '一般';
        const newDept = '';
        const newId = 'user_' + Math.random().toString(36).substr(2, 9);
        const newRow = [newId, this.currentUserEmail, newRole, newDept, newName];

        await window.gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAMES.USERS}!A2`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [newRow] }
        });

        user = {
          email: this.currentUserEmail,
          name: newName,
          role: 'user',
          department: newDept,
          avatarUrl: undefined
        };
      } catch (e) {
        console.error("Failed to auto-register user", e);
        return null;
      }
    }
    return user;
  }

  async getUsers(): Promise<User[]> {
    await this.ensureAuth();
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.USERS}!A2:E`,
    });
    const rows = res.result.values || [];
    return rows.map((row: string[]) => ({
      email: row[1],
      name: row[4] || row[1],
      role: (row[2] === '管理者' ? 'admin' : 'user') as 'admin' | 'user',
      department: row[3],
    }));
  }

  async getTags(): Promise<Tag[]> {
    await this.ensureAuth();
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TAGS}!A2:C`,
    });
    const rows = res.result.values || [];
    return rows.map((row: string[]) => ({
      id: row[0],
      name: row[1],
      color: row[2] || '#9CA3AF',
    }));
  }

  async createTag(tagName: string, existingTags: Tag[] = []): Promise<Tag> {
    await this.ensureAuth();
    const id = 'tag_' + Math.random().toString(36).substr(2, 9);
    
    const usedColors = new Set(existingTags.map(t => (t.color || '').toUpperCase()));
    const availableColors = PRESET_COLORS.filter(c => !usedColors.has(c.toUpperCase()));

    let color;
    if (availableColors.length > 0) {
        color = availableColors[Math.floor(Math.random() * availableColors.length)];
    } else {
        const randomHex = Math.floor(Math.random()*16777215).toString(16);
        color = '#' + randomHex.padStart(6, '0');
    }

    const newTag: Tag = {
        id,
        name: tagName,
        color
    };

    const row = [newTag.id, newTag.name, newTag.color];

    await window.gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAMES.TAGS}!A2`,
        valueInputOption: 'USER_ENTERED',
        resource: { values: [row] }
    });

    return newTag;
  }

  async getTasks(): Promise<Task[]> {
    await this.ensureAuth();
    // Range expanded to O (Column 15) for Order
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A2:O`,
    });
    const rows = res.result.values || [];
    const tasks = rows.map((row: string[]) => ({
      id: row[0],
      title: row[1],
      detail: row[2],
      assigneeEmail: row[3],
      tag: row[4],
      startDate: row[5],
      dueDate: row[6],
      priority: row[7] as Priority,
      status: row[8] as Status,
      createdAt: row[9],
      updatedAt: row[10],
      calendarEventId: row[11] || undefined,
      visibility: (row[12] as 'public' | 'private') || 'public',
      predecessorTaskId: row[13] || undefined,
      order: row[14] ? Number(row[14]) : 0,
    }));
    
    // Sort by order ascending, then createdAt descending
    return tasks.sort((a: Task, b: Task) => {
        if ((a.order || 0) !== (b.order || 0)) {
            return (a.order || 0) - (b.order || 0);
        }
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    await this.ensureAuth();
    const id = 'task_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    
    // Default order is large number if not specified
    const order = task.order !== undefined ? task.order : 999999;

    const newTask: Task = {
      ...task,
      id,
      createdAt: now,
      updatedAt: now,
      visibility: task.visibility || 'public',
      order,
    };

    const row = [
      newTask.id,
      newTask.title,
      newTask.detail,
      newTask.assigneeEmail,
      newTask.tag,
      newTask.startDate,
      newTask.dueDate,
      newTask.priority,
      newTask.status,
      newTask.createdAt,
      newTask.updatedAt,
      newTask.calendarEventId || '',
      newTask.visibility,
      newTask.predecessorTaskId || '',
      newTask.order,
    ];

    await window.gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A2`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] }
    });

    return newTask;
  }

  async updateTask(task: Task): Promise<Task> {
    await this.ensureAuth();
    const rowIndex = await this.getRowIndex(task.id);
    if (rowIndex === -1) throw new Error('Task not found');

    const now = new Date().toISOString();
    const updatedTask = { ...task, updatedAt: now };

    const row = [
      updatedTask.id,
      updatedTask.title,
      updatedTask.detail,
      updatedTask.assigneeEmail,
      updatedTask.tag,
      updatedTask.startDate,
      updatedTask.dueDate,
      updatedTask.priority,
      updatedTask.status,
      updatedTask.createdAt,
      updatedTask.updatedAt,
      updatedTask.calendarEventId || '',
      updatedTask.visibility,
      updatedTask.predecessorTaskId || '',
      updatedTask.order || 0,
    ];

    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A${rowIndex}:O${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] }
    });

    return updatedTask;
  }

  async updateTaskStatus(taskId: string, status: Status): Promise<void> {
    await this.ensureAuth(); 
    const tasks = await this.getTasks();
    const task = tasks.find(t => t.id === taskId);
    if (!task) throw new Error('Task not found');
    
    await this.updateTask({ ...task, status });
  }

  async updateTaskOrders(updatedTasks: Task[]): Promise<void> {
    await this.ensureAuth();
    
    // Fetch all IDs from A:A for correct mapping
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A:A`,
    });
    const rows = res.result.values || [];
    const idToRowMap = new Map<string, number>();
    rows.forEach((row: string[], i: number) => {
        if (row[0]) idToRowMap.set(row[0], i + 1); // 1-based index
    });
    
    const updatePromises = updatedTasks.map(t => {
        const rowIndex = idToRowMap.get(t.id);
        if (!rowIndex) return Promise.resolve();
        
        return window.gapi.client.sheets.spreadsheets.values.update({
             spreadsheetId: SPREADSHEET_ID,
             range: `${SHEET_NAMES.TASKS}!O${rowIndex}`,
             valueInputOption: 'USER_ENTERED',
             resource: { values: [[t.order]] }
        });
    });
    
    await Promise.all(updatePromises);
  }

  async deleteTask(taskId: string, verificationTitle?: string): Promise<void> {
    await this.ensureAuth();
    
    // 1. Fetch ID and Title columns (A:B) to robustly identify the row.
    // This is critical to prevent duplicate IDs or moved rows causing the wrong row (e.g. top row) to be deleted.
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A:B`, // A: ID, B: Title
    });
    const rows = res.result.values || [];
    
    let rowIndex = -1;

    // Find all rows matching the ID
    const candidates = rows
        .map((row: string[], index: number) => ({ id: row[0], title: row[1], physicalRow: index + 1 }))
        .filter(item => item.id === taskId);

    if (candidates.length === 0) throw new Error('Task not found in sheet');

    // If verification title is provided, try to match it to disambiguate duplicates
    if (verificationTitle && candidates.length > 1) {
        const titleMatch = candidates.find(c => c.title === verificationTitle);
        if (titleMatch) {
            rowIndex = titleMatch.physicalRow;
        }
    }

    // Fallback: If no title match or only 1 candidate, use the first candidate
    if (rowIndex === -1) {
        rowIndex = candidates[0].physicalRow;
    }

    // Safety Check (Redundant now but good for sanity)
    if (rowIndex === -1) throw new Error('Task not found');

    // Retrieve task details for calendar event deletion if needed
    // using getTasks for data lookup is fine, just not for index
    const tasks = await this.getTasks();
    const task = tasks.find(t => t.id === taskId);

    if (task && task.calendarEventId) {
        try {
            await this.removeFromCalendar(task.calendarEventId);
        } catch (e) {
            console.warn("Failed to remove from calendar", e);
        }
    }

    const sheetId = await this.getSheetId(SHEET_NAMES.TASKS);
    
    // 3. Calculate 0-based index for deleteDimension
    // rowIndex is 1-based (Physical Sheet Row).
    // Row 1 (Header) is index 0. Row N is index N-1.
    const startIndex = rowIndex - 1;

    await window.gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: startIndex,
              endIndex: startIndex + 1
            }
          }
        }]
      }
    });
  }

  private async getSheetId(sheetTitle: string): Promise<number> {
    await this.ensureAuth();
    const spreadsheet = await window.gapi.client.sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const sheet = spreadsheet.result.sheets.find((s: any) => s.properties.title === sheetTitle);
    return sheet ? sheet.properties.sheetId : 0;
  }

  async addToCalendar(task: Task): Promise<any> {
    await this.ensureAuth();
    if (!task.startDate) throw new Error("開始日が設定されていません");
    if (!task.dueDate) throw new Error("期限が設定されていません");

    const endDateObj = new Date(task.dueDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endDateStr = endDateObj.toISOString().split('T')[0];

    const event = {
      summary: `[Kiryo] ${task.title}`,
      description: `${task.detail}\n\nタグ: ${task.tag}\n優先度: ${task.priority}\nステータス: ${task.status}`,
      start: { date: task.startDate },
      end: { date: endDateStr },
      transparency: 'transparent',
    };

    try {
      const response = await window.gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });
      return response.result;
    } catch (e: any) {
      console.error("Failed to add to calendar", e);
      throw new Error("カレンダーへの追加に失敗しました。");
    }
  }

  async removeFromCalendar(eventId: string): Promise<void> {
    await this.ensureAuth();
    try {
      await window.gapi.client.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });
    } catch (e: any) {
      if (e.status === 404 || e.result?.error?.code === 404) return;
      console.error("Failed to remove from calendar", e);
      throw e;
    }
  }
}

export const sheetService = new SheetService();
