const express = require('express');
const userController = require('../controllers/userController');
const router = express.Router();

// Middleware to log balance operations
const logBalanceOperation = (req, res, next) => {
  const operation = req.route.path;
  const { nickname, amount } = req.body;
  
  console.log(`[${new Date().toISOString()}] Balance Operation: ${operation} - User: ${nickname}, Amount: ${amount}`);
  next();
};

// @route   POST /api/balance/add-coins
// @desc    Add coins to user account
// @body    { nickname: string, amount: number }
router.post('/add-coins', logBalanceOperation, userController.addCoins);

// @route   POST /api/balance/deduct-coins
// @desc    Deduct coins from user account
// @body    { nickname: string, amount: number }
router.post('/deduct-coins', logBalanceOperation, userController.deductCoins);

// @route   GET /api/balance/user/:nickname
// @desc    Get user balance and info
router.get('/user/:nickname', userController.getUserBalance);

// @route   POST /api/balance/transfer
// @desc    Transfer coins between users
// @body    { fromNickname: string, toNickname: string, amount: number }
router.post('/transfer', logBalanceOperation, userController.transferCoins);

module.exports = router;