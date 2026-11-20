# Equipment inventory CSV: how to fill it

Fill `inventory-template.csv` (Excel or Google Sheets both work, export back as CSV). Delete the example rows before uploading. One row = one physical item, except when using `quantity` for identical units.

## Columns

| Column | Required | What to put |
| --- | --- | --- |
| `name` | Yes | What people call it: "Sony FX3", "Aputure 120D". Must not be empty. |
| `category` | Yes | One of: `camera`, `lens`, `light`, `audio`, `grip`, `drone`, `battery`, `storage`, `computer`, `cable_adapter`, `accessory`, `other` |
| `brand_model` | No | Manufacturer + model, e.g. "Sony SEL2470GM2" |
| `serial_number` | No | Only when `quantity` is 1 (identical units can't share a serial). Leave blank if unknown. |
| `location` | Yes | `L1` (1st floor cupboard) or `L2` (2nd floor cupboard): where the item lives when it's home. |
| `quantity` | No | Default 1. For identical units (batteries, SD cards), put the count: 6 becomes 6 separate items named "... #1" to "... #6", each with its own QR code. |
| `purchase_date` | No | `YYYY-MM-DD`. Visible only to Tech Lead / HR / Founders. |
| `purchase_price_inr` | No | Number only, no commas or currency symbol. Visible only to Tech Lead / HR / Founders. |
| `notes` | No | Anything useful: "left mic clip broken", "usually with drone bag". |

Photos are not part of the CSV: the Tech Lead adds them per item inside the website after import.

The import screen in the Tech Console shows a full preview and lists every problem (bad category, missing name, duplicate serial) before anything is saved, so an imperfect file is safe to try.
