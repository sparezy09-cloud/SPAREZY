# Sparezy Billing Upgrade

## Brand separation
Hyundai and Mahindra remain separate Supabase schemas and separate inventory/sales/purchase data.

## Billing modes
Each brand now supports:
- `KACHA`: non-GST sale bill
- `GST`: GST/Pakka tax invoice

Both modes use the same brand inventory and reduce stock from the same inventory table.

## GST fields
GST sales support customer GSTIN, billing address, place of supply, intra-state CGST/SGST, or inter-state IGST. Each sale item stores its GST rate and HSN.

## Invoice numbering
Kacha invoices use `K-000001`, `K-000002`, ...
GST invoices use `GST-000001`, `GST-000002`, ...

## Roles
The application role names are now `Admin` and `Manager`. Run the migration to convert existing `Owner` users to `Admin`.

## Supabase migration
Run `supabase_migration_billing.sql` in the Supabase SQL Editor after the existing schema has been installed.

> GST rates and invoice/legal details should be configured to match the business's actual GST registration and applicable tax rules before production use.
