/**
 * File-based Storage Implementation
 *
 * Used for local development. Stores user data as JSON files.
 */

import { promises as fs } from 'fs';
import path from 'path';
import {
  IProjectStorage,
  UserProjects,
  Project,
  ProjectScanResult,
  ProjectLimits,
  AddProjectResult,
  RemoveProjectResult,
  UpdateScanResult,
  FREE_PROJECT_LIMIT,
} from './interface';

const DATA_DIR = path.join(process.cwd(), 'data', 'projects');

// Encode user ID for safe filename
function encodeUserId(userId: string): string {
  return Buffer.from(userId).toString('base64url');
}

// Get user data file path
function getUserFilePath(userId: string): string {
  return path.join(DATA_DIR, `${encodeUserId(userId)}.json`);
}

// Ensure data directory exists
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

export class FileStorage implements IProjectStorage {
  async getUserProjects(userId: string): Promise<UserProjects> {
    await ensureDataDir();
    const filePath = getUserFilePath(userId);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch {
      // Return default structure if file doesn't exist
      return {
        userId,
        isPaid: false,
        projects: [],
      };
    }
  }

  private async saveUserProjects(data: UserProjects): Promise<void> {
    await ensureDataDir();
    const filePath = getUserFilePath(data.userId);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private canAddProject(userProjects: UserProjects): boolean {
    if (userProjects.isPaid) return true;
    return userProjects.projects.length < FREE_PROJECT_LIMIT;
  }

  async getProjectLimits(userId: string): Promise<ProjectLimits> {
    const userProjects = await this.getUserProjects(userId);
    return {
      current: userProjects.projects.length,
      limit: userProjects.isPaid ? null : FREE_PROJECT_LIMIT,
      canAdd: this.canAddProject(userProjects),
    };
  }

  async addProject(
    userId: string,
    domain: string,
    scanResult?: ProjectScanResult
  ): Promise<AddProjectResult> {
    const userProjects = await this.getUserProjects(userId);

    // Check if project already exists
    const existing = userProjects.projects.find(
      (p) => p.domain.toLowerCase() === domain.toLowerCase()
    );
    if (existing) {
      return { success: false, error: 'Project already exists' };
    }

    // Check limit
    if (!this.canAddProject(userProjects)) {
      return {
        success: false,
        error: `Free users are limited to ${FREE_PROJECT_LIMIT} projects. Upgrade to add more.`,
      };
    }

    const project: Project = {
      domain: domain.toLowerCase(),
      addedAt: new Date().toISOString(),
      lastScan: scanResult || null,
    };

    userProjects.projects.push(project);
    await this.saveUserProjects(userProjects);

    return { success: true, project };
  }

  async removeProject(userId: string, domain: string): Promise<RemoveProjectResult> {
    const userProjects = await this.getUserProjects(userId);

    const index = userProjects.projects.findIndex(
      (p) => p.domain.toLowerCase() === domain.toLowerCase()
    );

    if (index === -1) {
      return { success: false, error: 'Project not found' };
    }

    userProjects.projects.splice(index, 1);
    await this.saveUserProjects(userProjects);

    return { success: true };
  }

  async updateProjectScan(
    userId: string,
    domain: string,
    scanResult: ProjectScanResult
  ): Promise<UpdateScanResult> {
    const userProjects = await this.getUserProjects(userId);

    const project = userProjects.projects.find(
      (p) => p.domain.toLowerCase() === domain.toLowerCase()
    );

    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    project.lastScan = scanResult;
    await this.saveUserProjects(userProjects);

    return { success: true };
  }

  async getProject(userId: string, domain: string): Promise<Project | null> {
    const userProjects = await this.getUserProjects(userId);

    return (
      userProjects.projects.find(
        (p) => p.domain.toLowerCase() === domain.toLowerCase()
      ) || null
    );
  }

  async setUserPaidStatus(userId: string, isPaid: boolean): Promise<void> {
    const userProjects = await this.getUserProjects(userId);
    userProjects.isPaid = isPaid;
    await this.saveUserProjects(userProjects);
  }
}
