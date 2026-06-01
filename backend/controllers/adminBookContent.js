import { adminBookContentService } from '../services/adminBookContentService.js';

function parseByteRange(rangeHeader, totalSize) {
  if (!rangeHeader || totalSize == null || totalSize <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
  if (!match) return null;

  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
  if (Number.isNaN(start) || start < 0 || start >= totalSize) return null;
  end = Math.min(end, totalSize - 1);
  if (end < start) return null;
  return { start, end };
}

function applyCommonHeaders(res, result) {
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(result.fileName)}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Source', result.source || 'uploaded');
  if (result.isDemo) {
    res.setHeader('X-Demo-Content', 'true');
    if (result.demoLabel) res.setHeader('X-Demo-Label', result.demoLabel);
  }
}

export async function streamBookContent(req, res, next) {
  try {
    const formatKind = req.query.format === 'audio' ? 'audio' : 'pdf';
    const rangeHeader = req.headers.range;
    const result = await adminBookContentService.getFormatStream(req.params.id, formatKind);

    applyCommonHeaders(res, result);
    res.setHeader('Accept-Ranges', 'bytes');

    if (result.buffer) {
      const total = result.buffer.length;
      const parsed = rangeHeader ? parseByteRange(rangeHeader, total) : null;
      if (parsed) {
        const { start, end } = parsed;
        const chunk = result.buffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
        res.setHeader('Content-Length', String(chunk.length));
        return res.send(chunk);
      }
      res.status(200);
      res.setHeader('Content-Length', String(total));
      return res.send(result.buffer);
    }

    if (result.stream) {
      if (rangeHeader && result.sourceUrl) {
        const ranged = await adminBookContentService.fetchRemoteRange(result.sourceUrl, rangeHeader);
        res.status(ranged.statusCode === 206 || ranged.statusCode === 200 ? ranged.statusCode : 206);
        if (ranged.contentType) res.setHeader('Content-Type', ranged.contentType);
        if (ranged.contentLength) res.setHeader('Content-Length', ranged.contentLength);
        if (ranged.contentRange) res.setHeader('Content-Range', ranged.contentRange);
        if (ranged.acceptRanges) res.setHeader('Accept-Ranges', ranged.acceptRanges);
        ranged.stream.on('error', (err) => next(err));
        ranged.stream.pipe(res);
        return;
      }

      if (result.contentLength) {
        res.setHeader('Content-Length', result.contentLength);
      }
      res.status(200);
      result.stream.on('error', (err) => next(err));
      result.stream.pipe(res);
      return;
    }

    res.status(404).json({ success: false, error: { message: 'No content available' } });
  } catch (error) {
    next(error);
  }
}
