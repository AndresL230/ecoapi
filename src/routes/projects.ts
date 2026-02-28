import { Router } from "express";
import {
  createProject,
  createScan,
  deleteProject,
  getCostBreakdownByFile,
  getCostBreakdownByProvider,
  getCostSummary,
  getEndpoint,
  getGraph,
  getLatestScan,
  getProjectWithSummary,
  getScan,
  getSuggestion,
  listLatestEndpoints,
  listLatestSuggestions,
  listProjects,
  listScans,
  patchProject
} from "../services/project-service";
import {
  validateCreateProjectInput,
  validatePatchProjectInput,
  validateScanInput
} from "../services/validation-service";
import { buildPaginationMeta, paginate, parsePagination } from "../utils/pagination";
import { AppError } from "../utils/app-error";
import { parseOrder } from "../utils/sort";

const router = Router();

router.post("/projects", (req, res) => {
  const input = validateCreateProjectInput(req.body);
  const project = createProject(input);
  res.status(201).json({ data: project });
});

router.get("/projects", (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const order = parseOrder(req.query.order);
  const data = listProjects({
    name: req.query.name as string | undefined,
    sort: req.query.sort as string | undefined,
    order
  });
  const paged = paginate(data, page, limit);
  res.json({
    data: paged,
    pagination: buildPaginationMeta(page, limit, data.length)
  });
});

router.get("/projects/:id", (req, res) => {
  const project = getProjectWithSummary(req.params.id);
  res.json({ data: project });
});

router.patch("/projects/:id", (req, res) => {
  const input = validatePatchProjectInput(req.body);
  const project = patchProject(req.params.id, input);
  res.json({ data: project });
});

router.delete("/projects/:id", (req, res) => {
  deleteProject(req.params.id);
  res.status(204).send();
});

router.post("/projects/:id/scans", (req, res) => {
  const input = validateScanInput(req.body);
  const scan = createScan(req.params.id, input.apiCalls);
  res.status(201).json({ data: scan });
});

router.get("/projects/:id/scans", (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const order = parseOrder(req.query.order ?? "desc");
  const sort = (req.query.sort as string | undefined) ?? "created_at";
  if (!["created_at"].includes(sort)) {
    throw new AppError("INVALID_SORT_FIELD", "Query param 'sort' must be created_at", 422);
  }
  const all = listScans(req.params.id).sort((a, b) =>
    order === "asc"
      ? a.createdAt.localeCompare(b.createdAt)
      : b.createdAt.localeCompare(a.createdAt)
  );

  res.json({
    data: paginate(all, page, limit),
    pagination: buildPaginationMeta(page, limit, all.length)
  });
});

router.get("/projects/:id/scans/latest", (req, res) => {
  const scan = getLatestScan(req.params.id);
  res.json({ data: scan });
});

router.get("/projects/:id/scans/:scanId", (req, res) => {
  const scan = getScan(req.params.id, req.params.scanId);
  res.json({ data: scan });
});

router.get("/projects/:id/endpoints", (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const order = parseOrder(req.query.order ?? "desc");
  const sort = (req.query.sort as string | undefined) ?? "monthly_cost";
  if (!["monthly_cost", "calls_per_day", "method", "provider"].includes(sort)) {
    throw new AppError(
      "INVALID_SORT_FIELD",
      "Query param 'sort' must be monthly_cost, calls_per_day, method, or provider",
      422
    );
  }

  let data = listLatestEndpoints(req.params.id);
  const provider = req.query.provider as string | undefined;
  const status = req.query.status as string | undefined;
  const method = req.query.method as string | undefined;

  if (provider) data = data.filter((item) => item.provider === provider);
  if (status) data = data.filter((item) => item.status === status);
  if (method) data = data.filter((item) => item.method === method.toUpperCase());

  data = data.sort((a, b) => {
    if (sort === "calls_per_day") return order === "asc" ? a.callsPerDay - b.callsPerDay : b.callsPerDay - a.callsPerDay;
    if (sort === "method") return order === "asc" ? a.method.localeCompare(b.method) : b.method.localeCompare(a.method);
    if (sort === "provider") return order === "asc" ? a.provider.localeCompare(b.provider) : b.provider.localeCompare(a.provider);
    return order === "asc" ? a.monthlyCost - b.monthlyCost : b.monthlyCost - a.monthlyCost;
  });

  res.json({
    data: paginate(data, page, limit),
    pagination: buildPaginationMeta(page, limit, data.length)
  });
});

router.get("/projects/:id/endpoints/:endpointId", (req, res) => {
  const endpoint = getEndpoint(req.params.id, req.params.endpointId);
  res.json({ data: endpoint });
});

router.get("/projects/:id/suggestions", (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const order = parseOrder(req.query.order ?? "desc");
  const sort = (req.query.sort as string | undefined) ?? "estimated_savings";
  if (!["estimated_savings", "severity", "type"].includes(sort)) {
    throw new AppError(
      "INVALID_SORT_FIELD",
      "Query param 'sort' must be estimated_savings, severity, or type",
      422
    );
  }

  let data = listLatestSuggestions(req.params.id);
  const type = req.query.type as string | undefined;
  const severity = req.query.severity as string | undefined;

  if (type) {
    const types = type.split(",").map((item) => item.trim());
    data = data.filter((item) => types.includes(item.type));
  }
  if (severity) data = data.filter((item) => item.severity === severity);

  data = data.sort((a, b) => {
    if (sort === "severity") {
      const rank = { high: 3, medium: 2, low: 1 };
      return order === "asc" ? rank[a.severity] - rank[b.severity] : rank[b.severity] - rank[a.severity];
    }
    if (sort === "type") return order === "asc" ? a.type.localeCompare(b.type) : b.type.localeCompare(a.type);
    return order === "asc"
      ? a.estimatedMonthlySavings - b.estimatedMonthlySavings
      : b.estimatedMonthlySavings - a.estimatedMonthlySavings;
  });

  res.json({
    data: paginate(data, page, limit),
    pagination: buildPaginationMeta(page, limit, data.length)
  });
});

router.get("/projects/:id/suggestions/:suggestionId", (req, res) => {
  const suggestion = getSuggestion(req.params.id, req.params.suggestionId);
  res.json({ data: suggestion });
});

router.get("/projects/:id/graph", (req, res) => {
  const graph = getGraph(req.params.id, req.query.cluster_by as string | undefined);
  res.json({ data: graph });
});

router.get("/projects/:id/cost", (req, res) => {
  const summary = getCostSummary(req.params.id);
  res.json({ data: summary });
});

router.get("/projects/:id/cost/by-provider", (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const data = getCostBreakdownByProvider(req.params.id);
  res.json({
    data: paginate(data, page, limit),
    pagination: buildPaginationMeta(page, limit, data.length)
  });
});

router.get("/projects/:id/cost/by-file", (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const data = getCostBreakdownByFile(req.params.id);
  res.json({
    data: paginate(data, page, limit),
    pagination: buildPaginationMeta(page, limit, data.length)
  });
});

export default router;
