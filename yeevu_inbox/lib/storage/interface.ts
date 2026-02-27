/**
 * Storage Interface for Projects
 *
 * This abstraction allows swapping storage backends:
 * - FileStorage: Local development (file system)
 * - KVStorage: Cloudflare Workers KV
 * - Future: Database storage (Supabase, PlanetScale, etc.)
 */

import { UserTier } from '../utils/tier';

export interface ProjectScanResult {
  timestamp: string;
  overallScore: number;
  results: Record<string, {
    status: string;
    score: number;
    details?: Record<string, unknown>;
  }>;
}

export interface ScanHistoryEntry {
  ts: string;
  finalScore: number;
  configScore: number;
  reputationTier: string;
  // Keyed by check name (e.g. 'mx', 'spf', 'mta_sts'). Older entries may only have
  // the original 5 core checks — render whatever keys are present.
  checks: Record<string, number>;
}

export interface Project {
  domain: string;
  addedAt: string;
  lastScan: ProjectScanResult | null;
  scanHistory: ScanHistoryEntry[];
  folder?: string;
}

export interface UserProjects {
  userId: string;
  projects: Project[];
}

export interface ProjectLimits {
  current: number;
  limit: number | null;
  canAdd: boolean;
  tier: UserTier;
}

export interface AddProjectResult {
  success: boolean;
  error?: string;
  project?: Project;
}

export interface RemoveProjectResult {
  success: boolean;
  error?: string;
}

export interface UpdateScanResult {
  success: boolean;
  error?: string;
}

/**
 * Storage interface that all implementations must follow
 */
export interface IProjectStorage {
  /**
   * Get all projects for a user
   */
  getUserProjects(userId: string): Promise<UserProjects>;

  /**
   * Add a project for a user (no limit enforcement — handled by API layer)
   */
  addProject(
    userId: string,
    domain: string,
    scanResult?: ProjectScanResult,
    historyEntry?: ScanHistoryEntry,
    folder?: string
  ): Promise<AddProjectResult>;

  /**
   * Remove a project for a user
   */
  removeProject(userId: string, domain: string): Promise<RemoveProjectResult>;

  /**
   * Update scan result for a project
   */
  updateProjectScan(
    userId: string,
    domain: string,
    scanResult: ProjectScanResult,
    historyEntry?: ScanHistoryEntry
  ): Promise<UpdateScanResult>;

  /**
   * Move a project to a different folder (or remove from folder)
   */
  updateProjectFolder(
    userId: string,
    domain: string,
    folder: string | undefined
  ): Promise<UpdateScanResult>;

  /**
   * Get a single project
   */
  getProject(userId: string, domain: string): Promise<Project | null>;

  /**
   * Clear scan history for a project
   */
  clearHistory(userId: string, domain: string): Promise<UpdateScanResult>;
}
