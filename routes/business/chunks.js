const express = require("express");
const { requireAuth } = require("../../middleware/auth");
const knowledgeService = require("../../services/KnowledgeService");

const router = express.Router({ mergeParams: true });

router.get("/", requireAuth, (req, res) => {
  try {
    if (req.auth?.business_id !== req.params.id) {
      return res.status(403).json({ error: true, message: "Forbidden." });
    }
    return res.json({ chunks: knowledgeService.listChunks(req.params.id, 200) });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Unable to load chunks." });
  }
});

router.post("/", requireAuth, (req, res) => {
  try {
    if (req.auth?.business_id !== req.params.id) {
      return res.status(403).json({ error: true, message: "Forbidden." });
    }

    const created = knowledgeService.addManualKnowledge({
      businessId: req.params.id,
      title: req.body?.title,
      content: req.body?.content,
      sourceUrl: "manual://dashboard"
    });

    return res.status(201).json(created);
  } catch (error) {
    return res.status(400).json({
      error: true,
      message: error.message || "Invalid chunk data."
    });
  }
});

router.delete("/:chunkId", requireAuth, (req, res) => {
  try {
    if (req.auth?.business_id !== req.params.id) {
      return res.status(403).json({ error: true, message: "Forbidden." });
    }

    const deleted = knowledgeService.deleteChunk(req.params.id, Number(req.params.chunkId));
    if (!deleted) {
      return res.status(404).json({ error: true, message: "Chunk not found." });
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: true, message: "Unable to delete chunk." });
  }
});

module.exports = router;
