
import { Task, User, Category, Status, Priority, SPREADSHEET_ID, SHEET_NAMES } from '../types';
import { GOOGLE_API_KEY, GOOGLE_CLIENT_ID, SCOPES, DISCOVERY_DOCS } from '../config';

// Global types for Google API
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

class SheetService {
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
                throw resp;
              }
              // IMPORTANT: Set the token for gapi client to use in subsequent requests
              const token = resp.access_token;
              if (token) {
                window.gapi.client.setToken(resp);
              }

              // Token acquired, now we can check user info
              // This ensures we have the email before checking the sheet
              await this.fetchUserInfo();
              onSignInUpdate(true);
            },
          });
          this.gisInited = true;
          if (this.gapiInited) resolve();
        }
      };

      // Check if scripts are already loaded (e.g. from previous render)
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
  signIn(): void {
    if (this.tokenClient) {
      // Request permissions. If scopes changed, this triggers consent screen.
      // 'prompt: consent' forces the consent screen to appear if scopes changed or first login
      this.tokenClient.requestAccessToken({ prompt: '' });
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
      // Do not throw, just log. Login check will fail gracefully in getCurrentUser or App.tsx
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
      // Updated for Teacher/Staff context
      // Users Sheet: Col 0: ID, 1: Email, 2: Role, 3: Department, 4: Name
      const headers: Record<string, string[]> = {
        [SHEET_NAMES.TASKS]: ['ID', 'Title', 'Detail', 'Assignee', 'Category', 'StartDate', 'DueDate', 'Priority', 'Status', 'CreatedAt', 'UpdatedAt'],
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
          
          // If Users sheet (Googleアカウント管理), add current user as admin automatically
          // Use columns: ID, Email, Role, Department, Name
          if (name === SHEET_NAMES.USERS && this.currentUserEmail) {
             await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAMES.USERS}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['0001', this.currentUserEmail, '管理者', 'システム管理', this.currentUserName || 'Admin User']] }
             });
          }
           // If Categories sheet, add default categories
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
    // Ensure we have the user's email
    if (!this.currentUserEmail) await this.fetchUserInfo();
    if (!this.currentUserEmail) {
        console.error("Cannot get current user: Email is missing.");
        return null;
    }

    const users = await this.getUsers();
    // Case-insensitive email check
    let user = users.find(u => u.email.toLowerCase() === this.currentUserEmail.toLowerCase());
    
    // If user not found, AUTO-REGISTER them
    if (!user) {
      console.log("User not found in sheet, auto-registering...");
      try {
        // Default values for new user
        const newName = this.currentUserName || this.currentUserEmail.split('@')[0];
        const newRole = '一般'; // Default role (maps to 'user' in frontend)
        const newDept = ''; // Empty department initially
        const newId = 'user_' + Math.random().toString(36).substr(2, 9);
        
        // Structure: 0:ID, 1:Email, 2:Role, 3:Department, 4:Name
        const newRow = [newId, this.currentUserEmail, newRole, newDept, newName];

        await window.gapi.client.sheets.spreadsheets.values.append({
          spreadsheetId: SPREADSHEET_ID,
          range: `${SHEET_NAMES.USERS}!A2`,
          valueInputOption: 'USER_ENTERED',
          resource: { values: [newRow] }
        });

        // Return the newly created user object
        user = {
          email: this.currentUserEmail,
          name: newName,
          role: 'user',
          department: newDept,
          avatarUrl: undefined
        };
        console.log("Auto-registration successful");
      } catch (e) {
        console.error("Failed to auto-register user. Check spreadsheet permissions.", e);
        // If auto-registration fails (e.g. read-only access), return null which triggers the auth error screen
        return null;
      }
    }
    return user;
  }

  async getUsers(): Promise<User[]> {
    // Fetch from 'Googleアカウント管理'
    // Structure: 0:ID, 1:Email, 2:Role, 3:Department, 4:Name
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.USERS}!A2:E`,
    });
    const rows = res.result.values || [];
    
    return rows.map((row: string[]) => {
      const roleStr = row[2]; // '管理者', '一般', etc.
      // Map Sheet roles to App roles
      const role: 'admin' | 'user' = (roleStr === '管理者') ? 'admin' : 'user';
      
      return {
        email: row[1] || '',
        name: row[4] || row[1] || 'Unknown', // Name is at index 4
        role: role,
        department: row[3] || '', // Department is at index 3
        avatarUrl: undefined
      };
    }).filter((u: User) => u.email !== ''); // Filter out empty rows
  }

  async getCategories(): Promise<Category[]> {
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.CATEGORIES}!A2:B`,
    });
    const rows = res.result.values || [];
    return rows.map((row: string[]) => ({
      id: row[0],
      name: row[1]
    }));
  }

  async getTasks(): Promise<Task[]> {
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A2:K`,
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
      updatedAt: row[10]
    }));
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const newTask: Task = {
      ...task,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      newTask.updatedAt
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
    // First, find the row index
    const allTasks = await this.getTasks();
    const index = allTasks.findIndex(t => t.id === task.id);
    
    if (index === -1) throw new Error("Task not found");

    const updatedTask = {
      ...task,
      updatedAt: new Date().toISOString()
    };

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
      updatedTask.updatedAt
    ];

    // Row in sheet is index + 2 (1 for header, 1 for 0-based index)
    const sheetRow = index + 2;

    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.TASKS}!A${sheetRow}:K${sheetRow}`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [row] }
    });

    return updatedTask;
  }

  async updateTaskStatus(taskId: string, newStatus: Status): Promise<Task> {
     const tasks = await this.getTasks();
     const task = tasks.find(t => t.id === taskId);
     if (!task) throw new Error("Task not found");
     
     task.status = newStatus;
     return this.updateTask(task);
  }

  async deleteTask(taskId: string): Promise<void> {
     const allTasks = await this.getTasks();
     const index = allTasks.findIndex(t => t.id === taskId);
     
     if (index === -1) throw new Error("Task not found");
     
     const spreadsheet = await window.gapi.client.sheets.spreadsheets.get({
        spreadsheetId: SPREADSHEET_ID,
      });
     const sheet = spreadsheet.result.sheets.find((s: any) => s.properties.title === SHEET_NAMES.TASKS);
     const sheetId = sheet.properties.sheetId;

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
}

export const sheetService = new SheetService();
