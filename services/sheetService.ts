import { Task, User, Category, Status, Priority } from '../types';
import { MOCK_TASKS, MOCK_USERS, MOCK_CATEGORIES } from '../mockData';

// In a real implementation, this service would call the Google Sheets API
// using the gapi client or simple REST calls with an API Key/OAuth token.

class SheetService {
  private tasks: Task[] = [...MOCK_TASKS];
  private users: User[] = [...MOCK_USERS];
  private categories: Category[] = [...MOCK_CATEGORIES];

  // Simulate network delay
  private async delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getCurrentUser(): Promise<User> {
    await this.delay(500);
    // Simulating a logged-in user
    return this.users[0];
  }

  async getUsers(): Promise<User[]> {
    await this.delay(500);
    return [...this.users];
  }

  async getCategories(): Promise<Category[]> {
    await this.delay(500);
    return [...this.categories];
  }

  async getTasks(): Promise<Task[]> {
    await this.delay(800);
    return [...this.tasks];
  }

  async createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    await this.delay(600);
    const newTask: Task = {
      ...task,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.push(newTask);
    return newTask;
  }

  async updateTask(task: Task): Promise<Task> {
    await this.delay(600);
    const index = this.tasks.findIndex(t => t.id === task.id);
    if (index !== -1) {
      const updatedTask = {
        ...task,
        updatedAt: new Date().toISOString(),
      };
      this.tasks[index] = updatedTask;
      return updatedTask;
    }
    throw new Error('Task not found');
  }

  async deleteTask(taskId: string): Promise<void> {
    await this.delay(500);
    this.tasks = this.tasks.filter(t => t.id !== taskId);
  }

  async updateTaskStatus(taskId: string, newStatus: Status): Promise<Task> {
    await this.delay(300); // Faster for drag and drop
    const task = this.tasks.find(t => t.id === taskId);
    if (task) {
      task.status = newStatus;
      task.updatedAt = new Date().toISOString();
      return { ...task };
    }
    throw new Error('Task not found');
  }
}

export const sheetService = new SheetService();