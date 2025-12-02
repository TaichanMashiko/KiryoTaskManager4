
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
      color: row[2],
    }));
  }

  async createTag(name: string, currentTags: Tag[]): Promise<Tag> {
    await this.ensureAuth();
    const newId = (currentTags.length + 1).toString();
    const color = PRESET_COLORS[currentTags.length % PRESET_COLORS.length];
    const newTag: Tag = { id: newId, name, color };
    
    await window.gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TAGS}!A2`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [[newId, name, color]] }
    });
    
    return newTag;
  }

  async getTasks(): Promise<Task[]> {
    await this.ensureAuth();
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A2:O`,
    });
    const rows = res.result.values || [];
    return rows.map((row: string[]) => ({
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
      calendarEventId: row[11],
      visibility: (row[12] as 'public' | 'private') || 'public',
      predecessorTaskId: row[13],
      order: row[14] ? parseInt(row[14]) : 0,
    }));
  }

  async createTask(task: Partial<Task>): Promise<Task> {
    await this.ensureAuth();
    const id = 'task_' + Math.random().toString(36).substr(2, 9);
    const now = new Date().toISOString();
    
    const tasks = await this.getTasks();
    const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.order || 0)) : 0;
    
    const newTask: Task = {
      id,
      title: task.title || '',
      detail: task.detail || '',
      assigneeEmail: task.assigneeEmail || '',
      tag: task.tag || '',
      startDate: task.startDate || '',
      dueDate: task.dueDate || '',
      priority: task.priority || Priority.MEDIUM,
      status: task.status || Status.NOT_STARTED,
      createdAt: now,
      updatedAt: now,
      calendarEventId: '',
      visibility: task.visibility || 'public',
      predecessorTaskId: task.predecessorTaskId || '',
      order: maxOrder + 1,
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
      newTask.calendarEventId,
      newTask.visibility,
      newTask.predecessorTaskId,
      newTask.order
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

    const updatedAt = new Date().toISOString();
    const updatedTask = { ...task, updatedAt };

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
      updatedTask.calendarEventId,
      updatedTask.visibility,
      updatedTask.predecessorTaskId,
      updatedTask.order
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
    const rowIndex = await this.getRowIndex(taskId);
    if (rowIndex === -1) return;
    
    await window.gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        resource: {
            data: [
                {
                    range: `${SHEET_NAMES.TASKS}!I${rowIndex}`,
                    values: [[status]]
                },
                {
                    range: `${SHEET_NAMES.TASKS}!K${rowIndex}`,
                    values: [[new Date().toISOString()]]
                }
            ],
            valueInputOption: 'USER_ENTERED'
        }
    });
  }

  async deleteTask(taskId: string, title?: string): Promise<void> {
    await this.ensureAuth();
    const rowIndex = await this.getRowIndex(taskId);
    if (rowIndex === -1) return;

    const spreadsheet = await window.gapi.client.sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID
    });
    const sheet = spreadsheet.result.sheets.find((s: any) => s.properties.title === SHEET_NAMES.TASKS);
    if (!sheet) return;
    const sheetId = sheet.properties.sheetId;

    await window.gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex - 1,
                endIndex: rowIndex
              }
            }
          }
        ]
      }
    });
  }
  
  async updateTaskOrders(tasks: Task[]): Promise<void> {
    await this.ensureAuth();
    
    const data: any[] = [];
    
    for (const task of tasks) {
        const rowIndex = await this.getRowIndex(task.id);
        if (rowIndex !== -1) {
            data.push({
                range: `${SHEET_NAMES.TASKS}!O${rowIndex}`,
                values: [[task.order]]
            });
        }
    }
    
    if (data.length > 0) {
        await window.gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                data: data,
                valueInputOption: 'USER_ENTERED'
            }
        });
    }
  }

  async addToCalendar(task: Task): Promise<any> {
    await this.ensureAuth();
    if (!task.startDate || !task.dueDate) return null;

    const event = {
      summary: task.title,
      description: task.detail,
      start: {
        date: task.startDate, 
      },
      end: {
        date: task.dueDate,
      },
    };

    if (task.calendarEventId) {
        try {
            await window.gapi.client.calendar.events.update({
                calendarId: 'primary',
                eventId: task.calendarEventId,
                resource: event
            });
            return { id: task.calendarEventId };
        } catch (e) {
            console.warn("Event not found, creating new");
        }
    }

    const res = await window.gapi.client.calendar.events.insert({
      calendarId: 'primary',
      resource: event,
    });
    return res.result;
  }
}

export const sheetService = new SheetService();
