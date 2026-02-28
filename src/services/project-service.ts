import { randomUUID } from "crypto";
import {
  EndpointRecord,
  GraphData,
  Project,
  ProjectInput,
  ProjectPatchInput,
  Scan,
  Suggestion
} from "../models/types";
import { db } from "../store/data-store";
import { notFound, AppError } from "../utils/app-error";
import { analyzeApiCalls } from "./analysis-service";
import { compareValues } from "../utils/sort";

export const createProject = (input: ProjectInput): Project => {
  const now = new Date().toISOString();
  const project: Project = {
    id: randomUUID(),
    name: input.name,
    description: input.description,
    createdAt: now,
    updatedAt: now
  };
  db.projects.set(project.id, project);

  if (input.apiCalls && input.apiCalls.length > 0) {
    const scan = createScan(project.id, input.apiCalls);
    project.latestScanId = scan.id;
    project.updatedAt = new Date().toISOString();
    db.projects.set(project.id, project);
  }

  return project;
};

export const listProjects = ({
  name,
  sort,
  order
}: {
  name?: string;
  sort?: string;
  order: "asc" | "desc";
}): Project[] => {
  const validSortFields = new Set(["created_at", "updated_at", "name"]);
  const sortField = sort ?? "created_at";
  if (!validSortFields.has(sortField)) {
    throw new AppError(
      "INVALID_SORT_FIELD",
      "Query param 'sort' must be one of: created_at, updated_at, name",
      422
    );
  }

  const filtered = Array.from(db.projects.values()).filter((project) =>
    name ? project.name.toLowerCase().includes(name.toLowerCase()) : true
  );

  return filtered.sort((a, b) => {
    if (sortField === "name") return compareValues(a.name, b.name, order);
    if (sortField === "updated_at") return compareValues(a.updatedAt, b.updatedAt, order);
    return compareValues(a.createdAt, b.createdAt, order);
  });
};

export const getProject = (projectId: string): Project => {
  const project = db.projects.get(projectId);
  if (!project) throw notFound("Project", projectId);
  return project;
};

export const getProjectWithSummary = (projectId: string): Project & { summary: Record<string, number> } => {
  const project = getProject(projectId);
  const latest = project.latestScanId ? db.scans.get(project.latestScanId) : undefined;

  return {
    ...project,
    summary: {
      scans: listScans(projectId).length,
      endpoints: latest?.summary.totalEndpoints ?? 0,
      callsPerDay: latest?.summary.totalCallsPerDay ?? 0,
      monthlyCost: latest?.summary.totalMonthlyCost ?? 0
    }
  };
};

export const patchProject = (projectId: string, input: ProjectPatchInput): Project => {
  const project = getProject(projectId);
  const updated: Project = {
    ...project,
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    updatedAt: new Date().toISOString()
  };
  db.projects.set(projectId, updated);
  return updated;
};

export const deleteProject = (projectId: string): void => {
  getProject(projectId);
  db.projects.delete(projectId);

  const scans = Array.from(db.scans.values()).filter((scan) => scan.projectId === projectId);
  for (const scan of scans) {
    db.scans.delete(scan.id);
    for (const endpointId of scan.endpointIds) db.endpoints.delete(endpointId);
    for (const suggestionId of scan.suggestionIds) db.suggestions.delete(suggestionId);
  }
};

export const createScan = (projectId: string, apiCalls: ProjectInput["apiCalls"]): Scan => {
  getProject(projectId);
  const scanId = randomUUID();
  const createdAt = new Date().toISOString();
  const result = analyzeApiCalls(projectId, scanId, apiCalls ?? []);

  for (const endpoint of result.endpoints) {
    db.endpoints.set(endpoint.id, endpoint);
  }
  for (const suggestion of result.suggestions) {
    db.suggestions.set(suggestion.id, suggestion);
  }

  const scan: Scan = {
    id: scanId,
    projectId,
    createdAt,
    endpointIds: result.endpoints.map((endpoint) => endpoint.id),
    suggestionIds: result.suggestions.map((suggestion) => suggestion.id),
    graph: result.graph,
    summary: result.summary
  };
  db.scans.set(scan.id, scan);

  const project = getProject(projectId);
  db.projects.set(projectId, {
    ...project,
    latestScanId: scan.id,
    updatedAt: new Date().toISOString()
  });

  return scan;
};

export const listScans = (projectId: string): Scan[] => {
  getProject(projectId);
  return Array.from(db.scans.values()).filter((scan) => scan.projectId === projectId);
};

export const getScan = (projectId: string, scanId: string): Scan => {
  getProject(projectId);
  const scan = db.scans.get(scanId);
  if (!scan || scan.projectId !== projectId) throw notFound("Scan", scanId);
  return scan;
};

export const getLatestScan = (projectId: string): Scan => {
  const project = getProject(projectId);
  if (!project.latestScanId) {
    throw new AppError("RESOURCE_NOT_FOUND", `No scans found for project '${projectId}'`, 404);
  }
  return getScan(projectId, project.latestScanId);
};

export const listLatestEndpoints = (projectId: string): EndpointRecord[] => {
  const latest = getLatestScan(projectId);
  return latest.endpointIds
    .map((id) => db.endpoints.get(id))
    .filter((endpoint): endpoint is EndpointRecord => Boolean(endpoint));
};

export const getEndpoint = (projectId: string, endpointId: string): EndpointRecord => {
  const endpoint = db.endpoints.get(endpointId);
  if (!endpoint || endpoint.projectId !== projectId) throw notFound("Endpoint", endpointId);
  return endpoint;
};

export const listLatestSuggestions = (projectId: string): Suggestion[] => {
  const latest = getLatestScan(projectId);
  return latest.suggestionIds
    .map((id) => db.suggestions.get(id))
    .filter((suggestion): suggestion is Suggestion => Boolean(suggestion));
};

export const getSuggestion = (projectId: string, suggestionId: string): Suggestion => {
  const suggestion = db.suggestions.get(suggestionId);
  if (!suggestion || suggestion.projectId !== projectId) throw notFound("Suggestion", suggestionId);
  return suggestion;
};

export const getGraph = (projectId: string, clusterBy?: string): GraphData => {
  const latest = getLatestScan(projectId);
  if (!clusterBy) return latest.graph;
  const cluster = ["provider", "file", "cost"];
  if (!cluster.includes(clusterBy)) {
    throw new AppError("INVALID_CLUSTER_BY", "Query param 'cluster_by' must be provider, file, or cost", 422);
  }

  if (clusterBy === "provider") return latest.graph;

  const nodes = latest.graph.nodes.map((node) => ({
    ...node,
    group:
      clusterBy === "cost"
        ? node.monthlyCost > 500
          ? "high-cost"
          : node.monthlyCost > 100
            ? "medium-cost"
            : "low-cost"
        : node.label
  }));

  return { nodes, edges: latest.graph.edges };
};

export const getCostSummary = (projectId: string): {
  totalMonthlyCost: number;
  totalCallsPerDay: number;
  endpointCount: number;
} => {
  const endpoints = listLatestEndpoints(projectId);
  return {
    totalMonthlyCost: Number(
      endpoints.reduce((sum, endpoint) => sum + endpoint.monthlyCost, 0).toFixed(4)
    ),
    totalCallsPerDay: Number(
      endpoints.reduce((sum, endpoint) => sum + endpoint.callsPerDay, 0).toFixed(2)
    ),
    endpointCount: endpoints.length
  };
};

export const getCostBreakdownByProvider = (
  projectId: string
): Array<{ provider: string; monthlyCost: number; callsPerDay: number; endpointCount: number }> => {
  const endpoints = listLatestEndpoints(projectId);
  const map = new Map<string, { monthlyCost: number; callsPerDay: number; endpointCount: number }>();

  for (const endpoint of endpoints) {
    const current = map.get(endpoint.provider) ?? {
      monthlyCost: 0,
      callsPerDay: 0,
      endpointCount: 0
    };
    current.monthlyCost += endpoint.monthlyCost;
    current.callsPerDay += endpoint.callsPerDay;
    current.endpointCount += 1;
    map.set(endpoint.provider, current);
  }

  return Array.from(map.entries()).map(([provider, value]) => ({
    provider,
    monthlyCost: Number(value.monthlyCost.toFixed(4)),
    callsPerDay: Number(value.callsPerDay.toFixed(2)),
    endpointCount: value.endpointCount
  }));
};

export const getCostBreakdownByFile = (
  projectId: string
): Array<{ file: string; monthlyCost: number; callsPerDay: number; endpointCount: number }> => {
  const endpoints = listLatestEndpoints(projectId);
  const map = new Map<string, { monthlyCost: number; callsPerDay: number; endpointCount: number }>();

  for (const endpoint of endpoints) {
    for (const file of endpoint.files) {
      const current = map.get(file) ?? { monthlyCost: 0, callsPerDay: 0, endpointCount: 0 };
      current.monthlyCost += endpoint.monthlyCost / endpoint.files.length;
      current.callsPerDay += endpoint.callsPerDay / endpoint.files.length;
      current.endpointCount += 1;
      map.set(file, current);
    }
  }

  return Array.from(map.entries()).map(([file, value]) => ({
    file,
    monthlyCost: Number(value.monthlyCost.toFixed(4)),
    callsPerDay: Number(value.callsPerDay.toFixed(2)),
    endpointCount: value.endpointCount
  }));
};

