require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const portfolioRoutes = require('./routes/portfolio');
const analyticsRoutes = require('./routes/analytics');
const stressRoutes    = require('./routes/stress');
const importRoutes    = require('./routes/import');
const accountsRoutes  = require('./routes/accounts');
const advisorRoutes   = require('./routes/advisor');
const rebalanceRoutes = require('./routes/rebalance');
const pricesRoutes    = require('./routes/prices');
const riskRoutes      = require('./routes/riskBarra');
const yodleeRoutes    = require('./routes/yodlee');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/portfolio', portfolioRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/stress',    stressRoutes);
app.use('/api/import',    importRoutes);
app.use('/api/accounts',  accountsRoutes);
app.use('/api/advisor',   advisorRoutes);
app.use('/api/rebalance', rebalanceRoutes);
app.use('/api/prices',    pricesRoutes);
app.use('/api/risk',      riskRoutes);
app.use('/api/yodlee',    yodleeRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

app.listen(PORT, () => console.log(`WealthOS API → http://localhost:${PORT}`));
