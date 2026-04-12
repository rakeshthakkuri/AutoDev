import express from 'express';
import config from '../config.js';

const router = express.Router();

let v2Available = false;
try {
    await import('../agents/index.js');
    v2Available = true;
} catch {
    // v2 modules failed to load — reported in health check
}

router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0.0',
        agentVersion: config.agentVersion,
        v1Deprecated: true,
        v2Available,
        frameworks: config.frameworks,
    });
});

export default router;
