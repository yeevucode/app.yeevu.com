const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const winston = require('winston');
const jwksRsa = require('jwks-rsa');
require('dotenv').config();

const app = express();
app.use(express.json());

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.File({ filename: 'access.log' })]
});

// Postgres setup
const pool = new Pool({
  user: process.env.DB_USER || 'your_db_user',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'yeevu_db',
  password: process.env.DB_PASSWORD || 'your_db_password',
  port: process.env.DB_PORT || 5432
});

// JWT verification middleware using Auth0 JWKS
const verifyToken = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    logger.error('No token provided');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const client = jwksRsa({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://yeevu.auth0.com/.well-known/jwks.json`
    });

    const getKey = (header, callback) => {
      client.getSigningKey(header.kid, (err, key) => {
        const signingKey = key?.getPublicKey();
        callback(err, signingKey);
      });
    };

    jwt.verify(token, getKey, {
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256']
    }, (err, decoded) => {
      if (err) {
        logger.error(`Invalid token: ${err.message}`);
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.user = decoded;
      logger.info(`User ${req.user.sub} accessed ${req.originalUrl}`);
      next();
    });
  } catch (error) {
    logger.error(`Token verification error: ${error.message}`);
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Subscription check endpoint
app.get('/api/user/subscription', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT subscription_type FROM users WHERE user_id = $1',
      [req.user.sub]
    );
    if (result.rows.length === 0) {
      logger.error(`User ${req.user.sub} not found`);
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ subscription: result.rows[0].subscription_type });
  } catch (error) {
    logger.error(`Error fetching subscription: ${error.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(3000, () => {
  logger.info('Server running on port 3000');
});