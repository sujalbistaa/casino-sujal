const CasinoUser = require('../models/User');

// Helper function to find user by nickname
const findUserByNickname = async (nickname) => {
  if (!nickname || typeof nickname !== 'string') {
    throw new Error('Valid nickname is required');
  }

  const user = await CasinoUser.findOne({ 
    nickname: { $regex: new RegExp(`^${nickname.trim()}$`, 'i') }
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
};

// Helper function to validate amount
const validateAmount = (amount) => {
  if (!amount || typeof amount !== 'number' || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }

  if (!Number.isInteger(amount)) {
    throw new Error('Amount must be a whole number');
  }

  return true;
};

// Helper function to format user response
const formatUserResponse = (user) => {
  return {
    id: user._id,
    nickname: user.nickname,
    balance: user.balance,
    totalWinnings: user.totalWinnings,
    totalLosses: user.totalLosses,
    gamesPlayed: user.gamesPlayed,
    winRate: user.winRate,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

const userController = {
  // Add coins to user balance
  addCoins: async (req, res) => {
    try {
      const { nickname, amount } = req.body;

      // Validate inputs
      validateAmount(amount);
      const user = await findUserByNickname(nickname);

      // Add coins to balance
      user.balance += amount;
      user.totalWinnings += amount;
      
      // Save changes
      await user.save();

      res.json({
        success: true,
        message: `Successfully added ${amount} coins to ${user.nickname}'s account`,
        transaction: {
          type: 'credit',
          amount: amount,
          previousBalance: user.balance - amount,
          newBalance: user.balance
        },
        user: formatUserResponse(user)
      });

    } catch (error) {
      console.error('Add coins error:', error);

      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          message: 'User not found. Please check the nickname.'
        });
      }

      if (error.message.includes('Amount') || error.message.includes('nickname')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to add coins',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  },

  // Deduct coins from user balance
  deductCoins: async (req, res) => {
    try {
      const { nickname, amount } = req.body;

      // Validate inputs
      validateAmount(amount);
      const user = await findUserByNickname(nickname);

      // Check if user has sufficient balance
      if (user.balance < amount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. Current balance: ${user.balance} coins, Required: ${amount} coins`,
          currentBalance: user.balance,
          requestedAmount: amount,
          shortfall: amount - user.balance
        });
      }

      // Store previous balance for transaction record
      const previousBalance = user.balance;

      // Deduct coins from balance
      user.balance -= amount;
      user.totalLosses += amount;
      
      // Save changes
      await user.save();

      res.json({
        success: true,
        message: `Successfully deducted ${amount} coins from ${user.nickname}'s account`,
        transaction: {
          type: 'debit',
          amount: amount,
          previousBalance: previousBalance,
          newBalance: user.balance
        },
        user: formatUserResponse(user)
      });

    } catch (error) {
      console.error('Deduct coins error:', error);

      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          message: 'User not found. Please check the nickname.'
        });
      }

      if (error.message.includes('Amount') || error.message.includes('nickname')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to deduct coins',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  },

  // Get user balance and info
  getUserBalance: async (req, res) => {
    try {
      const { nickname } = req.params;
      const user = await findUserByNickname(nickname);

      res.json({
        success: true,
        user: formatUserResponse(user)
      });

    } catch (error) {
      console.error('Get user balance error:', error);

      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          message: 'User not found. Please check the nickname.'
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to get user balance',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  },

  // Transfer coins between users
  transferCoins: async (req, res) => {
    try {
      const { fromNickname, toNickname, amount } = req.body;

      // Validate inputs
      validateAmount(amount);
      
      if (fromNickname === toNickname) {
        return res.status(400).json({
          success: false,
          message: 'Cannot transfer coins to yourself'
        });
      }

      // Find both users
      const fromUser = await findUserByNickname(fromNickname);
      const toUser = await findUserByNickname(toNickname);

      // Check if sender has sufficient balance
      if (fromUser.balance < amount) {
        return res.status(400).json({
          success: false,
          message: `Insufficient balance. ${fromNickname} has ${fromUser.balance} coins, Required: ${amount} coins`,
          currentBalance: fromUser.balance,
          requestedAmount: amount
        });
      }

      // Perform transfer
      fromUser.balance -= amount;
      fromUser.totalLosses += amount;
      
      toUser.balance += amount;
      toUser.totalWinnings += amount;

      // Save both users
      await Promise.all([fromUser.save(), toUser.save()]);

      res.json({
        success: true,
        message: `Successfully transferred ${amount} coins from ${fromNickname} to ${toNickname}`,
        transaction: {
          type: 'transfer',
          amount: amount,
          from: {
            nickname: fromUser.nickname,
            previousBalance: fromUser.balance + amount,
            newBalance: fromUser.balance
          },
          to: {
            nickname: toUser.nickname,
            previousBalance: toUser.balance - amount,
            newBalance: toUser.balance
          }
        },
        users: {
          sender: formatUserResponse(fromUser),
          receiver: formatUserResponse(toUser)
        }
      });

    } catch (error) {
      console.error('Transfer coins error:', error);

      if (error.message === 'User not found') {
        return res.status(404).json({
          success: false,
          message: 'One or both users not found. Please check the nicknames.'
        });
      }

      if (error.message.includes('Amount') || error.message.includes('nickname')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to transfer coins',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
};

module.exports = userController;
