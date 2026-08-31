# HR module

The HR workspace is intentionally connected to the existing Staff identity. The read endpoints are safe placeholders until the HR persistence migration is installed; they never fabricate payroll, tax, SGK, leave, or attendance amounts.

Next persistence layer should add employee HR profile, employment contracts, attendance, leave balances/requests, payroll periods/items, deductions, earnings, and payment batches, all scoped by tenant and linked to Staff.
