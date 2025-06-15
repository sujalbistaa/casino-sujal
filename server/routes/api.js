const express = require('express');
const CasinoUser = require('../models/User');
const router = express.Router();

// @route   POST /api/register
// @desc    Register a new user with nickname
router.post('/register', async (req, res) => {
  try {
    const { nickname } = req.body;

    // Validation
    if (!nickname) {
      return res.status(400).json({
        success: false,
        message: 'Nickname is required'
      });
    }

    // Check if nickname already exists
    const existingUser = await CasinoUser.findOne({ 
      nickname: { $regex: new RegExp(`^${nickname}$`, 'i') } // Case insensitive
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Nickname already taken. Please choose another one.'
      });
    }

    // Create new user
    const newUser = new CasinoUser({
      nickname: nickname.trim(),
      balance: 1000,
      lastLogin: new Date()
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: 'Welcome to the casino! You start with 1000 coins.',
      user: {
        id: newUser._id,
        nickname: newUser.nickname,
        balance: newUser.balance,
        totalWinnings: newUser.totalWinnings,
        totalLosses: newUser.totalLosses,
        gamesPlayed: newUser.gamesPlayed,
        winRate: newUser.winRate,
        createdAt: newUser.createdAt
      }
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Validation error'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
});

// @route   POST /api/login
// @desc    Login user with nickname (or create if doesn't exist)
router.post('/login', async (req, res) => {
  try {
    const { nickname } = req.body;

    if (!nickname) {
      return res.status(400).json({
        success: false,
        message: 'Nickname is required'
      });
    }

    // Find user (case insensitive)
    let user = await CasinoUser.findOne({ 
      nickname: { $regex: new RegExp(`^${nickname}$`, 'i') } 
    });

    // If user doesn't exist, create them
    if (!user) {
      user = new CasinoUser({
        nickname: nickname.trim(),
        balance: 1000,
        lastLogin: new Date()
      });
      await user.save();

      return res.status(201).json({
        success: true,
        message: 'New player created! Welcome to the casino!',
        isNewUser: true,
        user: {
          id: user._id,
          nickname: user.nickname,
          balance: user.balance,
          totalWinnings: user.totalWinnings,
          totalLosses: user.totalLosses,
          gamesPlayed: user.gamesPlayed,
          winRate: user.winRate,
          createdAt: user.createdAt
        }
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Welcome back to the casino!',
      isNewUser: false,
      user: {
        id: user._id,
        nickname: user.nickname,
        balance: user.balance,
        totalWinnings: user.totalWinnings,
        totalLosses: user.totalLosses,
        gamesPlayed: user.gamesPlayed,
        winRate: user.winRate,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Validation error'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
});

// @route   GET /api/get-user/:nickname
// @desc    Get user data by nickname
router.get('/get-user/:nickname', async (req, res) => {
  try {
    const { nickname } = req.params;

    const user = await CasinoUser.findOne({ 
      nickname: { $regex: new RegExp(`^${nickname}$`, 'i') } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        nickname: user.nickname,
        balance: user.balance,
        totalWinnings: user.totalWinnings,
        totalLosses: user.totalLosses,
        gamesPlayed: user.gamesPlayed,
        winRate: user.winRate,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/leaderboard
// @desc    Get top players by balance
router.get('/leaderboard', async (req, res) => {
  try {
    const topPlayers = await CasinoUser.find({ isActive: true })
      .sort({ balance: -1 })
      .limit(10)
      .select('nickname balance totalWinnings gamesPlayed createdAt');

    res.json({
      success: true,
      leaderboard: topPlayers.map((player, index) => ({
        rank: index + 1,
        nickname: player.nickname,
        balance: player.balance,
        totalWinnings: player.totalWinnings,
        gamesPlayed: player.gamesPlayed,
        memberSince: player.createdAt
      }))
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   PUT /api/update-balance
// @desc    Update user balance after game (for future game integration)
router.put('/update-balance', async (req, res) => {
  try {
    const { nickname, balanceChange, gameResult } = req.body;

    if (!nickname || balanceChange === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Nickname and balance change are required'
      });
    }

    const user = await CasinoUser.findOne({ 
      nickname: { $regex: new RegExp(`^${nickname}$`, 'i') } 
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update balance
    user.balance += balanceChange;
    user.gamesPlayed += 1;

    // Track winnings/losses
    if (balanceChange > 0) {
      user.totalWinnings += balanceChange;
    } else if (balanceChange < 0) {
      user.totalLosses += Math.abs(balanceChange);
    }

    // Ensure balance doesn't go negative
    if (user.balance < 0) {
      user.balance = 0;
    }

    await user.save();

    res.json({
      success: true,
      message: gameResult || 'Balance updated',
      user: {
        id: user._id,
        nickname: user.nickname,
        balance: user.balance,
        totalWinnings: user.totalWinnings,
        totalLosses: user.totalLosses,
        gamesPlayed: user.gamesPlayed,
        winRate: user.winRate
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// @route   GET /api/casino-stats
// @desc    Get overall casino statistics
router.get('/casino-stats', async (req, res) => {
  try {
    const totalPlayers = await CasinoUser.countDocuments();
    const totalGamesPlayed = await CasinoUser.aggregate([
      { $group: { _id: null, total: { $sum: '$gamesPlayed' } } }
    ]);
    const totalCoinsInCirculation = await CasinoUser.aggregate([
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);

    res.json({
      success: true,
      stats: {
        totalPlayers,
        totalGamesPlayed: totalGamesPlayed[0]?.total || 0,
        totalCoinsInCirculation: totalCoinsInCirculation[0]?.total || 0,
        averageBalance: totalPlayers > 0 ? Math.round((totalCoinsInCirculation[0]?.total || 0) / totalPlayers) : 0
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;