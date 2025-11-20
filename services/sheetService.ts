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
              // Token acquired, now we can check user info
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
      this.tokenClient.requestAccessToken({ prompt: '' });
    }
  }

  // Get authenticated user's email
  private async fetchUserInfo() {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: {
          Authorization: `Bearer ${window.gapi.client.getToken().access_token}`,
        },
      });
      const data = await response.json();
      this.currentUserEmail = data.email;
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
      // Note: 'Googleアカウント管理' structure is based on the provided GAS code:
      // Col 0: ID, 1: Email, 2: Role, 3: Year, 4: Class, 5: No, 6: Name
      const headers: Record<string, string[]> = {
        [SHEET_NAMES.TASKS]: ['ID', 'Title', 'Detail', 'Assignee', 'Category', 'StartDate', 'DueDate', 'Priority', 'Status', 'CreatedAt', 'UpdatedAt'],
        [SHEET_NAMES.USERS]: ['StudentID', 'Email', 'Role', 'Year', 'Class', 'No', 'Name'],
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
          // Use columns: ID, Email, Role, Year, Class, No, Name
          if (name === SHEET_NAMES.USERS && this.currentUserEmail) {
             await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAMES.USERS}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [['0001', this.currentUserEmail, '管理者', '', '', '', 'Admin User']] }
             });
          }
           // If Categories sheet, add default categories
          if (name === SHEET_NAMES.CATEGORIES) {
             await window.gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAMES.CATEGORIES}!A2`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [
                    ['1', '開発'], ['2', 'デザイン'], ['3', 'マーケティング'], ['4', '事務']
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
    // Case-insensitive email check
    const user = users.find(u => u.email.toLowerCase() === this.currentUserEmail.toLowerCase());
    
    // If user not found in 'Googleアカウント管理', return null to block access or Guest
    // Per the GAS code, if not found -> Access Denied. 
    // For this demo, we'll return null which App.tsx should handle as "Not Authorized".
    if (!user) {
      console.warn("User not found in Googleアカウント管理");
      return null;
    }
    return user;
  }

  async getUsers(): Promise<User[]> {
    // Fetch from 'Googleアカウント管理'
    // Structure: 0:ID, 1:Email, 2:Role, 3:Year, 4:Class, 5:No, 6:Name
    const res = await window.gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAMES.USERS}!A2:G`,
    });
    const rows = res.result.values || [];
    
    return rows.map((row: string[]) => {
      const roleStr = row[2]; // '管理者', '生徒', etc.
      // Map GAS roles to App roles
      const role: 'admin' | 'user' = (roleStr === '管理者') ? 'admin' : 'user';
      
      return {
        email: row[1] || '',
        name: row[6] || row[1] || 'Unknown', // Use Name (Col G) or fallback to Email
        role: role,
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
