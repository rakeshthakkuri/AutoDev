// ═══════════════════════════════════════════════════════════════════════════════
// LRU Cache for Analysis and Generation Results
// ═══════════════════════════════════════════════════════════════════════════════

import { LRUCache } from 'lru-cache';
import crypto from 'crypto';

// ── Analysis cache: same prompt + options → same analysis result
const analysisCache = new LRUCache({
    max: 200,              // up to 200 cached analyses
    ttl: 1000 * 60 * 30,  // 30 minutes TTL
});

// ── Plan cache: same requirements hash → same plan
const planCache = new LRUCache({
    max: 100,
    ttl: 1000 * 60 * 30,
});

/**
 * Create a deterministic hash key for caching
 */
function hashKey(data) {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
}

/**
 * Get cached analysis result
 */
export function getCachedAnalysis(prompt, options = {}) {
    const key = hashKey({ prompt: prompt.toLowerCase().trim(), ...options });
    return analysisCache.get(key) || null;
}

/**
 * Set cached analysis result
 */
export function setCachedAnalysis(prompt, options = {}, result) {
    const key = hashKey({ prompt: prompt.toLowerCase().trim(), ...options });
    analysisCache.set(key, result);
}

/**
 * Get cached plan
 */
export function getCachedPlan(requirements) {
    const key = hashKey({
        projectType: requirements.projectType,
        framework: requirements.framework,
        complexity: requirements.complexity,
        stylingFramework: requirements.stylingFramework,
        features: requirements.features,
        // description captures the prompt-specific intent that features alone cannot differentiate
        description: requirements.description || '',
        colorScheme: requirements.colorScheme || '',
        styleDirection: requirements.designIntent?.styleDirection || '',
    });
    return planCache.get(key) || null;
}

/**
 * Set cached plan
 */
export function setCachedPlan(requirements, result) {
    const key = hashKey({
        projectType: requirements.projectType,
        framework: requirements.framework,
        complexity: requirements.complexity,
        stylingFramework: requirements.stylingFramework,
        features: requirements.features,
        description: requirements.description || '',
        colorScheme: requirements.colorScheme || '',
        styleDirection: requirements.designIntent?.styleDirection || '',
    });
    planCache.set(key, result);
}

/**
 * Get cache stats
 */
export function getCacheStats() {
    return {
        analysis: { size: analysisCache.size, max: 200 },
        plan: { size: planCache.size, max: 100 },
    };
}

/**
 * Clear all caches
 */
export function clearAllCaches() {
    analysisCache.clear();
    planCache.clear();
}
