const { validationResult } = require('express-validator');

// validate([rules]) -> runs the express-validator rules, then returns the first error as a friendly 400.
module.exports = (rules) => [
  ...rules,
  (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();
    const firstErr = result.array()[0];
    const msg = firstErr.msg && firstErr.msg !== 'Invalid value'
      ? firstErr.msg
      : `${firstErr.path ? firstErr.path.charAt(0).toUpperCase() + firstErr.path.slice(1) : 'Field'} is invalid.`;
    res.status(400).json({ message: msg });
  },
];
