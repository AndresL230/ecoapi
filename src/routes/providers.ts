import { Router } from "express";
import { getProvider, listProviders } from "../services/provider-service";
import { buildPaginationMeta, paginate, parsePagination } from "../utils/pagination";

const router = Router();

router.get("/providers", (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const data = listProviders();
  res.json({
    data: paginate(data, page, limit),
    pagination: buildPaginationMeta(page, limit, data.length)
  });
});

router.get("/providers/:name", (req, res) => {
  res.json({ data: getProvider(req.params.name) });
});

export default router;
