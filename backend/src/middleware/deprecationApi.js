/**
 * Mark legacy `/api/*` HTTP surface as deprecated in favor of `/v1/*`.
 */
export function deprecationApiHeaders(req, res, next) {
    res.set('Deprecation', 'true');
    res.set('Sunset', 'Sat, 01 Jun 2026 00:00:00 GMT');
    res.set('Link', '</v1>; rel="successor-version"');
    next();
}
