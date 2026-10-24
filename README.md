# Delete Unused Elements – Mendix Studio Pro Extension

A Mendix Studio Pro extension to detect, filter, select, and bulk-delete unused elements across your Mendix project.

## Features

- **Domain Model Clean-Up**:
  - **Unused Entities**: Identifies entities in user modules not referenced by pages, microflows, rules, specializations, or active associations.
  - **Unused Attributes**: Detects entity attributes that are never placed on pages, never manipulated in microflows/nanoflows, never used in expressions/XPath, and not used in validation rules or indexes.
  - **Unused Associations**: Detects 1-to-many, many-to-many, and cross-associations never traversed in pages, forms, or microflows.
- **Standalone Documents Clean-Up**:
  - Detects unused Pages, Microflows, Nanoflows, Rules, Snippets, Layouts, Enumerations, Constants, etc.
- **Safety First**:
  - System modules (`System`, `Administration`, `Atlas_Core`, etc.) and AppStore/marketplace modules are strictly protected from deletion.
  - Confirmation dialog with category-by-category breakdown before any deletion occurs.
- **High-Contrast, Eye-Friendly Light Mode**:
  - Clean slate and white design with crisp typography (`Inter`) and high-contrast text.
  - Category tabs (`All`, `Entities`, `Attributes`, `Associations`, `Documents`) with real-time counters.
  - Real-time search across names, containers, and modules.
  - Multi-selection with header select-all, individual checkboxes, and clear-selection shortcuts.
  - Progress feedback during scanning and bulk-deleting.

## How to Use in Studio Pro

1. Open your project in **Mendix Studio Pro 10.12+**.
2. Go to the top menu: **Extensions** ➔ **Delete Unused Elements** ➔ **Find & Delete Unused Elements**.
3. A tab titled **Unused Elements Finder** will open.
4. Review the detected unused items, filter by category or search term, select the items you wish to clean up, and click **Delete Selected**.

## Building & Development

```bash
# Build the extension and deploy to extensions/
npm run build

# Watch mode for automatic rebuilds during development
npm run build:dev
```
