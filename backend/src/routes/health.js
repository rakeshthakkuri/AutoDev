import express from 'express';
import config from '../config.js';

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0.0',
        frameworks: config.frameworks,
    });
});

export default router;
