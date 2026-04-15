const router = require('express').Router();
const { body } = require('express-validator');
const { login, logout, me } = require('./auth.controller');
const { authenticate } = require('../../middleware/auth');
const { validate } = require('../../utils/validate');

router.post('/login',
  [body('email').isEmail(), body('password').notEmpty()],
  validate,
  login
);
router.post('/logout', logout);
router.get('/me', authenticate, me);

module.exports = router;
