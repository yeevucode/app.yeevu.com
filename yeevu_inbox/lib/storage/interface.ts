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
  checks: {
    dmarc: number;
    spf: number;
    dkim: number;
    mx: number;
    smtp: number;
  };
}

export interface Project {
  domain: string;
  addedAt: string;
  lastScan: ProjectScanResult | null;
  scanHistory: ScanHistoryEntry[];
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
    historyEntry?: ScanHistoryEntry
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
   * Get a single project
   */
  getProject(userId: string, domain: string): Promise<Project | null>;
}
