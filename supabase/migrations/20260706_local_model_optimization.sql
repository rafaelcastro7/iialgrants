-- Local-model optimization: set per-agent optimal models in agent_configs.
-- Hardware: GTX 1070 8GB VRAM, i7-7700, 51GB RAM
-- Strategy: small/fast models for throughput, large only for reasoning.
--
-- Agent model mapping:
--   discoverer: phi4-mini    (fast structured extraction)
--   enricher:   phi4-mini    (batch JSON field filling)
--   evaluator:  dolphin3     (uncensored = honest scoring)
--   strategist: qwen3:14b    (best reasoning depth)
--   writer:     qwen3:14b    (best prose quality)
--   critic:     dolphin3     (unfiltered review)

-- Upsert agent configs with optimized local models
INSERT INTO agent_configs (agent, model, fallback_model, temperature, max_output_tokens, json_mode, timeout_ms, max_retries, concurrency)
VALUES
  ('discoverer', 'phi4-mini:latest', 'dolphin3:latest', 0.2, 2048, true, 180000, 2, 4),
  ('enricher',   'phi4-mini:latest', 'dolphin3:latest', 0.1, 2048, true, 180000, 2, 4),
  ('evaluator',  'dolphin3:latest',  'phi4-mini:latest', 0.2, 1024, true, 180000, 2, 4),
  ('strategist', 'qwen3:14b',       'dolphin3:latest', 0.4, 4096, false, 300000, 3, 2),
  ('writer',     'qwen3:14b',       'dolphin3:latest', 0.4, 4096, false, 300000, 3, 1),
  ('critic',     'dolphin3:latest',  'qwen3:14b', 0.3, 2048, false, 180000, 2, 2)
ON CONFLICT (agent) DO UPDATE SET
  model = EXCLUDED.model,
  fallback_model = EXCLUDED.fallback_model,
  temperature = EXCLUDED.temperature,
  max_output_tokens = EXCLUDED.max_output_tokens,
  json_mode = EXCLUDED.json_mode,
  timeout_ms = EXCLUDED.timeout_ms,
  max_retries = EXCLUDED.max_retries,
  concurrency = EXCLUDED.concurrency,
  updated_at = now();

-- Update prompt versions to mark the local-first transition
UPDATE agent_configs SET prompt_version = '2.0.0-local' WHERE prompt_version = '1.0.0';
