import { describe, it } from 'node:test';
import assert from 'node:assert';
import { routeAfterPlanValidation, routeAfterGenerate, routeAfterReview, routeAfterFix } from '../../../src/agents/orchestrator/router.js';

describe('routeAfterPlanValidation', () => {
    it('returns emit_plan when plan is valid', () => {
        const result = routeAfterPlanValidation({ planValidation: { valid: true }, planRevisions: 0 });
        assert.strictEqual(result, 'emit_plan');
    });

    it('returns revise_plan when invalid with revisions left', () => {
        const result = routeAfterPlanValidation({ planValidation: { valid: false, errors: [{ type: 'MISSING_ENTRY' }] }, planRevisions: 0 });
        assert.strictEqual(result, 'revise_plan');
    });

    it('returns emit_plan when invalid but revisions exhausted', () => {
        const result = routeAfterPlanValidation({ planValidation: { valid: false, errors: [{ type: 'MISSING_ENTRY' }] }, planRevisions: 2 });
        assert.strictEqual(result, 'emit_plan');
    });

    it('returns revise_plan on first revision', () => {
        const result = routeAfterPlanValidation({ planValidation: { valid: false, errors: [] }, planRevisions: 1 });
        assert.strictEqual(result, 'revise_plan');
    });
});

describe('routeAfterGenerate', () => {
    it('returns generate_next_file when files remain', () => {
        const result = routeAfterGenerate({ fileQueue: ['a', 'b', 'c'], currentFileIndex: 1, stepCount: 5, maxSteps: 500 });
        assert.strictEqual(result, 'generate_next_file');
    });

    it('returns review when all files done', () => {
        const result = routeAfterGenerate({ fileQueue: ['a', 'b'], currentFileIndex: 2, stepCount: 5, maxSteps: 500 });
        assert.strictEqual(result, 'review');
    });

    it('returns review when step limit reached', () => {
        const result = routeAfterGenerate({ fileQueue: ['a', 'b', 'c'], currentFileIndex: 1, stepCount: 500, maxSteps: 500 });
        assert.strictEqual(result, 'review');
    });

    it('returns review when fileQueue is empty', () => {
        const result = routeAfterGenerate({ fileQueue: [], currentFileIndex: 0, stepCount: 0, maxSteps: 500 });
        assert.strictEqual(result, 'review');
    });
});

describe('routeAfterReview', () => {
    it('returns finalize when no issues', () => {
        const result = routeAfterReview({ reviewResult: { critical: [], errors: [], warnings: [], rootCauses: [] }, fixRounds: 0, errorBudget: { fixRoundsAllowed: 2 } });
        assert.strictEqual(result, 'finalize');
    });

    it('returns fix when errors exist and fix rounds available', () => {
        const result = routeAfterReview({
            reviewResult: { critical: [], errors: [{ type: 'SYNTAX_ERROR', file: 'a.js' }], warnings: [], rootCauses: [] },
            fixRounds: 0,
            errorBudget: { fixRoundsAllowed: 2 },
            planRevisions: 0,
        });
        assert.strictEqual(result, 'fix');
    });

    it('returns finalize when fix rounds exhausted', () => {
        const result = routeAfterReview({
            reviewResult: { critical: [], errors: [{ type: 'SYNTAX_ERROR' }], warnings: [], rootCauses: [] },
            fixRounds: 2,
            errorBudget: { fixRoundsAllowed: 2 },
            planRevisions: 0,
        });
        assert.strictEqual(result, 'finalize');
    });

    it('returns finalize on null reviewResult', () => {
        const result = routeAfterReview({ reviewResult: null });
        assert.strictEqual(result, 'finalize');
    });
});

describe('routeAfterFix', () => {
    it('always returns review', () => {
        assert.strictEqual(routeAfterFix(), 'review');
    });
});
