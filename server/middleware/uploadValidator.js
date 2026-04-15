const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const DEFAULT_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

const collectFiles = (req) => {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) {
    files.push(...req.files);
  } else if (req.files && typeof req.files === 'object') {
    for (const key of Object.keys(req.files)) {
      const list = req.files[key];
      if (Array.isArray(list)) files.push(...list);
    }
  }
  return files;
};

const uploadValidator = (options = {}) => {
  const maxSizeBytes = Number.isFinite(options.maxSizeBytes)
    ? options.maxSizeBytes
    : DEFAULT_MAX_SIZE_BYTES;
  const allowedMimeTypes = options.allowedMimeTypes
    ? new Set(options.allowedMimeTypes)
    : DEFAULT_ALLOWED_MIME_TYPES;

  return (req, res, next) => {
    const files = collectFiles(req);
    if (!files.length) return next();

    for (const f of files) {
      if (maxSizeBytes && f.size && f.size > maxSizeBytes) {
        return res.status(400).json({
          success: false,
          message: `File too large. Max size is ${Math.ceil(maxSizeBytes / (1024 * 1024))}MB`,
        });
      }
      if (allowedMimeTypes && !allowedMimeTypes.has(f.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'File type not allowed',
        });
      }
    }

    return next();
  };
};

module.exports = { uploadValidator };
