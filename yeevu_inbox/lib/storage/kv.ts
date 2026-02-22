/**
 * Cloudflare KV Storage Implementation
 *
 * Used in production on Cloudflare Workers.
 * Stores user data in Cloudflare KV namespace.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  IProjectStorage,
  UserProjects,
  Project,
  ProjectScanResult,
  ScanHistoryEntry,
  ProjectLimits,
  AddProjectResult,
  RemoveProjectResult,
  UpdateScanResult,
  FREE_PROJECT_LIMIT,
} from './interface';

// Local KVNamespace interface to avoid global type conflicts
interface KVNamespace {
  get(key: string, type: 'json'): Promise<unknown>;
  get(key: string, type?: 'text'): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

// KV key prefix for user projects
const KEY_PREFIX = 'user_projects:';

// Encode user ID for safe KV key
function encodeUserId(userId: string): string {
  return Buffer.from(userId).toString('base64url');
}

// Get KV key for user
function getUserKey(userId: string): string {
  return `${KEY_PREFIX}${encodeUserId(userId)}`;
}

export class KVStorage implements IProjectStorage {
  private async getKV(): Promise<KVNamespace> {
    const { env } = await getCloudflareContext();
    const kv = (env as Record<string, unknown>).PROJECTS_KV as KVNamespace | undefined;
    if (!kv) {
      throw new Error('PROJECTS_KV binding not found. Check wrangler.toml configuration.');
    }
    return kv;
  }

  async getUserProjects(userId: string): Promise<UserProjects> {
    const kv = await this.getKV();
    const key = getUserKey(userId);

    const data = await kv.get(key, 'json');

    if (data) {
      return data as UserProjects;
    }

    // Return default structure if not found
    return {
      userId,
      isPaid: false,
      projects: [],
    };
  }

  private async saveUserProjects(data: UserProjects): Promise<void> {
    const kv = await this.getKV();
    const key = getUserKey(data.userId);
    await kv.put(key, JSON.stringify(data));
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
    scanResult?: ProjectScanResult,
    historyEntry?: ScanHistoryEntry
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
      scanHistory: historyEntry ? [historyEntry] : [],
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

  async setUserPaidStatus(userId: string, isPaid: boolean): Promise<void> {
    const userProjects = await this.getUserProjects(userId);
    userProjects.isPaid = isPaid;
    await this.saveUserProjects(userProjects);
  }
}
