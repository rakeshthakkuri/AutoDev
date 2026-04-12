#!/bin/bash
set -e

echo "=== V2 Agent Pipeline Tests ==="

echo ""
echo "--- Pre-flight: Module Loading ---"
AGENT_VERSION=v2 BUILD_CHECK=1 node --input-type=module -e "
  await import('./src/agents/index.js');
  console.log('✅ All v2 modules loaded');
"

echo ""
echo "--- Unit Tests: Shared (Memory + Contracts) ---"
node --test test/agents/shared/memory.test.js test/agents/shared/contracts.test.js

echo ""
echo "--- Unit Tests: Planner ---"
node --test test/agents/planner/validators.test.js

echo ""
echo "--- Unit Tests: Coder ---"
node --test test/agents/coder/context.test.js

echo ""
echo "--- Unit Tests: Reviewer ---"
node --test test/agents/reviewer/reviewer.test.js

echo ""
echo "--- Unit Tests: Orchestrator Router ---"
node --test test/agents/orchestrator/router.test.js

echo ""
echo "--- Unit Tests: Editor ---"
node --test test/agents/editor/differ.test.js

echo ""
echo "--- Integration: Happy Path + Error Recovery ---"
node --test test/v2-integration/happy-path.test.js

echo ""
echo "--- V1 Regression ---"
node --test test/services/validator.test.js test/services/templates.test.js test/services/retry.test.js

echo ""
echo "=== ALL TESTS PASSED ==="
