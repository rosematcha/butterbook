'use strict';

const noDirectTenantDb = require('./rules/no-direct-tenant-db.js');

module.exports = {
  rules: {
    'no-direct-tenant-db': noDirectTenantDb,
  },
  configs: {
    recommended: {
      plugins: ['butterbook'],
      rules: {
        'butterbook/no-direct-tenant-db': 'error',
      },
    },
  },
};
