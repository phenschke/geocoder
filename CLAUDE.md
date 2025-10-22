# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Flask-based web application for geocoding historical addresses by clicking on rasterized maps. The tool allows researchers to quickly assign geographic coordinates to addresses by viewing historical maps and clicking on locations.

**Tech Stack**: Flask + vanilla JavaScript + SQLite, managed with uv (fast Python package manager)

## Development Commands

### Starting the Application

```bash
# Recommended: Use the startup script (handles dependency installation)
./run.sh

# Or manually with uv
uv sync                  # Install dependencies
uv run python app.py     # Run the application
```

Server runs at `http://localhost:5000` with debug mode enabled.

### Dependency Management

```bash
uv sync                  # Install/update dependencies from pyproject.toml
uv add <package>         # Add a new dependency
uv pip list              # List installed packages
```

This project uses [uv](https://github.com/astral-sh/uv) for dependency management, which is 10-100x faster than pip.

### Database

The SQLite database is located at `data/geocoder.db` and is created automatically on first run. To reset:

```bash
rm data/geocoder.db      # Delete database (recreates on next run)
```

## Application Architecture

### Backend Structure (Flask)

**app.py** - Main Flask application with REST API endpoints:
- CSV import (file path or browser upload)
- Address retrieval and pagination with filtering/sorting
- Geocoding and undo operations
- Progress tracking and data export
- Map file listing

**database.py** - Database layer (SQLite):
- Schema initialization and migrations
- CRUD operations for addresses
- Undo history management (last 50 actions via `Config.UNDO_STACK_SIZE`)
- CSV import/export with auto-column detection
- Paginated queries with filtering and sorting

**config.py** - Centralized configuration:
- Database path (`data/geocoder.db`)
- Maps directory (`static/maps/`)
- Undo stack size (default: 50)

### Database Schema

**addresses table**:
- Core fields: `id`, `street`, `number`, `x_coord`, `y_coord`, `lat`, `lon`
- Status tracking: `status` (pending/geocoded/skipped)
- Ordering: `sort_order` (preserves original CSV order)
- Timestamp: `timestamp` (when geocoded/skipped)
- Unique constraint on (street, number)

**undo_history table**:
- Stores last N actions for undo functionality
- Records: `address_id`, `action_type`, old coordinates, old status
- Automatically pruned to keep only most recent actions

### Frontend Structure

**templates/index.html** - Single-page application with:
- Map viewer canvas with pan/zoom controls
- Address list with filtering, sorting, pagination
- Progress tracking and statistics
- Import/export UI

**static/js/app.js** - Interactive map viewer:
- Canvas-based rendering for performance
- SVG overlay for geocoded points
- Keyboard shortcuts (Space = skip, Z = undo)
- Auto-advance mode (optional)
- Right-click geocoding workflow

**static/css/style.css** - Complete styling for UI components

## Key Features & Workflows

### CSV Import Logic

The application supports two import methods:
1. **File path import** (`/api/import`): Server reads CSV from filesystem
2. **Browser upload** (`/api/import_data`): Browser sends CSV data directly

**Auto-column detection** tries common column names:
- Street: `street`, `Street`, `street_name`, `StreetName`, `address`
- Number: `number`, `Number`, `house_number`, `HouseNumber`, `num`, `no`
- Lat/Lon: Optional columns for pre-geocoded data

**Import behavior**:
- Clears existing data (addresses and undo history)
- Preserves original CSV order via `sort_order` column
- Skips duplicate (street, number) combinations
- Supports importing pre-geocoded data with lat/lon columns

### Address List Feature

The address list is a sophisticated UI component with:
- **Filtering**: By status (pending/geocoded/skipped), street name, or search text
- **Sorting**: By street, number, or status (click column headers)
- **Pagination**: 20/50/100 per page, or "All"
- **Selection**: Click row to set as current address (doesn't affect map position)
- **Auto-advance toggle**: Controls whether geocoding advances to next address

**Important**: When auto-advance is ON, "next" means the next address in the *filtered/sorted* list, not the original CSV order. This allows workflows like "geocode all addresses on Main Street" by filtering to that street.

### Undo System

The undo system stores the previous state before each action:
- Geocoding an address
- Skipping an address
- Updating an existing geocode position

Undo restores: coordinates (x, y, lat, lon) and status. The undo stack is limited to the last N actions (configurable via `Config.UNDO_STACK_SIZE`).

**Key limitation**: Undo is a stack, not a full history. You can only undo sequentially from most recent to oldest.

## API Endpoints Reference

### Core Geocoding Flow
- `GET /api/current` - Get next pending address
- `POST /api/geocode` - Save geocoded coordinates (x, y, lat, lon)
- `POST /api/skip` - Mark address as skipped
- `POST /api/undo` - Undo last action

### Address List Management
- `GET /api/addresses` - Get paginated/filtered/sorted addresses
- `GET /api/streets` - Get unique street names for filtering
- `POST /api/set_current` - Set specific address as current (for manual selection)
- `POST /api/update_geocode` - Update position of already-geocoded address

### Data Management
- `POST /api/import` - Import from CSV file path
- `POST /api/import_data` - Import from CSV data (browser upload)
- `GET /api/export` - Download geocoded results as CSV
- `GET /api/maps` - List available map files in `static/maps/`
- `GET /api/progress` - Get statistics (total, geocoded, skipped, pending)
- `GET /api/points` - Get geocoded points for map visualization

## Common Customizations

### Adjusting Undo Stack Size
Edit `config.py`:
```python
UNDO_STACK_SIZE = 100  # Increase from default 50
```

### Changing Map Storage Location
Edit `config.py`:
```python
MAPS_DIR = os.path.join(BASE_DIR, 'path', 'to', 'maps')
```

### Modifying Zoom Limits
Edit `static/js/app.js` to adjust `MIN_SCALE` and `MAX_SCALE` constants.

### Changing Keyboard Shortcuts
Edit event handlers in `static/js/app.js` (search for `addEventListener('keydown')`).

## Testing Considerations

The application includes a sample CSV (`sample_addresses.csv`) for testing.

When testing:
1. **Import flow**: Test both file path and browser upload methods
2. **Undo behavior**: Verify undo works after geocoding, skipping, and multiple actions
3. **Address list filtering**: Test combinations of status filter + street filter + search
4. **Auto-advance**: Test both ON and OFF modes, especially with filtering active
5. **Edge cases**: Empty CSV, single address, duplicate addresses, missing coordinates

## Known Limitations

- **Single-user only**: SQLite doesn't support concurrent access well
- **No authentication**: Anyone with access to localhost:5000 can use the app
- **Pixel coordinates only**: Stores x/y pixel coords; lat/lon requires georeferencing (not yet implemented)
- **Large images**: Maps >50MB may have slow initial load times
- **Browser requirements**: Requires modern browser with Canvas and SVG support

## File Organization

```
geocoder/
├── app.py                    # Flask application and API endpoints
├── database.py               # SQLite database layer
├── config.py                 # Configuration constants
├── pyproject.toml            # uv dependencies
├── run.sh                    # Startup script
├── data/
│   ├── geocoder.db          # SQLite database (auto-created)
│   └── export.csv           # Temporary export file
├── static/
│   ├── maps/                # Historical map images go here
│   ├── css/style.css        # UI styling
│   └── js/app.js            # Frontend map viewer logic
├── templates/
│   └── index.html           # Main UI template
└── sample_addresses.csv     # Example data for testing
```

## Performance Notes

- **Canvas rendering** for map provides hardware-accelerated panning/zoom
- **Indexed queries** on `sort_order` and `status` columns for fast lookups
- **Pagination** keeps queries fast even with thousands of addresses
- **Debounced search** (300ms) prevents excessive database queries while typing
- Expected performance: 15 seconds per address, ~21 hours for 5,000 addresses
