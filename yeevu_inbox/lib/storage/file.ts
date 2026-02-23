/**
 * File-based Storage Implementation
 *
 * Used for local development. Stores user data as JSON files.
 * Tier/limit enforcement is handled by the API layer via D1.
 */

import { promises as fs } from 'fs';
import path from 'path';
import {
  IProjectStorage,
  UserProjects,
  Project,
  ProjectScanResult,
  ScanHistoryEntry,
  AddProjectResult,
  RemoveProjectResult,
  UpdateScanResult,
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
      const raw = JSON.parse(data) as Record<string, unknown>;
      return {
        userId,
        projects: (raw.projects as Project[]) ?? [],
      };
    } catch {
      return {
        userId,
        projects: [],
      };
    }
  }

  private async saveUserProjects(data: UserProjects): Promise<void> {
    await ensureDataDir();
    const filePath = getUserFilePath(data.userId);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async addProject(
    userId: string,
    domain: string,
    scanResult?: ProjectScanResult,
    historyEntry?: ScanHistoryEntry,
    folder?: string
  ): Promise<AddProjectResult> {
    const userProjects = await this.getUserProjects(userId);

    const existing = userProjects.projects.find(
      (p) => p.domain.toLowerCase() === domain.toLowerCase()
    );
    if (existing) {
      return { success: false, error: 'Project already exists' };
    }

    const project: Project = {
      domain: domain.toLowerCase(),
      addedAt: new Date().toISOString(),
      lastScan: scanResult || null,
      scanHistory: historyEntry ? [historyEntry] : [],
      ...(folder ? { folder } : {}),
    };

    userProjects.projects.push(project);
    await this.saveUserProjects(userProjects);

    return { success: true, project };
  }

  async updateProjectFolder(
    userId: string,
    domain: string,
    folder: string | undefined
  ): Promise<UpdateScanResult> {
    const userProjects = await this.getUserProjects(userId);

    const project = userProjects.projects.find(
      (p) => p.domain.toLowerCase() === domain.toLowerCase()
    );

    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    if (folder) {
      project.folder = folder;
    } else {
      delete project.folder;
    }

    await this.saveUserProjects(userProjects);

    return { success: true };
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
    scanResult: ProjectScanResult,
    historyEntry?: ScanHistoryEntry
  ): Promise<UpdateScanResult> {
    const userProjects = await this.getUserProjects(userId);

    const project = userProjects.projects.find(
      (p) => p.domain.toLowerCase() === domain.toLowerCase()
    );

    if (!project) {
      return { success: false, error: 'Project not found' };
    }

    project.lastScan = scanResult;

    if (historyEntry) {
      if (!project.scanHistory) project.scanHistory = [];
      project.scanHistory.unshift(historyEntry);
      if (project.scanHistory.length > 20) project.scanHistory.length = 20;
    }

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
}
