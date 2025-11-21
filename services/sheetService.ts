
import { Task, User, Category, Status, Priority, SPREADSHEET_ID, SHEET_NAMES } from '../types';
import { GOOGLE_API_KEY, GOOGLE_CLIENT_ID, SCOPES, DISCOVERY_DOCS } from '../config';

// Global types for Google API
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const AUTH_STORAGE_KEY = 'kiryo_task_manager_auth';

export class SheetService {
  private tokenClient: any;
  private gapiInited = false;
  private gisInited = false;
  private currentUserEmail: string = '';
  private currentUserName: string = '';

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
                    return;
                }
                throw resp;
              }
              // IMPORTANT: Set the token for gapi client to use in subsequent requests
              const token = resp.access_token;
              if (token) {
                window.gapi.client.setToken(resp);
                // Save auth state
                localStorage.setItem(AUTH_STORAGE_KEY, 'true');
              }

              // Token acquired, now we can check user info
              await this.fetchUserInfo();
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

  // Prompt user to sign in
  // Added 'silent' parameter to allow checking session without popup
  signIn(silent: boolean = false): void {
    if (this.tokenClient) {
      // 'prompt: none' attempts to sign in without user interaction
      this.tokenClient.requestAccessToken({ 
          prompt: silent ? 'none' : '' // Empty string is default behavior (consent if needed)
      });
    }
  }

  // Check if we should attempt auto-login
  hasStoredAuth(): boolean {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
  }

  // Sign out
  signOut(onSignOut: () => void): void {
    const token = window.gapi.client.getToken();
    if (token !== null) {
      window.google.accounts.oauth2.revoke(token.access_token, () => {
        window.gapi.client.setToken('');
        localStorage.removeItem(AUTH_STORAGE_KEY);
        this.currentUserEmail = '';
        this.currentUserName = '';
        onSignOut();
      });
    } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        onSignOut();
    }
  }

  // Get authenticated user's email and name
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
          // 401 means token invalid or scopes missing
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

  // Setup initial sheets and headers if they don't exist
  async initializeSheets(): Promise<void> {
    try {
      const spreadsheet = await window.gapi.client.sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
      });
      const sheets = spreadsheet.result.sheets;
      const existingTitles = sheets.map((s: any) => s.properties.title);

      const requests = [];

      // Define headers for each sheet
      const headers: Record<string, string[]> = {
        [SHEET_NAMES.TASKS]: ['ID', 'Title', 'Detail', 'Assignee', 'Category', 'StartDate', 'DueDate', 'Priority', 'Status', 'CreatedAt', 'UpdatedAt', 'CalendarEventId', 'Visibility', 'PredecessorTaskId'],
        [SHEET_NAMES.USERS]: ['ID', 'Email', 'Role', 'Department', 'Name'],
        [SHEET_NAMES.CATEGORIES]: ['ID', 'Name']
      };

      // Create missing sheets
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

      // Write Headers if empty
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
          
          // Setup defaults
          if (name === SHEET_NAMES.USERS && this.currentUserEmail) {
             await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAMES.USERS}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['0001', this.currentUserEmail, '管理者', 'システム管理', this.currentUserName || 'Admin User']] }
             });
          }
          if (name === SHEET_NAMES.CATEGORIES) {
             await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAMES.CATEGORIES}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [
                    ['1', '教務'], ['2', '進路'], ['3', '生徒指導'], ['4', '総務'], ['5', '学年団']
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

  // --- Data Access Methods ---

  async getCurrentUser(): Promise<User | null> {
    if (!this.currentUserEmail) await this.fetchUserInfo();
    if (!this.currentUserEmail) return null;

    const users = await this.getUsers();
    let user = users.find(u => u.email.toLowerCase() === this.currentUserEmail.toLowerCase());
    
    // Auto-register if not found
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

  async getCategories(): Promise<Category[]> {
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.CATEGORIES}!A2:B`,
    });
    const rows = res.result.values || [];
    return rows.map((row: string[]) => ({
      id: row[0],
      name: row[1],
    }));
  }

  async getTasks(): Promise<Task[]> {
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A2:N`, // Expanded range
    });
    const rows = res.result.values || [];
    return rows.map((row: string[]) => ({
      id: row[0],
      title: row[1],
      detail: row[2],
      assigneeEmail: row[3],
      category: row[4],
      startDate: row[5],
      dueDate: row[6],
      priority: row[7] as Priority,
      status: row[8] as Status,
      createdAt: row[9],
      updatedAt: row[10],
      calendarEventId: row[11] || undefined,
      visibility: (row[12] as 'public' | 'private') || 'public',
      predecessorTaskId: row[13] || undefined,
    }));
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const id = 'task_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    const newTask: Task = {
      ...task,
      id,
      createdAt: now,
      updatedAt: now,
      visibility: task.visibility || 'public', // default
    };

    const row = [
      newTask.id,
      newTask.title,
      newTask.detail,
      newTask.assigneeEmail,
      newTask.category,
      newTask.startDate,
      newTask.dueDate,
      newTask.priority,
      newTask.status,
      newTask.createdAt,
      newTask.updatedAt,
      newTask.calendarEventId || '',
      newTask.visibility,
      newTask.predecessorTaskId || '',
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
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === task.id);
    if (index === -1) throw new Error('Task not found');

    // Row index is data index + 2 (1 for header, 1 for 0-based)
    const rowIndex = index + 2;
    const now = new Date().toISOString();
    const updatedTask = { ...task, updatedAt: now };

    const row = [
      updatedTask.id,
      updatedTask.title,
      updatedTask.detail,
      updatedTask.assigneeEmail,
      updatedTask.category,
      updatedTask.startDate,
      updatedTask.dueDate,
      updatedTask.priority,
      updatedTask.status,
      updatedTask.createdAt,
      updatedTask.updatedAt,
      updatedTask.calendarEventId || '',
      updatedTask.visibility,
      updatedTask.predecessorTaskId || '',
    ];

    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A${rowIndex}:N${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] }
    });

    return updatedTask;
  }

  async updateTaskStatus(taskId: string, status: Status): Promise<void> {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index === -1) throw new Error('Task not found');
    
    const task = tasks[index];
    await this.updateTask({ ...task, status });
  }

  async deleteTask(taskId: string): Promise<void> {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === taskId);
    if (index === -1) throw new Error('Task not found');

    const task = tasks[index];

    // Googleカレンダーからの削除を試行
    if (task.calendarEventId) {
        try {
            await this.removeFromCalendar(task.calendarEventId);
        } catch (e) {
            console.warn("Failed to remove from calendar (might be already deleted)", e);
            // カレンダー削除に失敗してもタスク削除は続行する
        }
    }

    const sheetId = await this.getSheetId(SHEET_NAMES.TASKS);
    
    await window.gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: index + 1,
              endIndex: index + 2
            }
          }
        }]
      }
    });
  }

  private async getSheetId(sheetTitle: string): Promise<number> {
    const spreadsheet = await window.gapi.client.sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const sheet = spreadsheet.result.sheets.find((s: any) => s.properties.title === sheetTitle);
    return sheet ? sheet.properties.sheetId : 0;
  }

  // --- Google Calendar Integration ---

  async addToCalendar(task: Task): Promise<any> {
    if (!task.startDate) throw new Error("開始日が設定されていません");
    if (!task.dueDate) throw new Error("期限が設定されていません");

    // Google Calendar All-day event end date is exclusive (the day after)
    const endDateObj = new Date(task.dueDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endDateStr = endDateObj.toISOString().split('T')[0];

    const event = {
      summary: `[Kiryo] ${task.title}`,
      description: `${task.detail}\n\n優先度: ${task.priority}\nステータス: ${task.status}`,
      start: {
        date: task.startDate, // YYYY-MM-DD for all-day
      },
      end: {
        date: endDateStr,
      },
      transparency: 'transparent', // "Available" (doesn't block calendar)
    };

    try {
      const response = await window.gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });
      return response.result;
    } catch (e: any) {
      console.error("Failed to add to calendar", e);
      throw new Error("カレンダーへの追加に失敗しました。権限がないか、エラーが発生しました。");
    }
  }

  async removeFromCalendar(eventId: string): Promise<void> {
    try {
      await window.gapi.client.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });
    } catch (e: any) {
      if (e.status === 404 || e.result?.error?.code === 404) {
         console.log("Event not found in calendar, likely already deleted.");
         return;
      }
      console.error("Failed to remove from calendar", e);
      throw e;
    }
  }
}

export const sheetService = new SheetService();
